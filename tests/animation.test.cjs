'use strict';
const {test}=require('node:test');
const a=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const ts=require(path.join(process.env.COCOS_CREATOR_HOME||'D:/_Cocos Games/Creator/3.8.8','resources/app.asar.unpacked/node_modules/typescript'));
const {createRun,findLegalMoves,applyAction}=require('../.test-build/domain/board');
const {LEVELS,configForRun}=require('../.test-build/domain/levels');
const {newProfile,startRun,availableInventory}=require('../.test-build/platform/progress');

// The engine cannot run in Node. This clock models only the engine boundary:
// scheduled callbacks, node parenting and tween positions; GameApp and rules are real.
function harness(reduced=false,realGame=false){
 let time=0,serial=0;const jobs=[],animations=[],saved=[],feedback=[],sparks=[],nodes=[],comboLabels=[],artFrames=[];
 const character=(healing,chapter,tool,phase)=>{const frame={healing,chapter,tool,phase};artFrames.push(frame);return frame;};
 class Vec3{constructor(x=0,y=0,z=0){Object.assign(this,{x,y,z});}clone(){return new Vec3(this.x,this.y,this.z);}}
 class Node{
  static EventType={TOUCH_START:'start',TOUCH_MOVE:'move',TOUCH_END:'end',NODE_DESTROYED:'destroy'};
  constructor(name=''){this.name=name;this.children=[];this.position=new Vec3();this.scale=new Vec3(1,1,1);this.angle=0;this.isValid=true;this.components=new Map();nodes.push(this);}
  setParent(parent){this.parent=parent;parent.children.push(this);}
  setSiblingIndex(index){if(!this.parent)return;const siblings=this.parent.children;siblings.splice(siblings.indexOf(this),1);siblings.splice(Math.max(0,Math.min(index,siblings.length)),0,this);}
  setPosition(x,y,z){this.position=typeof x==='number'?new Vec3(x,y,z):x.clone();}
  setScale(x,y,z){this.scale=typeof x==='number'?new Vec3(x,y,z):x.clone();}
  addComponent(Type){const component=new Type();component.node=this;this.components.set(Type,component);return component;}
  getComponent(Type){return this.components.get(Type);}
  getChildByName(name){return this.children.find(n=>n.name===name&&n.isValid);}
  on(){}
  destroy(){this.isValid=false;this.children.slice().forEach(n=>n.destroy());if(this.parent){const siblings=this.parent.children,index=siblings.indexOf(this);if(index>=0)siblings.splice(index,1);}}
 }
 class UITransform{setContentSize(width,height){this.width=width;this.height=height;}}
 class Graphics{constructor(){this.lines=[];}clear(){}roundRect(){}circle(){}moveTo(){}lineTo(x,y){this.lines.push({x,y});}fill(){}stroke(){}}
 class Sprite{static SizeMode={CUSTOM:0};}
 class Label{static Overflow={SHRINK:0};}
 class UIOpacity{constructor(){this.opacity=255;}get isValid(){return this.node.isValid;}}
 class Color{static fromHEX(){}}
 class Component{
  constructor(){this.node=new Node();this.node.addComponent(UITransform);this.isValid=true;}
  scheduleOnce(fn,delay){jobs.push({fn,at:time+delay,id:serial++});}
  unschedule(fn){for(const job of jobs)if(job.fn===fn)job.cancelled=true;}
 }
 function tween(target){
  const steps=[];let stopped=false,startedAt=0;
  const animation={to(duration,props,options){steps.push({duration,props,options});return animation;},by(duration,props,options){steps.push({duration,props,options,relative:true});return animation;},delay(duration){steps.push({duration,props:{}});return animation;},call(fn){steps.push({fn});return animation;},start(){startedAt=time;animations.push(animation);return animation;},stop(){stopped=true;return animation;},sample(now){
   if(stopped||!target.isValid)return;let elapsed=now-startedAt,complete=true;
   for(const step of steps){if(elapsed<0){complete=false;break;}if(step.fn){if(!step.called){step.called=true;step.fn();}continue;}
    if(!step.origin)step.origin=Object.fromEntries(Object.keys(step.props).map(key=>[key,typeof target[key]==='number'?target[key]:target[key].clone()]));
    const p=Math.min(1,elapsed/step.duration),ease=step.options?.easing,f=ease==='quadInOut'?(p<.5?2*p*p:1-(-2*p+2)**2/2):ease==='quadIn'?p*p:ease==='quadOut'?1-(1-p)**2:p;
    for(const [key,value]of Object.entries(step.props)){const begin=step.origin[key];if(typeof value==='number'){const end=step.relative?begin+value:value;target[key]=begin+(end-begin)*f;}
     else{const end=step.relative?new Vec3(begin.x+value.x,begin.y+value.y,begin.z+value.z):value;target[key]=new Vec3(begin.x+(end.x-begin.x)*f,begin.y+(end.y-begin.y)*f,begin.z+(end.z-begin.z)*f);}}
    if(p<1){complete=false;break;}elapsed-=step.duration;
   }if(complete)stopped=true;
  }};return animation;
 }
 const cc={_decorator:{ccclass:()=>Class=>Class},Component,Node,UITransform,Graphics,Color,Sprite,Label,UIOpacity,Vec3,tween,view:{setDesignResolutionSize(){}},ResolutionPolicy:{SHOW_ALL:0}};
 const source=fs.readFileSync(path.join(__dirname,'../assets/scripts/GameApp.ts'),'utf8');
 const code=ts.transpileModule(source,{compilerOptions:{target:ts.ScriptTarget.ES2020,module:ts.ModuleKind.CommonJS,experimentalDecorators:true}}).outputText;
 const module={exports:{}};
 new Function('require','module','exports',code)(id=>id==='cc'?cc:id==='./ui/Paint'?{PALETTE:[],cloudArt:hp=>({kind:'cloud',hp}),character}:require(path.join(__dirname,'../.test-build',id)),module,module.exports);
 global.window={innerWidth:390,innerHeight:844,matchMedia:()=>({matches:reduced})};global.document={hidden:false};
 const app=new module.exports.GameApp();
 app.ready=true;app.screen='game';app.profile=startRun(newProfile(),createRun(LEVELS[0],1,1));app.frames=Array.from({length:6},(_,color)=>({color}));
 app.audio={feedback:(type,wave)=>feedback.push({type,wave,time}),activate(){},suspend(){},resume(){},setRainIntensity(){}};
 app.store={mode:'persistent',commit:async profile=>{saved.push(structuredClone(profile));return {ok:true};}};
 app.texture=canvas=>canvas;app.disposeFrame=frame=>{if(frame)frame.disposed=true;};app.toast=()=>{};app.spark=i=>sparks.push({i,time});app.background=()=>{for(const name of ['background','soft shade'])new Node(name).setParent(app.layer);};if(!realGame)app.game=()=>app.drawBoard();app.mascot=(x,y,size,heal=app.healing)=>{app.faceFrame=character(heal,app.chapter);app.faceNode=app.image(app.faceFrame,x,y,size,size*.9375);app.faceBase=app.faceNode.position.clone();};app.accessibility=()=>{};app.resultView=()=>{};app.prepShare=async()=>{};
 app.render();
 // Creator updates Scheduler before TweenSystem in each frame, including slow frames.
 function advance(seconds){time+=seconds;const due=jobs.filter(j=>!j.cancelled&&j.at<=time+1e-9).sort((x,y)=>x.at-y.at||x.id-y.id);for(const job of due)if(!job.cancelled){job.cancelled=true;job.fn();}animations.slice().forEach(anim=>anim.sample(time));
  for(const node of nodes){if(!node.isValid||!/^combo \d+$/.test(node.name))continue;const text=node.getComponent(Label)?.string,wave=Number(node.name.slice(6)),last=comboLabels.at(-1);if(text&&(last?.text!==text||last.wave!==wave))comboLabels.push({wave,text});}
 }
 function until(predicate,seconds=10,onFrame=()=>{}){const deadline=time+seconds;while(!predicate()&&time<deadline){advance(1/60);onFrame();}a.ok(predicate(),'condition must be reached without hanging the animation');}
 function settle(onFrame){until(()=>!app.busy,10,onFrame);}
 return {app,advance,until,settle,saved,feedback,sparks,nodes,comboLabels,artFrames,Sprite,Label,UITransform,UIOpacity,Graphics,Node,world(node){const p=node.position.clone();for(let parent=node.parent;parent;parent=parent.parent){p.x+=parent.position.x;p.y+=parent.position.y;}return p;}};
}
function firstMove(app){return {type:'swap',...findLegalMoves(app.profile.activeRun.board)[0]};}
function invalidMove(app){const run=app.profile.activeRun;for(let i=0;i<49;i++)for(const j of [i%7<6?i+1:-1,i+7])if(j>=0&&j<49&&!applyAction(run,{type:'swap',from:i,to:j},LEVELS[0],app.profile.inventory).ok)return {type:'swap',from:i,to:j};throw Error('No invalid neighbor');}
function visibleBoard(h){return h.app.tileNodes.map(node=>{const sprite=node.children.find(n=>n.getComponent(h.Sprite))?.getComponent(h.Sprite),frame=sprite?.spriteFrame;return frame?.kind==='cloud'?{kind:'cloud',hp:frame.hp}:frame?{kind:'tile',color:frame.color}:null;});}
// Supply a loaded run directly: route unlock validation belongs to platform tests.
function cascadeFixture(h,terminal=false){const cfg=LEVELS[terminal?0:30],run=createRun(cfg,1,1);h.app.profile={...newProfile(),activeRun:run,nextRunId:2};h.app.render();const action={type:'swap',...(terminal?{from:44,to:45}:{from:23,to:30})},result=applyAction(run,action,cfg,h.app.profile.inventory);a.ok(result.ok);a.ok(result.events.filter(e=>e.type==='clear').length>=6,'fixture must exercise a long cascade');return {action,result};}
function navigationFixture(){
 const h=harness(),app=h.app,base=newProfile(),run=createRun(configForRun({levelId:1,configVersion:6}),99,1);
 base.levels[1]={bestScore:640,bestStars:2,pureThreeStars:false,consecutiveFailures:2,claimed:{clear:true,threeStars:false,pureThreeStars:false,chapter:false},lastResult:null,lastWinResult:null};
 base.inventory.breathe=2;base.inventory.hug=2;run.reserved.breathe=1;run.reserved.hug=1;run.movesLeft=17;run.activeMs=12345;run.score=231;run.matchScore=231;run.sadness=12;run.revision=3;
 app.profile=startRun(base,run);app.render=()=>{};const dialogs=[];app.dialog=(title,body,choices)=>{app.overlay=true;dialogs.push({title,body,choices});};
 return {...h,dialogs,choice(text){const found=dialogs.at(-1)?.choices.find(b=>b.text===text);a.ok(found,`dialog must offer “${text}”`);return found.fn;}};
}

