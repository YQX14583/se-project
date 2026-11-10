import { ResultRecord } from './progress';
export interface ShareChapter {title:string;quotes:string[];color?:string}
export interface SharePayload {blob:Blob;text:string}
export function shareText(result:ResultRecord,chapter:ShareChapter):string {return `悲伤消消乐 · ${chapter.title} · ${result.levelName}\n${'★'.repeat(result.stars)}${'☆'.repeat(3-result.stars)}  共鸣值 ${result.score}\n${result.sadnessEnd===0?'悲伤值归零，这一刻轻了一些。':`这一页，悲伤值 ${result.sadnessEnd}。`}\n${chapter.quotes[(result.levelId-1)%chapter.quotes.length]||'今晚，先陪自己坐一会儿。'}`;}
function star(ctx:CanvasRenderingContext2D,x:number,y:number,r:number,filled:boolean){ctx.beginPath();for(let i=0;i<10;i++){const angle=-Math.PI/2+i*Math.PI/5,rr=i%2?r*.47:r;const xx=x+Math.cos(angle)*rr,yy=y+Math.sin(angle)*rr;i?ctx.lineTo(xx,yy):ctx.moveTo(xx,yy);}ctx.closePath();ctx.fillStyle=filled?'#dfb668':'#ded5c7';ctx.fill();ctx.strokeStyle='#8d7d75';ctx.lineWidth=3;ctx.stroke();}
export async function renderShare(result:ResultRecord,chapter:ShareChapter,fontFamily='ZCOOL KuaiLe'):Promise<SharePayload> {
 const text=shareText(result,chapter),canvas=document.createElement('canvas');canvas.width=1080;canvas.height=1920;
 const ctx=canvas.getContext('2d');if(!ctx)throw Error('SHARE_RENDER_FAILED');
 ctx.fillStyle='#d5c9c0';ctx.fillRect(0,0,1080,1920);ctx.fillStyle='#f3e8d3';ctx.beginPath();ctx.moveTo(65,65);ctx.lineTo(1010,80);ctx.lineTo(1022,1830);ctx.lineTo(52,1848);ctx.closePath();ctx.fill();
 ctx.lineWidth=5;ctx.strokeStyle='#736f85';ctx.strokeRect(163,310,744,610);ctx.fillStyle=chapter.color||'#343957';ctx.fillRect(172,320,726,590);
 ctx.strokeStyle='#e0c5a0';ctx.beginPath();ctx.moveTo(527,315);ctx.lineTo(532,921);ctx.moveTo(170,633);ctx.lineTo(905,639);ctx.stroke();
 ctx.save();ctx.beginPath();ctx.rect(174,323,720,583);ctx.clip();ctx.strokeStyle='#8890aa';ctx.lineWidth=2;for(let i=0;i<40;i++){const x=187+(i*127)%706,y=340+(i*83)%535;ctx.beginPath();ctx.moveTo(x,y);ctx.lineTo(x-7,y+35);ctx.stroke();}ctx.fillStyle='#eddfb1';ctx.beginPath();ctx.arc(755,455,66,0,Math.PI*2);ctx.fill();ctx.fillStyle=chapter.color||'#343957';ctx.beginPath();ctx.arc(779,438,61,0,Math.PI*2);ctx.fill();ctx.restore();
 ctx.fillStyle='#4d495d';ctx.textAlign='center';ctx.font=`76px "${fontFamily}", sans-serif`;ctx.fillText('悲伤消消乐',540,218);
 ctx.font=`43px "${fontFamily}", sans-serif`;ctx.fillText(`${chapter.title} · ${result.levelName}`,540,1042,880);
 for(let i=0;i<3;i++)star(ctx,385+i*155,1160,55,i<result.stars);
 ctx.fillStyle='#4d495d';ctx.font=`58px "${fontFamily}", sans-serif`;ctx.fillText(`共鸣值  ${result.score}`,540,1320);
 ctx.font=`36px "${fontFamily}", sans-serif`;ctx.fillText(result.sadnessEnd===0?'悲伤值归零 · 这一刻轻了一些':`悲伤值 ${result.sadnessEnd} · 今晚先到这里`,540,1418);
 const quote=chapter.quotes[(result.levelId-1)%chapter.quotes.length]||'先陪自己坐一会儿。';const lines:string[]=[];let line='';for(const char of quote){if(ctx.measureText(line+char).width>790){lines.push(line);line=char;}else line+=char;}lines.push(line);lines.forEach((t,i)=>ctx.fillText(t,540,1575+i*65));
 ctx.font=`28px "${fontFamily}", sans-serif`;ctx.fillStyle='#8a7f83';ctx.fillText('把这一刻，轻轻留在纸上。',540,1760);
 const blob=await new Promise<Blob>((resolve,reject)=>{try{canvas.toBlob(b=>b?resolve(b):reject(Error('SHARE_RENDER_FAILED')),'image/png');}catch{reject(Error('SHARE_RENDER_FAILED'));}});return {blob,text};
}
export async function copyText(text:string,nav:any=globalThis.navigator):Promise<{ok:boolean;text:string}> {try{await nav.clipboard.writeText(text);return {ok:true,text};}catch{return {ok:false,text};}}
export async function sharePrepared(payload:SharePayload,nav:any=globalThis.navigator,FileClass:any=globalThis.File):Promise<'shared'|'cancelled'|'fallback'> {
 try{if(!FileClass||!nav?.canShare||!nav?.share)return 'fallback';const files=[new FileClass([payload.blob],'悲伤消消乐.png',{type:'image/png'})];if(!nav.canShare({files}))return 'fallback';await nav.share({files,text:payload.text,title:'悲伤消消乐'});return 'shared';}catch(e){return (e as Error)?.name==='AbortError'?'cancelled':'fallback';}
}
/** Returns a local preview URL; the caller revokes it when closing the share view. */
export function saveImage(blob:Blob):{url:string;downloaded:boolean} {const url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download='悲伤消消乐.png';const downloaded='download' in a;if(downloaded){document.body.appendChild(a);a.click();a.remove();}return {url,downloaded};}
