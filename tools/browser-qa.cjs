const {execFileSync}=require('node:child_process');const fs=require('node:fs'),assert=require('node:assert/strict'),path=require('node:path');
const cli=process.env.AGENT_BROWSER_CLI||'C:/Users/QueKun/AppData/Local/npm-cache/_npx/6de2aa2fded2970c/node_modules/agent-browser/bin/agent-browser-win32-x64.exe';
const session='sad-night-01a19c16',out=path.join(__dirname,'output');fs.mkdirSync(out,{recursive:true});
const resume=process.argv.includes('--resume-narrow');const checks=resume?JSON.parse(fs.readFileSync(path.join(out,'browser-qa.json'),'utf8')).checks.filter(c=>c.passed):[];const ab=(...args)=>execFileSync(cli,['--session',session,...args],{encoding:'utf8',timeout:45000,windowsHide:true});
const ev=s=>JSON.parse(ab('eval','--json',s)).data.result;
const app='cc.director.getScene().getChildByName("Canvas").getComponent("GameApp")';
const ready=()=>ab('wait','--fn','window.cc && '+app+'?.ready && !'+app+'.busy');
const state=()=>ev('(()=>{const a='+app+';return {screen:a.screen,width:a.width,height:a.height,boardX:a.boardX,boardY:a.boardY,cell:a.cell,run:a.profile.activeRun,result:a.result,profile:a.profile,frames:a.frames.filter(f=>f?.isValid).length,paused:a.paused,audioPaused:a.audio.paused,offline:window.__sadnessOffline?.type,mode:a.store.mode}})()');
const clickPoint=(x,y)=>{ab('mouse','move',String(Math.round(x)),String(Math.round(y)));ab('mouse','down');ab('mouse','up');};
const button=text=>{const pt=ev('(()=>{const a='+app+';const walk=n=>n.name==='+JSON.stringify('button '+text)+'?n:n.children.map(walk).find(Boolean);const n=walk(a.root);return n?{x:n.position.x+a.width/2,y:a.height/2-n.position.y}:null})()');assert(pt,'Button missing: '+text);clickPoint(pt.x,pt.y);};
const shot=name=>ab('screenshot',path.join(out,name+'.png'));
const check=(name,detail)=>{checks.push({name,passed:true,detail});console.log('PASS '+name);fs.writeFileSync(path.join(out,'browser-qa.json'),JSON.stringify({timestamp:new Date().toISOString(),checks},null,2));};
function legal(board){const B=require('../.test-build/domain/board');return B.findLegalMoves(board).sort((a,b)=>{const n=m=>{const q=board.map(x=>({...x}));[q[m.from],q[m.to]]=[q[m.to],q[m.from]];return B.findMatches(q).length;};return n(b)-n(a);});}
function swap(m,drag=true){const s=state(),p=i=>[s.boardX+(i%7+.5)*s.cell,s.boardY+(Math.floor(i/7)+.5)*s.cell],from=p(m.from),to=p(m.to);
 if(drag){ab('mouse','move',...from.map(x=>String(Math.round(x))));ab('mouse','down');ab('mouse','move',...to.map(x=>String(Math.round(x))),'--steps','8','--duration','200');ab('mouse','up');}else{clickPoint(...from);clickPoint(...to);}ready();
}
try{
 let s;if(!resume){
 ready();assert.equal(state().frames,6);check('six visible sprite frames initialized',6);
 if(state().screen==='home')button(state().run?'接着这一页':'坐一会儿');ready();assert.equal(state().screen,'game');shot('game-desktop-fixed');
 const before=state().run;swap(legal(before.board)[0]);s=state();assert(s.run?s.run.validSwaps===before.validSwaps+1:s.result?.runId===before.runId);check('cross-cell drag applies one valid exchange');
 if(s.screen==='game'){
  button('暂停');assert.equal(state().paused,true);button('回房间 · 保留这一局');button('接着这一页');ready();s=state();assert.equal(s.audioPaused,false);assert.equal(s.paused,false);check('pause to home to resume restores audio');
  const saved=state().run;ab('open','http://localhost:7456/');ready();s=state();assert.equal(s.screen,'home');assert.deepEqual(s.run.board,saved.board);assert.equal(s.run.sadness,saved.sadness);assert.equal(s.run.movesLeft,saved.movesLeft);assert.deepEqual(s.run.reserved,saved.reserved);check('reload restores board sadness moves and reserved inventory');button('接着这一页');ready();
 }
 for(let n=0;n<70;n++){s=state();if(s.screen==='result'&&s.result.outcome==='win')break;if(s.screen==='result'){button('再坐一会儿');ready();continue;}assert(s.run);swap(legal(s.run.board)[0],n%2===0);}
 s=state();assert.equal(s.result.outcome,'win');assert.equal(s.screen,'result');assert(s.result.stars>=1);shot('result-desktop');check('real UI play reaches victory and awards stars',{level:s.result.levelId,score:s.result.score,stars:s.result.stars});
 ab('wait','--fn',app+'.share && '+app+'.shareId==='+app+'.result.runId');
 const payload=ev('(async()=>{const a='+app+';const b=a.share.blob;const image=await createImageBitmap(b);return {width:image.width,height:image.height,bytes:b.size,text:a.share.text,runId:a.shareId}})()');assert.equal(payload.width,1080);assert.equal(payload.height,1920);assert(payload.text.includes('悲伤消消乐'));assert(!/device|userAgent|runId|revision/i.test(payload.text));check('local share PNG has expected dimensions and no identifiers',payload);
 // Save the exact in-memory generated PNG for visual QA.
 const data=ev('(async()=>{const a='+app+';return await new Promise(res=>{const f=new FileReader();f.onload=()=>res(f.result);f.readAsDataURL(a.share.blob)})})()');fs.writeFileSync(path.join(out,'share-card.png'),Buffer.from(data.split(',')[1],'base64'));
 button('留下这一刻');shot('share-menu');button('收好');
 button('翻到下一页');ready();ab('set','viewport','390','844');ab('wait','--fn',app+'.width===390');shot('game-mobile');s=state();assert(s.cell>=44);assert(s.boardY+s.cell*7+130<s.height+5);check('390px mobile board and tools fit',{cell:s.cell});
 } ab('set','viewport','320','568');ab('wait','--fn',app+'.width===320');shot('game-small');s=state();assert(s.cell>=44);const hit=ev('(()=>{const a='+app+';return a.tileNodes.map(n=>n.getComponent("cc.UITransform").width)})()');assert(hit.every(x=>x>=44));check('320px screen retains at least 44px cell hit targets',{cell:s.cell});
 ab('set','viewport','390','844');ab('wait','--fn',app+'.width===390');
 ab('wait','--fn','window.__sadnessOffline?.type==="offline-ready"');
 ab('set','offline','on');ab('open','http://localhost:7456/');ready();assert(state().run);button('接着这一页');ready();const offlineBefore=state().run;swap(legal(offlineBefore.board)[0]);s=state();assert(s.run?s.run.validSwaps===offlineBefore.validSwaps+1:!!s.result);shot('offline-mobile');check('offline reload and valid gameplay persist without network');for(let i=0;i<25&&state().run;i++)swap(legal(state().run.board)[0]);s=state();assert.equal(s.screen,'result');assert(['win','fail'].includes(s.result.outcome));const settled=s.result;ab('open','http://localhost:7456/');ready();assert.equal(state().profile.lastResult.runId,settled.runId);assert.equal(state().profile.lastResult.outcome,settled.outcome);check('complete offline game settles and survives offline reload',{outcome:settled.outcome,level:settled.levelId});
 ab('set','offline','off');const errors=ab('errors');assert(!errors.trim(),'Browser errors: '+errors);check('no uncaught browser errors');
 console.log(JSON.stringify({passed:checks.length,report:path.join(out,'browser-qa.json')}));
}catch(e){checks.push({name:'FAILED',passed:false,error:String(e)});fs.writeFileSync(path.join(out,'browser-qa.json'),JSON.stringify({checks},null,2));try{shot('qa-failure');ab('set','offline','off');}catch{}throw e;}