test('tile artwork belongs to the moving cell, so its world position follows the slide',()=>{
 const h=harness(),cell=h.app.tileNodes[0],art=cell.children.find(n=>n.getComponent(h.Sprite));
 a.ok(art,'artwork must move with its cell');const before=h.world(art);cell.setPosition(cell.position.x+20,cell.position.y,0);a.equal(h.world(art).x,before.x+20);
});
test('accepted swap visibly crosses before clear effects and locks repeated input',async()=>{
 const h=harness(),app=h.app,move=firstMove(app),from=app.tileNodes[move.from],to=app.tileNodes[move.to],start=from.position.clone(),end=to.position.clone(),moves=app.profile.activeRun.movesLeft;
 await app.act(move);await app.act(move);a.equal(app.profile.activeRun.movesLeft,moves-1);a.equal(h.saved.length,1);a.equal(app.busy,true);
 h.advance(.09);const distance=Math.hypot(end.x-start.x,end.y-start.y),travel=Math.hypot(from.position.x-start.x,from.position.y-start.y);
 a.ok(travel>0&&travel<distance,'the tile must have an intermediate position');a.equal(h.sparks.length,0,'clear must wait for swap');
 h.advance(.10);a.deepEqual(from.position,end);h.advance(.01);a.ok(h.sparks.length>0);a.equal(app.tileNodes[move.to],from,'clear indices follow the swapped visuals');
 h.settle();a.equal(app.busy,false);
});
test('invalid adjacent swap slides out and back without charging or saving a move',async()=>{
 const h=harness(),app=h.app,move=invalidMove(app),node=app.tileNodes[move.from],origin=node.position.clone(),target=app.tileNodes[move.to].position.clone(),before=JSON.stringify(app.profile);
 await app.act(move);a.equal(app.busy,true);h.advance(.18);a.deepEqual(node.position,target);a.equal(JSON.stringify(app.profile),before);
 h.advance(.09);a.notDeepEqual(node.position,origin);h.advance(.10);a.deepEqual(node.position,origin);a.equal(app.busy,false);a.equal(h.saved.length,0);a.equal(h.sparks.length,0);
});
test('distant and cloud swaps never move either tile',async()=>{
 for(const action of [{type:'swap',from:0,to:8},{type:'swap',from:0,to:1}]){const h=harness(),app=h.app;if(action.to===1)app.profile.activeRun.board[1]={kind:'cloud',hp:3};const nodes=app.tileNodes.slice(),positions=nodes.map(n=>n.position.clone());await app.act(action);h.advance(.1);a.equal(app.busy,false);nodes.forEach((n,i)=>a.deepEqual(n.position,positions[i]));a.equal(h.saved.length,0);}
});
test('resize commits the completed view and releases input without stale animation callbacks',async()=>{
 const h=harness(),app=h.app;await app.act(firstMove(app));h.advance(.05);window.innerWidth=844;window.innerHeight=390;app.resizeHandler();
 a.equal(app.busy,false);a.equal(app.profile.activeRun.revision,1);const root=app.root;h.advance(3);a.equal(app.root,root,'cancelled callbacks must not rebuild the resized scene');a.equal(h.sparks.length,0);
});
test('hiding mid-swap saves the accepted state and releases animation lock',async()=>{
 const h=harness(),app=h.app,moves=app.profile.activeRun.movesLeft;await app.act(firstMove(app));h.advance(.05);document.hidden=true;app.visibilityHandler();
 a.equal(app.busy,false);a.equal(h.saved.at(-1).activeRun.movesLeft,moves-1);h.advance(3);a.equal(h.sparks.length,0);
});
test('reduced motion omits travel, scaling and particle motion but still finishes the move',async()=>{
 const h=harness(true),app=h.app,move=firstMove(app),node=app.tileNodes[move.from],origin=node.position.clone();await app.act(move);h.advance(.08);a.deepEqual(node.position,origin);a.deepEqual([node.scale.x,node.scale.y,node.scale.z],[1,1,1]);a.equal(h.sparks.length,0);h.settle();a.equal(app.busy,false);a.equal(app.profile.activeRun.revision,1);
});

