export interface RainStroke { x1:number; y1:number; x2:number; y2:number; alpha:number; }
interface Point { x:number; y:number; }

// Original 1440×960 Paint.room coordinates, clockwise in screen space.
// Insets leave the arched frame, curtains, mullions, sill and hanging stars dry.
export const WINDOW_PANES:ReadonlyArray<ReadonlyArray<Point>> = [
 [{x:232,y:168},{x:253,y:151},{x:386,y:151},{x:386,y:369},{x:191,y:369},{x:202,y:260},{x:212,y:207}],
 [{x:400,y:151},{x:534,y:151},{x:560,y:174},{x:583,y:211},{x:594,y:260},{x:596,y:369},{x:400,y:369}],
 [{x:191,y:383},{x:386,y:383},{x:386,y:583},{x:190,y:583}],
 [{x:400,y:383},{x:596,y:383},{x:596,y:583},{x:400,y:583}],
];
const bounds=WINDOW_PANES.map(p=>({left:Math.min(...p.map(v=>v.x)),right:Math.max(...p.map(v=>v.x)),top:Math.min(...p.map(v=>v.y)),bottom:Math.max(...p.map(v=>v.y))}));
const unit=(value:number)=>Number.isFinite(value)?Math.max(0,Math.min(1,value)):0;
const wrap=(value:number,span:number)=>((value%span)+span)%span;

export function rainIntensity(chapter:number,healing:number,seconds:number):number {
 const index=Number.isFinite(chapter)?Math.max(0,Math.min(4,Math.floor(chapter))):0;
 const time=Number.isFinite(seconds)?seconds:0;
 const gust=.9+.065*Math.sin(time*Math.PI*2/11)+.035*Math.sin(time*Math.PI*2/16+.8);
 return [ .72,.78,.86,.54,.34 ][index]*Math.pow(1-unit(healing),1.3)*gust;
}

function clip(pane:ReadonlyArray<Point>,x:number,y:number,dx:number,dy:number,alpha:number):RainStroke|null {
 let start=0,end=1;
 for(let i=0;i<pane.length;i++){
  const p=pane[i],q=pane[(i+1)%pane.length],ex=q.x-p.x,ey=q.y-p.y;
  const side=ex*(y-p.y)-ey*(x-p.x),direction=ex*dy-ey*dx;
  if(Math.abs(direction)<1e-8){if(side<0)return null;continue;}
  const boundary=-side/direction;
  if(direction>0)start=Math.max(start,boundary);else end=Math.min(end,boundary);
  if(start>=end)return null;
 }
 if((end-start)*dy<.6)return null;
 return {x1:x+dx*start,y1:y+dy*start,x2:x+dx*end,y2:y+dy*end,alpha};
}

export function rainStrokes(intensity:number,seconds:number):RainStroke[] {
 const strength=unit(intensity),time=Number.isFinite(seconds)?seconds:0,strokes:RainStroke[]=[];
 const amount=strength*104;
 for(let i=0;i<Math.ceil(amount);i++){
  const paneIndex=i%4,b= bounds[paneIndex],length=14+(i%5)*3;
  const vertical=wrap((i*.754877666+.23)*(b.bottom-b.top+length)+time*(95+(i%7)*17),b.bottom-b.top+length);
  const y=b.top-length+vertical,x=b.left+wrap(i*.618033989+.37,1)*(b.right-b.left+40)-vertical*.17;
  const alpha=(.11+.13*strength)*Math.min(1,amount-i);
  const stroke=clip(WINDOW_PANES[paneIndex],x,y,-length*.17,length,alpha);
  if(stroke)strokes.push(stroke);
 }
 return strokes;
}
