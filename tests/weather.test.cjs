'use strict';
const {test}=require('node:test');
const a=require('node:assert/strict');
const {rainIntensity,rainStrokes,WINDOW_PANES}=require('../.test-build/platform/weather');

function contains(pane,x,y){
 return pane.every((p,i)=>{const q=pane[(i+1)%pane.length];return (q.x-p.x)*(y-p.y)-(q.y-p.y)*(x-p.x)>=-1e-7;});
}

test('rain responds to the five emotional chapters and fades monotonically with healing',()=>{
 const chapters=Array.from({length:5},(_,c)=>rainIntensity(c,0,9));a.equal(new Set(chapters).size,5);
 a.ok(chapters[2]>chapters[0]&&chapters[3]<chapters[0]&&chapters[4]<chapters[3]);
 for(let c=0;c<5;c++)for(let t=0;t<60;t+=.4){
  let previous=1;
  for(let h=0;h<=1.001;h+=.1){const value=rainIntensity(c,h,t);a.ok(value>=0&&value<=previous);previous=value;}
  a.equal(rainIntensity(c,1,t),0);a.equal(rainIntensity(c,-2,t),rainIntensity(c,0,t));a.equal(rainIntensity(c,2,t),0);
 }
});

test('rain gusts evolve gently over seconds and every input remains bounded',()=>{
 let min=1,max=0;
 for(let t=0;t<64;t+=.05){const value=rainIntensity(2,0,t);min=Math.min(min,value);max=Math.max(max,value);a.ok(Math.abs(value-rainIntensity(2,0,t+.05))<.004);}
 a.ok(max-min>.08,'weather visibly changes over the course of a quiet turn');
 for(const value of [-100,0,4,100,NaN,Infinity])a.ok(Number.isFinite(rainIntensity(value,value,value)));
});

test('rain strokes move deterministically, stay short and remain inside the four glass panes',()=>{
 a.equal(WINDOW_PANES.length,4);a.deepEqual(rainStrokes(.8,2),rainStrokes(.8,2));a.notDeepEqual(rainStrokes(.8,2),rainStrokes(.8,2.1));
 for(let t=0;t<20;t+=.17){
  const strokes=rainStrokes(1,t);a.ok(strokes.length>=65&&strokes.length<=110);
  for(const s of strokes){
   a.ok(Object.values(s).every(Number.isFinite));a.ok(s.alpha>0&&s.alpha<=.3);
   a.ok(s.y2>s.y1&&s.x2<s.x1);a.ok(Math.hypot(s.x2-s.x1,s.y2-s.y1)<=28);
   a.ok(WINDOW_PANES.some(p=>contains(p,s.x1,s.y1)&&contains(p,s.x2,s.y2)));
   for(const [x,y] of [[s.x1,s.y1],[s.x2,s.y2]]){
    a.ok(x>=190&&x<=596&&y>=151&&y<=583,'stay clear of the frame, curtains, sill and hanging stars');
    a.ok(x<=386||x>=400,'keep the upright mullion uncovered');a.ok(y<=369||y>=383,'keep the crossbar uncovered');
   }
  }
 }
});

test('stronger rain adds drops without moving existing drops, and dry weather has none',()=>{
 a.deepEqual(rainStrokes(0,7),[]);a.deepEqual(rainStrokes(-4,7),[]);a.deepEqual(rainStrokes(4,7),rainStrokes(1,7));
 for(let t=0;t<20;t+=.5){
  let previous=[];
  for(const intensity of [.1,.3,.6,1]){
   const current=rainStrokes(intensity,t);a.ok(current.length>previous.length);
   previous.forEach((s,i)=>{for(const key of ['x1','x2','y1','y2'])a.equal(current[i][key],s[key]);});previous=current;
  }
 }
});
