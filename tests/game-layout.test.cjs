const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const file=path.join(__dirname,'../.test-build/platform/game-layout.js');
const gameLayout=fs.existsSync(file)?require(file).gameLayout:undefined;
const viewports=[[320,540],[320,568],[390,650],[390,844],[759,760],[760,760],[1366,768],[1366,540],[1280,620]];
const box=(x,y,w,h)=>({left:x-w/2,right:x+w/2,top:y-h/2,bottom:y+h/2});
const separate=(a,b)=>a.right<=b.left||b.right<=a.left||a.bottom<=b.top||b.bottom<=a.top;

test('responsive layout keeps all 49 touch cells and controls inside the available screen',()=>{
 assert.equal(typeof gameLayout,'function','pure gameLayout helper must be implemented');
 for(const [w,h]of viewports)for(const safe of [0,34])for(const preview of [false,true]){
  const g=gameLayout(w,h,safe,preview),context=JSON.stringify({w,h,safe,preview});
  assert(g.boardSize/7>=44,context+' cell hit area');assert(g.boardX>=0,context);assert(g.boardX+g.boardSize<=w,context);assert(g.boardY>=55,context+' navigation');
  assert(g.statsY+11<=g.boardY,context+' HUD covers board');
  if(preview){assert(g.previewY>=g.boardY+g.boardSize,context);assert(g.previewY+94<=h-safe,context+' preview clipped');}
  else{const bottom=g.boardY+g.boardSize;assert(g.goalY-10>=bottom,context+' goals cover board');assert(g.toolHeight>=44,context);assert(g.goalY+10<g.toolY-g.toolHeight/2,context+' goals overlap tools');assert(g.toolY+g.toolHeight/2<=h-safe,context+' tools clipped');}
 }
});

test('mascot and theme feedback stay outside the board and do not cover one another',()=>{
 assert.equal(typeof gameLayout,'function');
 for(const [w,h]of viewports)for(const safe of [0,34])for(const preview of [false,true]){
  const g=gameLayout(w,h,safe,preview),context=JSON.stringify({w,h,safe,preview});
  const board=box(g.boardX+g.boardSize/2,g.boardY+g.boardSize/2,g.boardSize,g.boardSize),mascot=box(g.mascot.x,g.mascot.y,g.mascot.size,g.mascot.size*.9375),feedback=box(g.feedback.x,g.feedback.y,g.feedback.w,g.feedback.h);
  assert(separate(board,mascot),context+' mascot covers board');assert(mascot.left>=0&&mascot.right<=w&&mascot.top>=0&&mascot.bottom<=h-safe,context);
  if(g.feedback.w){assert(separate(board,feedback),context+' feedback covers board');assert(separate(mascot,feedback),context+' feedback covers mascot');assert(feedback.left>=0&&feedback.right<=w&&feedback.top>=0&&feedback.bottom<=h-safe,context);}
  if(g.portrait&&preview&&h<760){assert(mascot.left>=110&&mascot.right<=w-90,context+' mascot covers navigation');assert.equal(g.feedback.w,0);}
 }
});

test('smallest safe-area viewport separates HUD, goals, tools and preview without shrinking touch targets',()=>{
 assert.equal(typeof gameLayout,'function');
 const normal=gameLayout(320,540,34,false),preview=gameLayout(320,540,34,true);
 assert.equal(normal.boardSize,308);assert.equal(preview.boardSize,308);assert.equal(normal.toolHeight,44);
 assert(normal.feedback.y+normal.feedback.h/2<normal.statsY-11);
 assert(preview.previewY+94<=506);assert(normal.toolY+22<=506);
});

test('each level story has a separate reserved area from feedback, navigation, HUD and board',()=>{
 for(const [w,h]of viewports)for(const safe of [0,34])for(const preview of [false,true]){
  const g=gameLayout(w,h,safe,preview),s=g.story,context=JSON.stringify({w,h,safe,preview});assert(s,context+' story area');
  if(!s.w)continue;
  const story=box(s.x,s.y,s.w,s.h),feedback=box(g.feedback.x,g.feedback.y,g.feedback.w*1.025,g.feedback.h*1.025),board=box(g.boardX+g.boardSize/2,g.boardY+g.boardSize/2,g.boardSize,g.boardSize),mascot=box(g.mascot.x,g.mascot.y,g.mascot.size,g.mascot.size*.9375);
  assert(story.top>=55&&story.left>=0&&story.right<=w,context);assert(separate(story,board)&&separate(story,mascot),context);if(g.feedback.w)assert(separate(story,feedback),context+' combo overlaps story');
  if(g.portrait)assert(story.bottom<g.statsY-11,context+' story overlaps HUD');
 }
});