test('tools preview without spending stock and require a separate confirmation',()=>{
 const h=harness(),app=h.app;app.profile.inventory.breathe=2;app.render=()=>{};app.audio.activate=()=>{};
 const before=JSON.stringify(app.profile),actions=[];app.act=action=>actions.push(action);
 app.chooseTool('breathe');a.equal(app.tool,'breathe');a.equal(app.toolTarget,-1);app.confirmTool();a.equal(actions.length,0);
 app.selectToolTarget(3);a.equal(JSON.stringify(app.profile),before);a.equal(actions.length,0);
 app.confirmTool();a.deepEqual(actions,[{type:'tool',tool:'breathe',target:3}]);
});
test('shuffle previews all ordinary cells and cancellation preserves inventory and board',()=>{
 const h=harness(),app=h.app;app.profile.inventory.shuffle=2;app.render=()=>{};app.audio.activate=()=>{};
 const before=JSON.stringify(app.profile);app.chooseTool('shuffle');a.equal(app.tool,'shuffle');a.equal(JSON.stringify(app.profile),before);
 app.cancelTool();a.equal(app.tool,null);a.equal(JSON.stringify(app.profile),before);
});
test('invalid tool targets and depleted inventory cannot be confirmed',()=>{
 const h=harness(),app=h.app;app.render=()=>{};app.audio.activate=()=>{};const actions=[];app.act=action=>actions.push(action);
 app.chooseTool('breathe');app.selectToolTarget(3);app.confirmTool();a.equal(actions.length,0);
 app.profile.inventory.breathe=2;app.profile.activeRun.board[3]={kind:'cloud',hp:3};app.selectToolTarget(3);app.confirmTool();a.equal(actions.length,0);
});

