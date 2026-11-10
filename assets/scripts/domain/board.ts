import {Board,Cell,LevelConfig,RunState,Action,Inventory,ActionResult,GameEvent,TileMovement} from './model';
import {previewTool} from './feedback';
const SIZE=7;
function next(rng:number):number { let x=rng>>>0||0x6d2b79f5;x^=x<<13;x^=x>>>17;x^=x<<5;return x>>>0; }
function tile(b:Board,i:number):number {const c=b[i];return c&&c.kind==='tile'?c.color:-1;}
function adjacent(a:number,b:number):boolean {return Number.isInteger(a)&&Number.isInteger(b)&&a>=0&&b>=0&&a<49&&b<49&&Math.abs(Math.floor(a/7)-Math.floor(b/7))+Math.abs(a%7-b%7)===1;}
function matchedAt(b:Board,i:number):boolean {const color=tile(b,i);if(color<0)return false;const row=Math.floor(i/7),col=i%7;for(const [dr,dc] of [[0,1],[1,0]]){let count=1;for(const sign of [-1,1]){let r=row+dr*sign,c=col+dc*sign;while(r>=0&&r<7&&c>=0&&c<7&&tile(b,r*7+c)===color){count++;r+=dr*sign;c+=dc*sign;}}if(count>=3)return true;}return false;}
export function findMatches(board:Board):number[] {const cells=new Set<number>();for(let axis=0;axis<2;axis++)for(let line=0;line<7;line++){let start=0;while(start<7){const index=axis?start*7+line:line*7+start,color=tile(board,index);let end=start+1;while(color>=0&&end<7&&tile(board,axis?end*7+line:line*7+end)===color)end++;if(color>=0&&end-start>=3)for(let p=start;p<end;p++)cells.add(axis?p*7+line:line*7+p);start=end;}}return Array.from(cells).sort((a,b)=>a-b);}
export function findLegalMoves(board:Board):Array<{from:number;to:number}> {const moves:Array<{from:number;to:number}>=[],b=board.slice();for(let from=0;from<49;from++){if(tile(b,from)<0)continue;for(const to of [from%7<6?from+1:-1,from+7<49?from+7:-1]){if(to<0||tile(b,to)<0||tile(b,from)===tile(b,to))continue;[b[from],b[to]]=[b[to],b[from]];if(matchedAt(b,from)||matchedAt(b,to))moves.push({from,to});[b[from],b[to]]=[b[to],b[from]];}}return moves;}
export function shuffleBoard(board:Board,colors:number,rng:number):{board:Board;rng:number} {
 for(let attempt=0;attempt<128;attempt++){const b:Board=board.map(c=>c.kind==='cloud'?{...c}:{kind:'tile',color:-1});for(let i=0;i<49;i++){if(b[i].kind==='cloud')continue;rng=next(rng);let color=rng%colors;for(let n=0;n<colors;n++){b[i]={kind:'tile',color};if(!((i%7>=2&&tile(b,i-1)===color&&tile(b,i-2)===color)||(i>=14&&tile(b,i-7)===color&&tile(b,i-14)===color)))break;color=(color+1)%colors;}}if(findLegalMoves(b).length)return {board:b,rng};}
 // Bounded constructive fallback: plant a legal 0,1,0 / *,0,* motif, then backtrack.
 for(let row=0;row<6;row++)for(let col=0;col<5;col++){const p=row*7+col,forced=new Map([[p,0],[p+1,1],[p+2,0],[p+8,0]]);if(Array.from(forced.keys()).some(i=>board[i].kind==='cloud'))continue;const b:Board=board.map(c=>c.kind==='cloud'?{...c}:{kind:'tile',color:-1});const fill=(i:number):boolean=>{if(i===49)return true;if(b[i].kind==='cloud')return fill(i+1);for(const color of forced.has(i)?[forced.get(i)!]:Array.from({length:colors},(_,n)=>n)){b[i]={kind:'tile',color};if((i%7>=2&&tile(b,i-1)===color&&tile(b,i-2)===color)||(i>=14&&tile(b,i-7)===color&&tile(b,i-14)===color))continue;if(fill(i+1))return true;}b[i]={kind:'tile',color:-1};return false;};if(fill(0))return {board:b,rng};}throw new Error('INVALID_CONFIG');
}
export function createRun(config:LevelConfig,seed:number,runId:number,gentle=false):RunState {
 if(![config.sadnessStart,config.colors,config.baseMoves,...Object.values(config.goals)].every(Number.isInteger)||config.sadnessStart<40||config.sadnessStart>100||config.colors<4||config.colors>6||config.baseMoves<1||Object.values(config.goals).some(n=>n<0)||config.initialClouds.length>3||new Set(config.initialClouds).size!==config.initialClouds.length||config.initialClouds.some(i=>!Number.isInteger(i)||i<0||i>=49)||config.goals.cloudsTarget>config.initialClouds.length)throw new Error('INVALID_CONFIG');
 const board:Board=Array.from({length:49},()=>({kind:'tile',color:0}));for(const i of config.initialClouds)board[i]={kind:'cloud',hp:3};
 const generated=shuffleBoard(board,config.colors,config.id<=3?0x20261102+config.id:seed);
 const initialMoves=config.baseMoves+(gentle?10:0);return {runId,levelId:config.id,configVersion:config.configVersion,board:generated.board,rng:generated.rng,sadness:config.sadnessStart,initialMoves,movesLeft:initialMoves,validSwaps:0,matchScore:0,score:0,cloudsCleared:0,chainActions:0,reserved:{breathe:0,hug:0,resonate:0,shuffle:0},gentle,activeMs:0,phase:'playing',revision:0};
}
export function evaluateGoals(s:RunState,c:LevelConfig):boolean {return s.sadness===0&&s.matchScore>=c.goals.matchScoreTarget&&s.cloudsCleared>=c.goals.cloudsTarget&&s.chainActions>=c.goals.chainActionsTarget;}
function refill(b:Array<Cell|null>,colors:number,rng:number,movements:TileMovement[]):number {
 for(let col=0;col<7;col++){let bottom=6;while(bottom>=0){
  if(b[bottom*7+col]?.kind==='cloud'){bottom--;continue;}
  let top=bottom;while(top>0&&b[(top-1)*7+col]?.kind!=='cloud')top--;
  const tiles:{cell:Cell;row:number}[]=[];for(let r=bottom;r>=top;r--)if(b[r*7+col])tiles.push({cell:b[r*7+col]!,row:r});
  let t=0,spawnRow=top-1;
  for(let r=bottom;r>=top;r--){const to=r*7+col;
   if(t<tiles.length){const tile=tiles[t++];b[to]=tile.cell;if(tile.row!==r)movements.push({fromRow:tile.row,to,cell:{...tile.cell},spawned:false});}
   else{rng=next(rng);const cell:Cell={kind:'tile',color:rng%colors};b[to]=cell;movements.push({fromRow:spawnRow--,to,cell:{...cell},spawned:true});}
  }
  bottom=top-1;
 }}return rng;
}
export function applyAction(state:RunState,action:Action,config:LevelConfig,availableInventory:Inventory):ActionResult {
 if(state.phase!=='playing'||state.movesLeft<=0)return {ok:false,code:'NOT_PLAYING'};
 if(state.levelId!==config.id||state.configVersion!==config.configVersion)return {ok:false,code:'INVALID_CONFIG'};
 const s:RunState={...state,board:state.board.map(c=>({...c})),reserved:{...state.reserved}},events:GameEvent[]=[];let clear:number[]=[],spawn=false;
 if(action.type==='swap'){const {from,to}=action;if(!adjacent(from,to)||tile(s.board,from)<0||tile(s.board,to)<0)return {ok:false,code:'INVALID_MOVE'};[s.board[from],s.board[to]]=[s.board[to],s.board[from]];clear=findMatches(s.board);if(!clear.length)return {ok:false,code:'INVALID_MOVE'};s.movesLeft--;s.validSwaps++;spawn=s.validSwaps%3===0&&state.sadness/config.sadnessStart>0.5;events.push({type:'swap',cells:[from,to]});}
 else {const {tool,target}=action;if(!Object.prototype.hasOwnProperty.call(s.reserved,tool))return {ok:false,code:'INVALID_TARGET'};if(Object.values(s.reserved).reduce((a,b)=>a+b,0)>=2)return {ok:false,code:'TOOL_LIMIT'};if(!(availableInventory[tool]>s.reserved[tool]))return {ok:false,code:'NO_STOCK'};
 if(tool==='shuffle'){const r=shuffleBoard(s.board,config.colors,s.rng);s.board=r.board;s.rng=r.rng;events.push({type:'shuffle',board:s.board.map(c=>({...c}))});}else {clear=previewTool(s.board,tool,target);if(!clear.length)return {ok:false,code:'INVALID_TARGET'};}s.reserved[tool]++;}
 let wave=0;while(clear.length){wave++;const n=clear.length,points=10*n*(1+.5*(wave-1));s.matchScore+=points;s.score+=points;s.sadness=Math.max(0,s.sadness-Math.max(1,Math.floor(n*(1+.2*(wave-1)))));events.push({type:'clear',cells:clear.slice(),wave,value:points,board:s.board.map(c=>({...c}))},{type:'sadnessChanged',wave,value:s.sadness});
 const b:Array<Cell|null>=s.board.slice();for(const i of clear)b[i]=null;
 for(let i=0;i<49;i++){const cloud=b[i];if(cloud?.kind!=='cloud')continue;if(clear.some(p=>adjacent(p,i))){cloud.hp--;events.push({type:'cloudHit',cells:[i],wave,value:cloud.hp});if(cloud.hp===0){b[i]=null;s.cloudsCleared++;s.score+=50;events.push({type:'cloudClear',cells:[i],wave,value:50});}}}
 if(wave===1&&spawn&&b.filter(c=>c?.kind==='cloud').length<3){s.rng=next(s.rng);const i=clear[s.rng%clear.length];b[i]={kind:'cloud',hp:3};events.push({type:'cloudSpawn',cells:[i],wave,value:3});}
 const movements:TileMovement[]=[];s.rng=refill(b,config.colors,s.rng,movements);s.board=b as Board;events.push({type:'fall',wave,board:s.board.map(c=>({...c})),movements});clear=findMatches(s.board);
 }
 if(wave>=2)s.chainActions++;events.push({type:'goalChanged',value:s.chainActions});
 if(evaluateGoals(s,config)){s.phase='won';s.score+=20*s.movesLeft;}else if(s.movesLeft===0)s.phase='lost';else if(!findLegalMoves(s.board).length){const r=shuffleBoard(s.board,config.colors,s.rng);s.board=r.board;s.rng=r.rng;events.push({type:'shuffle',board:s.board.map(c=>({...c}))});}
 s.revision++;if(s.phase!=='playing')events.push({type:'finished',value:s.score});return {ok:true,state:s,events,outcome:s.phase};
}


