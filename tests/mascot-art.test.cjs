'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const ts=require(path.join(process.env.COCOS_CREATOR_HOME||'D:/_Cocos Games/Creator/3.8.8','resources/app.asar.unpacked/node_modules/typescript'));
const moduleUnderTest={exports:{}};
const code=ts.transpileModule(fs.readFileSync(path.join(__dirname,'../assets/scripts/ui/Paint.ts'),'utf8'),{compilerOptions:{target:ts.ScriptTarget.ES2020,module:ts.ModuleKind.CommonJS}}).outputText;
new Function('exports','module',code)(moduleUnderTest.exports,moduleUnderTest);
const {character}=moduleUnderTest.exports;
function render(tool=null,phase=0,healing=.25,chapter=2){
 const commands=[],paint=[],stack=[];let gradientId=0,current=[];
 const ctx={fillStyle:'',strokeStyle:'',lineWidth:1,globalAlpha:1,m:[1,0,0,1,0,0]};
 const record=(name,...args)=>commands.push([name,...args]);
 const point=(x,y)=>[ctx.m[0]*x+ctx.m[2]*y+ctx.m[4],ctx.m[1]*x+ctx.m[3]*y+ctx.m[5]];
 const transform=(a,b,c,d,e,f)=>{const m=ctx.m;ctx.m=[m[0]*a+m[2]*b,m[1]*a+m[3]*b,m[0]*c+m[2]*d,m[1]*c+m[3]*d,m[0]*e+m[2]*f+m[4],m[1]*e+m[3]*f+m[5]];};
 ctx.save=()=>{record('save');stack.push({m:ctx.m.slice(),fillStyle:ctx.fillStyle,strokeStyle:ctx.strokeStyle,lineWidth:ctx.lineWidth,globalAlpha:ctx.globalAlpha});};
 ctx.restore=()=>{record('restore');Object.assign(ctx,stack.pop());};
 ctx.translate=(x,y)=>{record('translate',x,y);transform(1,0,0,1,x,y);};ctx.rotate=a=>{record('rotate',a);transform(Math.cos(a),Math.sin(a),-Math.sin(a),Math.cos(a),0,0);};ctx.scale=(x,y)=>{record('scale',x,y);transform(x,0,0,y,0,0);};
 ctx.beginPath=()=>{record('beginPath');current=[];};ctx.closePath=()=>record('closePath');
 for(const name of ['moveTo','lineTo','quadraticCurveTo','bezierCurveTo'])ctx[name]=(...args)=>{record(name,...args);for(let i=0;i<args.length;i+=2)current.push(point(args[i],args[i+1]));};
 ctx.ellipse=(x,y,rx,ry,rotation,start,end)=>{record('ellipse',x,y,rx,ry,rotation,start,end);for(let i=0;i<32;i++){const a=start+(end-start)*i/31;current.push(point(x+rx*Math.cos(a),y+ry*Math.sin(a)));}};
 ctx.arc=(x,y,r,start,end)=>{record('arc',x,y,r,start,end);for(let i=0;i<32;i++){const a=start+(end-start)*i/31;current.push(point(x+r*Math.cos(a),y+r*Math.sin(a)));}};
 for(const name of ['fill','stroke'])ctx[name]=()=>{const color=name==='fill'?ctx.fillStyle:ctx.strokeStyle;record(name,color,ctx.globalAlpha,name==='stroke'?ctx.lineWidth:0);paint.push({name,color,alpha:ctx.globalAlpha,points:current.slice()});};
 ctx.fillRect=(x,y,w,h)=>{record('fillRect',x,y,w,h,ctx.fillStyle,ctx.globalAlpha);paint.push({name:'fillRect',color:ctx.fillStyle,alpha:ctx.globalAlpha,points:[point(x,y),point(x+w,y),point(x,y+h),point(x+w,y+h)]});};
 for(const name of ['createLinearGradient','createRadialGradient'])ctx[name]=(...args)=>{const id='gradient'+gradientId++;record(name,...args);return {id,addColorStop:(offset,color)=>record('colorStop',offset,color)};};
 const canvas={width:0,height:0,getContext:()=>ctx};global.document={createElement:tag=>{assert.equal(tag,'canvas');return canvas;}};
 character(healing,chapter,tool,phase);return {commands,paint,width:canvas.width,height:canvas.height,stack};
}
const digest=x=>crypto.createHash('sha256').update(JSON.stringify(x.commands)).digest('hex');
test('ordinary mascot preserves the established rest artwork exactly',()=>{
 const rest=render();assert.equal(digest(rest),'c11e795c83729e8d85fcc372d7ca5912685a553b07d67f20b13f1662dcadb7a3');assert.equal(rest.width,320);assert.equal(rest.height,300);
 for(const tool of ['breathe','hug','resonate','shuffle'])for(const phase of [0,1])assert.equal(digest(render(tool,phase)),digest(rest));
});
test('each tool has a distinct expression and hand gesture, then returns to rest',()=>{
 const rest=render(),hands=r=>r.paint.filter(p=>p.color==='#e7e0dc').map(p=>p.points),eyes=r=>r.paint.filter(p=>p.color==='#4c4c65'||p.color==='#766b7e').map(p=>p.points);
 const poses=['breathe','hug','resonate','shuffle'].map(tool=>render(tool,.5));
 for(const pose of poses){assert.notDeepEqual(hands(pose),hands(rest),'hands must take part in the reaction');assert.notDeepEqual(eyes(pose),eyes(rest),'expression must react, not just its background');}
 assert.equal(new Set(poses.map(digest)).size,4);assert.equal(new Set(poses.map(p=>JSON.stringify(hands(p)))).size,4);
});
test('reaction frames use a bounded, transparent canvas and distinct local lighting',()=>{
 for(const tool of ['breathe','hug','resonate','shuffle'])for(let frame=0;frame<=12;frame++){
  const pose=render(tool,frame/12);assert.equal(pose.width,320);assert.equal(pose.height,300);assert.equal(pose.stack.length,0);
  for(const p of pose.paint){assert(p.alpha>=0&&p.alpha<=1);for(const [x,y] of p.points){assert(Number.isFinite(x)&&Number.isFinite(y));assert(x>=0&&x<=320&&y>=0&&y<=300,tool+' frame '+frame+' draws outside the canvas');}}
  if(frame===6)assert(pose.commands.some(c=>c[0]==='createRadialGradient'),'a local light should accompany the gesture');
 }
});
