import type { Game } from './Game';
import type { Painter } from './Painter';
import { SCENE_SCROLL_CHUNK_COUNTS, SCENE_SCROLL_TILE_STRIDE, SCENE_SCROLL_TILE_WIDTH } from './Content';
import { RUN_SPEED } from './Geometry';

export interface SceneryBounds {left:number;top:number;right:number;bottom:number}
/** The same signed distance drives the authored scene, its outer edges and the feet. */
export function sceneTravel(g:Game):number{
  const choiceTime=g.phase==='seat'?g.chairFreezeTime:g.phaseTime;
  const choiceTravel=(g.phase==='choice'||g.phase==='seat')?choiceTime:g.phase==='alleyExit'?g.phaseTime:0;
  return g.phase==='reverse'?-Math.max(.001,g.phaseTime*80):
    g.phase==='hell'?g.phaseTime*RUN_SPEED:g.phase==='reward'?g.rewardClock()*RUN_SPEED:
    (g.phase==='choice'||g.phase==='seat')&&[2,4,6].includes(g.choice)?choiceTime*RUN_SPEED:
    g.phase==='piano'?0:(g.time+choiceTravel)*RUN_SPEED;
}
function plane(p:Painter,key:string,x:number,width:number,b:SceneryBounds,opacity=1):boolean{
  const left=Math.max(x,b.left),right=Math.min(x+width,b.right);
  if(right<=left)return true;
  const sx=(left-x)/width,sw=(right-left)/width;
  let ready=true;
  const top=Math.max(0,b.top),bottom=Math.min(270,b.bottom);
  if(bottom>top)ready=(p.imageRegion?.(key,sx,top/270,sw,(bottom-top)/270,left,top,right-left,bottom-top,opacity)??false)&&ready;
  // Extend actual edge pixels into surplus sky/ceiling and pavement. Their
  // horizontal pattern follows the same world tile, including the four corners.
  if(b.top<0)ready=(p.imageRegion?.(key,sx,0,sw,1/270,left,b.top,right-left,-b.top,opacity)??false)&&ready;
  if(b.bottom>270)ready=(p.imageRegion?.(key,sx,269/270,sw,1/270,left,270,right-left,b.bottom-270,opacity)??false)&&ready;
  return ready;
}
function edgePlane(p:Painter,key:string,left:number,right:number,sourceWidth:number,sourceLeft:number,b:SceneryBounds,opacity=1):boolean{
  if(!p.imageRegion||right<=left||sourceWidth<=0)return true;
  const sx=Math.max(0,Math.min(1,sourceLeft/sourceWidth)),sw=Math.min(1/sourceWidth,1-sx);
  const x0=Math.max(left,b.left),x1=Math.min(right,b.right);if(x1<=x0)return true;
  let ready=true;const top=Math.max(0,b.top),bottom=Math.min(270,b.bottom);
  if(bottom>top)ready=(p.imageRegion(key,sx,top/270,sw,(bottom-top)/270,x0,top,x1-x0,bottom-top,opacity))&&ready;
  if(b.top<0)ready=(p.imageRegion(key,sx,0,sw,1/270,x0,b.top,x1-x0,-b.top,opacity))&&ready;
  if(b.bottom>270)ready=(p.imageRegion(key,sx,269/270,sw,1/270,x0,270,x1-x0,b.bottom-270,opacity))&&ready;
  return ready;
}
function repeating(p:Painter,key:string,width:number,offset:number,b:SceneryBounds,opacity=1):boolean{
  if(!p.imageRegion||!p.image(key,0,0,1,1,0))return false;
  // A repeating plate is still a finite authored image. Once its visible
  // edge reaches the logical canvas, continue that same edge instead of
  // wrapping the plate's far end into the margin.
  const x=-offset,right=x+width;let ready=true;
  if(right>b.left&&x<b.right)ready=plane(p,key,x,width,b,opacity)&&ready;
  if(b.left<x)ready=edgePlane(p,key,b.left,Math.min(x,b.right),width,0,b,opacity)&&ready;
  if(b.right>right)ready=edgePlane(p,key,Math.max(right,b.left),b.right,width,width-1,b,opacity)&&ready;
  return ready;
}
function scroll(p:Painter,name:string,distance:number,b:SceneryBounds):boolean{
  const count=(SCENE_SCROLL_CHUNK_COUNTS as Record<string,number>)[name]||0;
  if(!count||!p.imageRegion)return repeating(p,`scene.pixel.${name}`,480,0,b);
  const max=SCENE_SCROLL_TILE_WIDTH+(count-1)*SCENE_SCROLL_TILE_STRIDE-480;
  const camera=Math.max(0,Math.min(max,distance<0?max+distance:distance));
  const first=Math.floor((camera+b.left)/SCENE_SCROLL_TILE_STRIDE),last=Math.ceil((camera+b.right)/SCENE_SCROLL_TILE_STRIDE);
  const entries:Array<{key:string;x:number}>=[];let ready=true;
  for(let tile=first;tile<last;tile++){
    // Do not modulo out-of-range tiles. At the world boundaries the outer
    // screen should continue the boundary tile, never jump to the opposite
    // end of the authored route.
    if(tile<0||tile>=count)continue;
    const key=`scene.scroll.${name}.${String(tile).padStart(2,'0')}`;
    entries.push({key,x:tile*SCENE_SCROLL_TILE_STRIDE-camera});
    ready=p.image(key,0,0,1,1,0)&&ready;
  }
  // Native rendering asks for left and right bands separately. At an exact
  // world boundary that band contains no in-range tile at all, so seed the
  // corresponding boundary tile solely for its edge extension.
  if(!entries.length){
    if(camera<=0&&b.right<=0){
      const key=`scene.scroll.${name}.00`;
      entries.push({key,x:0});ready=p.image(key,0,0,1,1,0)&&ready;
    }else if(camera>=max&&b.left>=480){
      const index=count-1,key=`scene.scroll.${name}.${String(index).padStart(2,'0')}`;
      entries.push({key,x:index*SCENE_SCROLL_TILE_STRIDE-camera});ready=p.image(key,0,0,1,1,0)&&ready;
    }
  }
  if(!ready)return repeating(p,`scene.pixel.${name}`,480,0,b);
  for(const entry of entries)ready=plane(p,entry.key,entry.x,SCENE_SCROLL_TILE_WIDTH,b)&&ready;
  const firstEntry=entries[0],lastEntry=entries[entries.length-1];
  if(firstEntry){
    const firstRight=firstEntry.x;
    if(b.left<firstRight)ready=edgePlane(p,firstEntry.key,b.left,Math.min(firstRight,b.right),SCENE_SCROLL_TILE_WIDTH,0,b)&&ready;
  }
  if(lastEntry){
    const lastRight=lastEntry.x+SCENE_SCROLL_TILE_WIDTH;
    if(b.right>lastRight)ready=edgePlane(p,lastEntry.key,Math.max(lastRight,b.left),b.right,SCENE_SCROLL_TILE_WIDTH,SCENE_SCROLL_TILE_WIDTH-1,b)&&ready;
  }
  return ready;
}
/** Draw the real pixel artwork in surplus screen space, with stable tile coverage. */
export function drawSceneBackdrop(g:Game,p:Painter,b:SceneryBounds):boolean{
  if(b.right<=b.left||b.bottom<=b.top)return false;
  if(g.screen==='hall'||g.phase==='corridorTransition'){
    const key=p.image('scene.pixel.corridor',0,0,1,1,0)?'scene.pixel.corridor':
      p.image('scene.pixel.corridor.legacy',0,0,1,1,0)?'scene.pixel.corridor.legacy':'scene.pixel.corridor';
    return repeating(p,key,480,0,b);
  }
  if(g.phase==='ending'||g.phase==='finale')return false;
  const ph=g.phase;
  if(ph==='choice'||ph==='seat'||ph==='piano'||ph==='alleyExit'){
    const id=ph==='piano'?4:ph==='alleyExit'?'alley':g.choice;
    const frame=typeof id==='number'?String(id).padStart(2,'0'):id,key=`scene.choice.${frame}`;
    const at=ph==='seat'?g.chairFreezeTime:ph==='piano'?0:g.phaseTime;
    const offset=Math.min(800,Math.max(0,at*RUN_SPEED)),blend=id===4?1:Math.min(1,Math.max(0,at/.65));
    const previous=ph==='alleyExit'?'alley':id===2?'rain':id===6?(g.reward||'heaven'):id===3?'noon':id===5?'dusk':'dawn';
    const available=p.image(key,0,0,1,1,0);let old=false;
    if(blend<1||!available)old=scroll(p,previous,(id===6?60:g.time)*RUN_SPEED+at*RUN_SPEED,b);
    return available?repeating(p,key,1280,offset,b,old?blend:1)||old:old;
  }
  return scroll(p,g.branch||g.theme,g.settings.reducedMotion?0:sceneTravel(g),b);
}
