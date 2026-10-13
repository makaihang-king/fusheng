import { Painter } from './Painter';
import { drawDreamScenery, drawDreamTableHomework, dreamHomeworkMemory } from './DreamScenery';
import { ACHIEVEMENTS, ITEM_PRICES, COSMETICS } from './Model';
import { ENDINGS, ENDING_MEDIA, ENDING_MEDIA_SECONDS, ENDING_MEDIA_CARD_SECONDS, ENDING_SEQUENCE_FRAMES, CHAPTERS, SEGMENTS, CHARACTER_ANIMATIONS, CHARACTER_SKINS, CHARACTER_VARIANTS, CHARACTER_WET_LEVELS, MICRO_ANCHOR_ART, SCENE_SCROLL_CHUNK_COUNTS, SCENE_SCROLL_TILE_STRIDE, SCENE_SCROLL_TILE_WIDTH } from './Content';
import type { MainChoiceId, CharacterAnimation, ObstacleKind } from './Content';
import { XIAOMAN_MOTION, XIAOMAN_GAIT } from './Content';
import { corridorPoseBottom } from './CorridorPixels';
import { drawXiaomanFallback, xiaomanFrameAnchors } from './XiaomanFallback';
import { CHOICE_SCENES } from './Narrative';
import { memoryBookCards, memoryBookPageCount, memoryReviewForSegment, MEMORY_BOOK_PAGE_SIZE } from './MemoryBook';
import type { MemoryBookCard, MemoryBookIcon } from './MemoryBook';
import type { Game } from './Game';
import { drawPhysicalObstacle } from './ObstacleRendering';
import { obstacleVisible, type WorldObstacle } from './ObstacleLogic';
import { drawSceneGround } from './SceneGround';
import { drawRainWeather } from './RainWeather';
import { coreImagePainter } from './ImageBounds';
import { sceneTravel } from './SceneBackdrop';
import { CHAIRS, CHAIR_HEIGHT, CHAIR_TOP, GROUND_Y, RUN_SPEED, chairSurface, choicePropBounds,
  obstacleBounds, playerBodyBounds, worldX } from './Geometry';

