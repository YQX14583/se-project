import type { Tool } from '../domain/model';
export const PALETTE = ['#efd38e','#8bc5d5','#b6a5d8','#db98b1','#e7a68c','#96bdac'];
const canvas = (w:number,h:number) => {const c=document.createElement('canvas');c.width=w;c.height=h;return c;};
function path(c:CanvasRenderingContext2D, pts:number[], fill:string, stroke='#292a45', width=4) {c.beginPath();c.moveTo(pts[0],pts[1]);for(let i=2;i<pts.length;i+=2)c.lineTo(pts[i],pts[i+1]);c.closePath();c.fillStyle=fill;c.fill();if(width){c.strokeStyle=stroke;c.lineWidth=width;c.lineJoin='round';c.stroke();}}
function round(c:CanvasRenderingContext2D,x:number,y:number,w:number,h:number,r:number,fill:string,stroke='',sw=3){c.beginPath();c.moveTo(x+r,y);c.lineTo(x+w-r,y);c.quadraticCurveTo(x+w,y,x+w,y+r);c.lineTo(x+w,y+h-r);c.quadraticCurveTo(x+w,y+h,x+w-r,y+h);c.lineTo(x+r,y+h);c.quadraticCurveTo(x,y+h,x,y+h-r);c.lineTo(x,y+r);c.quadraticCurveTo(x,y,x+r,y);c.closePath();c.fillStyle=fill;c.fill();if(stroke){c.strokeStyle=stroke;c.lineWidth=sw;c.stroke();}}
function ellipse(c:CanvasRenderingContext2D,x:number,y:number,rx:number,ry:number,fill:string){c.beginPath();c.ellipse(x,y,rx,ry,0,0,Math.PI*2);c.fillStyle=fill;c.fill();}
function line(c:CanvasRenderingContext2D,points:number[],color:string,width=3){c.beginPath();c.moveTo(points[0],points[1]);for(let i=2;i<points.length;i+=2)c.lineTo(points[i],points[i+1]);c.strokeStyle=color;c.lineWidth=width;c.lineCap='round';c.stroke();}
function star(c:CanvasRenderingContext2D,x:number,y:number,r:number,color:string,rotation=0){const pts:number[]=[];for(let j=0;j<10;j++){const a=rotation-Math.PI/2+j*Math.PI/5,d=j%2?r*.46:r;pts.push(x+Math.cos(a)*d,y+Math.sin(a)*d);}path(c,pts,color,color,0);}
export function room(chapter:number,healing:number):HTMLCanvasElement{
 const out=canvas(1440,960),c=out.getContext('2d')!;const warm=Math.max(0,Math.min(1,healing));
 const bg=c.createLinearGradient(0,0,1440,960);bg.addColorStop(0,['#3c405b','#45415c','#443c59','#354d52','#405261'][chapter]||'#3c405b');bg.addColorStop(.6,'#252b42');bg.addColorStop(1,'#192235');c.fillStyle=bg;c.fillRect(0,0,1440,960);
 // Uneven plaster, pencil grain and a low wooden floor.
 for(let i=0;i<1800;i++){const x=(i*173.7)%1440,y=(i*77.13)%960;c.fillStyle=i%2?'rgba(235,220,197,.022)':'rgba(3,8,25,.045)';c.fillRect(x,y,1+(i%4),1);}
 path(c,[0,774,1440,718,1440,960,0,960],'#3b3443','#6d5a58',3);
 for(let x=-300;x<1800;x+=170)line(c,[x,960,x+190,746],'rgba(14,20,39,.3)',3);
 line(c,[0,865,1440,824],'rgba(154,119,101,.17)',2);
 // Arched midnight window.
 const arch=()=>{c.beginPath();c.moveTo(178,595);c.lineTo(178,260);c.bezierCurveTo(176,35,604,30,608,260);c.lineTo(608,595);c.closePath();};
 c.save();arch();c.shadowColor='rgba(5,10,30,.55)';c.shadowBlur=32;c.fillStyle='#1b263e';c.fill();c.shadowBlur=0;c.lineWidth=20;c.strokeStyle='#686680';c.stroke();c.restore();
 c.save();arch();c.clip();const sky=c.createLinearGradient(0,100,0,600);sky.addColorStop(0,'#25344f');sky.addColorStop(1,chapter===4?'#887a81':'#47536d');c.fillStyle=sky;c.fillRect(150,60,500,550);
 const glow=c.createRadialGradient(477,215,5,477,215,160);glow.addColorStop(0,'rgba(245,222,164,.18)');glow.addColorStop(1,'rgba(245,222,164,0)');c.fillStyle=glow;c.fillRect(200,70,450,440);
 ellipse(c,470,210,37,40,'#eee0b8');ellipse(c,487,196,34,37,'#2c3c55');
 for(let i=0;i<24;i++){const x=200+(i*67)%390,y=120+(i*53)%300;star(c,x,y,i%5===0?3:1.5,'#b8bdca');}
 for(let i=0;i<8;i++){const x=140+i*74,h=45+(i*29)%100;path(c,[x,610,x,560-h,x+35,534-h,x+72,560-h,x+72,610],'#273448','#273448',0);for(let j=0;j<3;j++)round(c,x+12+j*18,570-h,6,12,1,i%3?'#788080':'#d3bb8c');}
 c.fillStyle='rgba(230,185,139,'+(warm*.16)+')';c.fillRect(150,70,500,550);c.restore();
 line(c,[393,100,393,598],'#77788b',8);line(c,[182,376,604,376],'#7c7d90',8);
 round(c,151,591,486,26,10,'#827887','#37364d',4);
 // Billowing curtains and tied ribbons.
 path(c,[145,121,206,112,194,293,170,450,155,600,107,620,128,420],'#767386','#45465d',3);
 path(c,[596,111,649,120,660,346,688,610,637,615,620,435,601,292],'#747085','#43465d',3);
 line(c,[154,145,147,405,127,579],'#928b99',3);line(c,[630,140,637,408,668,583],'#918896',3);
 round(c,128,410,47,12,5,'#c2a58d');round(c,625,411,43,12,5,'#c2a58d');
 // Small hanging stars, deliberately uneven.
 c.beginPath();c.moveTo(54,56);c.quadraticCurveTo(340,115,734,44);c.strokeStyle='#8d8796';c.lineWidth=2;c.stroke();
 for(let i=0;i<8;i++){const x=74+i*87,y=65+Math.sin(i*.43)*23;line(c,[x,y,x,y+20+(i%3)*12],'#a99b9c',1.5);star(c,x,y+28+(i%3)*12,9+i%3,'#d5bd8c',i*.3);}
 // Lamplight makes a generous pool rather than a sharp UI glow.
 const lampGlow=c.createRadialGradient(722,525,10,722,525,290);lampGlow.addColorStop(0,'rgba(240,181,123,'+(.20+warm*.12)+')');lampGlow.addColorStop(1,'rgba(240,181,123,0)');c.fillStyle=lampGlow;c.fillRect(415,215,615,615);
 round(c,653,660,180,28,12,'#887164','#342f40',4);line(c,[675,683,665,828],'#71605a',12);line(c,[810,680,822,824],'#71605a',12);
 ellipse(c,738,657,40,9,'#b29472');line(c,[738,642,738,525],'#c7aa81',7);
 path(c,[704,450,772,454,804,536,670,536],'#dcc39a','#574a4c',4);ellipse(c,736,535,67,11,'#e8c990');
 // A quiet chair, throw and scattered personal objects.
 round(c,226,636,342,188,75,'#827185','#423d52',5);round(c,222,745,355,94,34,'#a18c97','#4a4152',4);
 round(c,198,700,70,138,28,'#91808e','#4a4152',4);round(c,535,708,65,135,28,'#91808e','#4a4152',4);
 path(c,[302,718,459,724,479,887,405,904,311,878],'#a9a4b0','#6b687d',3);
 for(let i=0;i<7;i++)line(c,[320+i*20,743,337+i*17,879],'rgba(222,210,211,.2)',2);
 line(c,[235,835,222,892],'#584653',12);line(c,[566,836,575,889],'#584653',12);
 ellipse(c,402,899,237,37,'rgba(10,16,29,.22)');
 round(c,42,630,116,13,3,'#a5a09b');round(c,47,645,109,17,2,'#676d85');round(c,35,666,122,15,3,'#bb9685');
 path(c,[59,691,136,678,167,718,83,731],'#b6a491','#695d67',2);line(c,[77,700,136,691],'#897a7c',2);
 // One framed keepsake and taped note on the far wall.
 c.save();c.translate(1290,560);c.rotate(-.05);round(c,-49,-65,98,130,4,'#c1a392','#6a5860',5);round(c,-40,-55,80,109,2,'#6c7383');ellipse(c,6,-19,20,23,'#bdb1a6');path(c,[-34,51,-17,0,20,12,35,51],'#96959a','#96959a',0);c.restore();
 c.save();c.translate(1250,230);c.rotate(.09);path(c,[-38,-47,35,-44,40,44,-34,49],'#b7ab9b','#8c7e79',1);round(c,-17,-54,34,14,1,'rgba(180,168,150,.65)');line(c,[-22,-20,18,-18],'#918685',2);line(c,[-22,-6,23,-4],'#918685',2);c.restore();
 // Warm vignette protects legibility but leaves visible paper texture.
 const shade=c.createLinearGradient(600,0,1440,0);shade.addColorStop(0,'rgba(17,22,39,0)');shade.addColorStop(1,'rgba(15,22,39,.43)');c.fillStyle=shade;c.fillRect(600,0,840,960);
 return out;
}
export function character(healing:number,chapter:number,tool:Tool|null=null,phase=0):HTMLCanvasElement{
 const out=canvas(320,300),c=out.getContext('2d')!;const h=Math.max(0,Math.min(1,healing)),p=Math.max(0,Math.min(1,phase));
 const reaction=tool&&p>0&&p<1?Math.sin(Math.PI*p):0;
 if(reaction){
  const tint=tool==='breathe'?'185,218,222':tool==='hug'?'241,166,186':tool==='resonate'?'246,213,139':'166,208,232';
  const light=c.createRadialGradient(160,155,18,160,155,134);light.addColorStop(0,'rgba('+tint+','+reaction*.34+')');light.addColorStop(.6,'rgba('+tint+','+reaction*.16+')');light.addColorStop(1,'rgba('+tint+',0)');c.fillStyle=light;c.fillRect(26,21,268,268);
 }
 ellipse(c,161,270,105,17,'rgba(10,18,35,.22)');
 c.save();c.translate(160,156);c.rotate((1-h)*-.055);
 if(reaction){
  if(tool==='breathe'){c.translate(0,-reaction*3);c.scale(1+reaction*.045,1+reaction*.025);}
  else if(tool==='hug'){c.translate(0,reaction*3);c.scale(1+reaction*.025,1-reaction*.025);}
  else if(tool==='resonate'){c.translate(0,-reaction*5);c.rotate(reaction*.045);}
  else {c.translate(Math.sin(p*Math.PI*2)*reaction*4,-reaction*3);c.rotate(Math.sin(p*Math.PI*2)*reaction*.075);}
 }
 c.beginPath();c.moveTo(-89,72);c.bezierCurveTo(-112,5,-75,-71,-42,-76);c.bezierCurveTo(-35,-122,-8,-117,5,-83);c.bezierCurveTo(28,-92,47,-105,55,-76);c.bezierCurveTo(105,-38,105,51,82,82);c.bezierCurveTo(48,115,-57,118,-89,72);c.closePath();c.fillStyle='#dfdce0';c.fill();c.strokeStyle='#8e92aa';c.lineWidth=4;c.stroke();
 const shade=c.createLinearGradient(0,-80,0,90);shade.addColorStop(0,'#f2ece4');shade.addColorStop(1,'#c6c8d6');c.fillStyle=shade;c.fill();
 if(!reaction){
  ellipse(c,-35,7,6,8,'#4c4c65');ellipse(c,35,7,6,8,'#4c4c65');
  if(h<.5){line(c,[-48,-7,-27,-15],'#6c6680',3);line(c,[25,-15,47,-7],'#6c6680',3);}
  c.beginPath();c.moveTo(-8,29);c.quadraticCurveTo(0,22+h*18,8,29);c.strokeStyle='#766b7e';c.lineWidth=3;c.stroke();
 }else{
  c.save();c.lineWidth=3;c.lineCap='round';c.strokeStyle='#4c4c65';
  if(tool==='breathe'||tool==='hug'){
   if(reaction<1)for(const x of [-35,35])ellipse(c,x,7,6,8*(1-reaction),'#4c4c65');
   c.globalAlpha=reaction;
   for(const x of [-35,35]){c.beginPath();c.moveTo(x-9,5);c.quadraticCurveTo(x,tool==='breathe'?12:15,x+9,5);c.stroke();}
  }else{
   const glance=tool==='shuffle'?Math.sin(p*Math.PI*2)*5*reaction:0,eyeY=7-(tool==='shuffle'?4:6)*reaction,eyeHeight=8+(tool==='shuffle'?-1:2)*reaction;
   ellipse(c,-35+glance,eyeY,6,eyeHeight,'#4c4c65');ellipse(c,35+glance,eyeY,6,eyeHeight,'#4c4c65');
   if(tool==='resonate'){c.globalAlpha=reaction;ellipse(c,-37,eyeY-3,2,3,'#fff4df');ellipse(c,33,eyeY-3,2,3,'#fff4df');}
  }
  if(h<.5){c.globalAlpha=tool==='shuffle'?1:1-reaction;line(c,[-48,-7-reaction*5,-27,-15],'#6c6680',3);line(c,[25,-15,47,-7-reaction*5],'#6c6680',3);}
  c.globalAlpha=1;
  if(tool==='breathe'){
   c.globalAlpha=1-reaction;c.beginPath();c.moveTo(-8,29);c.quadraticCurveTo(0,22+h*18,8,29);c.strokeStyle='#766b7e';c.stroke();c.globalAlpha=reaction;ellipse(c,0,29,5*reaction,6*reaction,'#766b7e');
  }else{
   const restMouth=22+h*18;c.beginPath();c.moveTo(-8-reaction*2,29-reaction*2);c.quadraticCurveTo(0,restMouth+((tool==='hug'?36:41)-restMouth)*reaction,8+reaction*2,29-reaction*2);c.strokeStyle='#766b7e';c.stroke();
  }
  c.restore();
 }
 ellipse(c,-52,23,13,6,'rgba(210,147,155,.55)');ellipse(c,52,23,13,6,'rgba(210,147,155,.55)');
 if(chapter===2&&h<.65){if(reaction){c.save();c.globalAlpha=1-reaction;}path(c,[44,27,37,43,46,49,52,43],'#99c4d4','#99c4d4',0);if(reaction)c.restore();}
 // Little blanket and gently unclenching hands.
 path(c,[-81,58,-35,47,0,65,41,50,86,62,88,91,39,111,-42,107,-85,90],['#8e98b4','#a19ab7','#ad95ac','#9daea9','#b2a795'][chapter],'#787c98',3);
 const left=[-48-h*10,61-h*12],right=[46+h*10,62-h*12];
 if(reaction){
  const hands=tool==='breathe'?[-47,42,47,43]:tool==='hug'?[24,45,-24,64]:tool==='resonate'?[-12,40,84,-21]:[-88,25,87,22];
  left[0]+=(hands[0]-left[0])*reaction;left[1]+=(hands[1]-left[1])*reaction;right[0]+=(hands[2]-right[0])*reaction;right[1]+=(hands[3]-right[1])*reaction;
  c.save();c.globalAlpha=reaction;c.lineCap='round';
  for(const [x,y,side] of [[left[0],left[1],-1],[right[0],right[1],1]]){c.beginPath();c.moveTo(side*72,55);c.quadraticCurveTo(side*(tool==='hug'?42:95),tool==='hug'?34:45,x,y);c.strokeStyle='#a7a7ba';c.lineWidth=19;c.stroke();c.strokeStyle='#e2dce0';c.lineWidth=15;c.stroke();}
  c.restore();
 }
 ellipse(c,left[0],left[1],21,13,'#e7e0dc');ellipse(c,right[0],right[1],21,13,'#e7e0dc');
 if(reaction){
  c.save();c.globalAlpha=reaction;
  if(tool==='hug'){c.translate(0,-39);c.scale(.55,.55);c.beginPath();c.moveTo(0,26);c.bezierCurveTo(-45,0,-17,-31,0,-11);c.bezierCurveTo(17,-31,45,0,0,26);c.fillStyle='#e9a9ba';c.fill();}
  else if(tool==='resonate'){star(c,90,-57,10,'#f6d998',p*.3);star(c,-82,-49,6,'#e7c98e',-.2);}
  else {c.strokeStyle=tool==='breathe'?'#bbdadf':'#b4d5e6';c.lineWidth=2.5;c.lineCap='round';for(let j=0;j<2;j++){const shift=tool==='shuffle'?Math.sin(p*Math.PI)*8:Math.max(0,p-.45)*25;c.beginPath();c.moveTo(84+shift,15+j*14);c.quadraticCurveTo(103+shift,5+j*14,114+shift,13+j*14);c.stroke();}}
  c.restore();
 }
 c.restore();return out;
}
export function tileArt(index:number):HTMLCanvasElement{
 const out=canvas(128,128),c=out.getContext('2d')!;c.translate(64,62);const color=PALETTE[index];
 c.shadowColor='rgba(16,25,46,.25)';c.shadowBlur=4;c.shadowOffsetY=4;
 if(index===0)star(c,0,0,42,color,.06);
 else if(index===1){c.beginPath();c.moveTo(0,-45);c.bezierCurveTo(-12,-22,-39,2,-33,23);c.bezierCurveTo(-25,57,34,48,35,16);c.bezierCurveTo(35,-4,12,-30,0,-45);c.fillStyle=color;c.fill();}
 else if(index===2){c.beginPath();c.arc(0,0,40,.15,Math.PI*2+.15);c.fillStyle=color;c.fill();c.globalCompositeOperation='destination-out';c.beginPath();c.arc(18,-13,34,0,Math.PI*2);c.fill();c.globalCompositeOperation='source-over';}
 else if(index===3){for(let i=0;i<5;i++){const a=i*Math.PI*2/5-Math.PI/2;ellipse(c,Math.cos(a)*23,Math.sin(a)*23,21,22,color);}ellipse(c,0,0,17,17,'#edc7b3');}
 else if(index===4){c.beginPath();c.moveTo(0,39);c.bezierCurveTo(-85,-10,-23,-64,0,-28);c.bezierCurveTo(24,-64,85,-10,0,39);c.fillStyle=color;c.fill();}
 else {c.beginPath();c.moveTo(-31,37);c.bezierCurveTo(-58,-11,-14,-42,38,-38);c.bezierCurveTo(44,11,10,48,-31,37);c.fillStyle=color;c.fill();line(c,[-25,29,26,-26],'#5d8f87',4);line(c,[-8,11,-16,-10],'#5d8f87',3);line(c,[5,-2,23,1],'#5d8f87',3);}
 c.shadowBlur=0;c.shadowOffsetY=0;
 if(index!==2&&index!==5){ellipse(c,-10,2,2.2,3,'rgba(51,55,76,.65)');ellipse(c,10,2,2.2,3,'rgba(51,55,76,.65)');}
 ellipse(c,-12,-20,9,4,'rgba(255,255,255,.25)');
 return out;
}
export function cloudArt(hp:number):HTMLCanvasElement{
 const out=canvas(128,128),c=out.getContext('2d')!;
 c.fillStyle='#9297b1';c.beginPath();c.moveTo(28,86);c.bezierCurveTo(-3,85,0,47,28,48);c.bezierCurveTo(29,12,77,9,88,42);c.bezierCurveTo(122,38,133,86,100,88);c.closePath();c.fill();
 line(c,[42,56,48,60,54,56],'#565c7c',3);line(c,[72,56,78,60,84,56],'#565c7c',3);
 for(let i=0;i<hp;i++)ellipse(c,48+i*16-(hp-1)*8+16,105,4,5,'#bec6d6');
 return out;
}