test('falling pieces have intermediate vertical positions and finish on the actual final board',async()=>{
 const h=harness(),app=h.app,{action,result}=cascadeFixture(h),fall=result.events.find(e=>e.type==='fall'),movement=fall.movements.find(m=>!m.spawned);
 a.ok(movement,'fixture includes an existing piece falling');const initialBoard=app.tileNodes[0].parent;
 await app.act(action);h.until(()=>app.tileNodes[0].parent!==initialBoard);
 const node=app.tileNodes[movement.to],origin=app.height/2-app.boardY-(movement.fromRow+.5)*app.cell,target=app.height/2-app.boardY-(Math.floor(movement.to/7)+.5)*app.cell;
 a.equal(node.position.y,origin);h.advance(.07);a.ok(node.position.y<origin&&node.position.y>target,'piece travels down instead of teleporting to its target');
 const accepted=JSON.stringify(app.profile.activeRun);await app.act(action);a.equal(JSON.stringify(app.profile.activeRun),accepted,'falling locks input');
 h.settle();a.deepEqual(visibleBoard(h),result.state.board);a.equal(h.saved.length,1);a.equal(app.busy,false);
});

test('cascade numbers and sounds follow real wave counts while shake increases within its cap and returns to zero',async()=>{
 const h=harness(),app=h.app,{action,result}=cascadeFixture(h),waves=result.events.filter(e=>e.type==='clear').map(e=>e.wave),positions=[];
 await app.act(action);h.settle(()=>positions.push(app.root.position.clone()));
 a.deepEqual(h.comboLabels.map(n=>n.wave),waves.slice(1));
 a.deepEqual(h.comboLabels.map(n=>n.text),waves.slice(1).map(w=>'心事松开了 ×'+w));
 a.deepEqual(h.feedback.filter(e=>e.type==='clear'||e.type==='chain').map(e=>[e.type,e.wave]),waves.map(w=>[w===1?'clear':'chain',w]));
 a.ok(positions.some(p=>Math.abs(p.x)>1),'enabled cascade shake visibly moves the root');
 a.ok(positions.every(p=>Math.abs(p.x)<=8&&Math.abs(p.y)<=8),'whole-screen movement is capped');
 a.deepEqual([app.root.position.x,app.root.position.y],[0,0]);
 const peaks=[];
 for(const wave of [2,3,6,20]){const animations=[];app.combo(wave,false,animations);h.advance(.035);peaks.push(Math.abs(app.root.position.x));h.advance(.2);}
 a.ok(peaks[1]>peaks[0]&&peaks[2]>peaks[1]);a.equal(peaks[2],peaks[3],'long combo counts do not amplify beyond the cap');a.ok(peaks[3]<=8);a.equal(app.root.position.x,0);
});

test('disabled shake and reduced motion keep the root still through a full cascade',async()=>{
 for(const reduced of [false,true]){const h=harness(reduced),app=h.app,{action,result}=cascadeFixture(h);if(!reduced)app.profile.settings.shake=false;
  await app.act(action);h.settle(()=>a.deepEqual([app.root.position.x,app.root.position.y],[0,0]));
  a.ok(h.comboLabels.some(n=>n.wave===2),'disabling movement retains readable combo feedback');a.deepEqual(visibleBoard(h),result.state.board);
 }
});

test('terminal cascades finish every wave even after settlement clears the active run',async()=>{
 const h=harness(),app=h.app,{action,result}=cascadeFixture(h,true);a.equal(result.outcome,'won');
 await app.act(action);a.equal(app.profile.activeRun,null);a.equal(app.busy,true);a.equal(app.screen,'game');
 let sawFinalBoard=false;h.settle(()=>{if(JSON.stringify(visibleBoard(h))===JSON.stringify(result.state.board))sawFinalBoard=true;});
 a.ok(sawFinalBoard,'the last wave is rendered even without an active run');a.equal(app.screen,'result');a.equal(app.busy,false);
 a.equal(h.feedback.filter(e=>e.type==='win').length,1);a.equal(app.profile.lastResult.score,result.state.score);
 a.deepEqual(h.comboLabels.map(n=>n.wave),[2,3,4,5,6]);
});

test('resizing or hiding during a fall cancels stale tweens and keeps the accepted board',async()=>{
 for(const interrupt of ['resize','hide']){const h=harness(),app=h.app,{action,result}=cascadeFixture(h),initialBoard=app.tileNodes[0].parent;
  await app.act(action);h.until(()=>app.tileNodes[0].parent!==initialBoard);h.advance(.07);a.equal(app.busy,true);
  if(interrupt==='resize'){window.innerWidth=844;window.innerHeight=600;app.resizeHandler();}else{document.hidden=true;app.visibilityHandler();}
  a.equal(app.busy,false);a.deepEqual(visibleBoard(h),result.state.board);const root=app.root,count=h.feedback.length;
  for(let frame=0;frame<180;frame++)h.advance(1/60);
  a.equal(app.root,root,'cancelled callbacks never replace the new scene');a.equal(h.feedback.length,count);a.deepEqual([root.position.x,root.position.y],[0,0]);
 }
});