const INK='#334941',MUTED='#5e7363',PAPER='#eeeade',GOLD='#cfac68';
const PAL:any={
 dawn:['#ecebd9','#d2d9ba','#a9b4a1','#657d68','#eee0b8'],
 rain:['#aebfc4','#94abad','#739293','#476d6c','#cfddd5'],
 noon:['#f0dfac','#e2c68b','#c4ab74','#817856','#f4e8c8'],
 gray:['#cbd0c7','#aebcaf','#91a69b','#597970','#e2dbb8'],
 dusk:['#e6c49e','#c59b81','#9e7d74','#635c5e','#f6d698'],
 night:['#22394b','#344d60','#3f6070','#1a303f','#e8d59e'],
 graduate:['#778c9c','#7d9a98','#658981','#3b6568','#efe2b7'],
 dream:['#8b7aa8','#b39ec8','#d6b9d5','#655679','#f4e0b8'],
 heaven:['#f1ecda','#e6dab7','#d4c18d','#a68a4f','#fff8db'],
 hell:['#35282c','#533336','#743c3b','#281e26','#d48b5a']
};
// Scenery tiles wrap beyond the logical canvas. Skip fully invisible geometry
// before Cocos Graphics builds a path and mesh for it. Keep a small fringe for
// stroke width and antialiasing at the edges.
const sceneryPainters=new WeakMap<Painter,Painter>();
function visibleSceneryPainter(source:Painter):Painter{
 let painter=sceneryPainters.get(source);if(painter)return painter;
 const fringe=2,left=-fringe,right=480+fringe,top=-fringe,bottom=270+fringe;
 painter={
  rect(x,y,w,h,c){if(w>0&&h>0&&x+w>=left&&x<=right&&y+h>=top&&y<=bottom)source.rect(x,y,w,h,c);},
  line(x1,y1,x2,y2,c,w){if(Math.max(x1,x2)>=left&&Math.min(x1,x2)<=right&&Math.max(y1,y2)>=top&&Math.min(y1,y2)<=bottom)source.line(x1,y1,x2,y2,c,w);},
  circle(x,y,r,c){if(x+r>=left&&x-r<=right&&y+r>=top&&y-r<=bottom)source.circle(x,y,r,c);},
  poly(points,c){let minX=Infinity,maxX=-Infinity,minY=Infinity,maxY=-Infinity;
   for(const point of points){minX=Math.min(minX,point[0]);maxX=Math.max(maxX,point[0]);minY=Math.min(minY,point[1]);maxY=Math.max(maxY,point[1]);}
   if(maxX>=left&&minX<=right&&maxY>=top&&minY<=bottom)source.poly(points,c);
  },
  text(value,x,y,size,c,align){source.text(value,x,y,size,c,align);},
  image(key,x,y,w,h,opacity){return source.image(key,x,y,w,h,opacity);},
  imageRegion(key,sx,sy,sw,sh,x,y,w,h,opacity){return w>0&&h>0&&x+w>=left&&x<=right&&y+h>=top&&y<=bottom?
    source.imageRegion?.(key,sx,sy,sw,sh,x,y,w,h,opacity)??false:false;}
 };
 sceneryPainters.set(source,painter);return painter;
}
const short=(s:string,n=25)=>s.length>n?s.slice(0,n-1)+'…':s;
function compactCount(value:number):string{
 const count=Math.max(0,Math.floor(value));
 if(count>=1e8)return String(Math.floor(count/1e7)/10)+'亿';
 if(count>=1e4){const units=count/1e4;return String(units<10?Math.floor(units*10)/10:Math.floor(units))+'万';}
 return String(count);
}
function shiftedPainter(source:Painter,dx:number,dy:number):Painter{
 return {
  rect(x,y,w,h,c){source.rect(x+dx,y+dy,w,h,c);},
  line(x1,y1,x2,y2,c,w){source.line(x1+dx,y1+dy,x2+dx,y2+dy,c,w);},
  circle(x,y,r,c){source.circle(x+dx,y+dy,r,c);},
  poly(points,c){source.poly(points.map(([x,y])=>[x+dx,y+dy]),c);},
  text(value,x,y,size,c,align){source.text(value,x+dx,y+dy,size,c,align);},
  image(key,x,y,w,h,opacity){return source.image(key,x+dx,y+dy,w,h,opacity);},
  imageRegion(key,sx,sy,sw,sh,x,y,w,h,opacity){return source.imageRegion?.(key,sx,sy,sw,sh,x+dx,y+dy,w,h,opacity)??false;}
 };
}
function fadedPainter(source:Painter,alpha:number):Painter{
 const color=(c:string)=>{
  const hex=/^#([0-9a-f]{6})$/i.exec(c),rgba=/^rgba\(([^,]+),([^,]+),([^,]+),([^\)]+)\)$/.exec(c);
  if(hex){const n=parseInt(hex[1],16);return `rgba(${n>>16},${n>>8&255},${n&255},${alpha.toFixed(3)})`;}
  if(rgba)return `rgba(${rgba[1]},${rgba[2]},${rgba[3]},${(Number(rgba[4])*alpha).toFixed(3)})`;
  return c;
 };
 return {
  rect(x,y,w,h,c){source.rect(x,y,w,h,color(c));},
  line(x1,y1,x2,y2,c,w){source.line(x1,y1,x2,y2,color(c),w);},
  circle(x,y,r,c){source.circle(x,y,r,color(c));},
  poly(points,c){source.poly(points,color(c));},
  text(value,x,y,size,c,align){source.text(value,x,y,size,color(c),align);},
  image(key,x,y,w,h,opacity=1){return source.image(key,x,y,w,h,opacity*alpha);},
  imageRegion(key,sx,sy,sw,sh,x,y,w,h,opacity=1){return source.imageRegion?.(key,sx,sy,sw,sh,x,y,w,h,opacity*alpha)??false;}
 };
}
function text(p:Painter,s:string,x:number,y:number,size=9,c=INK,align:'left'|'center'|'right'='left'){p.text(s,x,y,size,c,align);}
function wrap(p:Painter,s:string,x:number,y:number,width:number,size=9,c=INK,lineHeight=15){
 const max=Math.max(1,Math.floor(width/size));let row=0;
 for(const paragraph of String(s).split('\n')){
   let line='';let units=0;
   for(const ch of paragraph){const u=ch.charCodeAt(0)<128?.55:1;if(units+u>max){text(p,line,x,y+row++*lineHeight,size,c);line='';units=0;}line+=ch;units+=u;}
   text(p,line,x,y+row++*lineHeight,size,c);
 }return row*lineHeight;
}
function outline(p:Painter,x:number,y:number,w:number,h:number,c:string,l=1){p.rect(x,y,w,l,c);p.rect(x,y+h-l,w,l,c);p.rect(x,y,l,h,c);p.rect(x+w-l,y,l,h,c);}
function button(g:Game,p:Painter,x:number,y:number,w:number,h:number,label:string,action:()=>void,primary=false,disabled=false,icon=''){
 const pressed=!!g.pointer?.ui&&g.pointer.inside&&!g.pointer.cancelled&&g.pointer.button?.x===x&&g.pointer.button?.y===y;
 const fill=disabled?'#dde2d6':pressed?'#b5c7b1':primary?INK:'#f4f1e7';
 const labelInk=disabled?'#606f63':pressed?INK:primary?'#f4eee0':INK;
 p.rect(x,y,w,h,fill);
 if(!pressed&&!disabled)p.rect(x+1,y+h,w-1,1,'rgba(42,62,49,0.16)');
 outline(p,x,y,w,h,disabled?'#b9c4b3':pressed?'#667f68':primary?'#405a4b':'#b4c0ae');
 if(!disabled&&!pressed)p.rect(x+1,y+1,w-2,1,primary?'#4e6656':'#fffbef');
 if(primary&&!disabled){p.rect(x+1,y+2,2,h-4,GOLD);p.rect(x+3,y+h-2,w-4,1,'#9e8d62');}
 const iconSize=Math.min(16,Math.min(w,h)-4);
 const showLabel=w>=42&&h>=19;
 const iconX=showLabel?x+5:x+(w-iconSize)/2;
 const hasIcon=!!icon&&p.image(icon,iconX,y+(h-iconSize)/2,iconSize,iconSize);
 if(hasIcon&&w>=42&&h>=19)
  text(p,label,x+iconSize+10,y+(h-8)/2,8,labelInk,'left');
 else if(!hasIcon)
  text(p,label,x+w/2,y+(h-9)/2,9,labelInk,'center');
 g.button(x,y,w,h,label,action,disabled);
}
function heart(p:Painter,x:number,y:number,filled:boolean){
 p.rect(x,y,20,18,filled?'rgba(82,48,46,0.72)':'rgba(219,224,214,0.82)');
 outline(p,x,y,20,18,filled?'#cf8b73':'#7d8980');
 if(p.image(`ui.icon.heart.${filled?'active':'normal'}`,x+1,y+1,18,16))return;
 p.poly([[x+4,y+5],[x+7,y+2],[x+10,y+5],[x+13,y+2],[x+16,y+5],
  [x+16,y+9],[x+10,y+15],[x+4,y+9]],filled?'#cf7468':'#68766f');
 if(!filled)p.poly([[x+7,y+6],[x+9,y+5],[x+10,y+7],[x+12,y+5],[x+14,y+7],
  [x+14,y+9],[x+10,y+12],[x+7,y+9]],'#dfe2d8');
}
function memoryIcon(p:Painter,x:number,y:number,size:number,icon:MemoryBookIcon,ink:string,paper:string){
 const mid=x+size/2,bottom=y+size-5;
 if(icon==='hat'){
  p.rect(x+8,y+size*.51,size-16,9,ink);p.rect(x+4,y+size*.72,size-8,3,ink);
  p.rect(x+11,y+size*.47,size-22,3,paper);
 }else if(icon==='bag'){
  p.rect(x+9,y+10,size-18,size-16,ink);p.rect(x+13,y+17,size-26,size-25,paper);
  p.line(x+14,y+11,x+14,y+5,ink,2);p.line(x+14,y+5,x+size-14,y+5,ink,2);p.line(x+size-14,y+5,x+size-14,y+11,ink,2);
 }else if(icon==='book'){
  p.poly([[x+5,y+11],[mid-1,y+13],[mid-1,bottom],[x+5,bottom-2]],paper);
  p.poly([[mid+1,y+13],[x+size-5,y+11],[x+size-5,bottom-2],[mid+1,bottom]],paper);
  p.line(mid,y+12,mid,bottom,ink,2);p.line(x+6,bottom-2,mid,bottom,ink);p.line(mid,bottom,x+size-6,bottom-2,ink);
 }else if(icon==='door'){
  p.rect(x+10,y+4,size-20,size-9,ink);p.rect(x+14,y+8,size-28,size-13,paper);
  p.rect(mid+3,y+8,2,size-13,ink);p.circle(x+size-16,y+size*.54,2,ink);
 }else if(icon==='bench'){
  p.rect(x+5,y+size*.46,size-10,5,ink);p.rect(x+8,y+size*.27,size-16,5,ink);
  p.rect(x+10,y+size*.46,3,size*.34,ink);p.rect(x+size-13,y+size*.46,3,size*.34,ink);
 }else if(icon==='cup'){
  p.rect(x+9,y+size*.39,size-21,size*.38,paper);p.rect(x+9,y+size*.39,size-21,3,ink);
  p.line(x+size-12,y+size*.49,x+size-6,y+size*.49,ink,2);p.line(x+size-6,y+size*.49,x+size-6,y+size*.67,ink,2);
  p.line(x+size-6,y+size*.67,x+size-12,y+size*.67,ink,2);
  p.line(mid-5,y+size*.30,mid-4,y+size*.16,ink);p.line(mid+4,y+size*.30,mid+5,y+size*.15,ink);
 }else if(icon==='tag'){
  p.line(mid,y+2,mid,y+size*.28,ink,2);
  p.poly([[mid-10,y+size*.28],[mid+10,y+size*.28],[mid+12,y+size*.58],[mid,y+size*.79],[mid-12,y+size*.58]],paper);
  p.circle(mid,y+size*.38,2,ink);
 }else if(icon==='wall'){
  for(let row=0;row<3;row++)for(let col=0;col<2;col++){
   const bx=x+5+col*(size-10)/2+(row%2?3:0),by=y+7+row*10;
   p.rect(bx,by,(size-15)/2,8,ink);
  }
 }else if(icon==='field'){
  p.line(x+5,bottom,x+size-5,bottom,ink,2);p.line(x+10,y+size*.48,x+size-10,y+size*.48,ink,2);
  p.rect(x+12,y+size*.32,3,size*.45,ink);p.rect(x+size-15,y+size*.32,3,size*.45,ink);
  p.circle(mid,y+size*.68,4,paper);
 }else if(icon==='lamp'){
  p.poly([[mid-12,y+size*.35],[mid+12,y+size*.35],[mid+7,y+size*.57],[mid-7,y+size*.57]],paper);
  p.line(mid,y+size*.57,mid,bottom,ink,2);p.rect(mid-11,bottom,size*.5,3,ink);
 }
}
function protectionCue(g:Game,p:Painter,x:number,yy:number,player:boolean){
 if(!player)return;
 if(g.run.shield){
  p.circle(x+19,yy-48,7,'rgba(198,221,182,0.75)');
  p.poly([[x+19,yy-53],[x+23,yy-51],[x+22,yy-46],[x+19,yy-43],[x+16,yy-46],[x+15,yy-51]],'#426b5a');
 }else if(g.run.invincible>0){
  p.circle(x+19,yy-48,7,g.protectionPulse>0?'rgba(247,218,159,0.82)':'rgba(176,216,208,0.75)');
  p.poly([[x+15,yy-49],[x+17,yy-51],[x+19,yy-49],[x+21,yy-51],[x+23,yy-49],[x+23,yy-47],[x+19,yy-43],[x+15,yy-47]],'#476f69');
 }
}
function lamp(p:Painter,x:number,y:number,on:boolean,color=GOLD){
 if(on){p.circle(x,y,11,'rgba(234,207,128,0.09)');p.circle(x,y,6,'rgba(241,219,155,0.16)');}
 p.rect(x-4,y-4,8,2,INK);p.rect(x-3,y-2,6,6,on?color:'#c5cbbf');p.rect(x-4,y+4,8,2,INK);
}
function door(p:Painter,x:number,y:number,w:number,h:number,on:boolean,color:string){
 p.rect(x+3,y+3,w,h,'#bcc4b8');p.rect(x,y,w,h,on?'#798e7c':'#c6cec0');
 p.rect(x+3,y+3,w-6,h-3,on?'#3d574b':'#dce0d4');
 if(on){p.rect(x+5,y+5,w-10,h-5,'#233e35');p.rect(x+w-7,y+5,3,h-5,color);p.rect(x+6,y+8,w-17,h-11,'#496252');p.rect(x+w-12,y+h*.57,2,3,color);}
 else{outline(p,x+5,y+5,w-10,h-8,'#b9c4b7');
  p.rect(x+8,y+9,w-16,28,'#d3dace');outline(p,x+8,y+9,w-16,28,'#b4c1af');
  p.rect(x+8,y+44,w-16,h-56,'#d6dccf');outline(p,x+8,y+44,w-16,h-56,'#b9c4b3');
  p.rect(x+w-12,y+h*.57,3,8,'#b7b099');p.rect(x+w-15,y+h*.57+3,5,2,'#a4aa92');
 }
 p.rect(x+1,y+1,w-2,1,'#e6e5cf');p.rect(x+1,y+1,1,h-1,'#d5ddc9');
 for(const offset of [24,h-27]){p.rect(x+3,y+offset,2,7,on?'#8f9d7e':'#adb7a5');}
 p.rect(x-1,y+h,w+2,2,'rgba(56,72,57,0.24)');
}
const poseHistory=new WeakMap<Game,{run:object;phase:string;segment:number;branch:string;y:number;time:number;phaseTime:number;diving:boolean;landedAt:number;landedWorld:number;diveLand:boolean}>();
const artPoseHistory=new WeakMap<Game,{pose:CharacterAnimation;started:number}>();
const runGaitHistory=new WeakMap<Game,{run:object;phase:string;segment:number;branch:string;world:number;time:number;distance:number}>();
const LANDING_DURATION=CHARACTER_ANIMATIONS.land.frames/CHARACTER_ANIMATIONS.land.fps;
// A moving road cannot slide a full stride under a stationary landing pose.
const LANDING_TRAVEL=4.8;
function sceneImage(p:Painter,name:string,x=0,y=0,w=480,h=270){
 return p.image(`scene.pixel.${name}`,x,y,w,h)||
  (name==='corridor'&&p.image('scene.pixel.corridor.legacy',x,y,w,h))||p.image(`scene.${name}`,x,y,w,h);
}
function scrollSceneImage(p:Painter,name:string,scroll:number){
 const count=(SCENE_SCROLL_CHUNK_COUNTS as Record<string,number>)[name]||0;
 if(!count)return false;
 const totalWidth=SCENE_SCROLL_TILE_WIDTH+(count-1)*SCENE_SCROLL_TILE_STRIDE;
 const maxCamera=Math.max(0,totalWidth-480);
 const camera=Math.max(0,Math.min(maxCamera,scroll<0?maxCamera+scroll:scroll));
 const first=Math.floor(camera/SCENE_SCROLL_TILE_STRIDE);
 let supplied=true,visible=0;
 for(let tile=first;tile<Math.min(count,first+2);tile++){
  const frame=String(tile).padStart(2,'0');
  const x=tile*SCENE_SCROLL_TILE_STRIDE-camera;
  const onScreen=x<480&&x+SCENE_SCROLL_TILE_WIDTH>0;
  const shown=p.image(`scene.scroll.${name}.${frame}`,x,0,SCENE_SCROLL_TILE_WIDTH,270,onScreen?1:0);
  if(onScreen){visible++;supplied=shown&&supplied;}
 }
 return supplied&&visible>0;
}
const CHOICE_SCENE_WIDTH=1280;
/** Choice plates carry the corridor or street that the previous run leads into. */
function choiceScene(g:Game,p:Painter){
 const ph=g.phase;
 if(ph!=='choice'&&ph!=='seat'&&ph!=='piano'&&ph!=='alleyExit')return false;
 const id=ph==='piano'?4:ph==='alleyExit'?'alley':g.choice;
 const frame=typeof id==='number'?String(id).padStart(2,'0'):id;
 const at=ph==='seat'?g.chairFreezeTime:ph==='piano'?0:g.phaseTime;
 const offset=Math.min(CHOICE_SCENE_WIDTH-480,Math.max(0,at*RUN_SPEED));
 const key=`scene.choice.${frame}`;
 // A short dissolve shows the player passing through a gate or doorway before
 // the authored choice space becomes the running surface.
 const blend=id===4?1:Math.min(1,Math.max(0,at/.65));
 const oldTheme=ph==='alleyExit'?'alley':id===2?'rain':id===6?(g.reward||'heaven'):
  id===3?'noon':id===5?'dusk':'dawn';
 const ready=p.image(key,-offset,0,CHOICE_SCENE_WIDTH,270,0);
 let oldSupplied=false;
 if(blend<1||!ready){
  const oldScroll=(id===6?60:g.time)*RUN_SPEED+at*RUN_SPEED;
  oldSupplied=scrollSceneImage(p,oldTheme,oldScroll)||sceneImage(p,oldTheme);
  drawSceneGround(p,oldTheme,oldScroll);
 }
 if(!ready)return oldSupplied;
 return p.image(key,-offset,0,CHOICE_SCENE_WIDTH,270,oldSupplied?blend:1)||oldSupplied;
}
const ACHIEVEMENT_ART:Record<string,string>={
 noHit:'full_exam',collector:'fragment_jar',perfectScore:'red_pen',sharpEyes:'piano_scratch',
 threeSeats:'little_stool',umbrellaKeeper:'umbrella',floated:'cloud',bigDesk:'giant_pencil',
 lookBack:'old_photo',heldUp:'beam',emptyPockets:'empty_pocket',noJump:'worn_trousers',
 lampKeeper:'fifth_lamp',secondGrade:'mini_door',runaway:'brick',wall:'wall_grass',
};
function obstacleArtId(label:string):string|undefined{
 const matches:[RegExp,string][]=[
  [/自行车/,'bicycle'],[/车门/,'cardoor'],[/足球/,'football'],[/皮球|旧球|球/,'ball'],
  [/拖把桶/,'mopbucket'],[/晾伞|雨棚|伞架/,'umbrella_rib'],[/跨栏|跳绳/,'hurdle'],
  [/书包/,'satchel'],[/作业本|练习册|字典|书堆|旧箱|纸箱/,'stackbooks'],
  [/台阶|门槛/,'step'],[/茶杯|托盘|茶盘/,'teacup'],[/横梁|横杆|横架|横档|横栏|栏杆/,'pole'],
  [/墙|软垫/,'wall'],
 ];
 return matches.find(([pattern])=>pattern.test(label))?.[1];
}
/** Draw each occupied source cell once, either still attached or on its fall path. */
function corridorActorImage(g:Game,p:Painter,key:string,x:number,ground:number){
 const frameKey=key;
 // Probe the frame resource, then paint only occupied source cells. Once a
 // cell detaches, drawing the full canvas would fill the hole again.
 if(!p.imageRegion||!p.image(frameKey,0,0,1,1,0))return false;
 for(const fragment of g.corridorFragments){
  if(fragment.alpha<=0||!fragment.hasPixels||fragment.height<=0)continue;
  const sourceKey=fragment.detached ? fragment.sourceKey : frameKey;
  if(!sourceKey||!p.image(sourceKey,0,0,1,1,0))continue;
  p.imageRegion(sourceKey,fragment.sourceX/48,fragment.sourceY/48,fragment.size/48,fragment.height/48,
   fragment.x,fragment.y,
   fragment.size,fragment.height,fragment.detached?fragment.alpha:1);
 }
 return true;
}
function corridorActorFallback(g:Game,p:Painter,x:number,ground:number,pose:CharacterAnimation,frame:number){
 const baseX=x-XIAOMAN_MOTION.anchorX,baseY=ground-corridorPoseBottom(pose as 'idle'|'runStart'|'run',frame);
 for(const fragment of g.corridorFragments){
  if(fragment.alpha<=0||!fragment.hasPixels||fragment.height<=0)continue;
  const left=baseX+fragment.sourceX,top=baseY+fragment.sourceY;
  const dx=fragment.x-left,dy=fragment.y-top;
  const clipped:Painter={...p,rect(rx,ry,w,h,color){
   const x0=Math.max(left,rx),y0=Math.max(top,ry),x1=Math.min(left+fragment.size,rx+w),y1=Math.min(top+fragment.height,ry+h);
   if(x1>x0&&y1>y0)p.rect(x0+dx,y0+dy,x1-x0,y1-y0,fadePixel(color,fragment.detached?fragment.alpha:1));
  }};
  drawXiaomanFallback(clipped,fragment.detached?fragment.sourcePose:pose,
   fragment.detached?fragment.sourceFrame:frame,x,ground);
 }
}
function character(g:Game,p:Painter,x=96,ground=216,scale=1,blank=false,override:any=null){
 if(scale!==1){const q=p,ay=ground-g.y,sx=(v:number)=>x+(v-x)*scale,sy=(v:number)=>ay+(v-ay)*scale;p={rect:(a,b,w,h,c)=>q.rect(sx(a),sy(b),w*scale,h*scale,c),line:(a,b,c,d,e,w=1)=>q.line(sx(a),sy(b),sx(c),sy(d),e,w*scale),circle:(a,b,r,c)=>q.circle(sx(a),sy(b),r*scale,c),poly:(points,c)=>q.poly(points.map(v=>[sx(v[0]),sy(v[1])]),c),text:(v,a,b,z,c,align)=>q.text(v,sx(a),sy(b),z*scale,c,align),image:(k,a,b,w,h,opacity)=>q.image(k,sx(a),sy(b),w*scale,h*scale,opacity)};}
 const s=override?.stats||g.run.stats;const wet=override?.wet??g.run.wet;
 const t=g.sceneTime,transition=g.phase==='corridorTransition',transitionClock=transition?g.corridorTransitionTime:g.phaseTime;
 const player=!blank&&!override&&((x===96&&ground===216&&g.screen==='play')||transition);
 const canonicalPreview=!blank&&!override&&g.screen==='hall';
 const gaitWorld=transition?g.corridorActorX()-g.corridorDoorX:Math.abs(sceneTravel(g));
 const onTable=player&&g.phase==='reward'&&g.used.has('onTable')&&Math.abs(g.y-65)<1;
  const seated=player&&(g.phase==='seat'||g.benchSitRemaining>0);
 const onChair=player&&g.phase==='choice'&&g.choice===2&&Math.abs(g.y-CHAIR_HEIGHT)<.1;
 const grounded=g.y<=1||onTable||onChair||seated;
 let history=poseHistory.get(g);
 if(player&&!g.paused){
  if(!history||history.run!==g.run||history.phase!==g.phase||history.segment!==g.segment||history.branch!==g.branch||t<history.time||g.phaseTime<history.phaseTime)
   history={run:g.run,phase:g.phase,segment:g.segment,branch:g.branch,y:g.y,time:t,phaseTime:g.phaseTime,diving:g.diving,landedAt:-10,landedWorld:gaitWorld,diveLand:false};
  else if(grounded&&history.y>g.y+1){history.landedAt=t;history.landedWorld=gaitWorld;history.diveLand=history.diving;}
  history.y=g.y;history.time=t;history.phaseTime=g.phaseTime;history.diving=g.diving;poseHistory.set(g,history);
 }
 const landingTravel=history?Math.max(0,gaitWorld-history.landedWorld):0;
 const landing=player&&grounded&&!!history&&t-history.landedAt<LANDING_DURATION&&landingTravel<LANDING_TRAVEL-1e-8;
 // A hit flash must not turn a still-sliding physical body into a standing sprite.
 const hurt=player&&g.hurtPulse>.02&&g.slide<=0&&g.slideRecovery<=0;
 const slide=player&&grounded&&g.slide>0&&!hurt;
 const recovering=player&&grounded&&g.slide<=0&&g.slideRecovery>0&&!hurt;
 const dive=player&&!grounded&&g.diving;
 const airborne=player&&!grounded&&!dive;
 const second=airborne&&g.jumps>=2;
 const running=player&&grounded&&!slide&&!recovering&&!landing&&!hurt&&!seated&&
  (transition||g.phase==='run'||g.phase==='choice'||g.phase==='alleyExit'||g.phase==='hell'||g.phase==='reward'||g.phase==='reverse')&&
  (!transition||transitionClock<g.corridorWalkDuration);
 // Sprite canvas registration owns the foot anchor; do not add a second bob on top of authored poses.
 // y is the seat's elevation during seated states, not the sole's elevation.
 // The source sit rig registers its hip 16 px above the standing foot baseline.
 const yy=seated?ground-g.y+16:ground-g.y;
 if(blank&&p.image('character.pixel.idle.00',x-24,yy-44,48,48,.52))return;
 const climbTarget=player?g.interactionTarget():null;
 const climbing=airborne&&g.phase==='alleyExit'&&climbTarget?.kind==='wall'&&Math.abs(climbTarget.x-x)<20&&g.y>12;
 const breaking=player&&(g.lastAction==='break'&&g.actionTime>0||g.lastAction==='pianoSmash'&&g.actionTime>.7);
 const corridorFrame=transition?g.corridorActorFrame():null;
 const pose:CharacterAnimation=transition?corridorFrame!.pose:canonicalPreview?'idle':seated?'sit':hurt?'hurt':slide?'slide':recovering?'slideRecovery':breaking?'break':climbing?'climb':dive?'dive':airborne?(second?'doubleJump':'jump'):landing?'land':running?'run':'idle';
 let artPose=artPoseHistory.get(g);
 if(player&&(!artPose||artPose.pose!==pose||t<artPose.started)){
  artPose={pose,started:t};artPoseHistory.set(g,artPose);
 }
 // Use the same world coordinate that scrolls scenery/obstacles, rather than wall time.
 // Keeping distance while paused prevents drift; rewind/new route starts a new entry.
 let gait=runGaitHistory.get(g);
 if(player&&!g.paused){
  const reset=!gait||gait.run!==g.run||gait.phase!==g.phase||gait.segment!==g.segment||gait.branch!==g.branch||t<gait.time||gaitWorld<gait.world;
  if(reset)gait={run:g.run,phase:g.phase,segment:g.segment,branch:g.branch,world:gaitWorld,time:t,distance:0};
  if(gait){
   // The world keeps moving while the actor jumps, slides or lands. Retain
   // that travel so the feet resume the running cycle instead of starting
   // from a second motionless entrance pose after every interruption.
   gait.distance+=Math.max(0,gaitWorld-gait.world);
   gait.world=gaitWorld;gait.time=t;runGaitHistory.set(g,gait);
  }
 }
 let visiblePose:CharacterAnimation=pose;
 let elapsed=player&&artPose?Math.max(0,t-artPose.started):canonicalPreview?g.clock:0;
 if(transition&&transitionClock>=2.2)elapsed=0;
 if(slide)elapsed=Math.max(0,XIAOMAN_MOTION.slideSeconds-g.slide);
 else if(recovering)elapsed=Math.max(0,XIAOMAN_MOTION.slideRecoverySeconds-g.slideRecovery);
 else if(breaking)elapsed=Math.max(0,(g.lastAction==='pianoSmash'?1.1:.4)-g.actionTime);
 else if(landing)elapsed=Math.max(elapsed,LANDING_DURATION*landingTravel/LANDING_TRAVEL);
 const runEntrySeconds=CHARACTER_ANIMATIONS.runStart.frames/CHARACTER_ANIMATIONS.runStart.fps;
 const runEntryTravel=runEntrySeconds*XIAOMAN_MOTION.runSpeed*scale;
 const runDistance=running&&gait?gait.distance:0;
 if(!transition&&running&&runDistance<runEntryTravel-1e-8){visiblePose='runStart';elapsed=runEntrySeconds*runDistance/runEntryTravel;}
 const spec=CHARACTER_ANIMATIONS[visiblePose];
 const loop=(['idle','run','sit','climb','sleep','celebrate'] as readonly string[]).includes(visiblePose);
 const frame=transition?corridorFrame!.frame:visiblePose==='run'?Math.floor((.5+Math.max(0,runDistance-runEntryTravel)/(XIAOMAN_GAIT.cycleTravel*scale))*spec.frames+1e-8)%spec.frames:
  loop?Math.floor(elapsed*spec.fps)%spec.frames:Math.min(spec.frames-1,Math.floor(elapsed*spec.fps));
 const frameName=String(frame).padStart(2,'0');
 // Every action uses the same 48 px source canvas, fixed head and bone lengths.
 // Low posture comes from joint rotation; changing the image size is forbidden.
 const actorImage=(key:string)=>transition?corridorActorImage(g,p,key,x,yy):
  p.image(key,x-XIAOMAN_MOTION.anchorX,yy-XIAOMAN_MOTION.anchorY,XIAOMAN_MOTION.canvas,XIAOMAN_MOTION.canvas,blank ? .52 : 1);
 const outfit=g.profile.equippedSlots?.skin||g.profile.equipped;
 const skinId=CHARACTER_SKINS.find(id=>id===outfit);
 let variant='';let strongest=19;
 for(const stat of ['personality','relationship','will','appearance'] as const){
  const distance=Math.abs(s[stat]-50);
  if(distance>strongest){strongest=distance;variant=CHARACTER_VARIANTS[stat][s[stat]<50?'low':'high'];}
 }
 // All primary, skin, stat and compatibility frames are generated from one rig.
 let artLoaded=false;
 {
  let hdLoaded=false;
  const pixelPrefix=`character.pixel.${visiblePose}`;
  const canonicalSources:string[]=[];
  if(variant&&(visiblePose==='idle'||visiblePose==='run'))canonicalSources.push(skinId?
    `character.pixel.skin.${skinId}.variant.${variant}.${visiblePose}`:`character.pixel.variant.${variant}.${visiblePose}`);
  if(skinId)canonicalSources.push(`character.pixel.skin.${skinId}.${visiblePose}`);
  canonicalSources.push(pixelPrefix);
  let canonicalPixelLoaded=false;
  for(const source of canonicalSources){
    if(actorImage(`${source}.${frameName}`)){canonicalPixelLoaded=true;break;}
    // Retain the closest loaded key instead of flashing back to the first pose.
    for(let fallback=frame-1;fallback>=0;fallback--){
      if(actorImage(`${source}.${String(fallback).padStart(2,'0')}`)){canonicalPixelLoaded=true;break;}
    }
    if(canonicalPixelLoaded)break;
  }
  artLoaded=canonicalPixelLoaded;
  if(!canonicalPixelLoaded){
  const sources:{prefix:string;staticIdle:boolean}[]=[];
  if(variant&&(visiblePose==='idle'||visiblePose==='run'))sources.push({prefix:skinId?
   `character.skin.${skinId}.variant.${variant}.${visiblePose}`:`character.variant.${variant}.${visiblePose}`,staticIdle:visiblePose==='idle'});
  if(skinId)sources.push({prefix:`character.skin.${skinId}.${visiblePose}`,staticIdle:false});
  if(skinId||variant){
   for(const source of sources){
    const name=source.staticIdle?'00':frameName;
    artLoaded=actorImage(`${source.prefix}.${name}`)||
     (name!=='00'&&actorImage(`${source.prefix}.00`));
    if(artLoaded)break;
   }
  }
  const pixelLoaded=artLoaded||actorImage(`${pixelPrefix}.${frameName}`)||
   (frame>0&&actorImage(`${pixelPrefix}.00`));
  if(!pixelLoaded){
   const hdPrefix=`character.hd.${visiblePose}`;
   hdLoaded=actorImage(`${hdPrefix}.${frameName}`)||
    (frame>0&&actorImage(`${hdPrefix}.00`));
  }
  artLoaded=pixelLoaded||hdLoaded;
  if(!artLoaded){
   sources.push({prefix:`character.${visiblePose}`,staticIdle:false});
  }
  for(const source of sources){
   if(artLoaded)break;
   const name=source.staticIdle?'00':frameName;
   artLoaded=actorImage(`${source.prefix}.${name}`)||
    (name!=='00'&&actorImage(`${source.prefix}.00`));
   if(artLoaded)break;
  }
  }
  if(player&&!canonicalPixelLoaded&&artLoaded&&!hdLoaded&&wet>0){
   const level=CHARACTER_WET_LEVELS.reduce((best,candidate)=>
    Math.abs(candidate-wet)<Math.abs(best-wet)?candidate:best);
   if(level>0){const prefix=`character.wet.${level}.${pose}`;
    actorImage(`${prefix}.${frameName}`)||
     (frame>0&&actorImage(`${prefix}.00`));}
  }
 }
 const skin='#ddb58b';
 if(!artLoaded){
 if(transition&&g.corridorFragments.some(fragment=>fragment.detached))corridorActorFallback(g,p,x,yy,visiblePose,frame);
  else drawXiaomanFallback(p,visiblePose,frame,x,yy);
 }
 if(wet>0&&!transition){
  const a=xiaomanFrameAnchors(visiblePose,frame);
  const lean=Math.asin(Math.max(-1,Math.min(1,(a[2]-a[4]-.7)/15.4)));
  const fabric=(u:number,v:number):[number,number]=>[x-24+a[4]+u*Math.cos(lean)-v*Math.sin(lean),yy-44+a[5]+u*Math.sin(lean)+v*Math.cos(lean)];
  const tint='rgba(57,91,107,'+(.38*Math.min(1,wet/100)).toFixed(3)+')';
  for(const [u,v] of [[-1,-3],[1,-2]])p.poly([fabric(u-.6,v-1),fabric(u+.6,v-1),fabric(u+.6,v+.8),fabric(u-.6,v+.8)],tint);
 }
 const items=override?.items||g.run.items;
 if(!transition&&g.theme==='rain'&&items.includes('umbrella')&&!slide&&!recovering&&!dive){
  const anchor=xiaomanFrameAnchors(visiblePose,frame),handX=x-24+anchor[0],handY=yy-44+anchor[1];
  const canopyY=Math.min(yy-43,handY-27);
  p.line(handX,canopyY,handX,handY+1,'#8c896e',1);
  p.poly([[handX-20,canopyY],[handX-14,canopyY-8],[handX,canopyY-13],[handX+14,canopyY-8],[handX+20,canopyY]],'#c29e63');
  p.line(handX-20,canopyY,handX+20,canopyY,'#7c7659');
 }
 const charm=g.profile.equippedSlots?.charm; if(!transition&&charm&&!slide){p.line(x-8,yy-11,x-11,yy-5,GOLD);p.poly([[x-11,yy-5],[x-8,yy-2],[x-11,yy+1],[x-14,yy-2]],charm==='charm-plane'?'#e9e3cf':GOLD);}
 if(!transition&&g.glide>0&&!g.settings.reducedMotion){p.poly([[x-19,yy-14],[x+22,yy-18],[x+5,yy-5]],'#f4ecd7');}
 if(!transition)protectionCue(g,p,x,yy,player);
 if(g.actionTime>0&&g.lastAction==='pianoClose')p.line(x+7,yy-22,x+18,yy-23,skin,3);
}
function paintedHall(g:Game,p:Painter,transitioning=false){
 if(!transitioning){
 p.rect(0,0,480,43,'#f0eedf');
 p.rect(0,41,480,1,'#8c9b82');p.rect(0,42,480,1,'#d9c797');
 const logoLoaded=p.image('ui.logo',11,1,66,26);
 if(!logoLoaded)text(p,'浮生',16,4,23,INK);
 text(p,'第一章 · 学堂',16,29,8,'#536e5d');
 text(p,'小满 · 将满未满',236,29,8,'#65796a','center');
 p.rect(318,7,63,24,'#e7e9d8');p.rect(384,7,54,24,'#e7e9d8');
 p.rect(382,11,1,16,'#b8c2ad');
 p.image('ui.icon.fragment.normal',321,11,14,14);
 text(p,'碎片',377,9,6,MUTED,'right');
 text(p,compactCount(g.profile.fragments),377,18,8,INK,'right');
 p.image('ui.icon.wrapper.normal',387,11,14,14);
 text(p,'糖纸',435,9,6,MUTED,'right');
 text(p,compactCount(g.profile.wrappers),435,18,8,INK,'right');
 button(g,p,441,6,29,22,'退出',()=>{g.paused=true;g.exitConfirm=true;g.cancelInput();},false,false,'ui.icon.exit.normal');
 text(p,g.model.allLit()?'灯都亮了。墙后的路，仍然在。':
  '走过的路，会在这里留下一盏灯。',240,59,9,'#536e5d','center');
 }

 const start={x:18,y:101,w:44,h:GROUND_Y-101};
 door(p,start.x,start.y,start.w,start.h,true,'#d9bd77');
 if(transitioning||!p.image('ui.icon.lamp_morning.normal',start.x+15,87,14,14))
  lamp(p,start.x+start.w/2,94,true,'#e7cf91');
 if(!transitioning){
  p.image('ui.icon.play.normal',start.x+15,start.y+37,14,14);
  p.rect(start.x-1,196,start.w+2,20,'rgba(238,235,218,0.92)');
  p.rect(start.x-1,196,start.w+2,2,'#cfac68');
  text(p,g.checkpointState.available?'继续':'出发',start.x+start.w/2,200,9,INK,'center');
  text(p,g.checkpointState.available?'从存档点':'第一章',start.x+start.w/2,210,7,'#536e5d','center');
 }
 if(!transitioning)g.button(start.x-4,96,start.w+8,143,g.checkpointState.available?'继续存档':'出发',()=>g.checkpointState.available?g.continueCheckpoint():g.start());

 const doors=[
  {id:'morning',x:86,color:'#e0bd70'},
  {id:'backrow',x:160,color:'#86a097'},
  {id:'outside',x:234,color:'#bb7661'},
  {id:'desk',x:308,color:'#bc9077'},
 ] as const;
 for(const item of doors){
  const ending=(ENDINGS as any)[item.id];
  const on=g.profile.lights.includes(item.id);
  const cx=item.x+24;
  door(p,item.x,101,48,GROUND_Y-101,on,item.color);
  const lampIcon=`ui.icon.lamp_${item.id}.`+(on?'active':'normal');
  if(on)p.circle(cx,94,12,'rgba(245,219,157,0.12)');
  if(transitioning||!p.image(lampIcon,cx-7,87,14,14))lamp(p,cx,94,on,item.color);
  if(!transitioning){
   p.rect(item.x-2,196,52,20,'rgba(238,235,218,0.88)');
   p.rect(item.x-2,196,52,2,on?item.color:'#aeb9ab');
   text(p,short(ending.name,6),cx,200,8,on?INK:'#586b5e','center');
   text(p,on?'已点亮':'未点亮',cx,210,7,on?'#805d3d':'#586b5e','center');
  }
  if(on&&!transitioning)g.button(item.x-5,96,58,143,ending.name,()=>g.startEnding(item.id,true));
 }

 const hiddenOpen=g.model.allLit();
 const hidden={x:390,y:101,w:48,h:GROUND_Y-101};
 if(hiddenOpen)door(p,hidden.x,hidden.y,hidden.w,hidden.h,true,'#94a58a');
 else{
  p.rect(hidden.x,hidden.y,hidden.w,hidden.h,'#839187');
  outline(p,hidden.x,hidden.y,hidden.w,hidden.h,'#63766b',2);
  p.line(hidden.x+23,hidden.y+10,hidden.x+20,hidden.y+46,'#d1c59f',1);
  p.line(hidden.x+20,hidden.y+46,hidden.x+26,hidden.y+73,'#d1c59f',1);
  p.line(hidden.x+26,hidden.y+73,hidden.x+21,GROUND_Y-1,'#d1c59f',1);
 }
 if(hiddenOpen)lamp(p,hidden.x+24,94,true,'#e8d393');
 if(!transitioning){
  p.rect(388,196,52,20,'rgba(238,235,218,0.88)');
  p.rect(388,196,52,2,hiddenOpen?'#bca06d':'#8e7771');
  text(p,short(ENDINGS.secondGrade.name,6),414,200,8,hiddenOpen?INK:'#586b5e','center');
  text(p,hiddenOpen?'隐藏结局':'四灯后开放',414,210,7,hiddenOpen?'#805d3d':'#586b5e','center');
 }
 if(hiddenOpen&&!transitioning)g.button(hidden.x-5,96,58,143,'墙后',
  ()=>g.startEnding('secondGrade',g.profile.achievements.includes('secondGrade')));

 const nav:[string,string,string][]=[['成就墙','achievements','achievement'],['记忆册','memoryBook','book'],
  ['小卖部','shop','shop'],['换装','wardrobe','wardrobe'],['章节','chapters','chapter'],['设置','settings','settings']];
 if(!transitioning&&!g.panel)nav.forEach(([label,id,icon],i)=>button(g,p,8+i*78,242,72,24,label,
  ()=>{g.panel=id;g.panelPage=0;},false,false,`ui.icon.${icon}.normal`));
 if(!transitioning&&g.returnAnimation>0)text(p,'散掉的是一生，留下的是灯。',240,78,8,INK,'center');
}
function corridorBackdrop(p:Painter){
 const supplied=sceneImage(p,'corridor');
 if(!supplied){
  p.rect(0,0,480,270,'#e9e9dd');
  p.rect(0,43,480,173,'#dce2d5');
  p.rect(0,216,480,54,'#c9d1c2');
  for(let x=0;x<=480;x+=32)p.line(x,216,x,270,'#bdc8b9',1);
  p.line(0,216,480,216,'#adbcac');
 }
}
function hall(g:Game,p:Painter){
 corridorBackdrop(p);
 paintedHall(g,p);
}
function corridorTransition(g:Game,p:Painter){
 corridorBackdrop(p);
 paintedHall(g,p,true);
 const t=g.corridorTransitionTime;
 const doorX=g.corridorDoorX-24,close=Math.min(1,Math.max(0,(t-1.6)/.6));
 // The exit occupies the same doorway that will remain in the hall. Its
 // sliding leaf closes behind Xiaoman rather than creating a temporary door.
 if(close<1){
  p.rect(doorX+6,109,34*(1-close),GROUND_Y-109,'#233e35');
  p.rect(doorX+6+34*(1-close),109,2,GROUND_Y-109,'#d9bd77');
 }
 const x=g.corridorActorX(t);
 for(const fragment of g.corridorFragments){
  if(!fragment.detached||fragment.alpha<=0)continue;
  const shadowAlpha=fragment.landed ? .18*fragment.alpha : 0;
  if(shadowAlpha>0)p.rect(fragment.x-1,214,fragment.size+2,1,`rgba(51,73,65,${shadowAlpha.toFixed(3)})`);
 }
 if(g.corridorFragments.some(fragment=>fragment.alpha>0))character(g,p,x,216,1,false);
 const attached=g.corridorFragments.filter(fragment=>!fragment.detached).length;
 if(attached>0)p.rect(x-5,216,12,1,`rgba(51,73,65,${(.2*attached/g.corridorFragments.length).toFixed(3)})`);
 text(p,'掉在地上的，是刚走过的一生。',240,232,8,'#62786a','center');
 if(t>=6.8)text(p,'此刻，你在回廊。',240,59,9,INK,'center');
 button(g,p,433,6,39,22,'暂停',()=>g.back());
}
function fadePixel(hex:string,alpha:number){
 const value=hex.replace('#','');
 const r=parseInt(value.slice(0,2),16)||0,g=parseInt(value.slice(2,4),16)||0,b=parseInt(value.slice(4,6),16)||0;
 return `rgba(${r},${g},${b},${Math.max(0,Math.min(1,alpha)).toFixed(3)})`;
}
function sceneDetails(g:Game,p:Painter,scroll:number){
 const drift=(i:number,gap:number,speed:number,span:number)=>((i*gap-scroll*speed)%span+span)%span-gap;
 const theme=g.branch||g.theme;
 if(theme==='dawn'){
  for(let i=0;i<5;i++){const x=drift(i,129,.43,645);p.rect(x,137,69,79,'#a8b49a');p.poly([[x-5,139],[x+35,113],[x+74,139]],'#788d78');p.rect(x+29,167,18,49,'#6e826d');p.rect(x+5,151,13,15,'#dfe3c8');}
  for(let i=0;i<9;i++){const x=drift(i,61,.76,549);p.rect(x,208,24,2,'#e5dfc0');}
 }else if(theme==='rain'){
  for(let i=0;i<7;i++){const x=drift(i,86,.37,602);p.rect(x,117,68,82,'#8aa6a1');p.rect(x-3,114,74,5,'#526f70');p.rect(x+13,136,35,40,'#c2d2c9');p.line(x+6,190,x+61,190,'#e5e8da');}
  for(let i=0;i<9;i++){const x=drift(i,66,.82,594);p.line(x,215,x+18,215,'rgba(218,234,224,0.46)');}
 }else if(theme==='noon'){
  for(let i=0;i<5;i++){const x=drift(i,126,.3,630);p.rect(x,64,101,134,'#c8ab79');p.rect(x+6,70,89,91,'#f2dfad');p.line(x+50,70,x+50,161,'#a68c63');p.line(x+6,113,x+95,113,'#a68c63');p.poly([[x+9,163],[x+92,163],[x+151,216],[x+59,216]],'rgba(255,239,188,0.22)');}
  for(let i=0;i<4;i++){const x=drift(i,154,.7,616);p.rect(x,193,89,5,'#9b8769');p.rect(x+9,198,4,18,'#806f5d');p.rect(x+75,198,4,18,'#806f5d');}
 }else if(theme==='gray'){
  p.rect(0,54,480,143,'rgba(181,194,182,0.58)');
  for(let i=0;i<6;i++){const x=drift(i,105,.35,630);p.rect(x,73,76,91,'#6e8980');p.rect(x+5,78,66,77,'#becdc1');p.rect(x+14,88,48,44,'#e2e2d0');p.rect(x+20,95,36,2,'#9aa89e');p.rect(x+20,104,27,2,'#9aa89e');}
  p.rect(0,207,480,3,'#d0bb75');
 }else if(theme==='dusk'){
  for(let i=0;i<6;i++){const x=drift(i,111,.3,666);p.rect(x,76,80,98,'#aa8b7e');p.rect(x+7,84,66,76,'#edc5a0');p.rect(x+27,92,36,50,'#8b756e');p.rect(x+10,176,72,3,'#e1b494');}
  for(let i=0;i<4;i++){const x=drift(i,166,.77,664);p.rect(x,197,86,5,'#705c58');p.rect(x+8,202,5,14,'#705c58');p.rect(x+74,202,5,14,'#705c58');}
 }else if(theme==='night'){
  for(let i=0;i<7;i++){const x=drift(i,94,.28,658);p.rect(x,68,70,105,'#1d3547');p.rect(x+5,73,60,75,'#3e5b69');p.rect(x+12,83,18,27,'#263d51');p.rect(x+39,83,18,27,'#263d51');p.circle(x+35,126,5,'rgba(248,216,148,0.22)');}
  for(let i=0;i<5;i++){const x=drift(i,136,.83,680);p.rect(x,187,51,29,'#645848');p.rect(x+5,171,40,19,'#d8c292');p.rect(x+21,160,8,12,'#a48459');p.circle(x+25,158,8,'rgba(248,216,148,0.23)');}
 }else if(theme==='graduate'){
  const morning=Math.min(1,g.sceneTime/24);p.rect(0,38,480,129,`rgba(245,224,179,${(morning*.25).toFixed(3)})`);
  for(let i=0;i<5;i++){const x=drift(i,136,.35,680);p.rect(x,106,94,110,'#628179');p.rect(x+5,107,84,67,'#a6b7a8');p.poly([[x,106],[x+47,75],[x+94,106]],'#45695f');p.rect(x+30,142,29,74,'#4d6c65');}
  for(let i=0;i<6;i++){const x=drift(i,113,.72,678);p.rect(x,211,44,2,'#e2d5aa');}
 }else if(theme==='alley'){
  for(let i=0;i<7;i++){const x=drift(i,91,.41,637);p.rect(x,56,78,160,'#77909a');p.rect(x+5,77,66,56,'#a6b7b5');p.rect(x+12,84,29,43,'#536d75');p.rect(x+48,153,20,39,'#58727b');}
 }else if(theme==='playground'){
  for(let i=0;i<5;i++){const x=drift(i,141,.24,705);p.rect(x,103,101,113,'#8c9f8e');p.rect(x+6,111,89,90,'#ced1b8');p.rect(x+20,143,13,20,'#82988a');p.rect(x+62,143,13,20,'#82988a');}
  p.rect(0,203,480,3,'#c8b37f');for(let i=0;i<9;i++)p.line(drift(i,58,.85,522),208,drift(i,58,.85,522)+24,208,'#e6d29f');
 }else if(theme==='dream'){
  for(let i=0;i<10;i++){const x=drift(i,77,.2,770),y=62+i%4*29;p.circle(x,y,15,'rgba(243,220,238,0.17)');p.rect(x-26,y+8,52,5,'rgba(247,234,225,0.18)');}
  if(g.phase==='reward'){
   const pulse=g.settings.reducedMotion?0:Math.sin(g.clock*.45)*2;
   p.rect(24,68,432,2,'rgba(245,226,243,0.14)');
   for(let i=0;i<5;i++){const x=34+i*104-((scroll*.06)%520),h=56+(i%3)*17;p.rect(x,157-h,44,h,'rgba(92,82,122,0.38)');p.rect(x+5,163-h,34,h-8,'rgba(190,169,203,0.17)');p.rect(x+15,166-h,12,14,'rgba(251,238,205,0.42)');p.rect(x+19,180-h,4,h-21,'rgba(251,238,205,0.26)');}
   for(let i=0;i<4;i++){const x=((i*151-scroll*.18)%620+620)%620-60,y=77+i%2*45+pulse;p.rect(x,y,53,3,'rgba(249,230,242,0.22)');p.rect(x+9,y-14,3,31,'rgba(249,230,242,0.22)');p.rect(x+43,y-10,3,25,'rgba(249,230,242,0.22)');}
   p.poly([[0,183],[92,174],[163,183],[224,173],[300,184],[388,175],[480,183],[480,216],[0,216]],'rgba(83,75,112,0.24)');
   for(let i=0;i<7;i++){const x=drift(i,79,.34,553);p.rect(x,208,36,3,'rgba(240,224,236,0.25)');if(i%2===0)p.line(x+5,211,x+11,216,'rgba(240,224,236,0.24)');}
   p.rect(0,214,480,2,'rgba(235,213,234,0.28)');
   drawDreamScenery(p,{phaseTime:g.phaseTime,clock:g.clock,reducedMotion:g.settings.reducedMotion,homework:dreamHomeworkMemory(g.run.events)});
  }
 }else if(theme==='heaven'){
  for(let i=0;i<7;i++){const x=drift(i,102,.37,714);p.poly([[x,216],[x+23,123],[x+48,216]],'rgba(255,251,224,0.45)');p.circle(x+24,128,7,'rgba(255,255,238,0.42)');}
 }else if(theme==='hell'){
  const act=g.phaseTime<8?0:g.phaseTime<20?1:2;
  const ridge=act===0?'#64404b':act===1?'#7f4540':'#806358';
  for(let i=0;i<8;i++){const x=drift(i,85,.7,680);p.poly([[x,216],[x+18,140+i%3*12],[x+42,216]],ridge);p.line(x+8,188,x+35,170,act===2?'#c28f65':'#aa5b47');}
  if(act===0){p.poly([[0,0],[108,0],[155,216],[0,216]],'rgba(31,26,43,0.27)');p.rect(326,82,59,134,'rgba(32,31,44,0.29)');}
  if(act===1){for(let i=0;i<5;i++){const x=drift(i,132,.28,660);p.rect(x,148,29,68,'rgba(234,129,80,0.13)');p.rect(x+6,125,17,22,'rgba(237,163,98,0.11)');}}
  if(act===2){p.poly([[395,50],[418,50],[480,216],[334,216]],'rgba(246,214,157,0.14)');p.circle(407,89,12,'rgba(251,231,173,0.33)');}
 }
}
/** Small background objects only appear when their earlier action happened. */
function storyEchoProps(g:Game,p:Painter){
 if(g.phase!=='run'||g.branch)return;
 const events=g.run.events,t=g.time;
 const xAt=(at:number)=>worldX(at,t);
 if(g.segment===2&&t>=20&&t<30&&events.includes('hat')){
  const x=xAt(23.625);
  if(x>-50&&x<530&&!p.image('props.micro.redhat.active',x-11,92,22,20)){
   p.line(x,82,x,112,'#5a746f');p.line(x-7,96,x+9,96,'#5a746f');
   p.rect(x-5,104,11,6,'#bb6855');p.rect(x-8,110,17,2,'#bb6855');
  }
 }
 if(g.segment===2&&t>=20&&t<29&&events.includes('umbrella')){
  const x=xAt(23);
  if(x>-50&&x<530&&!p.image('props.story.umbrella.active',x-15,137,31,47)){
   p.line(x,143,x,184,'#7d806f');
   p.poly([[x-15,148],[x-9,139],[x,137],[x+10,139],[x+16,148]],'#cba36b');
  }
 }
 if(g.segment===3&&t>=6&&t<17&&events.includes('bag')){
  const x=xAt(9.85);
  if(x>-50&&x<530&&!p.image('props.micro.wetbag.active',x-13,157,26,31)){
   p.rect(x-9,163,18,25,'#647d79');p.rect(x-6,162,12,3,'#a2b6ab');p.line(x,166,x,183,'#d4d9c5');
  }
 }
 if(g.segment===5&&t>=5&&t<16&&events.includes('plant')){
  const x=xAt(8.57);
  if(x>-50&&x<530&&!p.image('props.micro.plant.active',x-12,101,25,37)){
   p.rect(x-8,123,17,14,'#a68161');p.line(x,123,x,104,'#5b7b69');
   p.poly([[x,111],[x-15,104],[x-11,116]],'#74916d');p.poly([[x,109],[x+14,100],[x+11,114]],'#74916d');
  }
 }
 if(g.segment===7&&t>=7&&t<17&&events.includes('milk')){
  const x=xAt(10.61);
  if(x>-50&&x<530&&!p.image('props.micro.milk.active',x-11,125,22,24)){
   p.circle(x,136,11,'rgba(234,216,183,0.35)');p.circle(x,136,6,'rgba(119,92,70,0.16)');
  }
 }
 if(g.segment===5&&t>=4&&t<18){
  // Distant adults remain scenery and never enter collision checks.
  const left=xAt(9.43),right=xAt(10.51);
  if(left>-24&&left<504)p.image('props.obstacles.adultlegs.normal',left-9,145,18,63);
  if(right>-24&&right<504)p.image('props.obstacles.adultlegs.active',right-9,145,18,63);
 }
}
function memoryAnchorPreview(g:Game,p:Painter){
 if(g.phase!=='run'||g.branch||g.phaseTime>=12||!g.level?.memoryAnchor)return;
 const anchor=g.level.memoryAnchor;
 const icon=({homework:'book',milk:'cup',wish:'tag'} as Record<string,MemoryBookIcon>)[anchor.id]||anchor.id as MemoryBookIcon;
 const alpha=Math.max(0,Math.min(1,g.phaseTime/.6,(12-g.phaseTime)/1.5));
 if(alpha<=0)return;
 const ink='rgba(51,73,65,'+alpha.toFixed(3)+')',paper='rgba(240,225,187,'+alpha.toFixed(3)+')';
 p.rect(400,124,66,58,'rgba(241,234,206,'+(alpha*.76).toFixed(3)+')');
 outline(p,400,124,66,58,'rgba(144,159,139,'+(alpha*.62).toFixed(3)+')');
 const asset=MICRO_ANCHOR_ART[anchor.id as keyof typeof MICRO_ANCHOR_ART];
 const state=anchor.events.some((event:string)=>g.run.events.includes(event))?'active':'normal';
 if(!p.image(`props.micro.${asset}.${state}`,417,131,32,32,alpha))
  memoryIcon(p,414,129,38,icon,ink,paper);
 text(p,anchor.object,433,167,7,ink,'center');
}
function scenery(g:Game,p:Painter){
 p=visibleSceneryPainter(p);
 const pal=PAL[g.theme]||PAL.dawn;
 p.rect(0,0,480,270,pal[0]);
 if(g.phase==='run'&&g.time>=g.duration-3){
  const next=g.branch==='alley'?'alley':!g.branch&&g.segment<7?String(g.segment).padStart(2,'0'):'';
  if(next)p.image(`scene.choice.${next}`,490,0,1,1,0);
 }
 if(g.phase==='reward'&&g.phaseTime>=57)p.image('scene.choice.06',490,0,1,1,0);
 if(choiceScene(g,p))return;
 const sceneName=(g.phase==='choice'||g.phase==='seat')&&g.choice===2?'noon':g.branch||g.theme;
 const scroll=g.settings.reducedMotion?0:sceneTravel(g);
 const supplied=scrollSceneImage(p,sceneName,scroll)||sceneImage(p,sceneName);
 if(supplied){
   drawSceneGround(p,sceneName,scroll);
   // Generated panels carry the setting; only run-specific weather and memories stay live.
   if(g.theme==='dream')sceneDetails(g,p,scroll);
   storyEchoProps(g,p);
   if(g.branch==='alley'){
    const catX=worldX(12,g.time);
    if(catX>-30&&catX<510)p.image('props.micro.cat.normal',catX-12,171,24,24);
   }
   if(g.theme==='rain')drawRainWeather(p,g.clock,g.settings.reducedMotion);
   return;
 }
 const indoor=['gray','dusk','night'].includes(g.theme)||(g.phase==='choice'||g.phase==='seat')&&g.choice>=2||g.phase==='piano';
 if(g.theme==='dream'||g.theme==='heaven'){
   p.circle(383,60,35,'rgba(255,245,211,0.32)');
   for(let i=0;i<8;i++){const x=((i*93-scroll*.12)%650+650)%650-90,y=60+(i%3)*40;p.rect(x,y,50,13,pal[1]);p.rect(x+9,y-8,27,10,pal[1]);}
   if(g.theme==='heaven'){p.poly([[358,0],[387,0],[420,216],[328,216]],'rgba(255,252,221,0.20)');}
 }else if(g.theme==='hell'){
   for(let i=0;i<12;i++){let x=((i*55-scroll*.4)%600+600)%600-50;p.poly([[x,216],[x+20,100+(i%3)*23],[x+46,216]],pal[1]);}
   for(let i=0;i<12;i++)p.rect((i*41+(g.settings.reducedMotion?0:g.clock*7))%480,120+(i*31)%87,2,2,'#aa6550');
 }else if(indoor){
   p.rect(0,49,480,148,pal[1]);p.rect(0,191,480,25,pal[2]);
   for(let i=0;i<7;i++){
     const x=((i*96-scroll*.25)%672+672)%672-96;
     p.rect(x,66,67,83,pal[3]);p.rect(x+4,70,59,74,g.theme==='night'?'#243e54':pal[4]);
     p.rect(x+32,69,3,76,pal[2]);p.rect(x+2,105,64,3,pal[2]);p.rect(x-3,147,73,5,pal[2]);
     if(g.theme!=='night')p.poly([[x+4,152],[x+65,152],[x+125,216],[x+53,216]],'rgba(252,235,179,0.12)');
   }
   if(g.segment===6&&g.phase==='run'){p.poly([[284,100],[246,214],[358,214]],'rgba(247,211,137,0.12)');p.rect(282,95,2,69,'#917956');p.poly([[268,96],[293,96],[286,86],[276,86]],pal[4]);}
 }else{
   p.circle(387,51,23,g.theme==='rain'?'#cfdbd1':pal[4]);
   for(let i=0;i<8;i++){
     const x=((i*85-scroll*.09)%680+680)%680-85,h=48+(i%3)*19;
     p.rect(x,163-h,69,h,pal[1]);p.poly([[x-4,163-h],[x+34,147-h],[x+73,163-h]],pal[2]);
     for(let j=0;j<3;j++)p.rect(x+10+j*18,177-h,9,11,pal[4]);
   }
   for(let i=0;i<6;i++){
     const x=((i*126-scroll*.24)%756+756)%756-100;
     p.rect(x+18,93,7,113,pal[3]);p.rect(x-4,71,50,46,pal[2]);p.rect(x+4,57,36,64,pal[2]);p.rect(x-12,84,65,27,pal[2]);
     p.rect(x+7,64,24,11,pal[1]);
   }
   p.rect(0,177,480,29,pal[2]);for(let i=0;i<30;i++)p.rect(((i*23-scroll*.4)%690+690)%690,179,2,28,pal[3]);
 }
 sceneDetails(g,p,scroll);
 storyEchoProps(g,p);
 if(g.branch==='alley')p.image('props.micro.cat.normal',350,171,24,24);
 p.rect(0,216,480,54,pal[3]);p.rect(0,216,480,3,pal[4]);p.rect(0,221,480,2,pal[2]);
 for(let i=0;i<22;i++)p.rect(((i*37-scroll)%814+814)%814,234+(i%3)*9,10+(i%4)*3,1,'rgba(255,255,230,0.09)');
 if(g.theme==='rain')drawRainWeather(p,g.clock,g.settings.reducedMotion);
 if(g.phase==='run'&&g.segment===1){const x=350-scroll*.45;if(x>-130){p.rect(x,103,117,98,pal[1]);p.rect(x+7,108,103,14,pal[3]);text(p,'幼 儿 园',x+59,111,9,pal[4],'center');p.rect(x+36,137,43,64,pal[3]);}}
  if(g.phase==='run'&&g.segment===7){const x=96+(g.duration-g.time)*72;if(x<520){p.rect(x+40,70,9,147,'#435f52');p.rect(x,41,94,52,'#8caa86');p.rect(x+15,27,61,77,'#8caa86');}}
}
function obstacle(p:Painter,o:WorldObstacle,g:Game,time=g.time){
 drawPhysicalObstacle(p,o,time,(PAL[g.theme]||PAL.dawn)[3]);
}
/** 同学有自己的圆脸、平刘海与青色服饰；坐骨贴座面，小腿真实垂下。 */
function seatedClassmate(p:Painter,x:number,seatY:number,quiet=false){
 const shirt='#91a78e',trousers='#596e67',skin='#d6b08a',hair='#615049';
 p.line(x-2,seatY,x+6,seatY+1,trousers,4);p.line(x+1,seatY+1,x+8,seatY+2,'#6e7f71',4);
 p.line(x+6,seatY+1,x+6,seatY+9,trousers,3);p.line(x+8,seatY+2,x+8,seatY+10,'#6e7f71',3);
 p.rect(x+3,seatY+9,5,2,'#d9d3be');p.rect(x+5,seatY+10,5,2,'#d9d3be');
 p.poly([[x-4,seatY-17],[x+3,seatY-17],[x+4,seatY],[x-4,seatY]],shirt);
 p.line(x-3,seatY-15,x-7,seatY-6,'#7d957e',3);p.line(x-7,seatY-6,x+3,seatY-3,skin,2);
 p.line(x+2,seatY-14,x+6,seatY-7,shirt,3);p.line(x+6,seatY-7,x+6,seatY-3,skin,2);
 p.rect(x-1,seatY-19,3,3,skin);p.circle(x,seatY-23,4,skin);
 p.poly([[x-4,seatY-25],[x-2,seatY-28],[x+2,seatY-28],[x+4,seatY-25],[x+4,seatY-23],[x+2,seatY-24],[x-4,seatY-24]],hair);
 p.rect(x-3,seatY-23,1,1,'#454743');p.line(x-3,seatY-21,x-1,seatY-21+(quiet?.2:0),'#a67c62',.6);
 p.line(x-2,seatY-15,x+1,seatY-13,'#dde2cb',1);
}
function prop(g:Game,p:Painter,id:string,label:string,at:number,height=0){
 const x=96+(at-g.time)*72;if(x<-30||x>510)return;const y=216-height;
 const micro=({hat:'redhat',bag:'wetbag',plant:'plant',milk:'milk',wish:'wishtag'} as Record<string,string>)[id];
 if(micro&&p.image(`props.micro.${micro}.normal`,x-16,id==='hat'?y-20:y-30,32,32)){
  p.line(x-10,y+1,x+10,y+1,'#faf2d1',1);text(p,label,x,y-31,7,'#faf0d0','center');return;
 }
 const storyArt=({pen:'pen',plane:'paperplane',paper:'paperplane',homework:'exam',exam:'exam',
  eraser:'eraser',umbrella:'umbrella'} as Record<string,string>)[id];
 if(storyArt){
  const state=Math.abs(x-96)<45?'active':'normal';
  if(p.image(`props.story.${storyArt}.${state}`,x-12,y-22,24,22)){
   p.line(x-10,y+1,x+10,y+1,'#faf2d1',1);text(p,label,x,y-31,7,'#faf0d0','center');return;
  }
 }
 if(id==='pen'){p.poly([[x-2,y-19],[x+2,y-19],[x+2,y-4],[x,y],[x-2,y-4]],'#b05f51');}
 else if(id==='plane'||id==='paper'){p.poly([[x-12,y-13],[x+12,y-19],[x,y-2],[x-3,y-11]],'#f4edd9');}
 else if(id==='life'){p.circle(x,y-12,7,'#b9caac');p.rect(x-1,y-17,2,10,'#f7f1d7');p.rect(x-5,y-13,10,2,'#f7f1d7');}
 else if(id==='homework'||id==='exam'){p.rect(x-12,y-5,24,5,'#ede6d6');p.line(x,y-5,x,y,'#8e9c94');}
 else if(id==='speak'){p.rect(x-10,y-24,24,16,'#f1e2b9');p.poly([[x-6,y-9],[x-6,y-3],[x,y-9]],'#f1e2b9');text(p,'…',x+1,y-24,12,INK,'center');}
 else if(id==='milk'){p.rect(x-5,y-17,10,17,'#e6dcc5');p.rect(x-4,y-15,8,9,'#fff6dd');}
  else if(id==='hat'){p.rect(x-7,y-10,14,7,'#b66c57');p.rect(x-11,y-3,22,3,'#b66c57');}
  else if(id==='plant'){p.rect(x-5,y-9,10,9,'#a88560');p.rect(x-1,y-23,2,14,'#587763');p.rect(x-7,y-23,6,7,'#769271');}
  else if(id==='bench'){
    // The other child stays visible during the two quiet seconds and as the bench passes.
    p.rect(x-27,y-29,54,5,'#9f896d');p.rect(x-27,y-24,4,12,'#87745d');p.rect(x+23,y-24,4,12,'#87745d');
    p.rect(x-27,y-16,54,5,'#b69d77');p.rect(x-25,y-11,4,11,'#79684f');p.rect(x+21,y-11,4,11,'#79684f');
    seatedClassmate(p,x+17,y-16,g.benchSitRemaining>0);
    p.line(x-29,y+1,x+29,y+1,'#faf2d1',1);
    text(p,g.benchSitRemaining>0?'坐一会儿':label,x,y-63,7,'#faf0d0','center');
    return;
  }
  else{p.rect(x-7,y-12,14,12,'#ceb482');p.rect(x-8,y-2,16,2,'#947d5d');}
 p.line(x-10,y+1,x+10,y+1,'#faf2d1',1);text(p,label,x,y-31,7,'#faf0d0','center');
}

