'use strict';
const http=require('node:http'),fs=require('node:fs'),path=require('node:path'),{execFile}=require('node:child_process');
const root=path.join(__dirname,'game'),manifest=JSON.parse(fs.readFileSync(path.join(root,'offline-manifest.json'),'utf8'));
const flag=process.argv.indexOf('--port'),port=flag<0?17456:Number(process.argv[flag+1]);
if(!Number.isInteger(port)||port<1024||port>65535)throw Error('Invalid port');
const url='http://localhost:'+port+'/',identity={app:'sadness-match3-portable',version:manifest.version};
function open(){console.log('游戏地址：'+url);if(!process.argv.includes('--no-open'))execFile('rundll32.exe',['url.dll,FileProtocolHandler',url],{windowsHide:true},err=>{if(err)console.log('请在浏览器打开上面的地址。');});}
const mime={'.html':'text/html; charset=utf-8','.js':'application/javascript; charset=utf-8','.json':'application/json; charset=utf-8','.css':'text/css; charset=utf-8','.png':'image/png','.jpg':'image/jpeg','.svg':'image/svg+xml','.ttf':'font/ttf','.woff':'font/woff','.woff2':'font/woff2','.wasm':'application/wasm','.mp3':'audio/mpeg','.ogg':'audio/ogg','.wav':'audio/wav'};
const server=http.createServer((req,res)=>{
 if(!['GET','HEAD'].includes(req.method)){res.writeHead(405);res.end();return;}
 if(req.url==='/__sadness_portable__'){res.writeHead(200,{'Content-Type':'application/json'});res.end(JSON.stringify(identity));return;}
 let relative;try{relative=decodeURIComponent(new URL(req.url,url).pathname);}catch{res.writeHead(400);res.end();return;}
 const file=path.resolve(root,'.'+(relative.endsWith('/')?relative+'index.html':relative));
 if(!file.startsWith(root+path.sep)){res.writeHead(403);res.end();return;}
 fs.stat(file,(err,stat)=>{if(err||!stat.isFile()){res.writeHead(404);res.end('Not found');return;}
  res.writeHead(200,{'Content-Type':mime[path.extname(file)]||'application/octet-stream','Content-Length':stat.size,'Cache-Control':'no-cache','Service-Worker-Allowed':'/','X-Content-Type-Options':'nosniff'});
  if(req.method==='HEAD')res.end();else fs.createReadStream(file).on('error',()=>res.destroy()).pipe(res);
 });
});
server.on('error',err=>{
 if(err.code!=='EADDRINUSE'){console.error('启动失败：'+err.message);process.exitCode=1;return;}
 const request=http.get(url+'__sadness_portable__',{timeout:1500},res=>{let body='';res.on('data',x=>body+=x);res.on('end',()=>{try{const other=JSON.parse(body);if(other.app===identity.app&&other.version===identity.version){console.log('游戏已经启动。');open();return;}}catch{}console.error('端口被占用：请关闭之前的游戏启动窗口后再试。');process.exitCode=1;});});
 request.on('timeout',()=>request.destroy(Error('timeout')));request.on('error',()=>{console.error('端口被占用：请关闭之前的游戏启动窗口后再试。');process.exitCode=1;});
});
server.listen(port,'127.0.0.1',()=>{console.log('悲伤消消乐 · Windows 免安装版\n游玩时保留此窗口；退出时关闭浏览器游戏页和此窗口。\n无需联网，无需安装 Cocos 或 Node.js。');open();});
