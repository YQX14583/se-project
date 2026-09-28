#!/usr/bin/env python3
"""墨笺: loopback-only, zero external dependency note server."""
import argparse
import json
import os
import re
import sqlite3
import uuid
from datetime import datetime, timezone
from contextlib import contextmanager
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import urlparse, parse_qs

ROOT = Path(__file__).resolve().parent
MAX_BODY = 16 * 1024 * 1024
MAX_LIBRARY = 8 * 1024 * 1024
MAX_NOTES = 2000

def now():
    return datetime.now(timezone.utc).isoformat(timespec='milliseconds')

class Problem(Exception):
    def __init__(self, status, message):
        self.status, self.message = status, message

class Store:
    def __init__(self, path):
        self.path = str(path)
        Path(path).parent.mkdir(parents=True, exist_ok=True)
        with self.connect() as db:
            db.execute('PRAGMA journal_mode=WAL')
            db.execute('''CREATE TABLE IF NOT EXISTS notes (
                id TEXT PRIMARY KEY, title TEXT NOT NULL, body TEXT NOT NULL,
                tags TEXT NOT NULL, starred INTEGER NOT NULL DEFAULT 0,
                deleted INTEGER NOT NULL DEFAULT 0, version INTEGER NOT NULL DEFAULT 1,
                created_at TEXT NOT NULL, updated_at TEXT NOT NULL)''')
    @contextmanager
    def connect(self):
        db = sqlite3.connect(self.path, timeout=5)
        db.row_factory = sqlite3.Row
        try:
            with db:
                yield db
        finally:
            db.close()
    @staticmethod
    def encode(row):
        d = dict(row)
        d['tags'] = json.loads(d['tags'])
        d['starred'], d['deleted'] = bool(d['starred']), bool(d['deleted'])
        return d
    def all(self):
        with self.connect() as db:
            return [self.encode(r) for r in db.execute('SELECT * FROM notes ORDER BY updated_at DESC, id')]
    def one(self, id):
        with self.connect() as db:
            r = db.execute('SELECT * FROM notes WHERE id=?', (id,)).fetchone()
        if not r:
            raise Problem(404, '笔记不存在')
        return self.encode(r)
    @staticmethod
    def validate(data):
        if not isinstance(data, dict):
            raise Problem(400, '笔记必须为对象')
        title, body, tags = data.get('title'), data.get('body'), data.get('tags', [])
        if not isinstance(title, str) or not 1 <= len(title.strip()) <= 80 or '\n' in title or '\r' in title:
            raise Problem(400, '标题须为 1–80 字符的单行文本')
        if not isinstance(body, str) or len(body) > 100000:
            raise Problem(400, '正文须为文本，且不超过 100000 字符')
        if not isinstance(tags, list) or len(tags) > 10 or any(not isinstance(t, str) or not 1 <= len(t.strip()) <= 20 for t in tags):
            raise Problem(400, '最多 10 个标签，每个 1–20 字符')
        for key in ('starred', 'deleted'):
            if key in data and type(data[key]) is not bool:
                raise Problem(400, key + ' 必须为布尔值')
        return title.strip(), body, list(dict.fromkeys(t.strip() for t in tags))
    def check_capacity(self, db):
        size = sum(len(json.dumps(self.encode(r), ensure_ascii=False).encode()) for r in db.execute("SELECT * FROM notes"))
        if size > MAX_LIBRARY:
            raise Problem(409, "知识库超过 8 MiB 数据预算，请先导出并整理")
    def create(self, data):
        title, body, tags = self.validate(data)
        id, stamp = uuid.uuid4().hex, now()
        with self.connect() as db:
            db.execute('BEGIN IMMEDIATE')
            if db.execute('SELECT COUNT(*) FROM notes').fetchone()[0] >= MAX_NOTES:
                raise Problem(409, '已达 2000 条笔记上限，请先导出并整理')
            db.execute('INSERT INTO notes VALUES (?,?,?,?,?,?,?,?,?)',
                       (id, title, body, json.dumps(tags, ensure_ascii=False), int(data.get('starred', False)), 0, 1, stamp, stamp))
            self.check_capacity(db)
        return self.one(id)
    def update(self, id, data):
        title, body, tags = self.validate(data)
        if type(data.get('version')) is not int:
            raise Problem(400, '保存需要整数版本号')
        with self.connect() as db:
            cursor = db.execute('''UPDATE notes SET title=?, body=?, tags=?, starred=?, deleted=?,
                version=version+1, updated_at=? WHERE id=? AND version=?''',
                (title, body, json.dumps(tags, ensure_ascii=False), int(data.get('starred', False)),
                 int(data.get('deleted', False)), now(), id, data['version']))
            if cursor.rowcount == 0:
                if db.execute('SELECT 1 FROM notes WHERE id=?', (id,)).fetchone():
                    raise Problem(409, '其他页面已修改这篇笔记。本页草稿仍保留，请下载草稿后重新载入。')
                raise Problem(404, '笔记不存在')
            self.check_capacity(db)
        return self.one(id)
    def purge(self, id, version):
        with self.connect() as db:
            cur = db.execute('DELETE FROM notes WHERE id=? AND deleted=1 AND version=?', (id, version))
            if not cur.rowcount:
                raise Problem(409, '只能永久删除版本一致的回收站笔记')
    def restore(self, payload):
        if not isinstance(payload, dict) or payload.get('format') != 'mojian-backup' or payload.get('schema_version') != 1:
            raise Problem(400, '不是受支持的墨笺 v1 备份')
        notes = payload.get('notes')
        if not isinstance(notes, list) or len(notes) > MAX_NOTES:
            raise Problem(400, '备份笔记数量无效')
        seen, rows = set(), []
        for n in notes:
            title, body, tags = self.validate(n)
            id = n.get('id')
            if not isinstance(id, str) or not re.fullmatch(r'[a-f0-9]{32}', id) or id in seen:
                raise Problem(400, '备份 ID 无效或重复')
            seen.add(id)
            for key in ('created_at', 'updated_at'):
                try:
                    if not isinstance(n.get(key), str) or datetime.fromisoformat(n[key]).tzinfo is None:
                        raise ValueError()
                except (ValueError, TypeError):
                    raise Problem(400, '备份时间格式无效')
            rows.append((id, title, body, json.dumps(tags, ensure_ascii=False), int(n.get('starred', False)), int(n.get('deleted', False)), 1, n['created_at'], n['updated_at']))
        # Merge only new IDs: existing local content can never be overwritten by import.
        with self.connect() as db:
            db.execute('BEGIN IMMEDIATE')
            known = {r[0] for r in db.execute('SELECT id FROM notes')}
            fresh = [r for r in rows if r[0] not in known]
            if len(known) + len(fresh) > MAX_NOTES:
                raise Problem(409, '恢复后超过 2000 条上限')
            db.executemany('INSERT INTO notes VALUES (?,?,?,?,?,?,?,?,?)', fresh)
            self.check_capacity(db)
        return {'imported': len(fresh), 'skipped': len(rows)-len(fresh)}

