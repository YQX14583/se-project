import json
import sys
import tempfile
import threading
import unittest
import urllib.request
import urllib.error
from pathlib import Path
from http.server import ThreadingHTTPServer
sys.path.insert(0, str(Path(__file__).resolve().parents[1]/'app'))
from server import Store, Problem, make_handler, seed

class StoreTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.store = Store(Path(self.tmp.name)/'notes.db')
    def tearDown(self):
        self.tmp.cleanup()
    def note(self, **kw):
        return self.store.create(dict(title='需求分析', body='正文 [[测试]]', tags=['课程'], **kw))
    def test_create_persist_unicode(self):
        n=self.note(); other=Store(self.store.path)
        self.assertEqual(other.one(n['id'])['body'], '正文 [[测试]]')
        self.assertEqual(n['version'],1)
    def test_title_boundaries(self):
        for title in ['', ' ', 'x'*81, 'a\nb', 123]:
            with self.subTest(title=title), self.assertRaises(Problem):
                self.store.create({'title':title,'body':''})
        self.store.create({'title':'x'*80,'body':''})
    def test_body_limit(self):
        self.store.create({'title':'t','body':'文'*100000})
        with self.assertRaises(Problem):self.store.create({'title':'t','body':'文'*100001})
    def test_tags_validation_dedup(self):
        n=self.store.create({'title':'t','body':'','tags':['  课程 ','课程']})
        self.assertEqual(n['tags'],['课程'])
        for tags in ['x',['x']*11,[''],['x'*21],[42]]:
            with self.subTest(tags=tags), self.assertRaises(Problem):self.store.create({'title':'t','body':'','tags':tags})
    def test_save_version_conflict(self):
        n=self.note(); newer=self.store.update(n['id'],{**n,'body':'修改'})
        self.assertEqual(newer['version'],2)
        with self.assertRaises(Problem) as cm:self.store.update(n['id'],{**n,'body':'过期覆盖'})
        self.assertEqual(cm.exception.status,409)
        self.assertEqual(self.store.one(n['id'])['body'],'修改')
    def test_trash_restore_purge(self):
        n=self.note()
        with self.assertRaises(Problem):self.store.purge(n['id'],n['version'])
        n=self.store.update(n['id'],{**n,'deleted':True})
        n=self.store.update(n['id'],{**n,'deleted':False})
        self.assertEqual(n['body'],'正文 [[测试]]')
        n=self.store.update(n['id'],{**n,'deleted':True})
        self.store.purge(n['id'],n['version']);self.assertEqual(self.store.all(),[])
    def test_backup_roundtrip_merge(self):
        n=self.note();payload={'format':'mojian-backup','schema_version':1,'notes':self.store.all()}
        other=Store(Path(self.tmp.name)/'second.db')
        self.assertEqual(other.restore(payload),{'imported':1,'skipped':0})
        self.assertEqual(other.all(),self.store.all())
        edited=other.update(n['id'],{**n,'body':'本机较新'})
        self.assertEqual(other.restore(payload),{'imported':0,'skipped':1})
        self.assertEqual(other.one(n['id'])['body'],edited['body'])
    def test_restore_atomic_validation(self):
        n=self.note();bad={**n,'id':'b'*32,'title':''}
        other=Store(Path(self.tmp.name)/'other.db')
        with self.assertRaises(Problem):other.restore({'format':'mojian-backup','schema_version':1,'notes':[n,bad]})
        self.assertEqual(other.all(),[])
    def test_bad_backups(self):
        n=self.note()
        for payload in [[],{}, {'format':'mojian-backup','schema_version':2,'notes':[]}, {'format':'mojian-backup','schema_version':1,'notes':[n,n]}, {'format':'mojian-backup','schema_version':1,'notes':[{**n,'created_at':'bad'}]}]:
            with self.subTest(payload=payload),self.assertRaises(Problem):self.store.restore(payload)
    def test_sql_injection_is_data(self):
        text="x'); DROP TABLE notes;--"
        n=self.store.create({'title':text,'body':'<script>alert(1)</script>'})
        self.assertEqual(self.store.one(n['id'])['title'],text)
    def test_boolean_and_version_types(self):
        with self.assertRaises(Problem):self.store.create({'title':'t','body':'','starred':'false'})
        n=self.note()
        with self.assertRaises(Problem):self.store.update(n['id'],{**n,'version':True})
    def test_seed_is_idempotent(self):
        seed(self.store);seed(self.store);self.assertEqual(len(self.store.all()),5)

class HTTPTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.tmp=tempfile.TemporaryDirectory();cls.store=Store(Path(cls.tmp.name)/'http.db')
        cls.server=ThreadingHTTPServer(('127.0.0.1',0),make_handler(cls.store))
        cls.thread=threading.Thread(target=cls.server.serve_forever,daemon=True);cls.thread.start()
        cls.base='http://127.0.0.1:'+str(cls.server.server_port)
    @classmethod
    def tearDownClass(cls):
        cls.server.shutdown();cls.server.server_close();cls.tmp.cleanup()
    def request(self,path='/',method='GET',data=None,headers=None):
        raw=json.dumps(data).encode() if data is not None else None
        req=urllib.request.Request(self.base+path,raw,{'Content-Type':'application/json','X-Mojian-Request':'1',**(headers or {})},method=method)
        try:
            with urllib.request.urlopen(req) as r:return r.status,r.read(),r.headers
        except urllib.error.HTTPError as r:return r.code,r.read(),r.headers
    def test_static_csp_and_path_traversal(self):
        status,body,h=self.request();self.assertEqual(status,200);self.assertIn(b'<!doctype html>',body);self.assertIn("default-src 'self'",h['Content-Security-Policy'])
        self.assertEqual(self.request('/../server.py')[0],404)
    def test_crud_api(self):
        status,body,_=self.request('/api/notes','POST',{'title':'API测试','body':'hello','tags':[]});self.assertEqual(status,201)
        n=json.loads(body)
        self.assertEqual(self.request('/api/notes/'+n['id'],'PUT',{**n,'body':'world'})[0],200)
        self.assertEqual(self.request('/api/notes/'+n['id'],'PUT',n)[0],409)
    def test_cross_origin_and_host(self):
        self.assertEqual(self.request('/api/notes','POST',{}, {'Origin':'https://evil.example'})[0],403)
        self.assertEqual(self.request('/',headers={'Host':'evil.example'})[0],403)
        self.assertEqual(self.request('/api/notes','POST',{}, {'X-Mojian-Request':''})[0],403)
    def test_bad_json(self):
        req=urllib.request.Request(self.base+'/api/notes',b'{','X' if False else {'X-Mojian-Request':'1'},method='POST')
        with self.assertRaises(urllib.error.HTTPError) as cm:urllib.request.urlopen(req)
        self.assertEqual(cm.exception.code,400)
    def test_backup_schema(self):
        code,body,headers=self.request('/api/backup');self.assertEqual(code,200);self.assertEqual(json.loads(body)['schema_version'],1);self.assertIn('attachment',headers['Content-Disposition'])

if __name__=='__main__':unittest.main(verbosity=2)