test('all four confirmed tools animate their own effect before resolving the same domain result',()=>{
 for(const tool of ['breathe','hug','resonate','shuffle']){
  const h=harness(),app=h.app;app.profile.inventory[tool]=2;
  const action=tool==='shuffle'?{type:'tool',tool}:{type:'tool',tool,target:24},expected=applyAction(app.profile.activeRun,action,LEVELS[0],app.profile.inventory);a.ok(expected.ok);
  const before=JSON.stringify(app.profile);app.chooseTool(tool);if(tool!=='shuffle')app.selectToolTarget(24);a.equal(JSON.stringify(app.profile),before);
  app.confirmTool();a.equal(app.busy,true);a.ok(h.nodes.some(n=>n.name==='effect '+tool));a.ok(h.feedback.some(e=>e.type==='tool-'+tool));
  let sawBoard=false;h.settle(()=>{if(JSON.stringify(visibleBoard(h))===JSON.stringify(expected.state.board))sawBoard=true;});
  a.ok(sawBoard,'tool visual must reach the same board as the real rules');a.equal(h.saved.length,1);
  a.equal((app.profile.activeRun||expected.state).reserved[tool],1);
 }
});

test('resonance gently enlarges, brightens and shakes only the matching tiles, then clears them together without connecting lines',async()=>{
 const h=harness(),app=h.app;app.profile.inventory.resonate=2;const run=structuredClone(app.profile.activeRun),target=24,color=run.board[target].color,hit=run.board.flatMap((c,i)=>c.kind==='tile'&&c.color===color?[i]:[]),expected=applyAction(run,{type:'tool',tool:'resonate',target},LEVELS[0],app.profile.inventory);
 await app.act({type:'tool',tool:'resonate',target});const tiles=app.tileNodes.slice(),origins=tiles.map(n=>n.position.clone());
 const glows=hit.map(i=>tiles[i].getChildByName('effect resonate'));a.ok(glows.every(Boolean),'each matching tile must receive its own highlight');a.equal(h.nodes.filter(n=>n.isValid&&n.name==='effect resonate').length,hit.length);
 a.ok(h.nodes.every(n=>!(n.getComponent(h.Graphics)?.lines.length)),'resonance must not draw connecting segments');
 h.advance(.14);for(const i of hit){a.ok(tiles[i].scale.x>1&&tiles[i].scale.x<=1.14);a.ok(glows[hit.indexOf(i)].getComponent(h.UIOpacity).opacity>0);}
 for(const [i,n]of tiles.entries())if(!hit.includes(i)){a.equal(n.scale.x,1);a.deepEqual(n.position,origins[i]);a.equal(n.getChildByName('effect resonate'),undefined);}
 h.advance(.025);a.ok(hit.every(i=>Math.abs(tiles[i].position.x-origins[i].x)>0&&Math.abs(tiles[i].position.x-origins[i].x)<=3),'matching tiles gently shake together');a.equal(h.sparks.length,0,'no tile clears during the preparation');
 h.until(()=>h.sparks.length>0);a.deepEqual(h.sparks.slice(0,hit.length).map(s=>s.i).sort((x,y)=>x-y),hit);a.equal(new Set(h.sparks.slice(0,hit.length).map(s=>s.time)).size,1,'all hit cells begin clearing in the same frame');
 hit.forEach(i=>a.deepEqual(tiles[i].position,origins[i],'shake returns to the cell before clear'));h.advance(.1);const scale=tiles[hit[0]].scale.x;a.ok(scale<1.1);hit.forEach(i=>a.equal(tiles[i].scale.x,scale));
 h.settle();if(expected.outcome==='playing')a.deepEqual(app.profile.activeRun,expected.state);else{a.equal(app.result.outcome,expected.outcome==='won'?'win':'fail');a.equal(app.result.score,expected.state.score);}a.ok(glows.every(n=>!n.isValid),'cell highlights must be released');
});

test('resonance waits for the real preparation tween even when the next frame is late, and resize cancels old highlights',async()=>{
 const h=harness(),app=h.app;app.profile.inventory.resonate=1;let observed=[];app.spark=i=>observed.push({i,positions:app.tileNodes.map(n=>n.position.clone()),scales:app.tileNodes.map(n=>n.scale.x)});
 await app.act({type:'tool',tool:'resonate',target:24});const color=app.frames.findIndex(f=>f===app.tileNodes[24].children[0].getComponent(h.Sprite).spriteFrame),hit=app.tileNodes.flatMap((n,i)=>n.children[0].getComponent(h.Sprite)?.spriteFrame===app.frames[color]?[i]:[]),origins=app.tileNodes.map(n=>n.position.clone()),glows=h.nodes.filter(n=>n.name==='effect resonate');
 h.advance(1);a.ok(observed.length);a.ok(observed.every(o=>hit.every(i=>Math.abs(o.scales[i]-1.1)<1e-6&&JSON.stringify(o.positions[i])===JSON.stringify(origins[i]))),'clear waits for every tile preparation to finish before starting');
 app.resizeHandler();const root=app.root;a.equal(app.busy,false);a.ok(glows.every(n=>!n.isValid));h.advance(2);a.equal(app.root,root);
});

test('reduced-motion resonance keeps a short local highlight without scale or shake before resolving',async()=>{
 const h=harness(true),app=h.app;app.profile.inventory.resonate=1;await app.act({type:'tool',tool:'resonate',target:24});const tiles=app.tileNodes.slice(),origins=tiles.map(n=>n.position.clone()),glows=h.nodes.filter(n=>n.isValid&&n.name==='effect resonate');a.ok(glows.length>1,'matching tiles remain identifiable without motion');
 h.advance(.13);a.ok(glows.every(n=>n.getComponent(h.UIOpacity).opacity>0));tiles.forEach((n,i)=>{a.equal(n.scale.x,1);a.deepEqual(n.position,origins[i]);});a.ok(!h.feedback.some(f=>f.type==='clear'),'highlight precedes clear');h.settle();a.ok(glows.every(n=>!n.isValid));
});

