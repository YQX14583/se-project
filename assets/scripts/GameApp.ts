import { _decorator, Component, Node, UITransform, Label, Graphics, Color, Sprite, SpriteFrame, Texture2D, ImageAsset, Font, AudioClip, resources, view, ResolutionPolicy, Vec3, UIOpacity, tween, EventTouch } from 'cc';
import { LEVELS, CHAPTERS, configForRun } from './domain/levels';
import { Action, Cell, RunState, Tool } from './domain/model';
import { previewTool } from './domain/feedback';
import { createRun, applyAction, findLegalMoves } from './domain/board';
import { Profile, ResultRecord, newProfile, startRun, finalize, unlockedLevel, availableInventory, totals, TOOLS } from './platform/progress';
import { SaveStore, SAVE_KEY } from './platform/save';
import { AudioController } from './platform/audio';
import { gameLayout } from './platform/game-layout';
import { rainIntensity, rainStrokes } from './platform/weather';
import { storyTitle } from './domain/story';
import { GUIDE_PAGES } from './domain/guide';
import { renderShare, SharePayload, saveImage, copyText, sharePrepared, shareText } from './platform/share';
import { room, character, tileArt, cloudArt, PALETTE } from './ui/Paint';
const { ccclass } = _decorator;
const INK='#f0e6d4', MUTED='#bcb9cb', PEACH='#e8bc9d', DARK='#37344b';
type Screen='home'|'route'|'game'|'result'|'diary';
const names:Record<Tool,string>={breathe:'深呼吸',hug:'拥抱',resonate:'共鸣',shuffle:'换气'};
const toolMarks:Record<Tool,string>={breathe:'·',hug:'♡',resonate:'✧',shuffle:'↻'};
const toolText:Record<Tool,string>={breathe:'轻轻吹散 1 个小物，上方小物落下来。',hug:'抱住一片 3×3 的小物，边缘会缩小。',resonate:'让整盘同色的小物一起散开。',shuffle:'重排所有小物，云朵留在原地。'};
@ccclass('GameApp')
export class GameApp extends Component {
 private root:Node|null=null; private layer:Node|null=null; private modal:Node|null=null; private font:Font|null=null; private frames:SpriteFrame[]=[];private ownedTextures=new WeakMap<SpriteFrame,Texture2D>();
 private roomFrame:SpriteFrame|null=null;private roomKey='';private faceFrame:SpriteFrame|null=null;private faceNode:Node|null=null;private faceBase=new Vec3();
 private reactionFrames:SpriteFrame[]=[];private reacting=false;private displayRun:RunState|null=null;
 private rainGraphics:Graphics|null=null;private rainScale=1;private rainAmount=-1;private rainTick=0;
 private hudMoves:Node|null=null;private hudSadness:Node|null=null;private hudGoal:Node|null=null;private hudEmotion:Node|null=null;private feedbackNode:Node|null=null;
 private store=new SaveStore();private audio=new AudioController();private profile:Profile=newProfile();private screen:Screen='home';private loadMessage='';
 private chapter=0;private selected=-1;private tool:Tool|null=null;private toolTarget=-1;private busy=false;private paused=false;private overlay=false;private conflict=false;
 private result:ResultRecord|null=null;private share:SharePayload|null=null;private shareUrl='';private shareBusy=false;private shareId=0;private shareRequest=0;private fontFamily='sans-serif';
 private width=390;private height=844;private now=0;private hintIdle=0;private hintCells:number[]=[];private toastText='';private toastUntil=0;private toastNode:Node|null=null;
 private tileNodes:Node[]=[];private boardX=0;private boardY=0;private cell=44;private safeBottom=0;private ready=false;private finishAction:(()=>void)|null=null;
 private resizeHandler=()=>{if(this.ready)this.render();};
 private visibilityHandler=()=>{if(document.hidden){if(this.finishAction)this.render();this.audio.suspend();if(this.ready)void this.persist();}else if(!this.conflict)void this.audio.resume();};
 private offlineHandler=()=>{if(this.ready&&this.screen==='home')this.render();};
 private storageHandler=(e:StorageEvent)=>{if(e.key===SAVE_KEY&&this.ready){this.conflict=true;this.paused=true;this.audio.suspend();this.showConflict();}};
 async start(){
  this.profile=await this.store.load();this.loadMessage=this.store.message;
  try{this.font=await new Promise<Font>((resolve,reject)=>resources.load('fonts/Cartoon',Font,(err,font)=>err?reject(err):resolve(font)));
   try{const face=new FontFace('NightCartoon','url("'+this.font.nativeUrl+'")');await face.load();(document.fonts as FontFaceSet & {add(font:FontFace):unknown}).add(face);this.fontFamily='NightCartoon';}catch{}
  }catch{console.warn('Cartoon font could not load; using sans-serif.');}
  this.frames=Array.from({length:6},(_,i)=>this.texture(tileArt(i)));
  this.audio.setSettings(this.profile.settings);
  resources.load('audio/NightPiano',AudioClip,(err,clip)=>{if(!err&&this.isValid)this.audio.setPianoUrl(clip.nativeUrl);});
  this.chapter=this.profile.activeRun?LEVELS[this.profile.activeRun.levelId-1].chapter-1:Math.floor((unlockedLevel(this.profile)-1)/15);
  this.ready=true;
  window.addEventListener('resize',this.resizeHandler);document.addEventListener('visibilitychange',this.visibilityHandler);
  window.addEventListener('sadness-offline',this.offlineHandler);window.addEventListener('storage',this.storageHandler);
  if(this.profile.activeRun&&this.profile.activeRun.phase!=='playing'){const r=this.profile.activeRun;this.settle(r,r.phase==='won'?'win':'fail');await this.persist();}
  this.render();
 }
 onDestroy(){this.finishAction?.();window.removeEventListener('resize',this.resizeHandler);document.removeEventListener('visibilitychange',this.visibilityHandler);window.removeEventListener('sadness-offline',this.offlineHandler);window.removeEventListener('storage',this.storageHandler);this.audio.destroy();this.releaseShare();this.frames.forEach(f=>this.disposeFrame(f));this.disposeFrame(this.roomFrame);this.disposeFrame(this.faceFrame);document.getElementById('night-status')?.remove();}
 update(dt:number){if(!this.ready)return;this.now+=dt;
  const weatherTime=window.matchMedia('(prefers-reduced-motion: reduce)').matches?0:this.now,target=rainIntensity(this.chapter,this.healing,weatherTime);
  this.rainAmount=this.rainAmount<0?target:this.rainAmount+(target-this.rainAmount)*(1-Math.exp(-Math.min(dt,.1)*1.8));this.audio.setRainIntensity(this.rainAmount);
  this.rainTick+=dt;if(this.rainTick>=.05){this.rainTick=0;this.drawRain(weatherTime);}
  const run=this.profile.activeRun;if(this.screen==='game'&&run&&!this.paused&&!this.overlay&&!document.hidden&&!this.busy){run.activeMs+=Math.round(dt*1000);this.hintIdle+=dt;if(this.hintIdle>8&&this.hintCells.length===0){const m=findLegalMoves(run.board)[0];if(m){this.hintCells=[m.from,m.to];this.drawBoard();}}}
  if(this.faceNode?.isValid&&!this.reacting&&!window.matchMedia('(prefers-reduced-motion: reduce)').matches){this.faceNode.setPosition(this.faceBase.x,this.faceBase.y+Math.sin(this.now*1.4)*2.2,0);}
  if(this.toastNode?.isValid&&this.now>this.toastUntil){this.toastNode.destroy();this.toastNode=null;}
 }
 private texture(canvas:HTMLCanvasElement){const image=new ImageAsset(canvas);const texture=new Texture2D();texture.image=image;const frame=new SpriteFrame();frame.texture=texture;this.ownedTextures.set(frame,texture);return frame;}
 private disposeFrame(f:SpriteFrame|null){if(f){const t=this.ownedTextures.get(f);const i=t?.image;this.ownedTextures.delete(f);f.destroy();t?.destroy();i?.destroy();}}
 private color(hex:string,alpha=255){const c=new Color();Color.fromHEX(c,hex);c.a=alpha;return c;}
 private makeNode(name:string,x:number,y:number,w:number,h:number,parent=this.layer!){const n=new Node(name);n.layer=1<<25;n.setParent(parent);n.addComponent(UITransform).setContentSize(w,h);n.setPosition(x-this.width/2,this.height/2-y,0);return n;}
 private rect(name:string,x:number,y:number,w:number,h:number,fill:string,stroke='',radius=18,parent=this.layer!,alpha=255){
  const n=this.makeNode(name,x,y,w,h,parent),g=n.addComponent(Graphics);g.fillColor=this.color(fill,alpha);g.roundRect(-w/2,-h/2,w,h,radius);g.fill();if(stroke){g.strokeColor=this.color(stroke);g.lineWidth=1.6;g.stroke();}return n;
 }
 private label(text:string,x:number,y:number,size=22,color=INK,w=320,h=40,parent=this.layer!,align=1){
  const n=this.makeNode(text.slice(0,18),x,y,w,h,parent),l=n.addComponent(Label);l.string=text;l.fontSize=size;l.lineHeight=size*1.5;l.color=this.color(color);l.horizontalAlign=align;l.verticalAlign=1;l.overflow=Label.Overflow.SHRINK;l.enableWrapText=true;if(this.font){l.font=this.font;l.useSystemFont=false;}else l.fontFamily='sans-serif';return n;
 }
 private image(frame:SpriteFrame,x:number,y:number,w:number,h:number,parent=this.layer!){const n=this.makeNode('illustration',x,y,w,h,parent);const s=n.addComponent(Sprite);s.sizeMode=Sprite.SizeMode.CUSTOM;s.spriteFrame=frame;n.getComponent(UITransform)!.setContentSize(w,h);return n;}
 private button(text:string,x:number,y:number,w:number,h:number,fn:()=>void,primary=false,parent=this.layer!,disabled=false){
  const n=this.rect('button '+text,x,y,w,h,primary?PEACH:'#44475e',primary?'#f0d2ae':'#73738a',Math.min(22,h*.4),parent,disabled?110:245);
  if(primary)n.angle=-1.3;
  this.label(text,x,y,Math.min(23,h*.38),primary?DARK:INK,w-18,h-4,parent);
  n.on(Node.EventType.TOUCH_END,(e:EventTouch)=>{e.propagationStopped=true;if(disabled||this.busy||this.conflict)return;void this.audio.activate();fn();});
  return n;
 }
 private bare(text:string,x:number,y:number,w:number,fn:()=>void,parent=this.layer!){return this.button(text,x,y,w,44,fn,false,parent);}
 private get portrait(){return this.width<760;}
 private get cfg(){return this.profile.activeRun?configForRun(this.profile.activeRun):LEVELS[(this.result?.levelId||unlockedLevel(this.profile))-1];}
 private get healing(){const r=this.displayRun||this.profile.activeRun;return this.screen==='game'&&r?1-r.sadness/LEVELS[r.levelId-1].sadnessStart:this.screen==='result'&&this.result?.outcome==='win'?1:Math.min(.35,totals(this.profile).cleared/75);}
 private async persist(){try{const r=await this.store.commit(this.profile);if(r.conflict){this.conflict=true;this.paused=true;this.showConflict();}else if(!r.ok)this.toast(this.store.message||'这一页暂时无法保存，请先别关掉。');return r.ok;}catch(e){console.error('Save failed',e);this.toast('暂时未能保存，仍可继续游玩。');return false;}}
 private render(){
  if(!this.ready)return;this.finishAction?.();this.width=Math.max(320,window.innerWidth);this.height=Math.max(540,window.innerHeight);
  const safe=(window as any).__sadnessSafeArea?.();this.safeBottom=Math.min(34,safe?.bottom||0);
  view.setDesignResolutionSize(this.width,this.height,ResolutionPolicy.SHOW_ALL);
  this.node.getComponent(UITransform)?.setContentSize(this.width,this.height);
  this.root?.destroy();this.root=new Node('NightGameUI');this.root.layer=1<<25;this.root.setParent(this.node);this.layer=this.root;
  this.modal=null;this.overlay=false;this.faceNode=null;this.toastNode=null;this.hudMoves=null;this.hudSadness=null;this.hudGoal=null;this.hudEmotion=null;this.feedbackNode=null;
  this.background();if(this.screen==='home')this.home();else if(this.screen==='route')this.route();else if(this.screen==='game')this.game();else if(this.screen==='result')this.resultView();else this.diary();
  if(this.store.mode==='memory')this.label('临时会话 · 关闭页面后可能无法保留进度',this.width/2,this.height-12-this.safeBottom,12,'#dbc9b3',this.width-16,24);
  this.accessibility();if(this.paused&&this.screen==='game')this.pauseMenu();if(this.conflict)this.showConflict();
  else if(this.loadMessage)this.dialog('关于这一页',this.loadMessage,[{text:'收好',fn:()=>{this.loadMessage='';this.closeModal();}}]);
 }
 private background(){
  const key=this.chapter+':'+Math.round(this.healing*10);if(key!==this.roomKey){this.disposeFrame(this.roomFrame);this.roomFrame=this.texture(room(this.chapter,this.healing));this.roomKey=key;}
  const h=this.height,scale=Math.max(this.width/1440,h/960);const imageW=1440*scale,imageH=960*scale;
  const x=this.portrait?(this.width/2+(720-440)*scale):this.width/2;
  const background=this.image(this.roomFrame!,x,h/2,imageW,imageH),rain=new Node('window rain');rain.layer=1<<25;rain.setParent(background);rain.addComponent(UITransform).setContentSize(imageW,imageH);this.rainGraphics=rain.addComponent(Graphics);this.rainScale=scale;
  const weatherTime=window.matchMedia('(prefers-reduced-motion: reduce)').matches?0:this.now;if(this.rainAmount<0)this.rainAmount=rainIntensity(this.chapter,this.healing,weatherTime);this.drawRain(weatherTime);
  if(this.screen!=='home')this.rect('soft shade',this.width/2,h/2,this.width,h,'#192238','',0,this.layer!,this.portrait?166:50);
 }
 private drawRain(seconds:number){const g=this.rainGraphics;if(!g?.isValid)return;g.clear();g.lineWidth=1.5*this.rainScale;for(const r of rainStrokes(this.rainAmount,seconds)){g.strokeColor=this.color('#afc8d8',Math.round(r.alpha*255));g.moveTo((r.x1-720)*this.rainScale,(480-r.y1)*this.rainScale);g.lineTo((r.x2-720)*this.rainScale,(480-r.y2)*this.rainScale);g.stroke();}}
 private mascot(x:number,y:number,size:number,heal=this.healing){this.disposeFrame(this.faceFrame);this.faceFrame=this.texture(character(heal,this.chapter));this.faceNode=this.image(this.faceFrame,x,y,size,size*.9375);this.faceBase=this.faceNode.position.clone();}
 private home(){
  const w=this.width,h=this.height,p=this.portrait,x=p?w/2:w*.72,compact=p&&h<650;
  const buttonY=p?Math.min(h*.74,h-154-this.safeBottom):h*.68,copyY=p?Math.min(h*.60,buttonY-72):h*.51;
  this.label('夜已经很深了',p?w/2:160,p?43:50,17,'#d6c8bf',220);
  if(p){const titleY=compact?100:h*.20,mascotY=compact?(135+copyY-35)/2:h*.43,size=compact?Math.min(180,(copyY-170)/.9375):Math.min(205,w*.53);this.mascot(w*.5,mascotY,size,.15);this.label('悲伤消消乐',w/2,titleY,48,INK,w-20,compact?70:80);}
  else{this.mascot(w*.285,h*.79,Math.min(260,w*.21),.15);this.label('悲伤\n消消乐',x,h*.29,Math.min(82,w*.07),INK,450,220);}
  this.label('把今晚的心事，\n轻轻放下一点。',x,copyY,p?22:26,'#d0c8cf',330,p?70:90);
  const bw=p?Math.min(280,w-40):310;
  this.button(this.profile.activeRun?'接着这一页':'把心事放下来',x,buttonY,bw,58,()=>{if(this.profile.activeRun)this.resume();else void this.begin(unlockedLevel(this.profile));},true);
  this.button('翻翻夜间日记',x,buttonY+62,bw,46,()=>this.openRoute());
  this.button('听听雨和琴',x-bw/4-3,buttonY+116,bw/2-6,44,()=>this.settingsMenu());
  this.button('陪我学一会',x+bw/4+3,buttonY+116,bw/2-6,44,()=>this.guideMenu());
 }
 private route(){
  const w=this.width,h=this.height,p=this.portrait,compact=h-this.safeBottom<680;
  this.bare('← 房间',65,38,102,()=>{this.screen='home';this.render();});
  this.label('那些睡不着的夜',w/2,compact?78:85,p?28:42,INK,w-50,44);
  const cx=w/2,chapterY=compact?123:140;this.label('第 '+String(this.chapter+1).padStart(2,'0')+' 章 · '+CHAPTERS[this.chapter].title,cx,chapterY,23,PEACH,w-100,36);
  this.bare('‹',cx-Math.min(140,w/2-30),chapterY,46,()=>{this.chapter=(this.chapter+4)%5;this.render();});this.bare('›',cx+Math.min(140,w/2-30),chapterY,46,()=>{this.chapter=(this.chapter+1)%5;this.render();});
  this.label(CHAPTERS[this.chapter].subtitle,cx,compact?159:182,16,MUTED,w-32,26);
  const columns=p?3:5,rows=15/columns,dx=p?Math.min(98,(w-40)/3):118,y0=compact?204:245,diaryY=h-42-this.safeBottom,dy=Math.min(p?83:110,(diaryY-62-y0)/(rows-1));
  const x0=cx-(columns-1)*dx/2;
  const points:{x:number,y:number,id:number}[]=[];
  for(let i=0;i<15;i++){const row=Math.floor(i/columns),col=row%2?columns-1-i%columns:i%columns;points.push({x:x0+col*dx+Math.sin(i*1.7)*5,y:y0+row*dy+(compact?0:Math.cos(i*1.2)*4),id:this.chapter*15+i+1});}
  const lineNode=this.makeNode('thread',w/2,h/2,w,h),g=lineNode.addComponent(Graphics);g.strokeColor=this.color('#828093',110);g.lineWidth=2;points.forEach((pt,i)=>{const x=pt.x-w/2,y=h/2-pt.y;i?g.lineTo(x,y):g.moveTo(x,y);});g.stroke();
  const max=unlockedLevel(this.profile);for(const pt of points){const locked=pt.id>max,stars=this.profile.levels[pt.id]?.bestStars||0;
   const n=this.rect('night '+pt.id,pt.x,pt.y,62,compact?44:56,locked?'#3a3d50':pt.id===max?'#d7b99c':'#69677b',locked?'#626075':'#d2bda8',16,this.layer!,locked?150:250);n.angle=Math.sin(pt.id)*3;
   this.label(locked?'·':String(pt.id).padStart(2,'0'),pt.x,pt.y-(stars?7:0),compact?21:23,pt.id===max?DARK:INK,60,28);
   if(stars)this.label('★'.repeat(stars),pt.x,pt.y+14,10,'#dfc28e',54,14);
   n.on(Node.EventType.TOUCH_END,()=>{if(this.overlay||this.busy||this.conflict)return;if(locked)this.toast('先走完前面这一页，不需要攒星星。');else{void this.audio.activate();this.requestBegin(pt.id);}});
  }
  const diaryUnlocked=!!this.profile.levels[(this.chapter+1)*15]?.bestStars;
  this.button(diaryUnlocked?'打开章末日记':'章末日记 · 走完这一章后打开',cx,diaryY,p?w-42:360,48,()=>{if(diaryUnlocked){this.screen='diary';this.render();}},false,this.layer!,!diaryUnlocked);
 }
 private requestBegin(id:number){
  if(this.busy||this.conflict||id<1||id>unlockedLevel(this.profile))return;const run=this.profile.activeRun,title=storyTitle(id);
  if(run?.levelId===id)this.dialog('这一页，还留着灯','第 '+id+' 页 · '+title+'\n接着刚才的心事，或重新写一遍。',[{text:'接着这一页',fn:()=>this.resume()},{text:'重新翻开',fn:()=>this.confirmRestart()},{text:'再想一会儿',fn:()=>this.closeModal()}]);
  else if(run)this.dialog('翻到另一页？','第 '+id+' 页 · '+title+'\n当前盘面会放下，用过的帮助会退还。',[{text:'接着原来那一页',fn:()=>this.resume()},{text:'翻到新的一页',fn:()=>{if(this.busy||this.profile.activeRun?.runId!==run.runId)return;this.settle(run,'abandon');this.closeModal();void this.begin(id);}},{text:'再想一会儿',fn:()=>this.closeModal()}]);
  else this.dialog('今晚，陪你翻这一页','第 '+id+' 页 · '+CHAPTERS[LEVELS[id-1].chapter-1].title+'\n'+title,[{text:'翻开这一页',fn:()=>{this.closeModal();void this.begin(id);}},{text:'再看看日记',fn:()=>this.closeModal()}]);
 }
 private confirmRestart(){
  const run=this.profile.activeRun;if(!run||this.busy||this.conflict)return;const fromPause=this.paused;
  this.dialog('把这一页重新翻开？','这局的盘面与步数会重新开始。\n用过的帮助会退还，最好成绩还在。\n这次重开不会记作失败。',[{text:'重新翻开',fn:()=>{if(this.busy||this.profile.activeRun?.runId!==run.runId)return;this.settle(run,'abandon');this.closeModal();void this.begin(run.levelId);}},{text:'再想一会儿',fn:()=>fromPause?this.pauseMenu():this.requestBegin(run.levelId)}]);
 }
 private openRoute(){if(this.busy||this.conflict)return;this.paused=false;this.selected=-1;this.tool=null;this.toolTarget=-1;this.closeModal();this.screen='route';void this.persist();this.render();}
 private resume(){this.chapter=LEVELS[this.profile.activeRun!.levelId-1].chapter-1;this.screen='game';this.paused=false;this.closeModal();this.audio.resume();this.render();}
 private async begin(id:number){
  if(this.busy||this.conflict||id<1||id>unlockedLevel(this.profile))return;this.busy=true;await this.audio.activate();this.audio.resume();
  const cfg=LEVELS[id-1],gentle=(this.profile.levels[id]?.consecutiveFailures||0)>=3;
  const seed=new Uint32Array(1);crypto.getRandomValues(seed);
  const run=createRun(cfg,seed[0]||1,this.profile.nextRunId,gentle);this.profile=startRun(this.profile,run);this.chapter=cfg.chapter-1;this.screen='game';this.selected=-1;this.tool=null;this.hintCells=[];this.hintIdle=0;this.paused=false;
  await this.persist();this.busy=false;this.render();
 }
 private game(){
  const r=this.displayRun||this.profile.activeRun;if(!r){this.screen='home';this.home();return;}
  const w=this.width,h=this.height,p=this.portrait,cfg=configForRun(r),layout=gameLayout(w,h,this.safeBottom,!!this.tool),available=h-this.safeBottom;
  this.bare('← 房间',62,33,96,()=>{this.paused=false;this.screen='home';void this.persist();this.render();});
  this.bare('暂停',w-51,33,78,()=>this.pauseMenu());
  const title=p?CHAPTERS[this.chapter].title+' · '+cfg.name:'第 '+String(cfg.id).padStart(2,'0')+' 页 · '+cfg.name;
  const boardSize=layout.boardSize;this.cell=boardSize/7;this.boardX=layout.boardX;this.boardY=layout.boardY;
  if(p){if(!this.tool||h>=760)this.label(CHAPTERS[this.chapter].title+' · '+cfg.id,w/2,33,14,MUTED,96,32);}
  else{this.label('今晚，'+CHAPTERS[this.chapter].title,w*.23,available*.19,Math.min(43,available*.065),INK,w*.36,60);if(this.boardY>=115)this.label(title,w*.65,65,22,INK,Math.min(570,boardSize+30),36);}
  if(layout.story.w){const s=layout.story,n=this.label(storyTitle(cfg.id),s.x,s.y,p?(h<760?14:23):20,PEACH,s.w-8,s.h);n.name='level story';}
  this.mascot(layout.mascot.x,layout.mascot.y,layout.mascot.size);
  if(layout.feedback.w>0){const tips=['拖一拖相邻的小物，让三个一样的靠在一起。','心事会跟着每一波消除，慢慢变轻。','云朵旁边消除三次，它就会慢慢散开。'];this.feedbackNode=this.label(cfg.id<=3?tips[cfg.id-1]:'慢慢来，今晚不用赶路。',layout.feedback.x,layout.feedback.y,p?14:18,MUTED,layout.feedback.w-16,layout.feedback.h);this.feedbackNode.name='emotion feedback';}
  const statsY=layout.statsY,bx=this.boardX+boardSize/2;
  this.hudMoves=this.label('还有 '+r.movesLeft+' 步',this.boardX+53,statsY,17,PEACH,110,22);this.hudMoves.name='HUD moves';
  this.hudSadness=this.label('心事 '+r.sadness+' / '+cfg.sadnessStart,this.boardX+boardSize-77,statsY,15,'#c4c7d7',160,22);this.hudSadness.name='HUD sadness';
  this.drawBoard();
  if(!this.tool){this.hudGoal=this.label(this.goalText(r),bx,layout.goalY,p?13:15,'#d6cbd3',boardSize+4,20);this.hudGoal.name='HUD goal';}
  const ty=layout.toolY,toolHeight=layout.toolHeight,inv=availableInventory(this.profile),toolW=Math.min(80,(boardSize-18)/4);
  if(this.tool){this.toolPanel(bx,layout.previewY,boardSize);}
  else {
  TOOLS.forEach((tool,i)=>{const x=bx+(i-1.5)*(toolW+6),active=this.tool===tool;
   const button=this.rect('tool '+tool,x,ty,toolW,toolHeight,active?'#9b8a9d':'#4c4c63',active?'#ecd7b5':'#7d788c',14);
   this.label(toolMarks[tool],x-15,ty-8,21,PEACH,28,24);this.label(String(inv[tool]),x+16,ty-8,15,INK,24,22);this.label(names[tool],x,ty+13,12,INK,toolW-3,18);
   button.on(Node.EventType.TOUCH_END,()=>this.chooseTool(tool));
  });
  }
  if(!p){this.progressBar(w*.23,available*.84,w*.27,1-r.sadness/cfg.sadnessStart);this.hudEmotion=this.label(r.sadness===0?'心事轻了，再把这一页收好。':r.sadness/cfg.sadnessStart>.5?'不用一下子好起来。':'已经轻了一些，慢慢来。',w*.23,available*.91,17,'#c5c1ce',w*.33,40);}
 }
 private chooseTool(tool:Tool){if(this.busy||this.paused||this.overlay||this.conflict)return;void this.audio.activate();this.tool=tool;this.toolTarget=-1;this.selected=-1;this.hintCells=[];this.render();}
 private cancelTool(){this.tool=null;this.toolTarget=-1;this.render();}
 private selectToolTarget(index:number){const r=this.profile.activeRun;if(!r||!this.tool||this.busy||this.overlay)return;this.toolTarget=previewTool(r.board,this.tool,index).length?index:-1;this.render();}
 private confirmTool(){const r=this.profile.activeRun,t=this.tool;if(!r||!t||this.busy||this.paused||this.overlay||this.conflict)return;if(!previewTool(r.board,t,this.toolTarget).length||availableInventory(this.profile)[t]<=0||Object.values(r.reserved).reduce((a,b)=>a+b,0)>=2)return;void this.act(t==='shuffle'?{type:'tool',tool:t}:{type:'tool',tool:t,target:this.toolTarget});}
 private toolPanel(x:number,y:number,w:number){
  const r=this.profile.activeRun!,t=this.tool!,cells=previewTool(r.board,t,this.toolTarget),stock=availableInventory(this.profile)[t],limited=Object.values(r.reserved).reduce((a,b)=>a+b,0)>=2;
  const bottom=y+71;
  this.rect('tool explanation',x,y+46,w+4,94,'#393e58','#b9a5a1',18);
  this.label(names[t]+' · '+toolText[t],x,y+13,14,INK,w-12,29);
  const hint=limited?'这一页已用过两次帮助。':stock<=0?'暂时没有了，过关或新星星会带来补给。':cells.length?(t==='shuffle'?'亮起的小物会重排，云朵不动。':'亮起的 '+cells.length+' 个小物会散开；旁边的云受 1 次安抚。'):'先点一个位置，看看它会照顾哪里。';
  this.label(hint,x,y+37,12,'#d5cad7',w-12,22);
  this.button('先收起来',x-w*.26,bottom,w*.43,44,()=>this.cancelTool());
  this.button('就这样，'+names[t],x+w*.23,bottom,w*.49,44,()=>this.confirmTool(),true,this.layer!,!cells.length||stock<=0||limited);
 }
 private goalText(r:RunState){const cfg=configForRun(r),g=cfg.goals,parts:string[]=[];if(g.matchScoreTarget)parts.push('共鸣 '+Math.min(r.matchScore,g.matchScoreTarget)+' / '+g.matchScoreTarget);if(g.cloudsTarget)parts.push('散云 '+r.cloudsCleared+' / '+g.cloudsTarget);if(g.chainActionsTarget)parts.push('连锁 '+r.chainActions+' / '+g.chainActionsTarget);return parts.length?parts.join('   ·   '):'心事一点点变轻 · 共鸣 '+r.score;}
 private drawBoard(board?:Array<Cell|null>){
  if(!this.layer||this.screen!=='game'||(!board&&!this.profile.activeRun))return;const old=this.layer.getChildByName('Board');old?.destroy();
  const parent=new Node('Board');parent.layer=1<<25;parent.setParent(this.layer);parent.setSiblingIndex(2);const cells=board||this.profile.activeRun!.board,side=this.cell*7,preview=this.tool&&this.profile.activeRun?previewTool(this.profile.activeRun.board,this.tool,this.toolTarget):[];
  this.rect('soft mat',this.boardX+side/2,this.boardY+side/2,side+10,side+12,'#555069','#8c8193',24,parent,240);
  this.tileNodes=[];
  for(let i=0;i<49;i++){const row=Math.floor(i/7),col=i%7,x=this.boardX+(col+.5)*this.cell,y=this.boardY+(row+.5)*this.cell,c=cells[i],selected=this.selected===i,hint=this.hintCells.includes(i),lit=preview.includes(i);
   const n=this.rect('cell '+i,x,y,this.cell-4,this.cell-4,lit?'#947f93':selected?'#7f768e':'#3e4059',lit||selected?'#f4d5a5':hint?'#bfc4dc':'#64627b',Math.max(9,this.cell*.19),parent,240);
   n.getComponent(UITransform)!.setContentSize(this.cell,this.cell);this.tileNodes.push(n);
   if(c?.kind==='tile')this.image(this.frames[c.color],x,y,this.cell*.82,this.cell*.82,n).setPosition(0,0,0);
   else if(c){const f=this.texture(cloudArt(c.hp));const image=this.image(f,x,y,this.cell*.95,this.cell*.95,n);image.setPosition(0,0,0);image.on(Node.EventType.NODE_DESTROYED,()=>this.disposeFrame(f));}
   let startX=0,startY=0,dragged=false;
   n.on(Node.EventType.TOUCH_START,(e:EventTouch)=>{if(this.busy)return;const pos=e.getUILocation();startX=pos.x;startY=pos.y;dragged=false;});
   n.on(Node.EventType.TOUCH_MOVE,(e:EventTouch)=>{if(dragged||this.busy||this.paused||this.overlay||this.tool)return;const pos=e.getUILocation(),dx=pos.x-startX,dy=pos.y-startY;if(Math.max(Math.abs(dx),Math.abs(dy))<this.cell*.36)return;dragged=true;const d=Math.abs(dx)>Math.abs(dy)?(dx>0?1:-1):(dy>0?-7:7),j=i+d;if(j>=0&&j<49&&(Math.abs(d)===7||Math.floor(j/7)===row)){this.audio.activate();void this.act({type:'swap',from:i,to:j});}});
   n.on(Node.EventType.TOUCH_END,(e:EventTouch)=>{e.propagationStopped=true;if(dragged||this.busy||this.paused||this.overlay)return;this.audio.activate();const pos=e.getUILocation(),dx=pos.x-startX,dy=pos.y-startY;
    if(this.tool){this.selectToolTarget(i);return;}
    if(Math.max(Math.abs(dx),Math.abs(dy))>16){const d=Math.abs(dx)>Math.abs(dy)?(dx>0?1:-1):(dy>0?-7:7);const j=i+d;if(j>=0&&j<49&&(Math.abs(d)===7||Math.floor(j/7)===row))void this.act({type:'swap',from:i,to:j});return;}
    if(this.selected===i)this.selected=-1;else if(this.selected>=0){const j=this.selected;this.selected=-1;void this.act({type:'swap',from:j,to:i});return;}else if(c?.kind==='tile')this.selected=i;
    this.drawBoard();
   });
  }
 }
 private progressBar(x:number,y:number,w:number,f:number){this.rect('progress',x,y,w,9,'#45475f','',5);if(f>0)this.rect('progress light',x-w/2+w*f/2,y,w*f,9,'#d7c3a2','',5);}
 private updateHud(run:RunState){
  this.displayRun=run;const cfg=configForRun(run),put=(node:Node|null,text:string)=>{if(node?.isValid){const label=node.getComponent(Label);if(label)label.string=text;}};
  put(this.hudMoves,'还有 '+run.movesLeft+' 步');put(this.hudSadness,'心事 '+run.sadness+' / '+cfg.sadnessStart);put(this.hudGoal,this.goalText(run));
  put(this.hudEmotion,run.sadness===0?'心事轻了，再把这一页收好。':run.sadness/cfg.sadnessStart>.5?'不用一下子好起来。':'已经轻了一些，慢慢来。');
  if(!this.portrait&&this.layer?.isValid){this.layer.getChildByName('progress')?.destroy();this.layer.getChildByName('progress light')?.destroy();this.progressBar(this.width*.23,(this.height-this.safeBottom)*.84,this.width*.27,1-run.sadness/cfg.sadnessStart);}
  if(!this.reacting)this.refreshFace();
 }
 private refreshFace(){if(!this.faceNode?.isValid)return;const old=this.faceFrame;this.faceFrame=this.texture(character(this.healing,this.chapter));this.faceNode.getComponent(Sprite)!.spriteFrame=this.faceFrame;this.disposeFrame(old);}
 private clearReaction(){
  this.reacting=false;if(this.faceNode?.isValid){this.faceNode.getComponent(Sprite)!.spriteFrame=this.faceFrame;this.faceNode.setPosition(this.faceBase);this.faceNode.setScale(1,1,1);this.faceNode.angle=0;this.faceNode.name='mascot';}
  this.reactionFrames.forEach(f=>this.disposeFrame(f));this.reactionFrames=[];
 }
 private reactToTool(tool:Tool,reduced:boolean,animations:{stop():unknown}[],later:(fn:()=>void,delay:number)=>void){
  if(!this.faceNode?.isValid)return;this.clearReaction();this.reacting=true;const node=this.faceNode,heal=this.healing;
  this.reactionFrames=Array.from({length:reduced?1:9},(_,i)=>this.texture(character(heal,this.chapter,tool,reduced?.5:i/8)));
  const show=(i:number)=>{if(node.isValid&&this.reacting){node.getComponent(Sprite)!.spriteFrame=this.reactionFrames[i];node.name='mascot '+tool;}};show(0);
  if(!reduced){for(let i=1;i<9;i++)later(()=>show(i),i*.14);if(tool==='breathe')animations.push(tween(node).to(.48,{scale:new Vec3(1.035,1.045,1)}).to(.64,{scale:new Vec3(1,1,1)}).start());else if(tool==='shuffle')animations.push(tween(node).to(.28,{angle:-4}).to(.44,{angle:4}).to(.40,{angle:0}).start());}
  later(()=>{this.clearReaction();this.refreshFace();},reduced?.32:1.13);
 }
 private async act(action:Action){
  const run=this.profile.activeRun;if(!run||this.busy||this.paused||this.overlay||this.conflict)return;
  const cfg=configForRun(run),ret=applyAction(run,action,cfg,this.profile.inventory);this.selected=-1;this.tool=null;this.toolTarget=-1;this.hintCells=[];this.hintIdle=0;
  const swap=action.type==='swap'&&(ret.ok||ret.code==='INVALID_MOVE')&&Number.isInteger(action.from)&&Number.isInteger(action.to)&&run.board[action.from]?.kind==='tile'&&run.board[action.to]?.kind==='tile'&&Math.abs(Math.floor(action.from/7)-Math.floor(action.to/7))+Math.abs(action.from%7-action.to%7)===1?action:null;
  if(!ret.ok&&!swap){this.drawBoard();this.toast(ret.code==='INVALID_TARGET'?'把帮助放到有小物的位置。':'试着让三个一样的小物靠在一起。');return;}
  if(ret.ok&&action.type==='tool')this.render();
  this.busy=true;
  const reduced=window.matchMedia('(prefers-reduced-motion: reduce)').matches,callbacks:(()=>void)[]=[],animations:{stop():unknown}[]=[];
  const finish=()=>{if(this.finishAction!==finish)return;this.finishAction=null;callbacks.forEach(fn=>this.unschedule(fn));animations.forEach(t=>t.stop());this.clearReaction();if(ret.ok)this.updateHud(ret.state);this.displayRun=null;this.root?.setPosition(0,0,0);this.busy=false;if(ret.ok&&ret.outcome!=='playing'){this.screen='result';if(ret.outcome==='won')this.audio.feedback('win');}};
  const later=(fn:()=>void,delay:number)=>{const callback=()=>{if(this.finishAction===finish)fn();};callbacks.push(callback);this.scheduleOnce(callback,delay);};
  const done=()=>{finish();if(this.isValid)this.render();};this.finishAction=finish;
  // Save the accepted logical state before playing its old-board visuals.
  // Resize/backgrounding can then finish the visuals without losing a move.
  const visual={...run,board:run.board.slice(),reserved:{...run.reserved}};
  if(ret.ok){visual.movesLeft=ret.state.movesLeft;this.updateHud(visual);this.profile.activeRun=ret.state;if(ret.outcome!=='playing'){this.settle(ret.state,ret.outcome==='won'?'win':'fail');void this.prepShare();}void this.persist();}
  const afterSwap=()=>{
   if(this.finishAction!==finish)return;
   if(!ret.ok){done();this.toast('试着让三个一样的小物靠在一起。');return;}
   if(document.hidden){done();return;}
   const queue=ret.events.filter(e=>e.type==='clear'||e.type==='fall'||e.type==='shuffle');
   const play=(index:number)=>{
    if(this.finishAction!==finish)return;const event=queue[index];if(!event){if(this.reacting)later(()=>play(index),.04);else later(done,.12);return;}
    const next=()=>play(index+1);
    if(event.type==='clear'){
     const wave=event.wave||1;this.audio.feedback(wave>1?'chain':'clear',wave);if(wave>1)this.combo(wave,reduced,animations);
     const gone=[...(event.cells||[]),...ret.events.filter(e=>e.type==='cloudClear'&&e.wave===wave).flatMap(e=>e.cells||[])];
     if(gone.length>(event.cells?.length||0))this.audio.feedback('cloud');
     const cleared=()=>{const clouds=ret.events.filter(e=>e.type==='cloudClear'&&e.wave===wave).length;visual.sadness=ret.events.find(e=>e.type==='sadnessChanged'&&e.wave===wave)!.value!;visual.matchScore+=event.value||0;visual.score+=(event.value||0)+clouds*50;visual.cloudsCleared+=clouds;visual.chainActions=run.chainActions+(wave>=2?1:0);this.updateHud({...visual});later(next,reduced?.025:.045);};
     if(reduced){later(cleared,.04);return;}
     let remaining=gone.length;if(!remaining){cleared();return;}
     gone.forEach(i=>{const n=this.tileNodes[i];if(!n?.isValid){if(--remaining===0)cleared();return;}this.spark(i,wave-1);
      animations.push(tween(n).to(.065,{scale:new Vec3(1.13,1.13,1)}).to(.13,{scale:new Vec3(.02,.02,1)},{easing:'quadIn'}).call(()=>{if(--remaining===0&&this.finishAction===finish)cleared();}).start());
     });
    }else if(event.type==='fall'){
     if(event.board)this.drawBoard(event.board);if(reduced){later(next,.025);return;}
     const moves=event.movements||[];let remaining=moves.length;if(!remaining){next();return;}
     moves.forEach(m=>{const n=this.tileNodes[m.to],target=n.position.clone();let fromRow=m.fromRow;
      // Fresh pieces enter inside their cloud-bounded segment, never through a cloud.
      if(m.spawned){let top=Math.floor(m.to/7);while(top>0&&event.board?.[(top-1)*7+m.to%7]?.kind!=='cloud')top--;fromRow=Math.max(top,fromRow);const opacity=n.addComponent(UIOpacity);opacity.opacity=0;animations.push(tween(opacity).to(.13,{opacity:255}).start());}
      n.setPosition(target.x,this.height/2-this.boardY-(fromRow+.5)*this.cell,0);
      const duration=Math.min(.40,.18+Math.abs(Math.floor(m.to/7)-fromRow)*.032);
      animations.push(tween(n).to(duration,{position:target},{easing:'quadIn'}).to(.055,{scale:new Vec3(1.06,.94,1)}).to(.06,{scale:new Vec3(1,1,1)}).call(()=>{if(--remaining===0&&this.finishAction===finish)later(next,.035);}).start());
     });
    }else{
     const cells=(event.board||run.board).flatMap((c,i)=>c?.kind==='tile'?[i]:[]);
     const reveal=()=>{if(event.board)this.drawBoard(event.board);if(reduced){next();return;}let remaining=cells.length;cells.forEach(i=>{const n=this.tileNodes[i],target=n.position.clone();n.setPosition(target.x+(3-i%7)*this.cell*.25,target.y+(Math.floor(i/7)-3)*this.cell*.25,0);n.setScale(.3,.3,1);animations.push(tween(n).to(.27,{position:target,scale:new Vec3(1,1,1)},{easing:'quadOut'}).call(()=>{if(--remaining===0&&this.finishAction===finish)next();}).start());});};
     if(reduced){reveal();return;}if(action.type!=='tool'||action.tool!=='shuffle')this.audio.feedback('tool-shuffle');
     let remaining=cells.length;cells.forEach(i=>{const n=this.tileNodes[i],p=n.position.clone();animations.push(tween(n).to(.22,{position:new Vec3(p.x+(3-i%7)*this.cell*.25,p.y+(Math.floor(i/7)-3)*this.cell*.25,0),scale:new Vec3(.3,.3,1)}).call(()=>{if(--remaining===0&&this.finishAction===finish)reveal();}).start());});
    }
   };
   if(action.type==='tool'){this.audio.feedback('tool-'+action.tool);this.reactToTool(action.tool,reduced,animations,later);if(action.tool==='resonate')this.resonateEffect(action.target,run.board,reduced,animations,()=>{if(this.finishAction===finish)play(0);});else if(!reduced){this.toolEffect(action.tool,action.target,animations);later(()=>play(0),.36);}else play(0);}else play(0);
  };
  if(swap&&!reduced&&!document.hidden){const from=this.tileNodes[swap.from],to=this.tileNodes[swap.to];if(from?.isValid&&to?.isValid){
   const origin=from.position.clone(),target=to.position.clone(),slide=.18;let completed=0;
   // Wait for both actual tweens: engine timers run before tweens each frame.
   const arrived=()=>{if(++completed!==2||this.finishAction!==finish)return;if(ret.ok)[this.tileNodes[swap.from],this.tileNodes[swap.to]]=[to,from];afterSwap();};
   const forward=tween(from).to(slide,{position:target},{easing:'quadInOut'}),backward=tween(to).to(slide,{position:origin},{easing:'quadInOut'});
   if(!ret.ok){forward.to(slide,{position:origin},{easing:'quadInOut'});backward.to(slide,{position:target},{easing:'quadInOut'});}
   animations.push(forward.call(arrived).start(),backward.call(arrived).start());return;
  }}
  afterSwap();
 }
 private combo(wave:number,reduced:boolean,animations:{stop():unknown}[]){
  const level=Math.min(6,wave),layout=gameLayout(this.width,this.height,this.safeBottom,false),slot=layout.feedback;
  const n=this.feedbackNode?.isValid?this.feedbackNode:this.label('',slot.x,slot.y,20,PEACH,slot.w-16,slot.h);this.feedbackNode=n;n.name='combo '+wave;
  const label=n.getComponent(Label)!;label.string='心事松开了 ×'+wave;label.fontSize=this.portrait?18:Math.min(28,22+level);label.lineHeight=label.fontSize*1.3;label.color=this.color('#ffe2a6');n.setScale(1,1,1);n.angle=0;
  if(reduced)return;
  n.setScale(.88,.88,1);animations.push(tween(n).to(.13,{scale:new Vec3(1.025,1.025,1)}).to(.13,{scale:new Vec3(1,1,1)}).start());
  if(this.profile.settings.shake!==false&&this.root){const force=Math.min(8,2+level),root=this.root;animations.push(tween(root).to(.035,{position:new Vec3(force,-force*.6,0)}).to(.04,{position:new Vec3(-force,force*.4,0)}).to(.04,{position:new Vec3(force*.45,-force*.25,0)}).to(.045,{position:new Vec3(0,0,0)}).start());}
 }
 private resonateEffect(target:number|undefined,board:Cell[],reduced:boolean,animations:{stop():unknown}[],complete:()=>void){
  const cells=previewTool(board,'resonate',target),nodes=cells.map(i=>this.tileNodes[i]).filter(n=>n?.isValid);let remaining=nodes.length;if(!remaining){complete();return;}
  const prepared=()=>{if(--remaining===0)complete();};
  for(const n of nodes){
   const glow=this.rect('effect resonate',0,0,this.cell-4,this.cell-4,'#fff3ca','',Math.max(9,this.cell*.19),n,82);glow.setPosition(0,0,0);const op=glow.addComponent(UIOpacity);op.opacity=0;
   const light=tween(op).to(.12,{opacity:255});if(reduced)light.delay(.10).call(prepared);animations.push(light.start());
   if(!reduced){const p=n.position.clone(),shift=Math.min(3,this.cell*.045);animations.push(tween(n).to(.13,{scale:new Vec3(1.1,1.1,1)},{easing:'quadOut'}).to(.045,{position:new Vec3(p.x+shift,p.y,0)}).to(.045,{position:new Vec3(p.x-shift,p.y,0)}).to(.045,{position:new Vec3(p.x+shift*.5,p.y,0)}).to(.045,{position:p}).call(prepared).start());}
  }
 }
 private toolEffect(tool:Exclude<Tool,'resonate'>,target:number|undefined,animations:{stop():unknown}[]){
  const i=target??24,x=this.boardX+(i%7+.5)*this.cell,y=this.boardY+(Math.floor(i/7)+.5)*this.cell;
  const n=this.makeNode('effect '+tool,x,y,this.cell*3,this.cell*3),g=n.addComponent(Graphics),op=n.addComponent(UIOpacity);g.lineWidth=tool==='breathe'?4:2.5;g.strokeColor=this.color(tool==='hug'?'#eab0be':'#b4dfdc');
  if(tool==='hug'){const row=Math.floor(i/7),col=i%7,left=Math.max(0,col-1),right=Math.min(6,col+1),top=Math.max(0,row-1),bottom=Math.min(6,row+1);g.roundRect((left-col-.4)*this.cell,-(bottom-row+.4)*this.cell,(right-left+.8)*this.cell,(bottom-top+.8)*this.cell,this.cell*.6);g.stroke();const heart=this.label('♡',x,y,72,'#efbecb',130,130);animations.push(tween(heart).to(.34,{scale:new Vec3(1.7,1.7,1)}).call(()=>heart.destroy()).start());}
  else{g.circle(0,0,this.cell*(tool==='shuffle'?1.2:.38));g.stroke();n.setScale(.5,.5,1);animations.push(tween(n).to(.36,{scale:new Vec3(tool==='shuffle'?2.8:2.2,tool==='shuffle'?2.8:2.2,1),angle:tool==='shuffle'?160:0}).start());}
  animations.push(tween(op).to(.36,{opacity:0}).call(()=>n.destroy()).start());
 }
 private spark(index:number,wave:number){if(!this.layer?.isValid)return;const x=this.boardX+(index%7+.5)*this.cell,y=this.boardY+(Math.floor(index/7)+.5)*this.cell;
  const n=this.label('✦',x,y,15,PALETTE[wave%6],32,32);const op=n.addComponent(UIOpacity);tween(n).by(.42,{position:new Vec3((index%3-1)*13,26,0)}).call(()=>n.destroy()).start();tween(op).to(.42,{opacity:0}).start();
 }
 private settle(run:RunState,outcome:'win'|'fail'|'abandon'){const f=finalize(this.profile,run,configForRun(run),outcome);this.profile=f.profile;this.result=f.result;return f.result;}
 private resultView(){
  const r=this.result||this.profile.lastResult;if(!r){this.screen='home';this.home();return;}this.result=r;const w=this.width,h=this.height,p=this.portrait,x=p?w/2:w*.68;const won=r.outcome==='win';
  if(p)this.rect('result paper',x,h*.48,w-32,Math.min(h-85,680),'#343a52','#777386',32,this.layer!,238);
  this.mascot(p?x:w*.27,p?h*.24:h*.63,p?178:285,won?1:.3);
  this.label(won?'这一刻，轻了一些':'今晚，先抱抱自己',x,p?h*.40:h*.26,p?29:43,INK,p?w-38:490,65);
  this.label('第 '+r.levelId+' 页 · '+r.levelName,x,p?h*.46:h*.35,17,MUTED,350,40);
  this.label(won?'★'.repeat(r.stars)+'☆'.repeat(3-r.stars):'再来一次也没关系',x,p?h*.52:h*.44,won?39:21,won?'#e6c58d':PEACH,330,60);
  this.label('共鸣 '+r.score,x,p?h*.59:h*.53,24,INK,300,46);
  this.label(won?(r.previousScore===null?'这一页，第一次被轻轻收好。':'上次 '+r.previousScore+'  ·  最好 '+r.bestScore):'用过的道具已还给你，最好成绩也还在。',x,p?h*.65:h*.60,14,MUTED,p?w-46:470,42);
  const gained=Object.values(r.awarded).reduce((a,b)=>a+b,0);if(gained)this.label('收到 '+gained+' 份小小的帮助',x,p?h*.70:h*.66,15,PEACH,300,35);
  const y=p?h*.79:h*.77;
  this.button(won?(r.levelId===75?'把最后一页收好':'翻到下一页'):'再坐一会儿',x,y,p?w-90:270,56,()=>{if(won&&r.levelId%15===0){this.chapter=r.chapter-1;this.screen='diary';this.render();}else void this.begin(won?Math.min(75,r.levelId+1):r.levelId);},true);
  this.button(won?'留下这一刻':'回到房间',x,y+65,p?w-90:270,44,()=>{if(won)this.shareMenu();else{this.screen='home';this.render();}});
  this.bare('← 房间',64,34,100,()=>{this.screen='home';this.render();});
 }
 private diary(){
  const w=this.width,h=this.height,p=this.portrait,x=p?w/2:w*.65,ch=CHAPTERS[this.chapter],open=!!this.profile.levels[(this.chapter+1)*15]?.bestStars;
  this.bare('← 夜间日记',77,37,130,()=>{this.screen='route';this.render();});
  if(!open){this.label('这一页，还在慢慢写。',w/2,h/2,27);return;}
  const pw=p?w-38:440,ph=Math.min(h-145,610),py=h/2;
  const paper=this.rect('diary page',x,py,pw,ph,'#e5d8c0','#b8a694',8);paper.angle=-1.2;
  this.label('第 '+String(this.chapter+1).padStart(2,'0')+' 夜',x,py-ph/2+58,18,'#867b85',pw-40,35);
  this.label(ch.title,x,py-ph/2+113,44,'#504a5d',pw-40,70);
  this.label(ch.diary,x,py-5,25,'#645a68',pw-62,ph*.47);
  this.label('留一盏灯给自己。',x,py+ph/2-85,17,'#9b8283',pw-40,40);
  this.button('留下这一刻',x,py+ph/2-32,pw-74,45,()=>{this.result=this.profile.levels[(this.chapter+1)*15].lastWinResult||this.profile.levels[(this.chapter+1)*15].lastResult;this.shareMenu();},false);
  if(!p)this.mascot(w*.24,h*.67,270,1);
 }
 private dialog(title:string,body:string,buttons:{text:string;fn:()=>void}[]){
  this.closeModal();this.overlay=true;this.modal=new Node('Modal');this.modal.layer=1<<25;this.modal.setParent(this.root!);
  const parent=this.modal,w=this.width,h=this.height,available=h-this.safeBottom,cw=Math.min(w-32,420),gap=52,ch=Math.min(available-32,buttons.length?188+buttons.length*gap:300),cy=available/2,top=cy-ch/2,bottom=cy+ch/2,firstButton=bottom-36-(buttons.length-1)*gap,bodyTop=top+76,bodyBottom=buttons.length?firstButton-36:cy+20;
  const shade=this.rect('modal backdrop',w/2,h/2,w,h,'#121a2d','',0,parent,210);shade.on(Node.EventType.TOUCH_END,(e:EventTouch)=>e.propagationStopped=true);
  this.rect('note',w/2,cy,cw,ch,'#e3d7c1','#b29d91',23,parent);
  this.label(title,w/2,top+40,26,'#514b60',cw-32,50,parent);
  this.label(body,w/2,(bodyTop+bodyBottom)/2,17,'#706675',cw-36,bodyBottom-bodyTop,parent);
  buttons.forEach((b,i)=>this.button(b.text,w/2,firstButton+i*gap,cw-44,44,b.fn,i===0,parent));
 }
 private closeModal(){this.modal?.destroy();this.modal=null;this.overlay=false;this.releaseShare();}
 private pauseMenu(){this.paused=true;this.dialog('先歇一会儿','这一页会留在这里，\n琴声和雨声陪你歇一会儿。',[{text:'接着这一页',fn:()=>this.resume()},{text:'重新翻开',fn:()=>this.confirmRestart()},{text:'翻翻夜间日记',fn:()=>this.openRoute()},{text:'听听雨和琴',fn:()=>this.settingsMenu()},{text:'回到房间',fn:()=>{this.paused=false;this.closeModal();this.screen='home';this.audio.resume();void this.persist();this.render();}}]);}
 private guideMenu(page=0){
  const entry=GUIDE_PAGES[page];if(!entry)return;this.closeModal();this.overlay=true;this.modal=new Node('Guide');this.modal.layer=1<<25;this.modal.setParent(this.root!);
  const parent=this.modal,w=this.width,h=this.height,available=h-this.safeBottom,cw=Math.min(w-32,430),ch=Math.min(available-32,480),cy=available/2,top=cy-ch/2,bottom=cy+ch/2;
  const shade=this.rect('guide backdrop',w/2,h/2,w,h,'#121a2d','',0,parent,210);shade.on(Node.EventType.TOUCH_END,(e:EventTouch)=>e.propagationStopped=true);
  this.rect('little guide note',w/2,cy,cw,ch,'#e3d7c1','#b29d91',23,parent);
  this.label('陪我学一会 · '+(page+1)+' / '+GUIDE_PAGES.length,w/2,top+27,14,'#847182',cw-28,24,parent);
  this.label(entry.title,w/2,top+65,25,'#514b60',cw-32,44,parent);
  const bodyTop=top+101,bodyBottom=bottom-124;this.label(entry.body,w/2,(bodyTop+bodyBottom)/2,18,'#675a6c',cw-40,bodyBottom-bodyTop,parent,0);
  const bw=(cw-52)/2;this.button('前一张',w/2-bw/2-5,bottom-90,bw,44,()=>this.guideMenu(page-1),false,parent,page===0);this.button(page===GUIDE_PAGES.length-1?'翻到第一张':'再陪我看一张',w/2+bw/2+5,bottom-90,bw,44,()=>this.guideMenu((page+1)%GUIDE_PAGES.length),false,parent);
  this.button('收好，慢慢试',w/2,bottom-36,cw-44,44,()=>this.closeModal(),true,parent);
 }
 private settingsMenu(){const wasPaused=this.paused;this.dialog('让今晚舒服一点','琴声陪着雨，心事慢慢散开。\n也可以收起声音或连击震动。',[{text:'雨声与钢琴：'+(this.profile.settings.music?'开':'关'),fn:()=>{this.profile.settings.music=!this.profile.settings.music;this.audio.setSettings(this.profile.settings);void this.persist();this.settingsMenu();}},{text:'小物的声音：'+(this.profile.settings.sfx?'开':'关'),fn:()=>{this.profile.settings.sfx=!this.profile.settings.sfx;this.audio.setSettings(this.profile.settings);void this.persist();this.settingsMenu();}},{text:'连击时的震动：'+(this.profile.settings.shake!==false?'开':'关'),fn:()=>{this.profile.settings.shake=this.profile.settings.shake===false;void this.persist();this.settingsMenu();}},{text:'收好',fn:()=>{this.closeModal();if(wasPaused)this.pauseMenu();}}]);}
 private showConflict(){if(!this.root)return;this.dialog('另一页正在被书写','另一个标签页已更新进度。\n重新打开最新的一页，避免覆盖它。',[]);const p=this.modal!;const n=this.rect('reload',this.width/2,this.height/2+60,240,48,PEACH,'#e9caad',18,p);this.label('载入最新进度',this.width/2,this.height/2+60,22,DARK,220,44,p);n.on(Node.EventType.TOUCH_END,()=>window.location.reload());}
 private async prepShare(){this.share=null;this.shareId=0;const r=this.result;if(!r||r.outcome!=='win')return;const request=++this.shareRequest;this.shareBusy=true;try{const payload=await renderShare(r,CHAPTERS[r.chapter-1],this.fontFamily);if(request===this.shareRequest&&this.result?.runId===r.runId){this.share=payload;this.shareId=r.runId;}}catch{}finally{if(request===this.shareRequest)this.shareBusy=false;}}
 private shareMenu(){
  const r=this.result||this.profile.lastResult;if(!r||r.outcome!=='win')return;this.result=r;if(this.shareId!==r.runId){this.share=null;void this.prepShare();}
  this.dialog('留下这一刻','这张小纸条只留在你的设备上，\n分享不会带来奖励。',[{text:'保存图片',fn:()=>void this.downloadShare()},{text:'复制这句话',fn:()=>void this.copyShare()},{text:'系统分享',fn:()=>void this.nativeShare()},{text:'收好',fn:()=>this.closeModal()}]);
  if(!this.share&&!this.shareBusy)void this.prepShare();
 }
 private async downloadShare(){if(!this.share){await this.prepShare();if(!this.share){this.toast('图片暂时没画好，请再点一次重试。');return;}}this.releaseShare();const out=saveImage(this.share!.blob);this.shareUrl=out.url;if(!out.downloaded)this.imagePreview(out.url);else this.toast('小纸条已交给浏览器保存。');}
 private imagePreview(url:string){const div=document.createElement('div');div.style.cssText='position:fixed;inset:0;background:#161d32ed;z-index:99;display:flex;align-items:center;justify-content:center;flex-direction:column;color:#fff;font:18px sans-serif';const im=document.createElement('img');im.src=url;im.alt='悲伤消消乐情绪分享图，长按保存';im.style.cssText='max-width:88vw;max-height:78vh';const btn=document.createElement('button');btn.textContent='长按图片保存 · 点这里返回';btn.style.cssText='padding:14px;border-radius:18px;margin:12px;background:#e8bc9d;color:#37344b;border:0';btn.onclick=()=>div.remove();div.append(im,btn);document.body.append(div);}
 private async copyShare(){const r=this.result!;const text=this.share?.text||shareText(r,CHAPTERS[r.chapter-1]);const result=await copyText(text);if(result.ok)this.toast('这句话，已经轻轻复制好了。');else{const area=document.createElement('textarea');area.value=text;area.setAttribute('aria-label','可手动复制的情绪文案');area.style.cssText='position:fixed;left:8%;top:30%;width:84%;height:35%;z-index:100;background:#efe4cf;color:#514b60;font:18px sans-serif;padding:16px';document.body.append(area);area.focus();area.select();const close=()=>area.remove();area.onblur=close;this.toast('长按选中文字复制，点外面收起。');}}
 private async nativeShare(){if(!this.share){this.toast('小纸条正在准备，请稍后再点一次。');return;}const result=await sharePrepared(this.share);if(result==='fallback')this.toast('这个浏览器可使用“保存图片”或“复制这句话”。');}
 private releaseShare(){if(this.shareUrl){URL.revokeObjectURL(this.shareUrl);this.shareUrl='';}}
 private toast(text:string){this.toastText=text;this.toastUntil=this.now+3;this.toastNode?.destroy();if(!this.root)return;const y=Math.max(65,this.height-100-this.safeBottom);const parent=new Node('toast');parent.layer=1<<25;parent.setParent(this.root);this.rect('toast bg',this.width/2,y,Math.min(this.width-26,490),52,'#202941','#8b8297',18,parent,245);this.label(text,this.width/2,y,15,INK,Math.min(this.width-46,470),48,parent);this.toastNode=parent;}
 private accessibility(){let el=document.getElementById('night-status');if(!el){el=document.createElement('div');el.id='night-status';el.setAttribute('role','status');el.setAttribute('aria-live','polite');el.style.cssText='position:absolute;left:-10000px;width:1px;height:1px;overflow:hidden';document.body.append(el);}const r=this.profile.activeRun;el.textContent='悲伤消消乐。'+({home:'房间',route:'夜间日记关卡路线',game:'消除中',result:'这一页的结果',diary:'章末日记'}[this.screen])+'。'+(r?'第'+r.levelId+'关，剩余'+r.movesLeft+'步，悲伤值'+r.sadness+'，'+this.goalText(r):'')+(this.result&&this.screen==='result'?'共鸣'+this.result.score+'，'+this.result.stars+'星。':'');document.title='悲伤消消乐 · '+CHAPTERS[this.chapter].title;document.querySelector('canvas')?.setAttribute('aria-label',el.textContent);}
}
