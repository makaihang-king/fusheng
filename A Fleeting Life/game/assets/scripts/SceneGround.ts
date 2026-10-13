import type { Painter } from './Painter';
import { SCENE_SCROLL_CHUNK_COUNTS, SCENE_SCROLL_TILE_WIDTH, SCENE_SCROLL_TILE_STRIDE } from './Content';

// Color percentiles sampled from the bottom 36 physical rows of the supplied scene tiles.
const MATERIAL:Record<string,readonly string[]>={
  dawn:['#77695d','#776c68','#776c68','#776c68','#91796a'],
  rain:['#292f38','#343a3f','#38414b','#4e5152','#5e6165'],
  noon:['#80654d','#917256','#b18f6a','#ddbf85','#f0ce96'],
  gray:['#47525b','#535962','#556069','#5a676c','#60696e'],
  dusk:['#7c6c61','#7c6e72','#7c6e74','#856f74','#c09174'],
  night:['#05132c','#05132c','#08142e','#0d182e','#101b2e'],
  graduate:['#434544','#4f4a47','#5b5553','#5b5553','#8d7f75'],
  alley:['#666e79','#666e79','#6b737b','#6b737b','#6e757f'],
  playground:['#cf5e40','#d36d4c','#d89671','#d9a581','#e5c9a4'],
  dream:['#d3c6dc','#d3c6dc','#d3c6dc','#d3c6dc','#d6c8df'],
  heaven:['#515657','#515657','#5c605e','#696862','#988773'],
  hell:['#524d4d','#524d4d','#54504e','#54504f','#57504f'],
};
export const SCENE_FLOOR_TOP=205;
const height=270-SCENE_FLOOR_TOP,strip=18;

/** Reuse actual pavement/boards below the background's old floor, at their original pixel density. */
export function drawSceneGround(p:Painter,name:string,scroll:number){
  const count=(SCENE_SCROLL_CHUNK_COUNTS as Record<string,number>)[name]||0;
  const total=SCENE_SCROLL_TILE_WIDTH+(count-1)*SCENE_SCROLL_TILE_STRIDE,max=Math.max(0,total-480);
  const camera=count?Math.max(0,Math.min(max,scroll<0?max+scroll:scroll)):0;
  let ready=!!p.imageRegion;
  for(let band=0,yy=SCENE_FLOOR_TOP;yy<270;band++,yy+=strip){
    const h=Math.min(strip,270-yy),offset=Math.min(max,camera+band*29);
    const first=count?Math.floor(offset/SCENE_SCROLL_TILE_STRIDE):0;
    for(let tile=first;tile<(count?Math.min(count,first+2):1);tile++){
      const x=count?tile*SCENE_SCROLL_TILE_STRIDE-offset:0,w=count?SCENE_SCROLL_TILE_WIDTH:480;
      if(x+w<=0||x>=480)continue;
      const key=count?`scene.scroll.${name}.${String(tile).padStart(2,'0')}`:`scene.pixel.${name}`;
      const shown=p.imageRegion?.(key,0,252/270,1,h/270,x,yy,w,h)??false;
      ready=shown&&ready;
    }
  }
  if(!ready){
    const colors=MATERIAL[name]||MATERIAL.dawn,boards=['noon','gray','dusk','night','dream'].includes(name);
    p.rect(0,SCENE_FLOOR_TOP,480,height,colors[2]);
    const cell=boards?67:43,rowHeight=boards?11:13;
    for(let row=0,yy=SCENE_FLOOR_TOP;yy<270;row++,yy+=rowHeight){
      const start=Math.floor((scroll+row*cell*.5)/cell);
      for(let i=start;i<start+Math.ceil(480/cell)+2;i++){
        const xx=Math.floor(i*cell-scroll-row*cell*.5),h=Math.min(rowHeight,270-yy);
        p.rect(xx,yy,cell-1,h-1,colors[(Math.abs(i*7+row*3)%3)+1]);
        p.rect(xx,yy,cell-2,1,colors[4]);p.rect(xx+cell-2,yy,1,h,colors[0]);
        if((i+row)%3===0)p.rect(xx+9,yy+3,boards?17:5,1,colors[0]);
      }
    }
  }
  // A broad contact plane, with a shallow back edge rather than a debug baseline.
  p.rect(0,SCENE_FLOOR_TOP,480,2,'rgba(32,37,33,0.19)');
  p.rect(0,SCENE_FLOOR_TOP+2,480,1,'rgba(246,230,191,0.13)');
}