test('a still-visible combo badge stays above the board when the next falling frame is drawn',async()=>{
 const h=harness(),app=h.app,{action}=cascadeFixture(h);await app.act(action);
 h.until(()=>h.nodes.some(n=>n.name==='combo 2'&&n.isValid));
 const badge=h.nodes.find(n=>n.name==='combo 2'),before=app.tileNodes[0].parent;
 h.until(()=>app.tileNodes[0].parent!==before);
 a.ok(badge.isValid,'fixture observes the badge before its fade finishes');
 const siblings=app.root.children;a.ok(siblings.indexOf(app.tileNodes[0].parent)<siblings.indexOf(badge),'board redraw must not cover the combo text');
 h.settle();
});

test('pausing gameplay and returning home keep background audio playing and preserve the run',()=>{
 const h=harness(),app=h.app;let buttons=[],suspends=0,audioPaused=false;const run=JSON.stringify(app.profile.activeRun);
 app.dialog=(_title,_body,choices)=>{buttons=choices;};app.render=()=>{};app.audio.resume=()=>{audioPaused=false;};app.audio.suspend=()=>{suspends++;audioPaused=true;};
 app.pauseMenu();a.equal(app.paused,true);a.equal(suspends,0,'game pause must not suspend background audio');a.equal(audioPaused,false);
 buttons.find(b=>b.text==='回到房间').fn();
 a.equal(app.screen,'home');a.equal(app.paused,false);a.equal(audioPaused,false);a.equal(suspends,0);a.equal(JSON.stringify(app.profile.activeRun),run);
});

test('choosing the unfinished page offers continue or restart before changing progress, and dismissal keeps the route',()=>{
 const h=navigationFixture(),app=h.app;app.screen='route';const before=structuredClone(app.profile);
 app.requestBegin(1);a.equal(app.screen,'route');a.equal(h.dialogs.at(-1)?.choices.length,3);h.choice('接着这一页');h.choice('重新翻开');h.choice('再想一会儿')();
 a.equal(app.screen,'route');a.equal(app.overlay,false);a.deepEqual(app.profile,before);a.equal(h.saved.length,0);
});

test('continuing an unfinished page retains its full v6 board, counters, reserved help and playback time',()=>{
 const h=navigationFixture(),app=h.app;app.screen='route';const before=structuredClone(app.profile);app.requestBegin(1);h.choice('接着这一页')();
 a.equal(app.screen,'game');a.equal(app.paused,false);a.equal(app.overlay,false);a.deepEqual(app.profile,before);a.equal(app.profile.activeRun.configVersion,6);a.equal(app.profile.activeRun.initialMoves,30);a.equal(h.saved.length,0);
});

test('restarting from the route requires a second decision and cancelling returns to the same page choices',()=>{
 const h=navigationFixture(),app=h.app;app.screen='route';const before=structuredClone(app.profile);app.requestBegin(1);h.choice('重新翻开')();
 a.equal(h.dialogs.length,2);a.deepEqual(app.profile,before);h.choice('再想一会儿')();
 h.choice('接着这一页');h.choice('重新翻开');a.equal(app.screen,'route');a.deepEqual(app.profile,before);a.equal(h.saved.length,0);
});

test('confirmed restart refunds reserved help, preserves failure and reward records, and creates one current-version round on repeated clicks',async()=>{
 const h=navigationFixture(),app=h.app;app.pauseMenu();h.choice('重新翻开')();const confirm=h.choice('重新翻开'),before=structuredClone(app.profile),stock=availableInventory(before);
 let release;app.audio.activate=()=>new Promise(resolve=>{release=resolve;});confirm();confirm();a.equal(app.busy,true);a.equal(app.profile.activeRun,null);release();await new Promise(resolve=>setImmediate(resolve));
 const run=app.profile.activeRun;a.ok(run);a.equal(run.runId,before.nextRunId);a.equal(app.profile.nextRunId,before.nextRunId+1);a.equal(run.configVersion,7);a.equal(run.initialMoves,LEVELS[0].baseMoves);a.equal(run.movesLeft,run.initialMoves);
 a.deepEqual(run.reserved,{breathe:0,hug:0,resonate:0,shuffle:0});a.deepEqual(app.profile.inventory,before.inventory);a.equal(availableInventory(app.profile).breathe,stock.breathe+1);a.equal(availableInventory(app.profile).hug,stock.hug+1);
 a.equal(app.profile.levels[1].consecutiveFailures,before.levels[1]?.consecutiveFailures||0);a.equal(app.profile.rewardSeed,before.rewardSeed);a.equal(app.profile.levels[1].bestScore,before.levels[1]?.bestScore||0);a.equal(app.profile.levels[1].bestStars,before.levels[1]?.bestStars||0);
 a.deepEqual(app.profile.levels[1].claimed,before.levels[1].claimed);
 a.deepEqual(app.profile.lastResult.awarded,{breathe:0,hug:0,resonate:0,shuffle:0});a.equal(app.profile.lastResult.outcome,'abandon');a.equal(app.profile.lastFinalizedRunId,before.activeRun.runId);a.equal(h.saved.length,1);a.equal(app.screen,'game');a.equal(app.paused,false);
});