def make_handler(store):
    class Handler(BaseHTTPRequestHandler):
        server_version = 'Mojian/1.0'
        def log_message(self, fmt, *args):
            pass
        def send(self, status, data, content_type='application/json; charset=utf-8', attachment=None):
            raw = json.dumps(data, ensure_ascii=False).encode() if content_type.startswith('application/json') else data
            self.send_response(status)
            self.send_header('Content-Type', content_type)
            self.send_header('Content-Length', str(len(raw)))
            self.send_header('Cache-Control', 'no-store')
            self.send_header('X-Content-Type-Options', 'nosniff')
            self.send_header('Content-Security-Policy', "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; object-src 'none'; frame-ancestors 'none'; base-uri 'none'")
            if attachment:
                self.send_header('Content-Disposition', 'attachment; filename="'+attachment+'"')
            self.end_headers()
            self.wfile.write(raw)
        def body(self):
            try:
                size = int(self.headers.get('Content-Length', '0'))
            except ValueError:
                raise Problem(400, '请求长度无效')
            if not 0 < size <= MAX_BODY:
                raise Problem(413, '请求须为 1 字节至 16 MiB')
            try:
                return json.loads(self.rfile.read(size))
            except (ValueError, UnicodeDecodeError):
                raise Problem(400, 'JSON 格式错误')
        def guard(self):
            expected = '127.0.0.1:' + str(self.server.server_port)
            if self.headers.get('Host') != expected:
                raise Problem(403, '仅允许通过 127.0.0.1 本机访问')
            origin = self.headers.get('Origin')
            if origin and origin != 'http://' + expected:
                raise Problem(403, '拒绝跨来源请求')
            if self.command != 'GET' and self.headers.get('X-Mojian-Request') != '1':
                raise Problem(403, '缺少本地应用请求标记')
        def route(self):
            self.guard()
            path = urlparse(self.path).path
            method = self.command
            if method == 'GET':
                if path == '/api/notes':
                    return self.send(200, {'notes': store.all()})
                if path == '/api/backup':
                    return self.send(200, {'format':'mojian-backup', 'schema_version':1, 'exported_at':now(), 'notes':store.all()}, attachment='mojian-backup.json')
                files = {'/':('index.html','text/html; charset=utf-8'), '/app.js':('app.js','text/javascript; charset=utf-8'), '/style.css':('style.css','text/css; charset=utf-8')}
                if path in files:
                    file, mime = files[path]
                    return self.send(200, (ROOT/'static'/file).read_bytes(), mime)
            if method == 'POST' and path == '/api/notes':
                return self.send(201, store.create(self.body()))
            if method == 'POST' and path == '/api/restore':
                return self.send(200, store.restore(self.body()))
            match = re.fullmatch(r'/api/notes/([a-f0-9]{32})', path)
            if match:
                if method == 'PUT':
                    return self.send(200, store.update(match[1], self.body()))
                if method == 'DELETE':
                    data = self.body()
                    if not isinstance(data, dict) or type(data.get('version')) is not int:
                        raise Problem(400, '删除需要版本号')
                    store.purge(match[1], data['version'])
                    return self.send(200, {'deleted': True})
            raise Problem(404, '资源不存在')
        def handle_request(self):
            try:
                self.route()
            except Problem as e:
                self.send(e.status, {'error': e.message})
            except sqlite3.Error:
                self.send(503, {'error':'数据库暂不可写，请保留草稿并重试或检查磁盘空间'})
            except (BrokenPipeError, ConnectionResetError):
                pass
            except Exception:
                self.send(500, {'error':'本地服务出现错误，请保留草稿并重启'})
        do_GET = do_POST = do_PUT = do_DELETE = handle_request
    return Handler

