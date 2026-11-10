'use strict';
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const root = path.resolve(__dirname,'../build/web-mobile');
const arg = process.argv.indexOf('--port');
const port = arg < 0 ? 7456 : Number(process.argv[arg + 1]);
if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('Invalid --port');
const types = {'.html':'text/html; charset=utf-8','.js':'application/javascript; charset=utf-8','.json':'application/json; charset=utf-8','.css':'text/css; charset=utf-8','.png':'image/png','.jpg':'image/jpeg','.jpeg':'image/jpeg','.svg':'image/svg+xml','.webp':'image/webp','.mp3':'audio/mpeg','.ogg':'audio/ogg','.wav':'audio/wav','.ttf':'font/ttf','.woff':'font/woff','.woff2':'font/woff2','.wasm':'application/wasm','.bin':'application/octet-stream','.cconb':'application/octet-stream'};
http.createServer((req,res)=>{
  if (!['GET','HEAD'].includes(req.method)) {res.writeHead(405);res.end();return;}
  let relative;
  try {relative = decodeURIComponent(new URL(req.url,'http://localhost').pathname);} catch {res.writeHead(400);res.end();return;}
  const file = path.resolve(root,'.'+(relative.endsWith('/')?relative+'index.html':relative));
  if (!file.startsWith(root + path.sep)) {res.writeHead(403);res.end();return;}
  fs.stat(file,(error,stat)=>{
    if(error || !stat.isFile()){res.writeHead(404,{'Content-Type':'text/plain; charset=utf-8'});res.end('Not found');return;}
    res.writeHead(200,{'Content-Type':types[path.extname(file)]||'application/octet-stream','Content-Length':stat.size,'Cache-Control':'no-cache','Service-Worker-Allowed':'/','X-Content-Type-Options':'nosniff'});
    if(req.method==='HEAD')res.end();else fs.createReadStream(file).pipe(res);
  });
}).listen(port,'127.0.0.1',()=>console.log(`Game: http://localhost:${port}/ (${root})`));