function symbol(g:Game,p:Painter){
 if(g.branch||g.segment>=7||g.used.has('symbolBroken'))return;
 const x=96+(g.duration*.82-g.time)*72;if(x<-30||x>510)return;const y=181;
 const names=['鸟笼','旧钟','断线风筝','别人的满分','别人的奖状','闹钟'];
 const art=g.segment===1?'birdcageDetail':['','oldclock','kite','noticeboard','award','alarmclock'][g.segment-1];
 const state=Math.abs(x-96)<42?'active':'normal';
 if(art&&p.image(`props.symbols.${art}.${state}`,x-16,y-38,32,40)){
  p.line(x-17,y+3,x+17,y+3,'#eee3c2');text(p,names[g.segment-1],x,y-44,7,'#f6e7bd','center');return;
 }
 if(g.segment===1){
  outline(p,x-13,y-25,26,28,'#8f886a');p.line(x-13,y-27,x+13,y-27,'#8f886a');for(let i=0;i<4;i++)p.rect(x-9+i*6,y-23,1,25,'#8f886a');
  p.rect(x-3,y-11,6,5,'#e6d8b4');p.rect(x+2,y-13,3,3,'#e6d8b4');
 }else if(g.segment===2||g.segment===6){
  p.circle(x,y-12,14,'#8a8571');p.circle(x,y-12,11,'#e8dcbd');p.line(x,y-12,x+7,y-17,INK);p.line(x,y-12,x,y-21,INK);
  if(g.segment===2)p.line(x,y+2,x+(g.settings.reducedMotion?0:Math.sin(g.clock*3)*6),y+20,'#93896b');
 }else if(g.segment===3){
  p.poly([[x,y-31],[x+16,y-16],[x,y],[x-12,y-16]],'#c29271');p.line(x-12,y-16,x+16,y-16,'#eee0b9');p.line(x,y,x+6,y+17,'#b8ab87');
 }else{
  p.rect(x-16,y-30,32,28,'#e8dcbd');outline(p,x-16,y-30,32,28,'#a17f61');text(p,g.segment===4?'100':'奖',x,y-24,11,'#b5785d','center');
 }
 p.line(x-17,y+3,x+17,y+3,'#eee3c2');text(p,names[g.segment-1],x,y-44,7,'#f6e7bd','center');
}