def seed(store):
    if store.all():
        return
    for title, tags, body, starred in [
        ('欢迎来到墨笺', ['开始使用'], '# 让零散的知识，慢慢连成一片\n\n墨笺是你的本地学习知识库。所有笔记保存在这台电脑，无需账户，也不依赖云端。\n\n## 从这里开始\n- 点击「新建笔记」，写下今天的新发现\n- 用标签整理课程，用搜索找回灵感\n- 输入 [[软件工程学习地图]]，把知识连接起来\n- 定期下载 JSON 备份，保存在另一块磁盘\n\n> 少一点整理的负担，多一点思考的空间。\n\n## 支持的 Markdown\n**粗体**、*斜体*、`行内代码`、标题、列表、引用与代码块。\n\n```python\nprint("Hello, 墨笺")\n```\n\n提示：底部「已保存」表示服务器已提交 SQLite；未保存时离开页面会收到提示。', True),
        ('软件工程学习地图', ['软件工程', '课程笔记'], '# 软件工程学习地图\n\n从问题出发，用可验证的需求连接设计、实现与测试。\n\n## 本周重点\n- [[需求分析方法]]：把模糊愿望变成验收标准\n- [[测试设计清单]]：正常路径与异常路径一起验证\n\n## 学习任务\n- 阅读课堂实验要求\n- 完成需求编号与追踪关系\n- 演示从创建到备份的完整流程', True),
        ('需求分析方法', ['软件工程', '方法'], '# 需求分析方法\n\n好的需求需要明确主体、触发条件、输入、处理和输出。\n\n## 一个例子\n模糊表达：搜索要很快。\n\n可验证表达：在约定数据集和测试环境下，输入关键词后，结果更新的第 95 百分位耗时不超过 300 毫秒。\n\n> 性能目标不能替代实测结果。\n\n返回 [[软件工程学习地图]]，再看看 [[测试设计清单]]。', False),
        ('测试设计清单', ['软件工程', '测试'], '# 测试设计清单\n\n## 数据与边界\n- 空标题与超长标题\n- 中文搜索与多个标签\n- 重复标题下的双链歧义\n- 多窗口修改冲突\n- 非法备份与重复导入\n\n## 数据安全\n将笔记移入回收站后，应能恢复原文。永久删除必须二次确认。\n\n相关：[[需求分析方法]]', False),
        ('一周阅读摘记', ['阅读', '灵感'], '# 一周阅读摘记\n\n写笔记不只是收藏信息，也是重新组织理解。\n\n## 我的三个问题\n1. 这条知识解决什么问题？\n2. 它和已有知识有什么联系？\n3. 我能用自己的例子解释吗？\n\n把答案写下来，再连接到 [[软件工程学习地图]]。', False),
    ]:
        store.create({'title':title, 'body':body, 'tags':tags, 'starred':starred})

if __name__ == '__main__':
    parser = argparse.ArgumentParser(description='墨笺本地笔记服务')
    parser.add_argument('--port', type=int, default=8765)
    parser.add_argument('--db', default=str(ROOT.parent/'data'/'mojian.sqlite3'))
    parser.add_argument('--demo', action='store_true', help='仅在空库中创建示例笔记')
    args = parser.parse_args()
    store = Store(args.db)
    if args.demo:
        seed(store)
    server = ThreadingHTTPServer(('127.0.0.1', args.port), make_handler(store))
    server.daemon_threads = True
    print(f'墨笺已启动：http://127.0.0.1:{args.port}  |  Ctrl+C 停止', flush=True)
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        server.server_close()
