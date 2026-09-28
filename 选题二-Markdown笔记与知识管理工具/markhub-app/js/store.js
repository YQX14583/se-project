/* MarkHub — 数据层：IndexedDB 本地 Vault（零网络、零上传，对应 NFR-06/07）
 * 记录结构 notes: { id, title, folder, content, tags[], favorite, deleted,
 *                   deletedAt, createdAt, updatedAt }
 * 说明：浏览器版以 IndexedDB 模拟"本地文件 Vault"；桌面版实现时同一接口
 *       映射到真实文件系统（架构上的存储后端可替换，对应 NFR-10）。
 */
(function (global) {
  'use strict';
  const DB_NAME = 'markhub-vault';
  const STORE = 'notes';
  let db = null;

  function open() {
    return new Promise((resolve, reject) => {
      if (db) return resolve(db);
      const req = indexedDB.open(DB_NAME, 1);
      req.onupgradeneeded = () => {
        const d = req.result;
        if (!d.objectStoreNames.contains(STORE)) {
          const s = d.createObjectStore(STORE, { keyPath: 'id' });
          s.createIndex('folder', 'folder');
          s.createIndex('updatedAt', 'updatedAt');
        }
      };
      req.onsuccess = () => { db = req.result; resolve(db); };
      req.onerror = () => reject(req.error);
    });
  }

  function tx(mode) { return db.transaction(STORE, mode).objectStore(STORE); }

  const Store = {
    async all() {
      await open();
      return new Promise((res, rej) => {
        const r = tx('readonly').getAll();
        r.onsuccess = () => res(r.result || []);
        r.onerror = () => rej(r.error);
      });
    },

    async get(id) {
      await open();
      return new Promise((res, rej) => {
        const r = tx('readonly').get(id);
        r.onsuccess = () => res(r.result);
        r.onerror = () => rej(r.error);
      });
    },

    async put(note) {
      await open();
      note.updatedAt = Date.now();
      return new Promise((res, rej) => {
        const r = tx('readwrite').put(note);
        r.onsuccess = () => res(note);
        r.onerror = () => rej(r.error);
      });
    },

    async remove(id) {
      await open();
      return new Promise((res, rej) => {
        const r = tx('readwrite').delete(id);
        r.onsuccess = () => res(true);
        r.onerror = () => rej(r.error);
      });
    },

    // FR-01：创建笔记，重名自动追加 -1/-2（title 唯一性用于 wiki-link 解析）
    async create(title, folder = '', content = '') {
      const all = await Store.all();
      const sanitize = (t) => t.replace(/[\\/:*?"<>|]/g, '-').trim();
      let name = sanitize(title) || '未命名';
      let final = name, n = 1;
      const exists = (t) => all.some(x => !x.deleted && x.title === t);
      while (exists(final)) { final = name + '-' + n; n++; }
      const now = Date.now();
      return Store.put({
        id: crypto.randomUUID ? crypto.randomUUID() : String(now) + '-' + Math.random().toString(36).slice(2),
        title: final, folder, content, tags: [], favorite: false,
        deleted: false, deletedAt: null, createdAt: now, updatedAt: now
      });
    },

    // FR-08：全文检索（AND 语义 + tag:/path: 过滤 + 精确短语）
    search(notes, query) {
      const q = query.trim();
      if (!q) return [];
      const terms = [];
      let filters = { tags: [], paths: [] };
      const phraseRe = /"([^"]+)"/g;
      let m, rest = q;
      while ((m = phraseRe.exec(q))) { terms.push(m[1].toLowerCase()); }
      rest = rest.replace(phraseRe, ' ');
      for (const tok of rest.split(/\s+/)) {
        if (!tok) continue;
        if (tok.startsWith('tag:')) filters.tags.push(tok.slice(4).toLowerCase());
        else if (tok.startsWith('path:')) filters.paths.push(tok.slice(5).toLowerCase());
        else terms.push(tok.toLowerCase());
      }
      const live = notes.filter(n => !n.deleted);
      return live
        .filter(n => {
          if (filters.tags.length && !filters.tags.every(t => n.tags.some(x => x.toLowerCase() === t))) return false;
          if (filters.paths.length && !filters.paths.every(p => (n.folder || '/').toLowerCase().includes(p))) return false;
          const hay = (n.title + '\n' + n.content).toLowerCase();
          return terms.every(t => hay.includes(t));
        })
        .map(n => {
          // 命中片段：关键词上下文各 ~40 字符
          let snippet = '';
          const first = terms.find(t => n.content.toLowerCase().includes(t));
          if (first) {
            const idx = n.content.toLowerCase().indexOf(first);
            const s = Math.max(0, idx - 40);
            snippet = (s > 0 ? '…' : '') + n.content.slice(s, idx + first.length + 40) + '…';
          } else snippet = n.content.slice(0, 80) + (n.content.length > 80 ? '…' : '');
          return { note: n, snippet, terms };
        })
        .sort((a, b) => (b.note.updatedAt - a.note.updatedAt));
    },

    // FR-09：反向链接索引
    backlinks(notes, targetTitle) {
      return notes.filter(n => !n.deleted && n.id !== targetTitle.__id &&
        Markdown.extractLinks(n.content).includes(targetTitle));
    }
  };

  global.Store = Store;
})(window);