function introDoorway(g:Game,p:Painter){
 const t=Math.max(0,Math.min(3,g.phaseTime));
 if(g.settings.reducedMotion){
  p.rect(0,0,5,270,INK);p.rect(475,0,5,270,INK);
  p.rect(0,0,480,4,INK);p.rect(5,0,2,270,GOLD);p.rect(473,0,2,270,GOLD);return;
 }
 if(t>=2.62)return;
 const smooth=(v:number)=>{v=Math.max(0,Math.min(1,v));return v*v*(3-2*v);};
 const open=smooth((t-.3)/1.12),push=smooth((t-1.42)/1.2);
 const angle=open*Math.PI*.49,depth=Math.sin(angle),scale=1+push*.45;
 const hinge=Math.round(18-84*push),top=Math.round(-40*push),bottom=Math.round(270+70*push);
 // 轻量门体模型：绕左侧竖直轴旋转，深度进入透视分母，门板上的所有部件共用投影。
 const eye=top+(bottom-top)*.56,focal=540,doorWidth=444*scale;
 const point=(u:number,v:number):[number,number]=>{
  const perspective=1+doorWidth*depth*u/focal;
  return [Math.round(hinge+doorWidth*Math.cos(angle)*u/perspective),
   Math.round(eye+(top+(bottom-top)*v-eye)/perspective)];
 };
 const width=point(1,0)[0]-hinge;
 const surface=(u:number,v:number,w:number,h:number,color:string)=>
  p.poly([point(u,v),point(u+w,v),point(u+w,v+h),point(u,v+h)],color);
 const rule=(u1:number,v1:number,u2:number,v2:number,c:string,w=1)=>{
  const a=point(u1,v1),b=point(u2,v2);p.line(a[0],a[1],b[0],b[1],c,w);
 };
 p.rect(0,0,480,270,`rgba(28,44,33,${(.18*(1-push)).toFixed(3)})`);
 surface(0,0,1,1,'#6d8070');
 surface(.04,.035,.92,.93,'#718573');
 surface(.08,.09,.84,.34,'#405a4b');
 surface(.10,.11,.80,.30,'#bcc7ad');
 surface(.10,.33,.80,.08,'#a2b399');
 surface(.492,.11,.016,.30,'#5c725f');
 surface(.08,.49,.84,.42,'#586f5d');
 surface(.10,.51,.80,.38,'#708472');
 surface(.13,.54,.022,.32,'#7f937d');
 // 旧木门的层次来自门榫、掉漆和顺纹细线，不使用整面随机噪点。
 if(width>36){
  for(const [u,v,w,h] of [[.04,.035,.92,.93],[.08,.09,.84,.34],[.08,.49,.84,.42]]){
   rule(u,v,u+w,v,'#9eae90');rule(u,v,u,v+h,'#91a187');
   rule(u,v+h,u+w,v+h,'#3c5645');rule(u+w,v,u+w,v+h,'#4a624f');
   rule(u+.006,v+.01,u+w-.008,v+.01,'#c0c6a0');
  }
  for(let i=0;i<12;i++){
   const u=.17+i*.06,v=.56+(i%4)*.027;
   rule(u,v,u-.006,.84-(i%3)*.023,i%3?'#788b73':'#627b64');
  }
  for(const [u,v] of [[.05,.23],[.055,.76],[.946,.52],[.947,.91],[.17,.924],[.74,.94]]){
   surface(u,v,.015,.008,'#aeac83');surface(u+.01,v+.008,.012,.005,'#516b55');
  }
  // 磨砂玻璃里有一层偏冷窗影与斜向晨光，跟随门扇一起转动。
  p.poly([point(.105,.115),point(.455,.115),point(.25,.41),point(.105,.41)],'rgba(230,225,190,0.19)');
  p.poly([point(.57,.11),point(.90,.11),point(.90,.22),point(.72,.41),point(.53,.41)],'rgba(239,230,190,0.16)');
  rule(.10,.315,.90,.315,'#acbca2');rule(.492,.11,.492,.41,'#d2d3b0');
  surface(.76,.453,.10,.018,'#bbc0a0');
  rule(.777,.46,.84,.46,'#829174');
 }
 const freeTop=point(1,0),freeBottom=point(1,1),edgeWidth=3+Math.round(depth*5);
 p.poly([freeTop,[freeTop[0]+edgeWidth,freeTop[1]+2],
  [freeBottom[0]+edgeWidth,freeBottom[1]-2],freeBottom],'#364e41');
 rule(1,.015,1,.98,'#d1b47b');
 const press=smooth((t-.1)/.2)*(1-smooth((t-.4)/.26));
 const latch=point(.89,.56),latchEnd=point(.815,.56+.035*press);
 surface(.873,.52,.037,.085,'#405548');surface(.879,.524,.025,.077,'#a99565');
 rule(.882,.53,.898,.53,'#d9c38b');rule(.882,.595,.898,.595,'#695b40');
 for(const v of [.535,.593]){const screw=point(.893,v);p.rect(screw[0]-1,screw[1],2,1,'#4e5944');}
 p.line(latch[0]+1,latch[1]+2,latchEnd[0]+1,latchEnd[1]+2,'#435646',4);
 p.line(latch[0],latch[1],latchEnd[0],latchEnd[1],'#b9a575',3);
 p.line(latch[0],latch[1]-1,latchEnd[0],latchEnd[1]-1,'#dfca90');
 // 一只校服袖口的手短暂抵住把手，随后撤出画面，不依赖角色动作图集。
 if(t<.88){
  const reach=smooth(t/.19),release=smooth((t-.58)/.3);
  const hx=Math.round(latchEnd[0]+12*(1-reach)+42*release),hy=Math.round(latchEnd[1]+4+136*release);
  p.poly([[hx+10,hy+5],[hx+29,hy+27],[hx+49,270],[hx+20,270],[hx+5,hy+16]],'#dce0c6');
  p.poly([[hx+16,hy+19],[hx+29,hy+27],[hx+49,270],[hx+39,270]],'#bdc9b3');
  p.line(hx+17,hy+29,hx+35,259,'#eef0d9');
  p.rect(hx+1,hy+8,14,8,'#536b5a');p.rect(hx+2,hy+9,12,2,'#708477');
  p.rect(hx+12,hy+12,2,2,'#d1cdb2');p.rect(hx-6,hy-4,15,13,'#d2a87e');
  p.rect(hx-9,hy-2,6,7,'#ddb68c');p.rect(hx-3,hy-7,9,5,'#ddb68c');
  p.rect(hx-5,hy+5,10,2,'#ac805f');
  p.rect(hx-4,hy-2,2,4,'#c39771');p.rect(hx+1,hy-3,1,5,'#bd8e67');
 }
 const right=Math.round(460+84*push),frameWidth=Math.round(18+10*push);
 p.rect(hinge-frameWidth,top,frameWidth,bottom-top,INK);
 p.rect(hinge-3,top,3,bottom-top,'#b8a171');
 p.rect(right,top,frameWidth,bottom-top,INK);
 p.rect(right,top,3,bottom-top,'#b8a171');
 p.rect(hinge-frameWidth,top,right-hinge+frameWidth*2,10+push*8,INK);
 p.rect(hinge-frameWidth+3,top+3,right-hinge+frameWidth*2-6,2,'#657b62');
 p.rect(hinge-frameWidth+3,top+3,2,bottom-top-3,'#6f8066');
 for(const v of [.16,.52,.86]){
  const hy=Math.round(top+(bottom-top)*v);
  p.rect(hinge-7,hy,6,16,'#405847');p.rect(hinge-5,hy+1,3,14,'#a69b72');
  for(const dy of [4,9,13])p.rect(hinge-5,hy+dy,3,1,'#68755b');
 }
 p.rect(0,bottom-6,480,6,'#7d8b73');
 p.rect(0,bottom-6,480,1,'#c6c7a5');
}

