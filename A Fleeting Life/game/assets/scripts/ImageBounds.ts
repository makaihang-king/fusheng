import type { Painter } from './Painter';

const painters=new WeakMap<Painter,Painter>();
/** Both hosts use the authored canvas boundary, including images wider than it. */
export function coreImagePainter(source:Painter):Painter{
  const existing=painters.get(source);if(existing)return existing;
  const region=(key:string,sx:number,sy:number,sw:number,sh:number,x:number,y:number,w:number,h:number,opacity=1):boolean=>{
    if(![sx,sy,sw,sh,x,y,w,h,opacity].every(Number.isFinite)||w<=0||h<=0||sw<=0||sh<=0)return false;
    const x0=Math.max(0,x),y0=Math.max(0,y),x1=Math.min(480,x+w),y1=Math.min(270,y+h);
    if(x1<=x0||y1<=y0)return false;
    return source.imageRegion?.(key,sx+(x0-x)/w*sw,sy+(y0-y)/h*sh,(x1-x0)/w*sw,(y1-y0)/h*sh,x0,y0,x1-x0,y1-y0,opacity)??false;
  };
  const painter:Painter={
    rect(x,y,w,h,c){source.rect(x,y,w,h,c);},
    line(x1,y1,x2,y2,c,w){source.line(x1,y1,x2,y2,c,w);},
    circle(x,y,r,c){source.circle(x,y,r,c);},
    poly(points,c){source.poly(points,c);},
    text(value,x,y,size,c,align){source.text(value,x,y,size,c,align);},
    image(key,x,y,w,h,opacity=1){
      // Invisible probes may request the next scene before it enters the canvas.
      if(opacity<=0)return source.image(key,x,y,w,h,0);
      if(![x,y,w,h,opacity].every(Number.isFinite)||w<=0||h<=0)return false;
      if(x+w<=0||x>=480||y+h<=0||y>=270)return false;
      if(x>=0&&y>=0&&x+w<=480&&y+h<=270)return source.image(key,x,y,w,h,opacity);
      // Legacy test/fallback painters have no region API; both actual hosts do.
      return source.imageRegion?region(key,0,0,1,1,x,y,w,h,opacity):source.image(key,x,y,w,h,opacity);
    },
    imageRegion(key,sx,sy,sw,sh,x,y,w,h,opacity=1){return region(key,sx,sy,sw,sh,x,y,w,h,opacity);},
    video:source.video?.bind(source),
  };
  painters.set(source,painter);return painter;
}
