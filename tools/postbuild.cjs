'use strict';
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const root = path.resolve(__dirname,'..');
const build = path.join(root,'build/web-mobile');
const template = path.join(root,'build-templates/web-mobile');
const index = path.join(build,'index.html');
let html = fs.readFileSync(index,'utf8');
html = html.replace(/<title>[^<]*<\/title>/,'<title>悲伤消消乐</title>');
html = html.replace(/<meta[^>]*name=["']viewport["'][^>]*>/i,'<meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1,user-scalable=no,viewport-fit=cover">');
html = html.replace(/<!-- sadness-shell -->[\s\S]*?<!-- \/sadness-shell -->/g,'');
html = html.replace('</head>','<!-- sadness-shell --><link rel="icon" type="image/svg+xml" href="favicon.svg"><link rel="stylesheet" href="game-shell.css"><script defer src="offline-bootstrap.js"></script><!-- /sadness-shell --></head>');
html = html.replace(/<html(?![^>]*lang=)/,'<html lang="zh-CN"');
fs.writeFileSync(index,html);
for(const file of ['game-shell.css','offline-bootstrap.js','favicon.svg'])fs.copyFileSync(path.join(template,file),path.join(build,file));
const files=[];
function walk(dir){for(const item of fs.readdirSync(dir,{withFileTypes:true})){const f=path.join(dir,item.name);if(item.isDirectory())walk(f);else if(!/\.(?:map|log)$/.test(item.name)&&!['sw.js','offline-manifest.json'].includes(item.name))files.push(path.relative(build,f).replaceAll('\\','/'));}}
walk(build);files.sort();
const hash=crypto.createHash('sha256');for(const f of files){hash.update(f);hash.update(fs.readFileSync(path.join(build,f)));}
const version=hash.digest('hex').slice(0,20);
fs.writeFileSync(path.join(build,'offline-manifest.json'),JSON.stringify({version,files},null,2));
const sw = `'use strict';
const CACHE='sadness-${version}';
const FILES=${JSON.stringify(files)};
const urls=FILES.map(f=>new URL(f,self.registration.scope).href);
const readyKey=new URL('__offline_complete__',self.registration.scope).href;
async function announce(type,detail){for(const c of await self.clients.matchAll({includeUncontrolled:true}))c.postMessage({type,detail});}
async function prepare(){const cache=await caches.open(CACHE);if(await cache.match(readyKey)){let complete=true;for(const url of urls)if(!(await cache.match(url))){complete=false;break;}if(complete){await announce('offline-ready');return;}}try{for(const url of urls){if(await cache.match(url))continue;const response=await fetch(new Request(url,{cache:'reload'}));if(!response.ok)throw new Error('cache '+response.status+': '+url);await cache.put(url,response);}await cache.put(readyKey,new Response('complete'));await announce('offline-ready');}catch(error){await announce('offline-failed',String(error));throw error;}}
self.addEventListener('install',event=>event.waitUntil(prepare().then(()=>self.skipWaiting())));
self.addEventListener('activate',event=>event.waitUntil((async()=>{await self.clients.claim();for(const key of await caches.keys())if(key.startsWith('sadness-')&&key!==CACHE)await caches.delete(key);await announce('offline-ready');})()));
self.addEventListener('message',event=>{if(event.data?.type==='prepare-offline')event.waitUntil(prepare());});
self.addEventListener('fetch',event=>{if(event.request.method!=='GET')return;event.respondWith((async()=>{const cache=await caches.open(CACHE);const url=new URL(event.request.url);if(event.request.mode==='navigate')url.pathname=new URL('index.html',self.registration.scope).pathname;url.search='';url.hash='';if(url.pathname==='/favicon.ico')url.pathname=new URL('favicon.svg',self.registration.scope).pathname;const hit=await cache.match(url.href);if(hit)return hit;await announce('offline-missing',url.pathname);return new Response('离线资源缺失，请在联网后重新打开游戏。',{status:503,headers:{'Content-Type':'text/plain; charset=utf-8'}});})());});
`;
fs.writeFileSync(path.join(build,'sw.js'),sw);
const bytes=files.reduce((n,f)=>n+fs.statSync(path.join(build,f)).size,0);
console.log(`Offline ${version}: ${files.length} resources, ${(bytes/1024/1024).toFixed(2)} MiB`);

