'use strict';
const {test}=require('node:test');
const a=require('node:assert/strict');
const {createHash}=require('node:crypto');
const fs=require('node:fs');
const path=require('node:path');
const {LEVELS,configForRun}=require('../.test-build/domain/levels');
const {createRun,findLegalMoves,findMatches,applyAction}=require('../.test-build/domain/board');
const previewPath=path.join(__dirname,'../.test-build/domain/feedback.js');
const previewTool=fs.existsSync(previewPath)?require(previewPath).previewTool:undefined;
const inv={breathe:5,hug:5,resonate:5,shuffle:5};
const copy=value=>structuredClone(value);

function traces(visit,configs=LEVELS){
 const tools=['breathe','hug','resonate','shuffle'];
 for(const cfg of configs)for(const seed of [17,628,9041]){
  let state=createRun(cfg,seed,cfg.id*10000+seed);visit({initial:state});
  for(let step=0;step<32&&state.phase==='playing';step++){
   const tool=tools[(cfg.id+step)%4],target=tool==='hug'?24:state.board.findIndex(c=>c.kind==='tile');
   const moves=findLegalMoves(state.board),action=step<2?{type:'tool',tool,target}:{type:'swap',...moves[(cfg.id+step+seed)%moves.length]};
   const result=applyAction(state,action,cfg,inv);a.ok(result.ok);visit({state,action,result});state=result.state;
  }
 }
}

test('visual event instrumentation preserves 225 explicit v6 games and every original rule event',()=>{
 const hash=createHash('sha256');let actions=0,waves=0,shuffles=0;
 traces(({initial,result})=>{if(initial){hash.update(JSON.stringify(initial));return;}
  hash.update(JSON.stringify(result.state));hash.update(JSON.stringify(result.events.map(({type,cells,wave,value})=>({type,cells,wave,value}))));
  actions++;waves+=result.events.filter(e=>e.type==='clear').length;shuffles+=result.events.filter(e=>e.type==='shuffle').length;
 },LEVELS.map(c=>configForRun({levelId:c.id,configVersion:6})));
 // Recorded from the unmodified rules before adding any animation metadata.
 a.equal(hash.digest('hex'),'4c6b8e70c87484e7d1859c11d2971b469ac06130c054d35d705ca9d5354725d5');
 a.deepEqual({actions,waves,shuffles},{actions:1217,waves:2906,shuffles:91});
});

test('every wave can be replayed from its clear snapshot through cloud damage and actual falling pieces',()=>{
 let moved=0,spawned=0,blockedSegments=0;
 traces(({initial,state,action,result})=>{
  if(initial)return;let board=copy(state.board);
  for(const event of result.events){
   if(event.type==='swap'){const [from,to]=event.cells;[board[from],board[to]]=[board[to],board[from]];}
   if(event.type==='clear'){
    a.ok(event.board,'clear needs its own pre-clear snapshot');a.deepEqual(event.board,board);
    if(event.wave>1||action.type==='swap')a.deepEqual(event.cells,findMatches(board));
    for(const i of event.cells){a.equal(board[i].kind,'tile');board[i]=null;}
   }
   if(event.type==='cloudHit')board[event.cells[0]].hp=event.value;
   if(event.type==='cloudClear')board[event.cells[0]]=null;
   if(event.type==='cloudSpawn')board[event.cells[0]]={kind:'cloud',hp:event.value};
   if(event.type==='fall'){
    a.ok(event.board,'fall needs its completed board');a.ok(Array.isArray(event.movements),'fall needs actual movement origins');
    const before=copy(board),destinations=new Set();
    for(const move of event.movements){
     a.equal(move.cell.kind,'tile');a.ok(!destinations.has(move.to));destinations.add(move.to);
     a.deepEqual(move.cell,event.board[move.to]);
     const col=move.to%7,row=Math.floor(move.to/7);let top=row;
     while(top>0&&before[(top-1)*7+col]?.kind!=='cloud')top--;
     if(top>0)blockedSegments++;
     if(move.spawned){spawned++;a.ok(move.fromRow<top,'new piece starts above its own segment');}
     else{moved++;a.ok(move.fromRow>=top&&move.fromRow<row,'survivors fall down within their cloud-bounded segment');a.deepEqual(move.cell,before[move.fromRow*7+col]);board[move.fromRow*7+col]=null;}
    }
    for(const move of event.movements)board[move.to]=copy(move.cell);
    a.deepEqual(board,event.board,'movement list reconstructs all 49 positions including unmoving tiles');
   }
   if(event.type==='shuffle'){
    a.ok(event.board,'shuffle needs its resulting board');
    board.forEach((cell,i)=>{if(cell.kind==='cloud')a.deepEqual(event.board[i],cell);});
    a.equal(findMatches(event.board).length,0);a.ok(findLegalMoves(event.board).length);board=copy(event.board);
   }
  }
  a.deepEqual(board,result.state.board,'last visual frame must match accepted state');
 });
 a.ok(moved>0&&spawned>0&&blockedSegments>0,'audit must include falling, replenishment and cloud barriers');
});

test('wave boards and movement cells stay independent from later cloud mutations and final state',()=>{
 const cfg=LEVELS.find(c=>c.initialClouds.length),state=createRun(cfg,17,1);
 const result=applyAction(state,{type:'tool',tool:'hug',target:cfg.initialClouds[0]},cfg,inv);a.ok(result.ok);
 const clear=result.events.find(e=>e.type==='clear');a.ok(clear.board,'clear snapshot missing');
 a.equal(clear.board[cfg.initialClouds[0]].hp,3,'snapshot is taken before damage');
 const captured=JSON.stringify(result.events);
 result.state.board.forEach(cell=>{if(cell.kind==='cloud')cell.hp=99;else cell.color=99;});
 a.equal(JSON.stringify(result.events),captured,'render snapshots must not alias final state');
 const fall=result.events.find(e=>e.type==='fall'),move=fall.movements[0];
 if(move){const cell=copy(fall.board[move.to]);move.cell.color=42;a.deepEqual(fall.board[move.to],cell,'movement cell is independently owned');}
});

test('tool previews show exactly the first affected tiles, including cloud-centered hugs and shuffle exclusions',()=>{
 a.equal(typeof previewTool,'function','pure previewTool helper must exist');
 const cfg=LEVELS.find(c=>c.initialClouds.length),state=createRun(cfg,628,1),before=JSON.stringify(state);
 for(const tool of ['breathe','hug','resonate','shuffle'])for(const target of [undefined,-1,0,24,48,49,.5,cfg.initialClouds[0]]){
  const cells=previewTool(state.board,tool,target),result=applyAction(state,{type:'tool',tool,target},cfg,inv);
  if(!result.ok){a.deepEqual(cells,[]);continue;}
  a.deepEqual(cells,tool==='shuffle'?state.board.flatMap((c,i)=>c.kind==='tile'?[i]:[]):result.events.find(e=>e.type==='clear').cells);
  a.equal(new Set(cells).size,cells.length);cells.forEach(i=>a.equal(state.board[i].kind,'tile'));
 }
 a.equal(JSON.stringify(state),before,'previews do not reserve stock or mutate the board');
 a.deepEqual(previewTool(state.board,'breathe',cfg.initialClouds[0]),[]);
 a.ok(previewTool(state.board,'hug',cfg.initialClouds[0]).length>0);
});
