import { Profile, ResultRecord, newProfile, clone, TOOLS, unlockedLevel, finalize } from './progress';
import { LEVELS, configForRun } from '../domain/levels';
import { LevelConfig } from '../domain/model';
export const SAVE_KEY='sadness-match3.save.v1', BACKUP_KEY='sadness-match3.backup.v1', LOCK_NAME='sadness-match3-save-v1';
const integer=(n:unknown,min=0,max=Number.MAX_SAFE_INTEGER):n is number=>Number.isSafeInteger(n)&&Number(n)>=min&&Number(n)<=max;
const object=(x:any)=>!!x&&typeof x==='object'&&!Array.isArray(x);
const stock=(x:any,max:number)=>object(x)&&Object.keys(x).length===4&&TOOLS.every(t=>integer(x[t],0,max));
function validResult(r:any):r is ResultRecord {
 return object(r)&&integer(r.runId,1)&&integer(r.levelId,1,75)&&integer(r.chapter,1,5)&&typeof r.levelName==='string'&&['win','fail','abandon'].includes(r.outcome)&&['score','matchScore','movesLeft','toolsUsed','sadnessStart','sadnessEnd','cloudsLeft','activeMs','bestScore','bestStars'].every(k=>integer(r[k]))&&integer(r.initialMoves,1)&&r.movesLeft<=r.initialMoves&&integer(r.stars,0,3)&&integer(r.bestStars,0,3)&&r.toolsUsed<=2&&r.cloudsLeft<=49&&typeof r.pure==='boolean'&&typeof r.gentle==='boolean'&&stock(r.awarded,5)&&(r.previousScore===null||integer(r.previousScore))&&(r.previousStars===null||integer(r.previousStars,0,3));
}
function validProfile(p:any,activeConfig?:LevelConfig):p is Profile {
 if(!object(p)||p.schemaVersion!==1||!integer(p.revision)||!integer(p.nextRunId,1)||!integer(p.rewardSeed,0,0xffffffff)||!integer(p.lastFinalizedRunId)||p.nextRunId<=p.lastFinalizedRunId||!stock(p.inventory,5)||!object(p.settings)||typeof p.settings.music!=='boolean'||typeof p.settings.sfx!=='boolean'||(p.settings.shake!==undefined&&typeof p.settings.shake!=='boolean')||!object(p.levels)||Object.keys(p.levels).length>75)return false;
 if(p.lastResult!==null&&(!validResult(p.lastResult)||p.lastResult.runId!==p.lastFinalizedRunId))return false;
 for(const [id,l] of Object.entries(p.levels) as [string,any][]){
  if(!integer(Number(id),1,75)||String(Number(id))!==id||!object(l)||!integer(l.bestScore)||!integer(l.bestStars,0,3)||!integer(l.consecutiveFailures)||typeof l.pureThreeStars!=='boolean'||!object(l.claimed)||!['clear','threeStars','pureThreeStars','chapter'].every(k=>typeof l.claimed[k]==='boolean'))return false;
  if(l.lastResult!==null&&(!validResult(l.lastResult)||l.lastResult.levelId!==Number(id)||l.lastResult.runId>p.lastFinalizedRunId))return false;
  if(l.lastWinResult!==null&&(!validResult(l.lastWinResult)||l.lastWinResult.outcome!=='win'||l.lastWinResult.levelId!==Number(id)||l.lastWinResult.runId>p.lastFinalizedRunId))return false;
  if((l.bestStars>0)!==l.claimed.clear||l.pureThreeStars!==l.claimed.pureThreeStars||l.pureThreeStars&&l.bestStars!==3||l.bestStars===0&&l.bestScore!==0)return false;
 }
 for(const [id,l] of Object.entries(p.levels) as [string,any][]){if(l.bestStars>0&&Number(id)>unlockedLevel(p))return false;}
 const r=p.activeRun;if(r===null)return true;
 if(!object(r)||!integer(r.levelId,1,unlockedLevel(p))||!integer(r.runId,p.lastFinalizedRunId+1,p.nextRunId-1))return false;
 let c=activeConfig;try{if(!c)c=configForRun(r);}catch{return false;}if(r.configVersion!==c.configVersion)return false;
 if(!Array.isArray(r.board)||r.board.length!==49||!r.board.every((cell:any)=>object(cell)&&(cell.kind==='tile'?integer(cell.color,0,c.colors-1):cell.kind==='cloud'&&integer(cell.hp,1,3))))return false;
 if(!['rng','sadness','movesLeft','validSwaps','matchScore','score','cloudsCleared','chainActions','activeMs','revision'].every(k=>integer(r[k]))||r.rng>0xffffffff||r.sadness>c.sadnessStart||!integer(r.initialMoves,1)||r.movesLeft>r.initialMoves||r.validSwaps>r.initialMoves||r.validSwaps+r.movesLeft!==r.initialMoves||r.chainActions>r.validSwaps+2||typeof r.gentle!=='boolean'||r.initialMoves!==c.baseMoves+(r.gentle?10:0)||!['playing','won','lost'].includes(r.phase)||!stock(r.reserved,2)||TOOLS.reduce((s,t)=>s+r.reserved[t],0)>2||TOOLS.some(t=>r.reserved[t]>p.inventory[t]))return false;
 if(r.score!==r.matchScore+50*r.cloudsCleared+(r.phase==='won'?20*r.movesLeft:0))return false;
 if(r.phase==='playing'&&r.movesLeft===0||r.phase==='lost'&&r.movesLeft!==0||r.phase==='won'&&(r.sadness!==0||r.matchScore<c.goals.matchScoreTarget||r.cloudsCleared<c.goals.cloudsTarget||r.chainActions<c.goals.chainActionsTarget))return false;
 return true;
}
export function validateProfile(p:any):p is Profile {return validProfile(p);}
interface StorageLike {getItem(key:string):string|null;setItem(key:string,value:string):void}
interface LocksLike {request<T>(name:string,options:{mode:'exclusive'},callback:()=>T|Promise<T>):Promise<T>}
interface Options {storage?:StorageLike|null;locks?:LocksLike|null;key?:string;backupKey?:string}
export interface CommitResult {ok:boolean;mode:'persistent'|'memory';conflict?:boolean}
function checksum(s:string):string {let h=2166136261;for(let i=0;i<s.length;i++)h=Math.imul(h^s.charCodeAt(i),16777619);return (h>>>0).toString(16);}
function encode(p:Profile):string {const payload=JSON.stringify(p);return JSON.stringify({schemaVersion:1,revision:p.revision,payload:p,checksum:checksum(payload)});}
function decode(s:string|null):{profile:Profile|null;unknown:boolean} {
 if(s===null)return {profile:null,unknown:false};
 try{
  const e=JSON.parse(s);
  if(integer(e?.schemaVersion,2))return {profile:null,unknown:true};
  // Check the original envelope before changing any payload fields.
  if(e?.schemaVersion!==1||!object(e.payload)||e.revision!==e.payload.revision||checksum(JSON.stringify(e.payload))!==e.checksum)return {profile:null,unknown:false};
  let p=e.payload;const r=p.activeRun,c=object(r)&&integer(r.levelId,1,75)?LEVELS[r.levelId-1]:null;
  if(c&&r.configVersion!==c.configVersion){
   let legacy:LevelConfig;try{legacy=configForRun(r);}catch{return {profile:null,unknown:true};}
   if(!validProfile(p,legacy))return {profile:null,unknown:false};
   if(r.phase!=='playing'){
    // A completed old run keeps its original score, star ratio and rewards.
    p=finalize(p,r,legacy,r.phase==='won'?'win':'fail').profile;
   }
  }
  return validateProfile(p)?{profile:p,unknown:false}:{profile:null,unknown:false};
 }catch{return {profile:null,unknown:false};}
}
export class SaveStore {
 mode:'persistent'|'memory'='memory';message='';
 private storage:StorageLike|null=null;private locks:LocksLike|null=null;private key:string;private backupKey:string;private expectedRevision=0;private memory:Profile=newProfile();private blocked=false;private queue:Promise<unknown>=Promise.resolve();
 constructor(options:Options={}) {this.key=options.key||SAVE_KEY;this.backupKey=options.backupKey||BACKUP_KEY;try{this.storage=options.storage===undefined?globalThis.localStorage:options.storage;this.locks=options.locks===undefined?(globalThis.navigator as any)?.locks:options.locks;}catch{}if(!this.storage||!this.locks)this.message='当前为临时会话，关闭页面后不会保存。';}
 private serial<T>(fn:()=>Promise<T>):Promise<T>{const result=this.queue.then(fn,fn);this.queue=result.catch(()=>{});return result;}
 private read(){const mainRaw=this.storage!.getItem(this.key),backupRaw=this.storage!.getItem(this.backupKey),main=decode(mainRaw),backup=decode(backupRaw);const profile=main.profile&&backup.profile?(main.profile.revision>=backup.profile.revision?main.profile:backup.profile):main.profile||backup.profile;return {profile,unknown:main.unknown||backup.unknown,main,mainRaw,backupRaw};}
 async load():Promise<Profile>{return this.serial(async()=>{
  if(!this.storage||!this.locks)return clone(this.memory);
  try{return await this.locks.request(LOCK_NAME,{mode:'exclusive'},async()=>{const s=this.read();if(s.unknown){this.blocked=true;this.mode='memory';this.message='存档配置版本不兼容，已保留原档；本次为临时会话。';return clone(this.memory);}
   if(s.profile){this.memory=clone(s.profile);this.expectedRevision=s.profile.revision;if(!s.main.profile||s.main.profile.revision<s.profile.revision){this.storage!.setItem(this.key,encode(s.profile));this.message='已从备份恢复进度。';}}
   else{this.memory=newProfile();this.expectedRevision=0;if(s.mainRaw||s.backupRaw)this.message='旧存档已损坏，无法恢复；已开始新的一页。';}
   this.mode='persistent';return clone(this.memory);
  });}catch{this.mode='memory';this.message='暂时无法保存，进度保留在本页，关闭后可能丢失。';return clone(this.memory);}
 });}
 async commit(profile:Profile):Promise<CommitResult>{const candidate=clone(profile);return this.serial(async()=>{
  if(!validateProfile(candidate))throw Error('INVALID_PROFILE');this.memory=candidate;
  if(!this.storage||!this.locks||this.blocked)return {ok:false,mode:'memory'};
  try{return await this.locks.request(LOCK_NAME,{mode:'exclusive'},async()=>{const s=this.read();if(s.unknown){this.blocked=true;this.mode='memory';this.message='存档版本不兼容，已保留原档。';return {ok:false,mode:this.mode};}
   if((s.profile?.revision||0)!==this.expectedRevision){this.message='另一页面已更新进度，请重新载入。';return {ok:false,mode:this.mode,conflict:true};}
   candidate.revision=this.expectedRevision+1;
   if(s.profile){try{this.storage!.setItem(this.backupKey,encode(s.profile));}catch{}}
   this.storage!.setItem(this.key,encode(candidate));this.expectedRevision=candidate.revision;profile.revision=candidate.revision;this.memory=clone(candidate);this.mode='persistent';this.message='';return {ok:true,mode:this.mode};
  });}catch{this.mode='memory';this.message='暂时未能保存，进度保留在本页，关闭后可能丢失。';return {ok:false,mode:this.mode};}
 });}
}