test('the pause menu offers themed navigation, restart cancellation returns to it, and the route preserves the active page',()=>{
 const h=navigationFixture(),app=h.app;app.tool='hug';app.toolTarget=24;app.selected=12;const before=structuredClone(app.profile);
 app.pauseMenu();for(const text of ['接着这一页','重新翻开','翻翻夜间日记','听听雨和琴','回到房间'])h.choice(text);h.choice('重新翻开')();h.choice('再想一会儿')();
 a.equal(app.paused,true);h.choice('翻翻夜间日记')();a.equal(app.screen,'route');a.equal(app.paused,false);a.equal(app.overlay,false);a.equal(app.tool,null);a.equal(app.toolTarget,-1);a.equal(app.selected,-1);a.deepEqual(app.profile,before);
 app.requestBegin(1);h.choice('接着这一页')();a.equal(app.screen,'game');a.deepEqual(app.profile,before);
});

test('new-game creation ignores busy and conflicting input and coalesces a double click into one saved round',async()=>{
 const h=navigationFixture(),app=h.app;app.profile=newProfile();const before=structuredClone(app.profile);app.busy=true;await app.begin(1);a.deepEqual(app.profile,before);app.busy=false;app.conflict=true;await app.begin(1);a.deepEqual(app.profile,before);app.conflict=false;
 let release;app.audio.activate=()=>new Promise(resolve=>{release=resolve;});const first=app.begin(1),second=app.begin(1);a.equal(app.busy,true);release();await Promise.all([first,second]);
 a.equal(app.profile.activeRun.runId,1);a.equal(app.profile.nextRunId,2);a.equal(h.saved.length,1);
});

test('tab visibility restores background sound even with the game paused, but never overrides a conflict',()=>{
 const h=harness(),app=h.app;let suspends=0,resumes=0;app.paused=true;app.audio.suspend=()=>suspends++;app.audio.resume=()=>resumes++;
 document.hidden=true;app.visibilityHandler();a.equal(suspends,1);
 document.hidden=false;app.visibilityHandler();a.equal(resumes,1,'visible paused game still has background music');a.equal(app.paused,true);
 app.conflict=true;app.visibilityHandler();a.equal(resumes,1,'a storage conflict keeps the sound suspended');
});

test('combo feedback stays outside the board at its largest animated size on compact and desktop layouts',()=>{
 for(const [width,height]of [[320,568],[390,844],[1366,900]]){const h=harness(false,true),app=h.app;window.innerWidth=width;window.innerHeight=height;app.render();
  const animations=[];app.combo(20,false,animations);let observed=false;
  for(let frame=0;frame<40;frame++){h.advance(1/60);const badge=h.nodes.find(n=>n.isValid&&n.getComponent(h.Label)?.string.includes('×20'));if(!badge)continue;observed=true;
   const p=h.world(badge),size=badge.getComponent(h.UITransform),cx=p.x+app.width/2,cy=app.height/2-p.y,angle=badge.angle*Math.PI/180,hw=size.width*Math.abs(badge.scale.x)/2,hh=size.height*Math.abs(badge.scale.y)/2,halfW=hw*Math.abs(Math.cos(angle))+hh*Math.abs(Math.sin(angle)),halfH=hh*Math.abs(Math.cos(angle))+hw*Math.abs(Math.sin(angle)),left=app.boardX+app.root.position.x,top=app.boardY-app.root.position.y;
   a.ok(cx+halfW<=left||cx-halfW>=left+7*app.cell||cy+halfH<=top||cy-halfH>=top+7*app.cell,`${width}×${height}: combo must not cover any tile`);
   a.ok(cx-halfW>=0&&cx+halfW<=app.width&&cy-halfH>=0&&cy+halfH<=app.height,`${width}×${height}, frame ${frame}: feedback box (${cx-halfW},${cy-halfH})–(${cx+halfW},${cy+halfH}) must remain on-screen`);
  }
  a.ok(observed,'themed ×20 combo feedback must be visible');
 }
});

test('HUD advances each real clear wave without jumping to the saved final state or early victory bonus',async()=>{
 for(const scenario of ['winning swap','cloud hug']){
  const h=harness(false,true),app=h.app;let action;
  if(scenario==='winning swap')action={type:'swap',from:44,to:45};
  else{app.profile={...newProfile(),activeRun:createRun(LEVELS[2],1,1),nextRunId:2};app.profile.inventory.hug=1;app.profile.activeRun.board[24].hp=1;action={type:'tool',tool:'hug',target:24};app.render();}
  const before=structuredClone(app.profile.activeRun),cfg=configForRun(before),result=applyAction(before,action,cfg,app.profile.inventory);a.ok(result.ok);
  if(scenario==='winning swap')a.equal(result.outcome,'won');else a.ok(result.events.some(e=>e.type==='cloudClear'),'fixture must visibly clear a cloud');
  a.equal(typeof app.updateHud,'function','wave playback needs an independent HUD state updater');
  const original=app.updateHud,records=[];app.updateHud=function(run){original.call(this,run);records.push({busy:this.busy&&!!this.finishAction,run:structuredClone(run),moves:this.hudMoves?.getComponent(h.Label)?.string,sadness:this.hudSadness?.getComponent(h.Label)?.string,goal:this.hudGoal?.getComponent(h.Label)?.string});};
  await app.act(action);
  if(result.outcome==='won')a.equal(app.profile.activeRun,null,'logical settlement has already happened while visuals keep playing');
  a.ok(records.length,'accepted action immediately updates the move count');a.equal(records[0].run.movesLeft,result.state.movesLeft);a.equal(records[0].run.sadness,before.sadness);a.equal(records[0].run.score,before.score);
  h.settle();
  const clears=result.events.filter(e=>e.type==='clear'),expected=[];let score=before.score,matchScore=before.matchScore,cloudsCleared=before.cloudsCleared;
  for(const clear of clears){const clouds=result.events.filter(e=>e.type==='cloudClear'&&e.wave===clear.wave);score+=clear.value+clouds.reduce((sum,e)=>sum+e.value,0);matchScore+=clear.value;cloudsCleared+=clouds.length;expected.push({movesLeft:result.state.movesLeft,sadness:result.events.find(e=>e.type==='sadnessChanged'&&e.wave===clear.wave).value,score,matchScore,cloudsCleared,chainActions:before.chainActions+(clear.wave>=2?1:0)});}
  const fields=Object.keys(expected[0]),busy=records.filter(r=>r.busy);let wave=0;
  for(const record of busy){
   a.match(record.moves,new RegExp('还有\\s+'+record.run.movesLeft+'\\s+步'),'moves Label follows display state');
   a.match(record.sadness,new RegExp('心事\\s+'+record.run.sadness+'\\s*/'),'sadness Label follows display state');
   if(cfg.goals.cloudsTarget)a.ok(record.goal.includes('散云 '+record.run.cloudsCleared+' / '+cfg.goals.cloudsTarget),'cloud HUD updates when that wave clears a cloud');
   else a.ok(record.goal.includes(String(record.run.score)),'score HUD follows the displayed wave');
   if(wave<expected.length&&fields.every(k=>record.run[k]===expected[wave][k]))wave++;
   a.ok(record.run.score<=score,'animation HUD cannot include the unplayed victory bonus');
  }
  a.equal(wave,clears.length,'each wave must produce its own cumulative HUD state');
  if(result.outcome==='won'){a.equal(app.profile.lastResult.score,result.state.score);a.equal(result.state.score-score,20*result.state.movesLeft);}
 }
});

