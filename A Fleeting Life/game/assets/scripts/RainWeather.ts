import type { Painter } from './Painter';

type RainPainter=Pick<Painter,'line'|'circle'>;
export interface RainBounds {left:number;top:number;right:number;bottom:number;}
const CELL_WIDTH=512;
const layers=[
 {count:15,speed:83,length:4.5,alpha:.13,width:.5},
 {count:26,speed:137,length:8,alpha:.22,width:.75},
 {count:12,speed:202,length:12,alpha:.29,width:1}
];
function hash(seed:number){
 let n=Math.imul(seed^seed>>>16,0x7feb352d);
 n=Math.imul(n^n>>>15,0x846ca68b);
 return ((n^n>>>16)>>>0)/4294967296;
}
function mod(value:number,span:number){return (value%span+span)%span;}

/** A shared world field keeps the rain continuous from stage to wide-screen margins. */
export function drawRainWeather(p:RainPainter,clock:number,reducedMotion:boolean,
 bounds:RainBounds={left:0,top:0,right:480,bottom:270}){
 const time=reducedMotion?0:Math.max(0,clock);
 const top=-18,ground=216,fallSpan=ground-top+18;
 const rowsAbove=Math.max(0,Math.ceil((top-bounds.top)/fallSpan));
 const first=Math.floor((bounds.left-18)/CELL_WIDTH),last=Math.floor((bounds.right+18)/CELL_WIDTH);
 for(let cell=first;cell<=last;cell++)for(let layer=0;layer<layers.length;layer++){
  const spec=layers[layer],count=reducedMotion?Math.ceil(spec.count*.3):spec.count;
  for(let i=0;i<count;i++){
   const seed=cell*17011+(layer+1)*4099+i*97;
   const phase=hash(seed+31)*Math.PI*2,lean=.09+hash(seed+101)*.15;
   const speed=spec.speed*(.77+hash(seed+13)*.48);
   const length=spec.length*(.64+hash(seed+47)*.74)*(reducedMotion?.7:1);
   const x=cell*CELL_WIDTH+mod(hash(seed+71)*CELL_WIDTH-time*speed*lean+Math.sin(time*.53+phase)*1.5,CELL_WIDTH);
   const baseY=top+mod(hash(seed+59)*fallSpan+time*speed,fallSpan);
   if(x+1<bounds.left||x-length*lean>bounds.right)continue;
   const alpha=spec.alpha*(.65+hash(seed+113)*.5)*(reducedMotion?.72:1);
   for(let row=0;row<=rowsAbove;row++){
    const y=baseY-row*fallSpan;
    if(y>ground||y+length<bounds.top)continue;
    p.line(x,y,x-length*lean,Math.min(ground,y+length),
     `rgba(225,239,235,${alpha.toFixed(3)})`,spec.width);
   }
  }
 }
 for(let cell=first;cell<=last;cell++)for(let i=0;i<(reducedMotion?3:14);i++){
  const seed=cell*17011+13001+i*131,period=1.15+hash(seed+7)*1.65;
  const age=reducedMotion?.07:mod(time/period+hash(seed+19),1);
  if(age>.16)continue;
  const x=cell*CELL_WIDTH+hash(seed+29)*CELL_WIDTH,y=213+hash(seed+41)*5;
  if(x<bounds.left-3||x>bounds.right+3||y<bounds.top||y>bounds.bottom)continue;
  const radius=.65+age*13,alpha=reducedMotion?.08:.18*(1-age/.16);
  const color=`rgba(197,220,215,${alpha.toFixed(3)})`;
  p.line(x-radius,y,x+radius,y,color,.7);
  if(!reducedMotion&&age<.055){
   p.line(x-radius*.4,y-.7,x-radius*.9,y-2.3,`rgba(222,237,230,${(alpha*.68).toFixed(3)})`,.55);
   p.line(x+radius*.4,y-.6,x+radius*.8,y-1.7,`rgba(222,237,230,${(alpha*.5).toFixed(3)})`,.5);
  }
 }
}
