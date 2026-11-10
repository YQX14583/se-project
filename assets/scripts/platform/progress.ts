import { Inventory, RunState, LevelConfig, Tool } from '../domain/model';
export const TOOLS: Tool[] = ['breathe','hug','resonate','shuffle'];
export const emptyInventory = (): Inventory => ({ breathe:0, hug:0, resonate:0, shuffle:0 });
export type Outcome = 'win'|'fail'|'abandon';
export interface ResultRecord { runId:number; levelId:number; chapter:number; levelName:string; outcome:Outcome; score:number; matchScore:number; stars:number; pure:boolean; gentle:boolean; movesLeft:number; initialMoves:number; toolsUsed:number; sadnessStart:number; sadnessEnd:number; cloudsLeft:number; activeMs:number; awarded:Inventory; previousScore:number|null; previousStars:number|null; bestScore:number; bestStars:number }
export interface LevelProgress { bestScore:number; bestStars:number; pureThreeStars:boolean; consecutiveFailures:number; claimed:{clear:boolean;threeStars:boolean;pureThreeStars:boolean;chapter:boolean}; lastResult:ResultRecord|null; lastWinResult:ResultRecord|null }
export interface Profile { schemaVersion:1; revision:number; nextRunId:number; rewardSeed:number; inventory:Inventory; levels:Record<number,LevelProgress>; settings:{music:boolean;sfx:boolean;shake?:boolean}; activeRun:RunState|null; lastFinalizedRunId:number; lastResult:ResultRecord|null }
export const clone = <T>(x:T):T => JSON.parse(JSON.stringify(x));
const blankLevel = ():LevelProgress => ({bestScore:0,bestStars:0,pureThreeStars:false,consecutiveFailures:0,claimed:{clear:false,threeStars:false,pureThreeStars:false,chapter:false},lastResult:null,lastWinResult:null});
export function newProfile():Profile {return {schemaVersion:1,revision:0,nextRunId:1,rewardSeed:0x71ac309d,inventory:emptyInventory(),levels:{},settings:{music:true,sfx:true,shake:true},activeRun:null,lastFinalizedRunId:0,lastResult:null};}
export function availableInventory(p:Profile):Inventory {const stock={...p.inventory};for(const t of TOOLS)stock[t]-=p.activeRun?.reserved[t]||0;return stock;}
export function unlockedLevel(p:Profile):number {let id=1;while(id<75&&p.levels[id]?.bestStars>0)id++;return id;}
export function startRun(profile:Profile,run:RunState):Profile {if(run.levelId>unlockedLevel(profile))throw Error('LOCKED');if(profile.activeRun)throw Error('ACTIVE_RUN');if(run.runId<=profile.lastFinalizedRunId)throw Error('STALE_RUN');for(const t of TOOLS)if(run.reserved[t]>profile.inventory[t])throw Error('NO_STOCK');const p=clone(profile);p.activeRun=clone(run);p.nextRunId=Math.max(p.nextRunId,run.runId+1);return p;}
export function totals(p:Profile):{score:number;cleared:number;pureThreeStars:number} {return Object.values(p.levels).reduce((a,l)=>({score:a.score+l.bestScore,cleared:a.cleared+(l.bestStars>0?1:0),pureThreeStars:a.pureThreeStars+(l.pureThreeStars?1:0)}),{score:0,cleared:0,pureThreeStars:0});}
export function finalize(profile:Profile,run:RunState,config:LevelConfig,outcome:Outcome):{profile:Profile;result:ResultRecord} {
 const previous=profile.levels[run.levelId]?.lastResult;
 if(run.runId<=profile.lastFinalizedRunId){const result=profile.lastResult?.runId===run.runId?profile.lastResult:previous?.runId===run.runId?previous:null;if(!result)throw Error('STALE_RUN');return {profile,result};}
 if(profile.activeRun?.runId!==run.runId||config.id!==run.levelId)throw Error('INVALID_RUN');
 const p=clone(profile), l=p.levels[run.levelId]||(p.levels[run.levelId]=blankLevel());
 const toolsUsed=TOOLS.reduce((n,t)=>n+run.reserved[t],0), cloudsLeft=run.board.filter(c=>c.kind==='cloud').length,ratio=run.movesLeft/run.initialMoves;
 let stars=outcome==='win'?(ratio>=.45&&cloudsLeft===0?3:ratio>=.25?2:1):0;if(run.gentle)stars=Math.min(stars,2);
 const pure=stars===3&&toolsUsed===0&&!run.gentle, awarded=emptyInventory();
 const result:ResultRecord={runId:run.runId,levelId:run.levelId,chapter:config.chapter,levelName:config.name,outcome,score:run.score,matchScore:run.matchScore,stars,pure,gentle:run.gentle,movesLeft:run.movesLeft,initialMoves:run.initialMoves,toolsUsed,sadnessStart:config.sadnessStart,sadnessEnd:run.sadness,cloudsLeft,activeMs:run.activeMs,awarded,previousScore:l.lastResult?.score??null,previousStars:l.lastResult?.stars??null,bestScore:l.bestScore,bestStars:l.bestStars};
 const give=(t:Tool,n:number)=>{const actual=Math.min(n,5-p.inventory[t]);p.inventory[t]+=actual;awarded[t]+=actual;};
 const randomGift=()=>{let x=p.rewardSeed;x^=x<<13;x^=x>>>17;x^=x<<5;p.rewardSeed=x>>>0;give(TOOLS[p.rewardSeed%4],1);};
 if(outcome==='win'){
  for(const t of TOOLS){if(run.reserved[t]>p.inventory[t])throw Error('NO_STOCK');p.inventory[t]-=run.reserved[t];}
  if(!l.claimed.clear){l.claimed.clear=true;randomGift();}if(stars===3&&!l.claimed.threeStars){l.claimed.threeStars=true;randomGift();}if(pure&&!l.claimed.pureThreeStars){l.claimed.pureThreeStars=true;randomGift();}
  if(config.index===15&&!l.claimed.chapter){l.claimed.chapter=true;for(const t of TOOLS)give(t,2);}
  l.bestScore=Math.max(l.bestScore,run.score);l.bestStars=Math.max(l.bestStars,stars);l.pureThreeStars ||= pure;l.consecutiveFailures=0;
 }else if(outcome==='fail')l.consecutiveFailures++;
 result.bestScore=l.bestScore;result.bestStars=l.bestStars;if(outcome==='win')l.lastWinResult=result;l.lastResult=result;p.lastResult=result;p.lastFinalizedRunId=run.runId;p.activeRun=null;return {profile:p,result};
}

