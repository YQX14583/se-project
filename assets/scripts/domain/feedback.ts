import {Board,Tool} from './model';

export function previewTool(board:Board,tool:Tool,target?:number):number[] {
 if(tool==='shuffle')return board.flatMap((c,i)=>c.kind==='tile'?[i]:[]);
 if(target===undefined||!Number.isInteger(target)||target<0||target>=49)return [];
 const cell=board[target];if(tool!=='hug'&&cell.kind!=='tile')return [];
 if(tool==='breathe')return [target];
 if(tool==='resonate'&&cell.kind==='tile')return board.flatMap((c,i)=>c.kind==='tile'&&c.color===cell.color?[i]:[]);
 if(tool==='hug')return board.flatMap((c,i)=>c.kind==='tile'&&Math.abs(Math.floor(i/7)-Math.floor(target/7))<=1&&Math.abs(i%7-target%7)<=1?[i]:[]);
 return [];
}