function geometryDebug(g:Game,p:Painter){
 // Deliberately empty: collision telemetry is never drawn in a player-facing view.
}

function endingFilm(g:Game,p:Painter){
 const end=ENDINGS[g.ending as keyof typeof ENDINGS];
 const outfit=g.profile.equippedSlots?.skin||g.profile.equipped;
 const skin=CHARACTER_SKINS.find(id=>id===outfit)||'base';
 p.rect(0,0,480,270,end?.color||PAPER);
 if(g.phaseTime<ENDING_MEDIA_SECONDS||(!g.endingMediaEnded&&g.endingMediaStatus!=='failed')){
  const result=g.endingMediaStatus==='failed'?undefined:p.video?.(`ending.video.${g.ending}`,0,0,480,270,g.phaseTime,g.paused,g.endingPlaybackToken,skin,g.settings.muted);
  const visible=typeof result==='object'?result.visible:result===true;
  if(typeof result==='object')g.setEndingMediaProgress(result.seconds,result.status);
  else g.setEndingMediaProgress(null,'failed');
  g.setEndingMediaActive(visible);
  if(!visible){
   const frame=Math.min(ENDING_SEQUENCE_FRAMES-1,Math.floor(g.phaseTime/ENDING_MEDIA_SECONDS*ENDING_SEQUENCE_FRAMES));
   const targetReady=p.image(`ending.sequence.${g.ending}.${skin}.${String(frame).padStart(2,'0')}`,0,0,480,270);
   g.setEndingFallbackProgress(frame,targetReady);
   let ready=targetReady;
   // 首次解码尚未完成时保留最近已载入的前帧，避免每个关键帧都跳回片头。
   for(let previous=frame-1;previous>=0&&!ready;previous--){
    ready=p.image(`ending.sequence.${g.ending}.${skin}.${String(previous).padStart(2,'0')}`,0,0,480,270);
   }
   if(!ready)text(p,end?.name||'',240,118,17,INK,'center');
  }
 }else{
  g.setEndingMediaActive(false);
  p.rect(0,0,480,270,'#eeeade');
  p.rect(0,0,480,6,'#5c7565');p.rect(0,6,480,2,'#cfac68');
  p.rect(22,24,436,205,'rgba(236,232,214,0.82)');
  outline(p,22,24,436,205,'#a4b6a1',2);
  text(p,end?.name||'',240,105,21,INK,'center');
  if(end?.line)wrap(p,end.line,101,143,278,9,'#60736a',15);
  g.endingEchoes.slice(0,2).forEach((echo,i)=>text(p,echo.text,240,190+i*16,7.5,'#60736a','center'));
 }
 // 片中保留暂停；重看可随时返回，首次解锁由完整播放的媒体时钟判定。
 if(!g.paused){
  button(g,p,445,12,23,18,'Ⅱ',()=>{g.paused=true;g.cancelInput();},false,false,'ui.icon.pause.normal');
  if(g.replayEnding)button(g,p,18,12,82,19,'回到回廊',()=>g.cancelEndingMedia());
  if(g.endingMediaStatus==='failed'&&g.endingFallbackBlocked){
   p.rect(94,197,292,55,'rgba(238,232,215,0.94)');
   text(p,'这段记忆暂时没有载入。',240,204,9,INK,'center');
   button(g,p,117,224,115,21,'重新播放',()=>g.retryEndingMedia());
   button(g,p,248,224,115,21,'回到回廊',()=>g.cancelEndingMedia());
  }
 }
}
function play(g:Game,p:Painter){
 if((g.phase as string)==='ending'){endingFilm(g,p);return;}
 if(g.phase==='corridorTransition'){corridorTransition(g,p);return;}
 const ui=p;
 if(g.phase==='run'&&g.shake>0&&!g.settings.reducedMotion){
  const strength=Math.min(1,g.shake/.25);
  const dx=Math.sin(g.clock*47)*2*strength,dy=Math.cos(g.clock*53)*1.5*strength;
  // Keep the real scenery beneath the small strips uncovered by camera shake.
  scenery(g,ui);
  p=shiftedPainter(ui,dx,dy);
 }
 scenery(g,p);
 // The gameplay HUD is drawn procedurally below; keep the pixel scene visible.
 const ph=g.phase;
 if(ph==='run'){symbol(g,p);
  for(const o of g.obstacles)if(!o.erased&&obstacleVisible(o,g.time))obstacle(p,o,g);
  for(const f of g.pickups){const x=worldX(f.at,g.time);if(x<0||x>480||g.run.collected.includes(f.id))continue;
   const y=216-f.height,state=Math.abs(x-96)<24&&Math.abs(y-(216-g.y-19))<24?'active':'normal';
   if(!p.image(`props.symbols.fragment.${state}`,x-8,y-8,16,16)){
    p.poly([[x,y-4],[x+4,y],[x,y+4],[x-4,y]],f.value===3?'#f5cf76':'#e6d9b5');p.rect(x-1,y-1,2,2,'#fff6cd');
   }}
  const life=g.level.lifeAt;if(life!==null&&life!==undefined&&!g.used.has('life'))prop(g,p,'life','加命',g.duration*life);
   const m=g.level.micro;if(m&&(m.event==='bench'||!g.used.has('micro')))prop(g,p,m.event,m.label,m.at<=1?g.duration*m.at:m.at);
  if(!g.branch){
   if(g.segment===2&&!g.used.has('pen'))prop(g,p,'pen','笔',g.duration*.3);
   if(g.segment===3){if(!g.used.has('plane'))prop(g,p,'plane','纸飞机',g.duration*.4,42);if(!g.used.has('homework'))prop(g,p,'homework','作业本',g.duration*.7);}
   if(g.segment===4){if(!g.used.has('speak'))prop(g,p,'speak','卡住的话',g.duration*.5);if(!g.used.has('eraser'))prop(g,p,'eraser','橡皮',g.duration*.65);}
  }
  if(g.branch==='playground'){const target=g.interactionTarget();if(target?.kind==='side'&&target.x>-110&&target.x<540){
   const x=target.x;
   const schoolFacade=p.image('scene.scroll.playground.01',490,0,1,1,0);
   if(!p.image('props.choice.sideDoor',x-25,91,110,125)&&!schoolFacade){
    p.rect(x-23,101,109,115,'#84958b');p.rect(x-20,104,103,109,'#c4c6a9');
    for(let row=0;row<4;row++)p.line(x-20,124+row*22,x+83,124+row*22,'#a8ae96');
    p.rect(x+2,120,61,96,'#636e65');p.rect(x+6,123,53,91,'#344942');
    p.rect(x+9,126,46,85,'#e4c58b');p.rect(x+13,130,37,78,'#b8a376');
    p.rect(x+53,121,4,95,'#6c705f');p.circle(x+43,171,2,'#f4ddac');
    p.rect(x-26,210,114,6,'#9e9a79');
   }
  }}
  for(const c of g.chalks){const x=96+(c.at-g.time)*72;if(x>-60&&x<480)text(p,c.text,x,207,8,'#f2e5c5');}
 }
 if(ph==='choice'||ph==='seat'){
   if(g.choice===1){
    const wall=choicePropBounds('wall',g.phaseTime),umbrella=choicePropBounds('umbrella',g.phaseTime);
    const embeddedWall=p.image('scene.choice.01',490,0,1,1,0);
    if(!embeddedWall&&wall.x<530&&wall.x>-60){
     if(!p.image('props.choice.wall',wall.x,wall.y,wall.w,wall.h)){
      p.rect(wall.x,wall.y,wall.w,wall.h,'#758575');
      for(let row=0;row<3;row++)for(let col=0;col<3;col++){
       const xx=wall.x+col*15+(row%2?7:0);
       if(xx<wall.x+wall.w-2)p.rect(xx,wall.y+2+row*10,Math.min(12,wall.x+wall.w-2-xx),7,row%2?'#8f9e83':'#82947d');
      }
      p.rect(wall.x,wall.y-4,wall.w,5,'#c4c4a2');
      text(p,'巷口',wall.x+wall.w/2,164,8,'#e9e7ca','center');
     }
    }
    const ux=umbrella.x+umbrella.w/2;
    if(ux>-80&&ux<540){
     if(!p.image('props.choice.umbrella',umbrella.x,160,umbrella.w,56)){
      p.poly([[ux-9,171],[ux-5,160],[ux+2,164],[ux+10,171],[ux+5,181],[ux-4,181]],'#b9976b');
      p.line(ux+1,178,ux+1,209,'#746651',2);p.line(ux+1,209,ux+6,212,'#746651',2);
      p.rect(ux-12,212,24,4,'#7c8873');
      text(p,'伞架',ux,142,8,'#f0e8cf','center');
     }
    }
   }
   if(g.choice===2){
    const t=ph==='seat'?g.chairFreezeTime:g.phaseTime;
    CHAIRS.forEach((chair,i)=>{const surface=chairSurface(i,t),x=surface.center;
     if(x<-40||x>520)return;
     const qwenDesk=p.image('props.choice.chairDesk',x-40,161,80,55);
     if(!qwenDesk){
      p.rect(x+13,178,51,5,'#a78865');p.rect(x+17,183,4,33,'#76634e');
      p.rect(x+59,183,4,33,'#76634e');p.rect(x+16,181,45,2,'#d0b48a');
      if(!p.image(`props.story.chair${i+1}.${surface.active?'active':'normal'}`,x-16,CHAIR_TOP-16,32,32)){
       p.rect(surface.rect.x,surface.rect.y,surface.rect.w,surface.rect.h,'#967e5d');
       p.rect(x-11,CHAIR_TOP+5,4,GROUND_Y-CHAIR_TOP-5,'#655e4b');
       p.rect(x+8,CHAIR_TOP+5,4,GROUND_Y-CHAIR_TOP-5,'#655e4b');
      }
      text(p,surface.label,x,177,8,INK,'center');
     }
     if(surface.active){p.rect(surface.rect.x,CHAIR_TOP-3,surface.rect.w,2,'#f9eac3');
      const fraction=(chair.end-t)/(chair.end-chair.start);p.rect(surface.rect.x,CHAIR_TOP-10,surface.rect.w*Math.max(0,fraction),2,'#e6c57d');}
     if(ph==='seat'&&g.seat===surface.index){
      if(!qwenDesk){p.rect(x+14,CHAIR_TOP,26,3,'#b09574');p.rect(x+16,CHAIR_TOP+3,3,GROUND_Y-CHAIR_TOP-3,'#7b7059');p.rect(x+35,CHAIR_TOP+3,3,GROUND_Y-CHAIR_TOP-3,'#7b7059');}
      seatedClassmate(p,x+26,CHAIR_TOP,true);
     }
    });
    if(g.profile.lights.includes('backrow')){p.rect(395,170,24,4,'#9ca89a');p.rect(397,174,3,20,'#9ca89a');p.rect(414,174,3,20,'#9ca89a');}
   }
   if(g.choice===3){const exam=choicePropBounds('exam',g.phaseTime);
    if(exam.x>-140&&exam.x<540){
     if(!p.image('props.choice.examDesk',exam.x+22,150,94,66)){
      p.rect(exam.x+19,164,92,5,'#94775b');p.rect(exam.x+25,169,5,47,'#78634e');
      p.rect(exam.x+100,169,5,47,'#78634e');p.rect(exam.x+26,158,41,6,'#c6b090');
      p.rect(exam.x+32,152,34,5,'#ede5d5');p.rect(exam.x+34,149,32,4,'#dcd6c8');
     }
     if(!p.image('props.choice.examPaper',exam.x-3,exam.y-7,37,15)){
      p.poly([[exam.x,exam.y],[exam.x+26,exam.y-6],[exam.x+31,exam.y+7],[exam.x+2,exam.y+8]],'#eee7d5');
      p.line(exam.x+11,exam.y,exam.x+25,exam.y-3,'#ae7467');
      text(p,'59',exam.x+exam.w/2,exam.y-18,8,'#554b44','center');
     }
    }
   }
   if(g.choice===4){const piano=choicePropBounds('piano',g.phaseTime);
    if(piano.x>-120&&piano.x<530){
     if(!p.image('props.choice.piano',piano.x-8,piano.y-8,piano.w+16,piano.h+8)){
      p.rect(piano.x,piano.y+12,80,38,'#66514b');p.rect(piano.x+4,piano.y+17,72,29,'#7d6355');
      p.rect(piano.x+9,piano.y+28,61,5,'#ece2c6');
      for(let i=0;i<8;i++)p.rect(piano.x+12+i*7,piano.y+28,2,3,'#4d4642');
      p.rect(piano.x+8,piano.y+50,7,18,'#554541');p.rect(piano.x+64,piano.y+50,7,18,'#554541');
      p.poly([[piano.x+4,piano.y+12],[piano.x+19,piano.y-12],[piano.x+75,piano.y+4],[piano.x+77,piano.y+14]],'#4d4446');
      p.line(piano.x+21,piano.y-10,piano.x+27,piano.y+13,'#c6af8c',2);
     }
     if(g.canTouchPiano()){
      p.rect(piano.x+9,piano.y+26,61,2,'rgba(248,222,170,0.7)');
      if(g.hold>0)p.rect(piano.x+9,piano.y+22,Math.min(61,g.hold/.6*61),2,'#efd59e');
     }
    }
   }
   if(g.choice===5){
   const bench=choicePropBounds('bench',g.phaseTime),exit=choicePropBounds('door',g.phaseTime);
    // The Qwen hallway plate carries the actual office doorway at this world
    // coordinate. A second freestanding door here would cover its frame.
    const embeddedDoor=p.image('scene.choice.05',490,0,1,1,0);
    if(!embeddedDoor&&exit.x>-60&&exit.x<540){
     if(!p.image('props.choice.door',exit.x,exit.y,exit.w,exit.h)){
      p.rect(exit.x,exit.y,exit.w,exit.h,'#74665b');p.rect(exit.x+3,exit.y+4,exit.w-6,exit.h-8,'#a78162');
      p.rect(exit.x+7,exit.y+8,exit.w-15,exit.h-16,'#865f4b');
      p.rect(exit.x+exit.w-8,exit.y+5,4,exit.h-9,'#574943');
      p.circle(exit.x+exit.w-12,exit.y+46,2,'#f1daaa');
      p.rect(exit.x,exit.y+exit.h-5,exit.w,5,'#a3937b');
     }
    }
    if(bench.x>-90&&bench.x<530){
     if(!p.image('props.choice.bench',bench.x-12,bench.y-22,64,65)){
      p.rect(bench.x-5,bench.y-14,50,5,'#8e745c');p.rect(bench.x-5,bench.y-7,50,5,'#9d8064');
      p.rect(bench.x,bench.y,bench.w,5,'#a08363');
      p.rect(bench.x+3,bench.y+5,4,bench.h-5,'#6d5b4c');
      p.rect(bench.x+bench.w-7,bench.y+5,4,bench.h-5,'#6d5b4c');
      p.line(bench.x+8,bench.y+bench.h-2,bench.x+bench.w-8,bench.y+bench.h-2,'#d4b98d');
     }
    }
   }
   if(g.choice===6&&g.model.allLit()){
    const former=choicePropBounds('oldSelf',g.phaseTime),x=former.x+former.w/2;
    if(x>-50&&x<530){
     p.rect(x-9,212,18,2,'rgba(226,227,198,0.28)');
     character(g,p,x,GROUND_Y+(g.settings.reducedMotion?0:Math.sin(g.clock)*1.5),.8,false,
      g.profile.endingSnapshots.desk||g.profile.endingSnapshots.morning);
     if(g.canLookBack())p.circle(x,145,3,'#e8d6a8');
    }
   }
 }
 if(ph==='alleyExit'){const target=g.interactionTarget();if(target?.kind==='wall'){const x=target.x;
  const embeddedWindow=p.image('scene.choice.alley',490,0,1,1,0);
  if(!embeddedWindow&&x>-110&&x<540){
   if(!p.image('props.choice.alleyWall',x-28,72,121,144)){
    p.rect(x-28,84,120,132,'#687b80');p.rect(x-23,90,110,126,'#869797');
    for(let row=0;row<8;row++)p.line(x-20,102+row*14,x+86,102+row*14,'#a9b5a9');
    p.rect(x+target.width+12,100,30,26,'#4f656b');p.rect(x+target.width+15,103,24,20,'#c3c5ac');
    p.rect(x-6,121,target.width+12,6,'#c5ccb6');p.rect(x-3,127,target.width+6,89,'#82958f');
    text(p,'窗台',x+target.width/2,108,8,'#f3e5c5','center');
   }
  }
 }}
 if(ph==='reward'){
  for(let i=0;i<18;i++){const at=3+i*3,x=96+(at-g.rewardClock())*72;if(x<0||x>500||g.used.has('reward'+i))continue;
   const h=g.reward==='dream'&&g.phaseTime<30?40+(i%3)*40:18+(i%3)*27;
   p.circle(x,216-h,10,'rgba(255,241,210,0.48)');p.poly([[x-5,213-h],[x+5,213-h],[x+5,221-h],[x-5,221-h]],'#edd9a2');}
  if(g.reward==='dream'&&g.phaseTime>=30){const table=g.interactionTarget();if(table?.kind==='table'){
   const y=GROUND_Y-table.height;p.rect(table.x,y,table.width,10,'#d1ac80');p.rect(table.x+16,y+10,13,GROUND_Y-y-10,'#a38471');p.rect(table.x+table.width-18,y+10,13,GROUND_Y-y-10,'#a38471');
   drawDreamTableHomework(p,{x:table.x,y,width:table.width},dreamHomeworkMemory(g.run.events));}}
 }
 if(ph==='hell'){
  g.hellObstacles.forEach(o=>{if(obstacleVisible(o,g.phaseTime))obstacle(p,o,g,g.phaseTime);});
  p.rect(332,42,128,2,'rgba(235,207,170,0.28)');p.rect(332,42,128*Math.min(1,g.phaseTime/28),2,'#e2b784');
  for(const at of [8,20])p.rect(331+128*at/28,39,2,8,'#e2b784');
 }
 if(ph==='poem'&&g.choice===3){
  p.rect(284,177,60,8,'#8f9f90');p.rect(310,166,48,8,'#8f9f90');text(p,'',300,140);
 }
 if(ph==='reverse'&&!g.settings.reducedMotion){for(let i=0;i<10;i++)p.rect((i*47+g.phaseTime*110)%480,176+i%3*12,17,1,'rgba(233,229,201,0.30)');}
 if(!g.settings.reducedMotion)for(const bit of g.particles)p.rect(bit.x,bit.y,2,2,bit.color);
 if(ph==='reward'&&g.used.has('sprint')&&!g.settings.reducedMotion){for(let i=1;i<4;i++)p.rect(96-i*12,216-g.y-19,8,17,'rgba(245,222,194,'+(.20-i*.04)+')');}
  if(ph!=='finale')character(g,p,96,216,ph==='reward'&&g.reward==='dream'&&g.phaseTime>=30?.65:1,false,g.replayEnding?g.endingSnapshot:null);
 geometryDebug(g,p);
 if(ph==='intro'){
  introDoorway(g,p);
 }
 if(ph==='finale'){finale(g,p);return;}
 if(ph==='intro'&&!g.settings.reducedMotion&&g.phaseTime<1.85){
  button(g,ui,445,12,23,18,'Ⅱ',()=>{g.paused=true;g.cancelInput();},false,false,'ui.icon.pause.normal');
 }else{
  const entranceUI=ph==='intro'&&!g.settings.reducedMotion&&g.phaseTime<2.4?
   fadedPainter(ui,Math.min(1,(g.phaseTime-1.85)/.55)):ui;
  hud(g,entranceUI);
  memoryAnchorPreview(g,ui);
 }
}
function hudButton(g:Game,p:Painter,x:number,y:number,w:number,h:number,label:string,action:()=>void,light:boolean,icon=''){
 const pressed=!!g.pointer?.ui&&g.pointer.inside&&!g.pointer.cancelled&&g.pointer.button?.x===x&&g.pointer.button?.y===y;
 const ink=light?'#eddfbc':INK;
 p.rect(x,y,w,h,pressed?'rgba(172,190,158,0.82)':light?'rgba(24,43,50,0.66)':'rgba(239,237,222,0.69)');
 outline(p,x,y,w,h,light?'rgba(203,216,190,0.32)':'rgba(77,102,84,0.30)');
 if(!icon||!p.image(icon,x+(w-12)/2,y+(h-12)/2,12,12))text(p,label,x+w/2,y+(h-8)/2,8,ink,'center');
 g.button(x,y,w,h,label,action);
}
function hud(g:Game,p:Painter){
 const light=['night','hell','graduate'].includes(g.theme);const c=light?'#eddfbc':INK;
 const cueInk=(alpha:number)=>`rgba(${light?'237,223,188':'51,73,65'},${Math.max(0,Math.min(1,alpha)).toFixed(3)})`;
 p.rect(0,0,480,25,light?'rgba(24,43,50,0.47)':'rgba(236,234,215,0.48)');
 const lifeRatio=Math.max(0,Math.min(1,g.run.lives/3));
 p.rect(9,2,48,1,light?'#71827e':'#9aa69b');
 p.rect(9,2,Math.round(48*lifeRatio),1,g.run.lives<3?'#c86758':'#d28a6f');
 const frame=g.profile.equippedSlots?.frame;if(frame)p.line(9,21,76,21,frame==='frame-night'?'#61758e':frame==='frame-dusk'?'#cb9273':'#c3b979');
 if(g.hurtPulse>0)p.circle(14+Math.min(2,g.run.lives)*16,13,8,'rgba(190,109,89,0.24)');
 for(let i=0;i<3;i++){
  const x=9+i*16,filled=g.run.lives>i;
  if(!p.image(`ui.icon.heart.${filled?'active':'normal'}`,x,6,12,11))
   p.poly([[x+1,8],[x+3,6],[x+6,8],[x+9,6],[x+11,8],[x+11,10],[x+6,15],[x+1,10]],filled?'#cf7468':'#9aa69b');
 }
 text(p,g.run.lives+'/3',60,8,7,c);
 if(g.run.lifeStock>0)text(p,'+'+g.run.lifeStock,82,8,7,light?'#e4c78b':'#8b6956');
 if(g.run.shield)text(p,'盾',105,8,7,c);
 else if(g.run.invincible>0)text(p,'护 '+Math.ceil(g.run.invincible),105,8,7,c);
 const headings=g.phase==='ending'?[]:g.subtitles.views('heading');
 if(headings.length)for(const cue of headings)text(p,cue.text,240,10,10,cueInk(cue.alpha),'center');
 const counter=g.phase==='reward'?g.rewardHits:g.profile.fragments;
 p.image(g.phase==='reward'?'ui.icon.wrapper.normal':'ui.icon.fragment.normal',400,6,13,13);
 text(p,compactCount(counter),457,8,8,c,'right');
 if(g.phase==='run'){const progress=Math.min(1,(g.time-g.startAt)/(g.duration-g.startAt));p.rect(0,25,480*progress,1,'#d0af72');}
 if(g.phase==='choice'){const left=1-g.phaseTime/g.duration;p.rect(0,25,480,1,'rgba(231,207,154,0.42)');p.rect(0,25,480*Math.max(0,left),1,'#d0af72');}
 if(g.paused)return;
 const manual=g.subtitleTime>0&&g.subtitle&&g.subtitle!==g.managedSubtitle;
 const storyViews=manual?[{text:g.subtitle,alpha:1}]:g.subtitles.views('story');
 if(g.scoreTime>0&&g.lastScore){
  const marks=[g.lastScore.clear&&'走完',g.lastScore.full&&'满罐',g.lastScore.noHit&&'无伤'].filter(Boolean);
  if(marks.length)text(p,marks.join(' · '),240,storyViews.length?91:39,7,cueInk(.88),'center');
 }
 const inv=g.profile.inventory;
 ['shield','magnet','eraser'].forEach((id,i)=>{if(inv[id]>0&&!g.run.usedItems.includes(id)&&g.phase==='run')hudButton(g,p,346+i*40,241,37,21,['盾','磁','擦'][i]+' '+inv[id],()=>g.useItem(id),light);});
 if(g.phase!=='ending')hudButton(g,p,445,40,23,18,'Ⅱ',()=>{g.paused=true;g.cancelInput();},light,'ui.icon.pause.normal');
 // Story and tutorial cues use open space rather than layered paper panels.
 if(g.phase!=='ending')for(const cue of storyViews){
  const lines=cue.text.split('\n');
  lines.forEach((line,i)=>text(p,line,240,55+i*15,lines.length>1?8:9,cueInk(cue.alpha),'center'));
 }
 if(g.memoryCueTime>0&&g.memoryCue&&g.phase==='run'){
  const a=Math.min(1,g.memoryCueTime/.35);
  text(p,short(g.memoryCue,18),398,98,7,cueInk(a),'center');
 }
 const tutorials=g.phase==='ending'?[]:g.subtitles.views('tutorial');
 for(const cue of tutorials){
  const lines=cue.text.split('\n');
  lines.forEach((line,i)=>text(p,line,180,lines.length>1?241+i*11:246,8,cueInk(cue.alpha),'center'));
 }
 if(g.phase==='run'&&g.segment===1&&g.time>9&&g.time<15){
  text(p,'轻点 · 跳过书包',163,247,8,cueInk(.92),'center');
 }
}
function finale(g:Game,p:Painter){
 p.rect(0,0,480,270,'#172825');const t=g.finaleTime;
 if(t<10){text(p,'你自己的十秒',240,30,16,'#e5dec7','center');text(p,'来时的路，在记忆里亮了一下。',240,242,9,'#bbbcaa','center');}
 else if(t<11)return;
 else if(t<13){text(p,'小满，没有大满。',240,100,18,'#e8dfc3','center');text(p,'「不完满才是人生。」—— 季羡林',240,143,12,'#bdc9b5','center');}
 else{text(p,'感谢你玩到这里。',240,83,18,'#e8dfc3','center');text(p,'这段路是你自己跑的。',240,120,12,'#bdc9b5','center');text(p,'以及，每一位跑完这条路的人。',240,185,11,'#e8dfc3','center');}
}
const REPLAY_ICONS:readonly MemoryBookIcon[]=['hat','bag','book','door','bench','cup','tag'];
/** The object on this page is separate from the obstacle course and its HUD. */
function memoryChoiceArt(g:Game,p:Painter,n:number,hasPen:boolean){
 const ink='#435b50',warm='#e9dbb9';
 if(n!==4){p.rect(318,84,106,78,'rgba(219,228,207,0.70)');outline(p,318,84,106,78,'#bdc9b8');}
 if(n===1){
  p.rect(386,113,29,39,'#83927b');p.line(385,111,415,111,'#6e816d',2);
  p.poly([[329,122],[354,98],[377,122]],'#d1a881');p.line(354,99,354,146,ink,2);
  p.line(354,145,360,149,ink,2);p.line(360,149,365,146,ink,2);
 }else if(n===2){
  for(let i=0;i<3;i++){const x=326+i*30,y=106+i%2*6;
   p.rect(x,y,25,6,ink);p.rect(x+3,y+19,20,5,'#8b9d84');
   p.rect(x+5,y+23,3,24,ink);p.rect(x+20,y+23,3,24,ink);
  }
 }else if(n===3){
  p.rect(332,91,72,62,'#faf4df');outline(p,332,91,72,62,'#bdc9b8');
  text(p,'59',352,101,22,'#a05c4f');p.line(341,131,394,131,'#b3bcae');
  if(hasPen){p.line(388,107,410,143,'#9e6256',4);p.circle(410,143,2,'#c89474');}
  else{p.rect(378,136,31,9,'#b7b8a7');outline(p,378,136,31,9,'#8d9a87');}
 }else if(n===4){
  // The whole piano lid lies inside Game's x318,y84,w106,h78 long-press area.
  const holding=!!g.pointer&&!g.pointer.ui&&g.held&&(g.pointer.source==='key'||
    g.pointer.x>=318&&g.pointer.x<=424&&g.pointer.y>=84&&g.pointer.y<=162);
  const progress=holding?Math.max(0,Math.min(1,g.hold/.6)):0;
  p.rect(325,112,93,40,'#405951');
  p.poly([[329,112],[345,93+progress*11],[404,93+progress*11],[416,112]],'#526b60');
  p.line(335,99+progress*8,409,99+progress*8,'rgba(237,218,172,0.58)',2);
  p.rect(332,119,79,17,'#f2eee0');
  for(let i=0;i<10;i++){const x=333+i*8;p.line(x,119,x,136,'#9ba99b');
   if(i<9&&i%3!==2)p.rect(x+5,119,4,8,'#43534e');
  }
  p.rect(326,156,92*progress,2,'#d7bd82');
  text(p,'琴盖 · 停留片刻',371,148,7,'#efdfbc','center');
 }else if(n===5){
  p.rect(377,91,31,62,'#899782');p.rect(382,96,21,57,'#536b5d');
  p.circle(399,127,2,warm);p.rect(327,119,48,6,ink);
  p.rect(332,103,39,7,ink);p.rect(333,125,4,26,ink);p.rect(366,125,4,26,ink);
 }else if(n===6){
  p.poly([[340,153],[344,97],[399,97],[404,153]],'#b4c1ac');
  p.rect(347,101,49,52,'#e9e5cb');p.line(371,102,371,153,'#a4b4a0');
  p.line(331,153,414,153,ink,2);
  if(g.model.allLit()){
   p.circle(329,123,5,'rgba(62,88,77,0.26)');
   p.rect(325,128,8,16,'rgba(62,88,77,0.22)');
   p.poly([[325,143],[333,143],[337,153],[321,153]],'rgba(62,88,77,0.18)');
   text(p,'来路还有一道影子',371,149,6,'rgba(55,82,72,0.57)','center');
  }
 }
}
function memoryPlay(g:Game,p:Painter){
 const replay=g.memoryReplay,segment=replay&&SEGMENTS[replay.segment-1];
 if(!replay||!segment){
  p.rect(0,0,480,270,PAPER);text(p,'这页记忆暂时合上了。',240,115,12,INK,'center');
  button(g,p,184,157,112,26,'回记忆册',()=>g.returnFromMemoryReplay(),true);return;
 }
 const n=replay.segment,anchor=segment.memoryAnchor,pal=PAL[segment.theme]||PAL.dawn;
  const atDoor=n===4,atBench=n===5;
 p.rect(0,0,480,270,pal[0]);p.poly([[0,73],[480,49],[480,216],[0,236]],pal[1]);
 p.rect(0,0,480,49,'rgba(31,52,45,0.90)');
 text(p,'第 '+n+' 段 · '+segment.name,20,11,13,'#f5edd8');
 text(p,'短记忆 · 重新走过这一小幕',21,32,7,'#d1d5c1');
 button(g,p,370,12,91,25,'回记忆册',()=>g.returnFromMemoryReplay());
 p.rect(26,53,428,177,'rgba(248,244,229,0.92)');outline(p,26,53,428,177,'#b5c3ae');
  const stageNames={object:atDoor?'走廊门前':atBench?'长椅边':'物件',
   touchResponse:atDoor?'门前的一刻':atBench?'并排坐一会儿':'物件的回应',
   choice:'这一刻的选择',response:'这一次的回应',poem:'新写下的诗页'};
 text(p,stageNames[replay.stage],42,61,11,INK);
 p.line(41,81,439,81,'#c8d0bf');
 if(anchor.sound)button(g,p,351,57,88,20,g.settings.muted?'声音已关':'再听一声',
   ()=>g.sound(anchor.sound),false,g.settings.muted);
 if(replay.stage==='object'){
  const icon=REPLAY_ICONS[n-1]||'book',pulse=g.settings.reducedMotion?0:Math.sin(g.clock*2.8)*3;
  p.circle(240,129,49+pulse,'rgba(210,189,139,0.23)');
  p.circle(240,129,40,'#dce5d3');
  memoryIcon(p,202,91,76,icon,'#425d50','#f3dfb7');
   g.button(200,87,80,83,atDoor?'走过门前':atBench?'坐到长椅边':'触碰'+anchor.object,
    ()=>g.touchMemoryObject(),replay.objectTouched);
  text(p,anchor.object,240,171,12,INK,'center');
  text(p,anchor.line,240,191,9,'#536b5b','center');
   text(p,atDoor?'走过门前，让这一页继续。':atBench?'在另一个孩子旁坐一会儿，让这一页继续。':
    '触碰眼前的物件，让这一页继续。',240,211,8,MUTED,'center');
 }else if(replay.stage==='touchResponse'){
  p.rect(53,104,374,101,'#e3e9d7');p.rect(53,104,3,101,'#bca26e');
  memoryIcon(p,75,119,50,REPLAY_ICONS[n-1]||'book','#425d50','#f3dfb7');
  text(p,anchor.object,143,122,9,MUTED);
  wrap(p,replay.touchResponse,143,147,267,11,INK,19);
   text(p,n===7?'这一页会在片刻后合上。':atBench?'这段安静过后，那时的选择又来到面前。':
    '随后，那时的选择又来到面前。',240,214,8,MUTED,'center');
 }else if(replay.stage==='choice'){
  if(n<=6){
   const scene=CHOICE_SCENES[n as MainChoiceId];
   text(p,short(scene.focus,28),43,88,10,INK);
   wrap(p,scene.preview,43,108,265,8,'#536b5b',13);
   memoryChoiceArt(g,p,n,replay.hasPen);
   if(n===3){
    button(g,p,43,141,122,22,replay.hasPen?'带笔 · 换成空手':'空手 · 带上笔',
      ()=>g.toggleMemoryPen());
    text(p,replay.hasPen?'笔在口袋里':'口袋里没有笔',173,147,7,MUTED);
   }else text(p,short(scene.stakes,35),43,143,8,MUTED);
   const options=g.memoryVisibleChoiceIds().map(id=>scene.outcomes.find(outcome=>outcome.trigger.id===id))
     .filter((outcome):outcome is typeof scene.outcomes[number]=>!!outcome);
   options.forEach((outcome,i)=>{
    const count=options.length,one=count===1,four=count>2;
    const x=one?153:43+(i%2)*201,y=four?168+Math.floor(i/2)*27:182;
    const label=short(outcome.action,one?23:20);
    button(g,p,x,y,one?174:193,four?23:27,label,
      ()=>g.chooseMemoryReplay(outcome.trigger.id),one);
   });
   if(n===4)text(p,'琴盖的微光停在手边。',43,162,7,'#849782');
   if(n===6&&g.model.allLit())text(p,'旧时的脚印，仿佛在身后。',43,163,7,'#849782');
  }
 }else if(replay.stage==='response'){
  const scene=n<=6?CHOICE_SCENES[n as MainChoiceId]:null;
  const outcome=scene?.outcomes.find(choice=>choice.trigger.id===replay.selected);
  text(p,outcome?outcome.object+' · '+outcome.action:anchor.object,55,98,9,MUTED);
  p.rect(53,122,374,76,'#e3e9d7');p.rect(53,122,3,76,'#bca26e');
  wrap(p,replay.response||anchor.line,69,144,342,11,INK,19);
  text(p,replay.poem?'诗页正在翻开。':'这一幕会慢慢合上。',240,208,8,MUTED,'center');
 }else{
  p.rect(74,91,332,119,'#fbf7ea');outline(p,74,91,332,119,'#d0c8ac');
  p.line(98,108,382,108,'#d7ceb5');
  const lines=(replay.poem||anchor.line).split('\n');
  lines.forEach((line,i)=>text(p,line,240,126+i*24,12,INK,'center'));
  if(replay.selected)text(p,'这一次 · '+short(replay.response,37),240,192,7,MUTED,'center');
 }
 p.rect(0,238,480,32,'rgba(31,52,45,0.88)');
 text(p,'只在记忆里试一试 · 不改变本局记录或结局',240,248,8,'#eee4c7','center');
}
function memoryKind(kind:MemoryBookCard['kind']){
  return kind==='segment'?'走过的段落':kind==='branch'?'岔开的路':kind==='ending'?'回廊的灯':'故事的背面';
}
function memoryReviewPanel(g:Game,p:Painter){
 const index=Math.floor(g.panelPage/3),step=((g.panelPage%3)+3)%3;
 const review=memoryReviewForSegment(g.profile,String(index+1));
 if(!review){
  text(p,'这一页还没有走过。',240,117,12,MUTED,'center');
  button(g,p,43,224,96,19,'回记忆册',()=>{g.panel='memoryBook';g.panelPage=0;});
  return;
 }
 const detail=()=>{g.panel='memoryBook';g.panelPage=-(index+1);};
 p.rect(42,66,396,146,'#f6f1e4');outline(p,42,66,396,146,'#b9c5b3');
 text(p,'第 '+(index+1)+' 段 · '+review.title,54,76,12,INK);
 text(p,'只重看已经走过的内容',426,79,7,MUTED,'right');
 p.line(53,99,427,99,'#c7cebd');
 if(step===0){
  p.rect(57,111,67,67,'#dce3cf');memoryIcon(p,65,119,51,review.icon,'#435c4d','#f0e3c2');
  text(p,review.object,141,117,11,INK);wrap(p,review.line,141,138,275,9,'#536c5b',15);
  button(g,p,137,181,207,24,index===3?'走过门前 · 再看那时':'碰一碰 · 再看那时',()=>{
   if(review.sound)g.sound(review.sound);
   g.panelPage=index*3+(review.choice?1:2);
  },true);
  button(g,p,43,224,96,19,'回记忆册',detail);
  text(p,index===3?'门前':'物件',240,229,8,MUTED,'center');
 }else if(step===1&&review.choice){
  text(p,review.anchorResponse||review.line,56,113,9,'#536c5b');
  p.line(53,139,427,139,'#d2d8c9');
  text(p,'那时的选择',56,149,8,MUTED);
  text(p,review.choice.object+' · '+review.choice.action,56,165,10,INK);
  button(g,p,137,181,207,24,'照那时走一步',()=>g.panelPage=index*3+2,true);
  button(g,p,43,224,96,19,'上一幕',()=>g.panelPage=index*3);
  text(p,'选择',240,229,8,MUTED,'center');
 }else{
  if(review.choice){
   text(p,review.choice.action,56,110,9,MUTED);
   wrap(p,review.choice.response,56,128,370,9,INK,15);
  }else{
   text(p,review.object,56,115,11,INK);
   text(p,index===6?'这一段没有主抉择。':'那时的选择没有留下记录。',56,141,9,MUTED);
  }
  if(review.poem){
   p.line(53,160,427,160,'#d2d8c9');
   wrap(p,review.poem,80,169,320,9,'#536c5b',14);
  }
  button(g,p,43,224,96,19,'回记忆册',detail);
  button(g,p,230,224,107,19,'完整重跑本章',()=>g.start());
  text(p,review.poem?'诗页':'记忆',185,229,8,MUTED,'center');
 }
}
function memoryBookPanel(g:Game,p:Painter){
 const cards=memoryBookCards(g.profile,g.run),pageCount=memoryBookPageCount(cards);
 let detailIndex=g.panelPage<0?-g.panelPage-1:-1;
 if(detailIndex>=cards.length){g.panelPage=0;detailIndex=-1;}
  if(detailIndex>=0){
   const card=cards[detailIndex];
   const unlockedSegment=card.kind==='segment'&&card.unlocked;
  p.rect(42,66,396,146,card.unlocked?'#f6f1e4':'#e5e9dc');
  outline(p,42,66,396,146,'#b9c5b3');
  if(!p.image('ui.card.memory',58,76,39,50))p.rect(52,76,50,50,card.unlocked?'#dce3cf':'#c8d1c3');
  memoryIcon(p,65,88,24,card.icon,card.unlocked?'#435c4d':'#788b78',card.unlocked?'#f0e3c2':'#dce3d5');
  text(p,memoryKind(card.kind),115,77,7,MUTED);
  text(p,short(card.title,24),115,91,13,card.unlocked?INK:'#718677');
  text(p,card.object,115,111,9,card.unlocked?INK:MUTED);
  text(p,short(card.status.join(' · '),48),115,126,7,MUTED);
  p.line(52,140,428,140,'#c7cebd');
  if(card.unlocked){
   text(p,short(card.question,46),53,146,8,INK);
   text(p,short(card.line,46),53,164,8,'#536c5b');
   p.line(52,180,428,180,'#d2d8c9');
    if(card.echoes.length)card.echoes.slice(0,2).forEach((echo,i)=>
     text(p,short(echo.origin+' · '+echo.text,unlockedSegment?27:48),53,185+i*12,8,INK));
    else text(p,short('这件物的另一面，等下次路过再看。',unlockedSegment?27:48),53,190,8,MUTED);
    if(unlockedSegment)button(g,p,286,184,142,25,'快速重跑本段',()=>{
     if(!g.startMemoryReplay(Number(card.id.slice('segment:'.length))))g.toast('这页记忆还没准备好。');
    },true);
  }else{
   text(p,short(card.line,46),53,151,9,MUTED);
   text(p,'先走过那段路，这一页才会慢慢亮起来。',53,183,8,MUTED);
   }
   button(g,p,43,224,84,19,'回目录',()=>g.panelPage=Math.floor(detailIndex/MEMORY_BOOK_PAGE_SIZE));
    const canReview=unlockedSegment&&!!memoryReviewForSegment(g.profile,card.id.slice('segment:'.length));
   if(canReview){
    button(g,p,133,224,95,19,'记忆重看',()=>{g.panel='memoryReview';g.panelPage=detailIndex*3;});
    button(g,p,233,224,96,19,'完整重跑本章',()=>g.start());
   }else text(p,(detailIndex+1)+' / '+cards.length,239,229,8,MUTED,'center');
   if(card.sound)button(g,p,337,224,100,19,g.settings.muted?'声音已关':'再听一声',()=>g.sound(card.sound),false,g.settings.muted);
  return;
 }
 const page=Math.max(0,Math.min(pageCount-1,g.panelPage));
 const shown=cards.slice(page*MEMORY_BOOK_PAGE_SIZE,(page+1)*MEMORY_BOOK_PAGE_SIZE);
 shown.forEach((card,slot)=>{
  const x=42+(slot%2)*202,y=66+Math.floor(slot/2)*76;
  p.rect(x,y,194,69,card.unlocked?'#f7f2e5':'#e5e9dd');
  outline(p,x,y,194,69,card.unlocked?'#b7c4b0':'#c7d0c2');
  if(!p.image('ui.card.memory',x+11,y+13,31,40))p.rect(x+8,y+16,38,40,card.unlocked?'#dde4d2':'#cbd4c7');
  memoryIcon(p,x+15,y+20,23,card.icon,card.unlocked?'#465f50':'#7f917e',card.unlocked?'#f0e3c2':'#dce4d5');
  text(p,memoryKind(card.kind),x+55,y+6,7,MUTED);
  text(p,short(card.status[0]||'',9),x+185,y+6,7,card.unlocked?'#688169':MUTED,'right');
  text(p,short(card.title,14),x+55,y+19,10,card.unlocked?INK:'#748777');
  text(p,short(card.object,18),x+55,y+36,7,card.unlocked?'#647968':MUTED);
  text(p,short(card.line,18),x+55,y+51,7,card.unlocked?'#6b806d':MUTED);
  g.button(x,y,194,69,'记忆:'+card.id,()=>g.panelPage=-(page*MEMORY_BOOK_PAGE_SIZE+slot+1));
 });
 button(g,p,43,224,63,19,'上一页',()=>g.panelPage=Math.max(0,page-1),false,page===0);
 text(p,'第 '+(page+1)+' / '+pageCount+' 页',240,229,8,MUTED,'center');
 button(g,p,374,224,63,19,'下一页',()=>g.panelPage=Math.min(pageCount-1,page+1),false,page===pageCount-1);
}
function panel(g:Game,p:Painter){
 // Panels are drawn as found paper from the same school corridor instead of
 // swapping in unrelated high-resolution watercolor plates. The small rules,
 // corner tape and ink stamp give each screen a tactile, authored surface.
 p.rect(0,0,480,270,'rgba(24,42,36,0.56)');
 p.rect(27,20,432,236,'rgba(20,38,32,0.26)');
 p.rect(24,16,432,236,'#f1eddd');
 p.rect(28,20,424,228,'#f8f3e4');
 p.rect(28,20,4,228,'#d7c79d');
 for(let y=69;y<243;y+=18)p.line(36,y,448,y,'rgba(167,177,157,0.11)');
 p.rect(36,20,412,38,'rgba(220,225,205,0.72)');
 p.rect(36,20,6,38,'#5f7968');
 p.rect(421,21,21,5,'#d5be80');
 p.rect(427,26,15,3,'#bd8e67');
 outline(p,24,16,432,236,'#829886');
 outline(p,27,19,426,230,'#c2cbb8');
 p.rect(25,17,430,1,'#fffbee');p.rect(25,18,1,232,'#fffbee');
 p.rect(25,250,430,1,'#b9bca5');
 for(const y of [79,151,224]){p.rect(32,y,2,5,'#c6b88f');p.rect(34,y+1,1,3,'#fffae7');}
 const labels:any={achievements:'走过的路 · 成就墙',memoryBook:'学堂 · 记忆册',memoryReview:'学堂 · 记忆重看',shop:'回廊小卖部',wardrobe:'换一件旧衣裳',chapters:'五个节气 · 一条人生',settings:'设置与操作'};
 text(p,labels[g.panel]||'回廊',48,31,16,INK);
 text(p,g.panel==='shop'?'道具 / 收好再出发':g.panel==='wardrobe'?'衣柜 / 试穿':g.panel==='settings'?'声音 · 动作 · 操作':'小满的旧纸页',300,31,7,'#657b68','right');
 p.rect(407,25,31,4,'#d4bd79');
 p.circle(414,30,2,'#a57356');p.circle(431,30,2,'#718c73');
 button(g,p,410,28,28,21,'×',()=>g.panel='');
 p.line(42,57,438,57,'#9caf99');
  if(g.panel==='memoryBook'){memoryBookPanel(g,p);return;}
  if(g.panel==='memoryReview'){memoryReviewPanel(g,p);return;}
 if(g.panel==='achievements'){
  const page=g.panelPage;const rows=ACHIEVEMENTS.slice(page*5,page*5+5);
  p.rect(42,64,396,19,'rgba(213,223,204,0.58)');
  text(p,'黑板上的小记号',53,70,8,'#526c5b');
  text(p,g.profile.achievements.length+' / '+ACHIEVEMENTS.length+' 已留下',425,70,7,'#718477','right');
  rows.forEach((a,i)=>{const y=91+i*27,done=g.profile.achievements.includes(a.id),art=ACHIEVEMENT_ART[a.id];
   p.line(43,y+22,437,y+22,'rgba(160,174,155,0.35)');
   if(!art||!p.image(`props.achievements.${art}.${done?'active':'normal'}`,47,y-3,20,20))p.circle(55,y+5,4,done?GOLD:'#b9c3b3');
   if(done)p.image('ui.icon.check.active',61,y-2,10,10);
   text(p,a.name,78,y,10,done?INK:MUTED);text(p,short(a.condition,52),78,y+13,7,'#7d8d7b');
   text(p,done?'已记下':'还在路上',425,y+6,7,done?'#98764a':'#9aa79a','right');});
  text(p,'每一盏灯，都是走过之后才会留下的。',240,229,8,INK,'center');
  button(g,p,43,224,52,19,'上一页',()=>g.panelPage=Math.max(0,page-1),false,page===0);
  button(g,p,385,224,52,19,'下一页',()=>g.panelPage=Math.min(3,page+1),false,page===3);
 }
 if(g.panel==='shop'){
  text(p,'碎片 '+g.profile.fragments+'    糖纸 '+g.profile.wrappers,42,66,9,INK);
  const names:any={rewind:'回溯时光',feather:'复活羽毛',shield:'护盾',magnet:'磁铁',eraser:'黑板擦'};
  const desc:any={rewind:'命用尽时，自动回到本段开头。',feather:'时光不可用时，原地回满三颗心。',shield:'本段下一次碰撞，由它挡下。',magnet:'这一段的碎片会靠得更近。',eraser:'擦去前方一小片障碍。'};
  Object.keys(ITEM_PRICES).forEach((id,i)=>{const y=85+i*28,shortOnFragments=g.profile.fragments<ITEM_PRICES[id];
   const icon=id==='rewind'?'rewind':id==='feather'?'feather':id;
   p.image(`ui.icon.${icon}.${g.profile.inventory[id]>0?'active':'normal'}`,43,y-2,15,15);
   text(p,names[id],63,y,10);text(p,desc[id],145,y,8,MUTED);text(p,'持有 '+g.profile.inventory[id],145,y+11,6,MUTED);
    if(shortOnFragments)text(p,'碎片不足',283,y+11,7,'#a76b57');
    button(g,p,362,y-2,74,23,ITEM_PRICES[id]+' 碎片',()=>{if(g.model.buy(id))g.toast('收好。下一局，带着它出发。');else g.toast('碎片还不够。');},false,shortOnFragments);});
  text(p,'每件道具一局最多使用一次。',43,233,7,MUTED);
 }
 if(g.panel==='wardrobe'){
  // A quiet fitting nook makes a purchase legible before the player commits.
  p.rect(248,64,82,83,'rgba(221,229,211,0.72)');
  outline(p,248,64,82,83,'#aebda9');
  p.rect(249,65,80,1,'#faf6e8');p.rect(249,66,2,80,'#c5cfb9');
  p.line(258,85,320,85,'#a4b49f');
  p.line(268,86,268,91,'#a4b49f');p.poly([[268,91],[262,96],[274,96]],'#b6c1ad');
  p.line(258,130,320,130,'#8b9b88',2);
  character(g,p,289,130,.62,false);
  text(p,'当前穿着',289,70,7,'#607666','center');
  const equippedSkin=g.profile.equippedSlots?.skin||g.profile.equipped;
  text(p,short(COSMETICS.find(c=>c.id===equippedSkin)?.name||'校服',12),289,137,7,INK,'center');
  const rows=COSMETICS.slice(g.panelPage*5,g.panelPage*5+5);
  rows.forEach((c,i)=>{const y=69+i*29,owned=g.profile.cosmetics.includes(c.id),equipped=(g.profile.equippedSlots?.[c.kind]||g.profile.equipped)===c.id,shortOnWrappers=!owned&&c.price>=0&&g.profile.wrappers<c.price;
   text(p,c.name,44,y+3,10);text(p,c.price<0?'墙后的纪念物':c.kind==='skin'?'衣服':c.kind==='frame'?'头像框':'挂件',197,y+4,7,MUTED);
   if(shortOnWrappers)text(p,'糖纸不足',197,y+15,7,'#a76b57');
   button(g,p,345,y,91,23,equipped?'穿在身上':owned?'换上':c.price<0?'尚未找到':c.price+' 糖纸',()=>{if(owned){g.model.equip(c.id);g.toast('这一次，穿着它走。');}else if(g.model.buy(c.id))g.toast('已收进衣柜。');else g.toast('糖纸还不够。');},equipped,!owned&&(c.price<0||shortOnWrappers));
  });
  text(p,'挂件和头像框只改变外观。',43,212,7,MUTED);
  button(g,p,43,224,52,19,'上一页',()=>g.panelPage=Math.max(0,g.panelPage-1),false,g.panelPage===0);
  button(g,p,385,224,52,19,'下一页',()=>g.panelPage=Math.min(2,g.panelPage+1),false,g.panelPage===2);
 }
 if(g.panel==='chapters'){
  (CHAPTERS as any[]).forEach((c,i)=>{const y=71+i*31;
    p.image(c.available?'ui.icon.check.active':'ui.icon.lock.normal',43,y-1,14,14);
    text(p,['一','二','三','四','终'][i],61,y,10,MUTED);text(p,c.season+' · '+c.name,82,y,11,c.available?INK:MUTED);
    text(p,c.available?(g.checkpointState.available?'重新开始会覆盖本局存档。':'从昨天刚告别的地方出发。'):['','开始忙，开始承担。','天开始凉，开始失去。','第一次真的冻着。','最长的夜。'][i],82,y+14,7,MUTED);
    button(g,p,352,y-2,82,24,c.available?(g.checkpointState.available?'重新开始':'推门出发'):'尚待书写',()=>{if(c.available)g.start();},c.available,!c.available);
  });
 }
 if(g.panel==='settings'){
  button(g,p,43,72,175,26,g.settings.muted?'声音：关闭':'声音：开启',()=>{g.settings.muted=!g.settings.muted;g.profile.settings=g.settings;g.model.save();g.hooks.setting?.('muted',g.settings.muted);},false,false,`ui.icon.sound.${g.settings.muted?'normal':'active'}`);
  button(g,p,237,72,198,26,g.settings.reducedMotion?'动态效果：减弱':'动态效果：标准',()=>{g.settings.reducedMotion=!g.settings.reducedMotion;g.profile.settings=g.settings;g.model.save();},false,false,`ui.icon.motion.${g.settings.reducedMotion?'active':'normal'}`);
  text(p,'手机',44,117,10);wrap(p,'轻点跳跃，空中再点二段跳。\n地面下滑滑铲，空中下滑急坠。',108,115,300,9,INK,15);
  text(p,'键盘',44,159,10);wrap(p,'空格 / ↑ 跳跃，↓ 下滑，E 长按。\n1 / 2 / 3 使用道具，Esc 暂停。',108,157,300,9,INK,15);
  p.line(42,193,438,193,'#c7cebd');
  text(p,'段首自动存档；暂停可查看位置，回廊可继续存档。',44,207,8,MUTED);
  text(p,'雨声、脚步和门轴声会随场景出现。',44,229,7,'#6e8172');
 }
}
export function drawGame(g:Game,p:Painter){
 p=coreImagePainter(p);
 if(g.phase==='corridorTransition')corridorTransition(g,p);
 else if(g.screen==='hall')hall(g,p);else if(g.screen==='memory')memoryPlay(g,p);else play(g,p);
 if(g.panel){g.buttons=[];panel(g,p);}
 if(g.paused&&g.screen!=='memory'){g.buttons=[];
  const checkpoint=g.checkpointState;
  const ongoing=g.run.active&&!g.replayEnding;
  const checkpointLine=checkpoint.failed?'保存未成功，请保持窗口开启。':checkpoint.saved?'已保存至：'+short(checkpoint.location,20):ongoing?'尚未到达存档点':'暂无进行中的存档';
  const checkpointDetail=checkpoint.failed?'可重试保存；先不要关闭窗口。':checkpoint.available?checkpoint.detail:ongoing?'进入跑段后，段首会自动保存。':'已解锁的记忆会留在回廊。';
  const checkpointInk=checkpoint.failed?'#9c5847':MUTED;
  const expanded=!(g.phase==='corridorTransition'||g.phase==='ending'&&!g.replayEnding);
  const panelY=expanded?35:59,panelH=expanded?201:152;
  p.rect(0,0,480,270,'rgba(23,40,34,0.65)');
  p.rect(115,panelY,250,panelH,'#eeeade');
  p.rect(115,panelY,250,4,'#5c7565');p.rect(115,panelY+4,250,2,'#cfac68');
  outline(p,115,panelY,250,panelH,'#a4b6a1',2);
  if(g.phase==='corridorTransition'){
   text(p,'回到回廊的路，停在此刻。',240,82,13,INK,'center');
   button(g,p,148,122,185,25,'继续回到回廊',()=>g.paused=false,true);
   button(g,p,148,157,185,25,'直接进入回廊',()=>g.toHall());
  }else if(g.phase==='ending'&&g.endingMediaStatus==='failed'&&g.endingFallbackBlocked){
   text(p,'这段记忆暂时没有载入。',240,82,14,INK,'center');
   button(g,p,139,122,202,24,'重新播放',()=>g.retryEndingMedia(),true);
   button(g,p,139,157,202,24,'回到回廊',()=>g.cancelEndingMedia());
  }else if(g.phase==='ending'&&!g.replayEnding){
   text(p,'这一段记忆，还在继续。',240,82,14,INK,'center');
   button(g,p,148,122,185,25,'继续观看',()=>{g.exitConfirm=false;g.paused=false;},true);
   text(p,'完整看完后，这段记忆才会亮起。',240,165,8,MUTED,'center');
  }else if(g.exitConfirm){
   const inHall=g.screen==='hall';
   text(p,inHall?'要退出游戏吗？':'要在这里休息吗？',240,54,14,INK,'center');
   text(p,checkpointLine,240,79,8,checkpointInk,'center');
   text(p,checkpointDetail,240,93,8,MUTED,'center');
   button(g,p,139,117,202,24,inHall?'留在回廊':'继续游戏',()=>{g.exitConfirm=false;g.paused=false;},true);
   if(inHall){
    if(checkpoint.available)button(g,p,139,149,202,24,'继续存档',()=>g.continueCheckpoint());
    button(g,p,139,checkpoint.available?181:149,202,24,'退出游戏',()=>g.exitGame());
   }
   else{
    button(g,p,139,149,202,24,'保存存档点',()=>g.saveCheckpoint(),false,!checkpoint.available);
    button(g,p,139,181,97,24,'返回回廊',()=>g.toHall());
    button(g,p,244,181,97,24,'退出游戏',()=>g.exitGame());
   }
  }else{
   text(p,'在这里，歇一歇。',240,54,15,INK,'center');
   text(p,checkpointLine,240,79,8,checkpointInk,'center');
   text(p,checkpointDetail,240,93,8,MUTED,'center');
   button(g,p,148,113,185,23,'继续向前',()=>g.paused=false,true);
   button(g,p,148,142,185,23,'保存存档点',()=>g.saveCheckpoint(),false,!checkpoint.available);
   button(g,p,148,171,185,23,checkpoint.available?'返回回廊 · 保留存档':'返回回廊',()=>g.exitConfirm=true);
   button(g,p,148,200,185,23,'退出游戏',()=>{g.exitConfirm=true;});
  }
  if(expanded&&g.checkpointFeedback)text(p,short(g.checkpointFeedback,28),240,226,7,checkpointInk,'center');
 }
 if(!g.paused&&g.noticeTime>0&&g.notice){
  if(g.panel){p.rect(235,26,164,25,'rgba(53,73,65,0.95)');text(p,short(g.notice,20),317,34,8,'#f3e6c5','center');}
  else if(g.screen==='play'){
   const ink=['night','hell','graduate'].includes(g.theme)?'#eddfbc':INK;
   p.rect(112,224,256,17,['night','hell','graduate'].includes(g.theme)?'rgba(24,43,50,0.56)':'rgba(236,234,215,0.56)');
   text(p,short(g.notice,34),240,228,8,ink,'center');
  }
 }
 if((g.screen==='play'||g.screen==='memory')&&!g.paused&&!g.panel)for(const ripple of g.inputRipples){
  const t=1-ripple.time/ripple.duration,r=5+t*13;
  // The replay paper has room above its choice controls for the full ripple.
  const x=g.screen==='memory'?Math.max(44,Math.min(436,ripple.x)):ripple.x;
  const y=g.screen==='memory'?Math.max(100,Math.min(122,ripple.y)):ripple.y;
  p.circle(x,y,r,ripple.kind==='blocked'?'rgba(184,91,76,0.25)':'rgba(218,204,151,0.23)');
  p.circle(x,y,3,ripple.kind==='blocked'?'#b76f5b':'#d9c991');
 }
}
