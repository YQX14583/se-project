export function gameLayout(w:number,h:number,safeBottom:number,preview:boolean){
 const portrait=w<760,compact=portrait&&h<760,available=h-safeBottom;
 const boardSize=portrait?Math.min(w-12,462,Math.max(308,available-(compact?(preview?100:128):190)-(preview?98:70))):Math.max(308,Math.min(550,w*.48,available-226));
 const boardY=portrait?(compact?(preview?100:128):190):Math.min(125,available-boardSize-(preview?98:88));
 const boardX=portrait?(w-boardSize)/2:w*.65-boardSize/2,bottom=boardY+boardSize;
 const mascot=portrait?{x:compact?(preview?w/2:36):w*.2,y:compact?(preview?33:79):136,size:compact?42:65}:{x:w*.23,y:available*.61,size:Math.min(250,w*.23,available*.30)};
 let feedback:{x:number;y:number;w:number;h:number};
 if(compact)feedback={x:(w+72)/2,y:92,w:preview?0:w-82,h:18};
 else if(portrait){const left=Math.max(w*.27,mascot.x+mascot.size/2+10),right=w-12;feedback={x:(left+right)/2,y:136,w:right-left,h:40};}
 else feedback={x:w*.23,y:available*.39,w:Math.min(w*.36,2*(boardX-w*.23-10)),h:44};
 const story=compact?{x:(w+72)/2,y:68,w:preview?0:w-82,h:20}:portrait?{x:w/2,y:79,w:w-30,h:38}:{x:w*.23,y:available*.28,w:w*.34,h:40};
 return {portrait,boardX,boardY,boardSize,statsY:boardY-(portrait?15:26),goalY:bottom+(portrait?14:17),toolY:bottom+(portrait?48:62),toolHeight:portrait?44:52,previewY:bottom+4,mascot,feedback,story};
}
