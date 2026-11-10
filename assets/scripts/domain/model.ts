export type Cell = { kind: 'tile'; color: number } | { kind: 'cloud'; hp: number };
export type Board = Cell[];
export type Tool = 'breathe' | 'hug' | 'resonate' | 'shuffle';
export type Inventory = Record<Tool, number>;
export interface LevelConfig { id:number; chapter:number; index:number; name:string; type:'T1'|'T2'|'T3'|'T4'|'T5'; sadnessStart:number; colors:number; baseMoves:number; goals:{matchScoreTarget:number;cloudsTarget:number;chainActionsTarget:number}; initialClouds:number[]; configVersion:number }
export interface RunState { runId:number; levelId:number; configVersion:number; board:Board; rng:number; sadness:number; initialMoves:number; movesLeft:number; validSwaps:number; matchScore:number; score:number; cloudsCleared:number; chainActions:number; reserved:Inventory; gentle:boolean; activeMs:number; phase:'playing'|'won'|'lost'; revision:number }
export type Action = {type:'swap';from:number;to:number}|{type:'tool';tool:Tool;target?:number};
export interface TileMovement { fromRow:number; to:number; cell:Cell; spawned:boolean }
export interface GameEvent { type:string; cells?:number[]; wave?:number; value?:number; board?:Array<Cell|null>; movements?:TileMovement[] }
export type ActionResult = {ok:true;state:RunState;events:GameEvent[];outcome:'playing'|'won'|'lost'}|{ok:false;code:string};