test('an existing v6 round still accepts moves with its original budget after new-game budgets change',async()=>{
 const h=harness(),app=h.app,cfg=configForRun({levelId:1,configVersion:6}),run=createRun(cfg,1,1);a.equal(run.initialMoves,30);
 app.profile=startRun(newProfile(),run);app.render();const action=firstMove(app),expected=applyAction(run,action,cfg,app.profile.inventory);a.ok(expected.ok);
 await app.act(action);h.settle();a.equal(h.saved.length,1);a.equal(app.profile.activeRun.configVersion,6);a.equal(app.profile.activeRun.initialMoves,30);a.equal(app.profile.activeRun.movesLeft,29);a.deepEqual(app.profile.activeRun,expected.state);
});

test('each tool animates intermediate mascot poses and releases them when returning to the healed base pose',()=>{
 for(const tool of ['breathe','hug','resonate','shuffle']){
  const h=harness(false,true),app=h.app,node=app.faceNode,sprite=node.getComponent(h.Sprite),origin=node.position.clone(),animations=[];
  app.reactToTool(tool,false,animations,(fn,delay)=>app.scheduleOnce(fn,delay));
  const reaction=app.reactionFrames.slice(),phases=new Set([sprite.spriteFrame.phase]);a.equal(sprite.spriteFrame.tool,tool);a.equal(app.reacting,true);
  // The art itself is a canvas boundary; frame selection and lifetime are real GameApp code.
  for(let frame=0;frame<70;frame++){h.advance(1/60);if(sprite.spriteFrame.tool){a.equal(sprite.spriteFrame.tool,tool);phases.add(sprite.spriteFrame.phase);}}
  a.ok(phases.size>=7,'reaction must show a sequence rather than a single replacement picture');a.ok(phases.has(0)&&[...phases].some(p=>p>=.75));
  a.equal(app.reacting,false);a.equal(sprite.spriteFrame.tool,undefined);a.equal(sprite.spriteFrame.healing,app.healing);a.equal(sprite.spriteFrame.disposed,undefined);
  a.ok(reaction.every(frame=>frame.disposed),'temporary reaction textures are released');a.deepEqual(node.position,origin);a.deepEqual([node.scale.x,node.scale.y,node.angle],[1,1,0]);
 }
});

test('reduced-motion tool reactions use a brief static mascot pose without movement',()=>{
 for(const tool of ['breathe','hug','resonate','shuffle']){
  const h=harness(true,true),app=h.app,node=app.faceNode,sprite=node.getComponent(h.Sprite),origin=node.position.clone(),animations=[];
  app.reactToTool(tool,true,animations,(fn,delay)=>app.scheduleOnce(fn,delay));const reaction=app.reactionFrames.slice();a.equal(sprite.spriteFrame.tool,tool);a.equal(sprite.spriteFrame.phase,.5);
  for(let frame=0;frame<24;frame++){h.advance(1/60);a.deepEqual(node.position,origin);a.deepEqual([node.scale.x,node.scale.y,node.angle],[1,1,0]);}
  a.equal(app.reacting,false);a.equal(sprite.spriteFrame.tool,undefined);a.ok(reaction.every(frame=>frame.disposed));
 }
});

test('a resize during the tool mascot reaction releases its frames and prevents old callbacks changing the new mascot',async()=>{
 const h=harness(false,true),app=h.app;app.profile.inventory.breathe=2;await app.act({type:'tool',tool:'breathe',target:24});
 a.equal(app.reacting,true);const old=app.faceNode,reaction=app.reactionFrames.slice();h.advance(.2);window.innerWidth=844;window.innerHeight=600;app.resizeHandler();
 a.equal(app.busy,false);a.equal(app.reacting,false);a.ok(reaction.every(frame=>frame.disposed));a.equal(old.isValid,false);
 const node=app.faceNode,base=node.getComponent(h.Sprite).spriteFrame;for(let frame=0;frame<100;frame++)h.advance(1/60);
 a.equal(app.faceNode,node);a.equal(node.getComponent(h.Sprite).spriteFrame,base);a.equal(base.tool,undefined);
});

