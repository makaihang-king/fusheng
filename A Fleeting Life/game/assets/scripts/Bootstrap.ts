import { _decorator, Component, Node, Canvas, Camera, UITransform, Graphics, Label, Color, Rect, Layers, view, ResolutionPolicy, input, Input, EventTouch, EventMouse, EventKeyboard, KeyCode, sys, resources, Font, SpriteFrame, Sprite, AudioClip, AudioSource, director, Director, RenderTexture, native, assetManager, ImageAsset, Texture2D, VideoPlayer, VideoClip, profiler, game as engineGame, Game as EngineGame } from 'cc';
import { Game } from './Game';
import { Painter, EndingVideoState } from './Painter';
import { ART_MANIFEST, ART_PIXEL_DENSITY, ENDING_MEDIA } from './Content';
import { BrowserMoments } from './WebMoments';
import { VideoReplayEvidence } from './ReplayEvidence';
import { coreViewport, pointInCore } from './Viewport';
import { drawSceneBackdrop } from './SceneBackdrop';
import { MusicVoice, SceneMusicBackend, SceneMusicController, SceneMusicId } from './SceneMusic';
const { ccclass } = _decorator;
// Keep only a short history of art frames; the game streams one pose group at a time.
const MARGIN_COLORS:Record<string,string>={hall:'#344941',dawn:'#a9b4a1',rain:'#739293',noon:'#c4ab74',gray:'#91a69b',dusk:'#9e7d74',night:'#1a303f',graduate:'#3b6568',dream:'#655679',heaven:'#d4c18d',hell:'#281e26'};
type MarginPalette=readonly [string,string,string,string,string];
// Match the scenery bands in Renderer: sky, distant wall, near wall, ground, highlight.
const MARGIN_PALETTES:Record<string,MarginPalette>={
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
function coreRect(canvas:HTMLCanvasElement){const r=canvas.getBoundingClientRect(),scale=Math.min(r.width/480,r.height/270);return {left:r.left+(r.width-480*scale)/2,top:r.top+(r.height-270*scale)/2,width:480*scale,height:270*scale};}
function color(value:string):Color {
  if(value.startsWith('rgb')){const parts=value.match(/[\d.]+/g)!.map(Number);return new Color(parts[0],parts[1],parts[2],parts.length>3?parts[3]*255:255);}
  return new Color().fromHEX(value);
}
function marginRect(p:Painter,left:number,right:number,x:number,y:number,w:number,h:number,fill:string){
  const x0=Math.max(left,x),x1=Math.min(right,x+w);
  if(x1>x0&&h>0)p.rect(x0,y,x1-x0,h,fill);
}
function drawHallMargin(p:Painter,left:number,right:number){
  const width=right-left,ceiling=(x:number)=>50-x*18/480,floor=(x:number)=>218-x*17/480;
  p.rect(left,0,width,270,'#e9e9dd');
  p.poly([[left,ceiling(left)],[right,ceiling(right)],[right,floor(right)],[left,floor(left)]],'#dce2d5');
  p.poly([[left,floor(left)],[right,floor(right)],[right,270],[left,270]],'#c9d1c2');
  p.line(left,floor(left),right,floor(right),'#adbcac');
  for(let x=left+8;x<right;x+=66){
    marginRect(p,left,right,x,108,37,96,'#b8c6b7');
    marginRect(p,left,right,x+4,113,29,87,'#e8dcc1');
    marginRect(p,left,right,x+13,134,11,66,'#849a87');
    marginRect(p,left,right,x+16,137,5,61,'#d2c5a6');
    marginRect(p,left,right,x+2,103,33,3,'#91a893');
    marginRect(p,left,right,x+12,94,13,3,'#a6b8a5');
    marginRect(p,left,right,x+16,90,5,5,'#e9d9a6');
    marginRect(p,left,right,x+5,211,29,3,'#adbcac');
  }
  for(let x=left+20;x+14<right;x+=38)p.line(x,floor(x)+4,x+14,270,'#bdc8b9');
}
function drawPlayMargin(p:Painter,g:Game,left:number,right:number){
  const width=right-left,pal=MARGIN_PALETTES[g.theme]||MARGIN_PALETTES.dawn;
  const indoor=['gray','dusk','night'].includes(g.theme)||((g.phase==='choice'||g.phase==='seat')&&g.choice>=2)||g.phase==='piano';
  p.rect(left,0,width,270,pal[0]);
  if(indoor){p.rect(left,49,width,148,pal[1]);p.rect(left,191,width,25,pal[2]);}
  else if(!['dream','heaven','hell'].includes(g.theme))p.rect(left,177,width,29,pal[2]);
  if(g.theme==='gray'&&!g.branch)p.rect(left,54,width,143,'rgba(181,194,182,0.58)');
  if(g.theme==='graduate')p.rect(left,38,width,129,`rgba(245,224,179,${(Math.min(1,g.sceneTime/24)*.25).toFixed(3)})`);
  if(g.theme==='hell'&&g.phaseTime<8&&left<0)p.rect(left,0,width,216,'rgba(31,26,43,0.27)');

  const drift=g.settings.reducedMotion?0:Math.floor((g.time||g.phaseTime)*5)%70;
  for(let x=left+9-drift;x<right;x+=70){
    if(g.theme==='hell'){
      marginRect(p,left,right,x+10,111,25,105,pal[1]);
      marginRect(p,left,right,x+15,90,15,125,pal[2]);
      marginRect(p,left,right,x+20,80,5,18,pal[4]);
      marginRect(p,left,right,x+3,153,5,5,'#aa6550');
    }else if(g.theme==='dream'||g.theme==='heaven'){
      marginRect(p,left,right,x,96,51,8,pal[1]);
      marginRect(p,left,right,x+9,86,31,12,pal[1]);
      marginRect(p,left,right,x+6,166,43,5,pal[2]);
      marginRect(p,left,right,x+16,154,21,12,pal[2]);
      if(g.theme==='heaven')marginRect(p,left,right,x+23,67,3,87,'rgba(255,252,221,0.28)');
    }else if(indoor){
      marginRect(p,left,right,x,67,51,91,pal[3]);
      marginRect(p,left,right,x+5,72,41,77,g.theme==='night'?'#243e54':pal[4]);
      marginRect(p,left,right,x+24,72,3,77,pal[2]);
      marginRect(p,left,right,x+5,109,41,3,pal[2]);
      marginRect(p,left,right,x-4,154,59,5,pal[2]);
      marginRect(p,left,right,x+7,199,37,3,pal[3]);
    }else if(g.branch==='playground'){
      marginRect(p,left,right,x,112,52,65,pal[1]);
      marginRect(p,left,right,x+4,119,44,48,pal[4]);
      marginRect(p,left,right,x+13,138,4,39,pal[3]);
      marginRect(p,left,right,x+34,138,4,39,pal[3]);
      marginRect(p,left,right,x-4,169,60,5,pal[2]);
    }else{
      marginRect(p,left,right,x+3,112,46,65,pal[1]);
      marginRect(p,left,right,x,106,52,7,pal[2]);
      marginRect(p,left,right,x+9,124,9,13,pal[4]);
      marginRect(p,left,right,x+32,124,9,13,pal[4]);
      marginRect(p,left,right,x+19,149,14,28,pal[3]);
      marginRect(p,left,right,x-3,174,58,3,pal[2]);
      if(g.theme==='rain')marginRect(p,left,right,x-2,101,56,4,pal[3]);
    }
  }
  if(g.theme==='gray'&&!g.branch)p.rect(left,207,width,3,'#d0bb75');
  if(g.branch==='playground')p.rect(left,203,width,3,'#c8b37f');
  if(g.theme==='dream'&&g.phase==='reward'){
    p.rect(left,183,width,33,'rgba(83,75,112,0.24)');
    p.rect(left,214,width,2,'rgba(235,213,234,0.28)');
  }
  p.rect(left,216,width,54,pal[3]);
  p.rect(left,216,width,3,pal[4]);
  p.rect(left,221,width,2,pal[2]);
  for(let x=left+15-drift;x<right;x+=37)marginRect(p,left,right,x,236+((Math.floor(x/37)%3+3)%3)*9,10,1,'rgba(255,255,230,0.09)');
}
type MarginRegion={x:number;y:number;w:number;h:number};
/** Four disjoint bands include the corners without drawing over the authored play area. */
function marginRegions(logicalWidth:number,logicalHeight:number):MarginRegion[]{
  const horizontal=Math.max(0,logicalWidth-480)/2,vertical=Math.max(0,logicalHeight-270)/2;
  return [
    {x:-horizontal,y:0,w:horizontal,h:270},
    {x:480,y:0,w:horizontal,h:270},
    {x:-horizontal,y:-vertical,w:480+horizontal*2,h:vertical},
    {x:-horizontal,y:270,w:480+horizontal*2,h:vertical},
  ].filter(region=>region.w>0&&region.h>0);
}
/** Continue the ceiling/sky and floor with two fills, even on a tall portrait screen. */
function drawVerticalMargin(p:Painter,g:Game,region:MarginRegion){
  const hall=g.screen==='hall'||g.phase==='corridorTransition';
  const dark=g.phase==='finale'||g.phase==='ending';
  const pal=MARGIN_PALETTES[g.theme]||MARGIN_PALETTES.dawn;
  const shade=hall?(region.y<0?'#e9e9dd':'#c9d1c2'):dark?'#172825':pal[region.y<0?0:3];
  p.rect(region.x,region.y,region.w,region.h,shade);
}
function drawWideMargins(p:Painter,g:Game,logicalWidth:number,logicalHeight=270){
  for(const region of marginRegions(logicalWidth,logicalHeight)){
    if(region.y!==0){drawVerticalMargin(p,g,region);continue;}
    const left=region.x,right=left+region.w;
    if(g.screen==='hall'||g.phase==='corridorTransition')drawHallMargin(p,left,right);
    else if(g.phase==='finale'||g.phase==='ending')p.rect(left,0,right-left,270,'#172825');
    else drawPlayMargin(p,g,left,right);
  }
}
function drawWideMarginOverlays(p:Painter,g:Game,logicalWidth:number,logicalHeight=270){
  for(const {x,y,w,h} of marginRegions(logicalWidth,logicalHeight)){
    if(g.phase==='intro'&&g.phaseTime<3)p.rect(x,y,w,h,'#334941');
    if(g.screen==='play'&&g.phase!=='finale'&&y===0){
      const light=['night','hell','graduate'].includes(g.theme),headerHeight=Math.min(h,25);
      p.rect(x,y,w,headerHeight,light?'rgba(24,43,50,0.47)':'rgba(236,234,215,0.48)');
    }
    if(g.panel)p.rect(x,y,w,h,'rgba(29,46,40,0.45)');
    if(g.paused)p.rect(x,y,w,h,'rgba(23,40,34,0.65)');
  }
}
type GraphicOp =
  | {kind:'rect';x:number;y:number;w:number;h:number;c:string}
  | {kind:'line';x1:number;y1:number;x2:number;y2:number;c:string;width:number}
  | {kind:'circle';x:number;y:number;r:number;c:string}
  | {kind:'poly';points:number[][];c:string};
class CocosPainter implements Painter {
  private static readonly FRAME_IDLE_FRAMES=180;
  private static readonly TRIM_INTERVAL_FRAMES=60;
  private graphics:Graphics[]=[]; private labels:Label[]=[]; private sprites:Sprite[]=[];
  private labelTransforms:UITransform[]=[];private spriteTransforms:UITransform[]=[];
  private labelColors:string[]=[];private graphicKeys:string[]=[];
  private colorCache=new Map<string,Color>();private artPaths=new Map(ART_MANIFEST.filter(a=>a.path).map(a=>[a.key,a.path!]));
  private gi=0; private li=0; private si=0; private order=0; private active:Graphics|null=null;
  private previousGi=0;private previousLi=0;private previousSi=0;
  private cacheGraphics=false;private pendingOps:GraphicOp[]|null=null;
  private ops=0;private redrawn=0;
  private frameClock=0;private frameLastUsed=new Map<string,number>();
  private endingVideoNode:Node|null=null;private endingVideoPlayer:VideoPlayer|null=null;
  private endingVideoRequested=false;private endingVideoKey='';private endingVideoPath='';
  private endingVideoStatus:'idle'|'loading'|'ready'|'playing'|'paused'|'ended'|'failed'='idle';private endingVideoToken=0;private endingVideoPaused=false;
  private endingVideoSession=-1;private endingVideoProof:VideoReplayEvidence|null=null;
  private endingVideoLastWall=0;private endingVideoWaitMs=0;private endingVideoLastAdvanceMs=0;private endingVideoLastSeconds=0;
  private frames=new Map<string,SpriteFrame|null>(); font:Font|null=null;
  private artRegions=new Map<string,{key:string,source:SpriteFrame,frame:SpriteFrame}>();
  private artRegionSources=new Map<string,SpriteFrame>();
  private frameFailures=new Map<string,{attempts:number,nextAt:number}>();
  private frameLoads=new Map<string,number>();private frameLoadSerial=0;private painterDestroyed=false;
  private canonicalArtKeys=new Set([...this.artPaths.keys()].filter(key=>/^character\.pixel\.[^.]+\.\d+$/.test(key)));
  private prefetchedActions=new Set<string>();
  constructor(private root:Node){for(const key of this.canonicalArtKeys)this.loadArtFrame(key);}
  private loadArtFrame(key:string){
    const path=this.artPaths.get(key),failure=this.frameFailures.get(key);
    if(this.painterDestroyed||!path||this.frames.has(key)||(failure&&performance.now()<failure.nextAt))return;
    const token=++this.frameLoadSerial;this.frameLoads.set(key,token);
    this.frames.set(key,null);this.frameLastUsed.set(key,this.frameClock);resources.load(path.replace(/\.[^/.]+$/,'')+'/texture',Texture2D,(err,texture)=>{
      // A request can finish after trimFrames() evicted the slot and started a
      // replacement load. Its texture is never owned by the current cache entry,
      // so always release it on a stale or destroyed callback.
      if(this.frameLoads.get(key)!==token||this.painterDestroyed){if(texture)resources.release(path.replace(/\.[^/.]+$/,'')+'/texture',Texture2D);return;}
      this.frameLoads.delete(key);
      if(!err&&texture){texture.setFilters(Texture2D.Filter.NEAREST,Texture2D.Filter.NEAREST);const frame=new SpriteFrame();frame.texture=texture;
        this.frameFailures.delete(key);this.frames.set(key,frame);
      }else{this.frames.delete(key);const attempts=Math.min(6,(failure?.attempts||0)+1);
        this.frameFailures.set(key,{attempts,nextAt:performance.now()+Math.min(30000,1000*2**(attempts-1))});}
    });
  }
  private prefetchAction(key:string){
    if(!/^character\..+\.\d+$/.test(key))return;
    const prefix=key.slice(0,key.lastIndexOf('.')+1);if(this.prefetchedActions.has(prefix))return;
    this.prefetchedActions.add(prefix);
    for(const candidate of this.artPaths.keys())if(candidate.startsWith(prefix)&&/^\d+$/.test(candidate.slice(prefix.length)))this.loadArtFrame(candidate);
  }
  private prefetchSequence(key:string){
    if(!/^ending\.sequence\..+\.\d+$/.test(key))return;
    const prefix=key.slice(0,key.lastIndexOf('.')+1),frame=Number(key.slice(prefix.length));
    for(let i=frame+1;i<=frame+3;i++)this.loadArtFrame(prefix+String(i).padStart(2,'0'));
  }
  private artPixel(value:number){return Math.round(value*ART_PIXEL_DENSITY)/ART_PIXEL_DENSITY;}
  get counts(){return {graphics:this.gi,labels:this.li,sprites:this.si,textures:this.frames.size,ops:this.ops,redrawn:this.redrawn};}
  private cachedColor(value:string){let result=this.colorCache.get(value);if(!result){result=color(value);this.colorCache.set(value,result);}return result;}
  begin(cacheGraphics=false){this.gi=this.li=this.si=this.order=this.ops=this.redrawn=0;this.frameClock++;this.active=null;this.pendingOps=null;this.cacheGraphics=cacheGraphics;this.endingVideoRequested=false;}
  end(){this.flushGraphics();for(let i=this.gi;i<this.previousGi;i++){
      this.graphics[i].node.active=false;
      // Native Graphics can lose its mesh while inactive; redraw this slot when it returns.
      this.graphicKeys[i]='';
    }
    for(let i=this.li;i<this.previousLi;i++)this.labels[i].node.active=false;for(let i=this.si;i<this.previousSi;i++)this.sprites[i].node.active=false;this.previousGi=this.gi;this.previousLi=this.li;this.previousSi=this.si;
    if(!this.endingVideoRequested&&this.endingVideoKey){if(this.endingVideoNode?.active){this.endingVideoPlayer?.pause();this.endingVideoNode.active=false;}this.releaseEndingVideo();}
    if(this.frameClock%CocosPainter.TRIM_INTERVAL_FRAMES===0)this.trimFrames();}
  private node(name:string):Node {const n=new Node(name);n.layer=Layers.Enum.UI_2D;this.root.addChild(n);n.addComponent(UITransform);return n;}
  private place(node:Node){if(!node.active)node.active=true;if(node.getSiblingIndex()!==this.order)node.setSiblingIndex(this.order);this.order++;}
  private g():Graphics {
    if(!this.active){let g=this.graphics[this.gi];if(!g){g=this.node('Draw '+this.gi).addComponent(Graphics);this.graphics.push(g);}this.gi++;this.place(g.node);this.active=g;
      if(this.cacheGraphics)this.pendingOps=[];else{g.clear();this.graphicKeys[this.gi-1]='';this.redrawn++;}}
    return this.active;
  }
  private flushGraphics(){if(this.active&&this.pendingOps){const key=JSON.stringify(this.pendingOps),index=this.gi-1;
      if(this.graphicKeys[index]!==key){const g=this.active;g.clear();for(const op of this.pendingOps)this.draw(g,op);this.graphicKeys[index]=key;this.redrawn++;}}
    this.active=null;this.pendingOps=null;}
  private draw(g:Graphics,op:GraphicOp){if(op.kind==='rect'){g.fillColor=this.cachedColor(op.c);g.rect(op.x-240,135-op.y-op.h,op.w,op.h);g.fill();}
    else if(op.kind==='line'){g.strokeColor=this.cachedColor(op.c);g.lineWidth=op.width;g.moveTo(op.x1-240,135-op.y1);g.lineTo(op.x2-240,135-op.y2);g.stroke();}
    else if(op.kind==='circle'){g.fillColor=this.cachedColor(op.c);g.circle(op.x-240,135-op.y,op.r);g.fill();}
    else{g.fillColor=this.cachedColor(op.c);g.moveTo(op.points[0][0]-240,135-op.points[0][1]);for(let i=1;i<op.points.length;i++)g.lineTo(op.points[i][0]-240,135-op.points[i][1]);g.close();g.fill();}}
  rect(x:number,y:number,w:number,h:number,c:string){if(w<=0||h<=0)return;const g=this.g();this.ops++;if(this.pendingOps)this.pendingOps.push({kind:'rect',x,y,w,h,c});else{g.fillColor=this.cachedColor(c);g.rect(x-240,135-y-h,w,h);g.fill();}}
  line(x1:number,y1:number,x2:number,y2:number,c:string,width=1){const g=this.g();this.ops++;if(this.pendingOps)this.pendingOps.push({kind:'line',x1,y1,x2,y2,c,width});else{g.strokeColor=this.cachedColor(c);g.lineWidth=width;g.moveTo(x1-240,135-y1);g.lineTo(x2-240,135-y2);g.stroke();}}
  circle(x:number,y:number,r:number,c:string){const g=this.g();this.ops++;if(this.pendingOps)this.pendingOps.push({kind:'circle',x,y,r,c});else{g.fillColor=this.cachedColor(c);g.circle(x-240,135-y,r);g.fill();}}
  poly(points:number[][],c:string){if(!points.length)return;const g=this.g();this.ops++;if(this.pendingOps)this.pendingOps.push({kind:'poly',points,c});else{g.fillColor=this.cachedColor(c);g.moveTo(points[0][0]-240,135-points[0][1]);for(let i=1;i<points.length;i++)g.lineTo(points[i][0]-240,135-points[i][1]);g.close();g.fill();}}
  text(value:string,x:number,y:number,size:number,c:string,align:'left'|'center'|'right'='left'){
    this.flushGraphics();const index=this.li;let l=this.labels[index];if(!l){const node=this.node('Text '+index);l=node.addComponent(Label);this.labels.push(l);this.labelTransforms.push(node.getComponent(UITransform)!);l.overflow=Label.Overflow.NONE;l.verticalAlign=Label.VerticalAlign.TOP;}this.li++;this.ops++;
    this.place(l.node);if(l.string!==value)l.string=value;if(l.fontSize!==size)l.fontSize=size;if(l.lineHeight!==size+2)l.lineHeight=size+2;
    if(this.labelColors[index]!==c){l.color=this.cachedColor(c);this.labelColors[index]=c;}if(l.font!==this.font)l.font=this.font;
    const horizontal=align==='center'?Label.HorizontalAlign.CENTER:align==='right'?Label.HorizontalAlign.RIGHT:Label.HorizontalAlign.LEFT;
    if(l.horizontalAlign!==horizontal)l.horizontalAlign=horizontal;
    const t=this.labelTransforms[index],anchor=align==='center'?.5:align==='right'?1:0;if(t.anchorX!==anchor||t.anchorY!==1)t.setAnchorPoint(anchor,1);
    const px=x-240,py=135-y,pos=l.node.position;if(pos.x!==px||pos.y!==py)l.node.setPosition(px,py);
  }
  image(key:string,x:number,y:number,w:number,h:number,opacity=1):boolean {
    const path=this.artPaths.get(key);if(!path)return false;
    this.frameLastUsed.set(key,this.frameClock);
    this.loadArtFrame(key);this.prefetchAction(key);this.prefetchSequence(key);
    const frame=this.frames.get(key);if(!frame)return false;
    return this.drawArtFrame(frame,x,y,w,h,opacity);
  }
  imageRegion(key:string,sx:number,sy:number,sw:number,sh:number,x:number,y:number,w:number,h:number,opacity=1):boolean{
    if(![sx,sy,sw,sh,x,y,w,h,opacity].every(Number.isFinite)||sw<=0||sh<=0||w<=0||h<=0||!this.artPaths.has(key))return false;
    const left=Math.max(0,sx),top=Math.max(0,sy),right=Math.min(1,sx+sw),bottom=Math.min(1,sy+sh);
    if(right<=left||bottom<=top)return false;
    this.frameLastUsed.set(key,this.frameClock);this.loadArtFrame(key);const source=this.frames.get(key);if(!source)return false;
    const texture=source.texture;if(!texture||!Number.isFinite(texture.width)||!Number.isFinite(texture.height)||texture.width<=0||texture.height<=0)return false;
    const x0=Math.floor(left*texture.width),y0=Math.floor(top*texture.height),x1=Math.min(texture.width,Math.ceil(right*texture.width)),y1=Math.min(texture.height,Math.ceil(bottom*texture.height));
    // Invalidate before drawing any child of a replacement source, including
    // when the first new draw uses a slot this key has never occupied before.
    if(this.artRegionSources.get(key)!==source){this.releaseArtRegions(key);this.artRegionSources.set(key,source);}
    // Camera crops change every frame. Each draw slot owns one mutable child,
    // so the pool follows visible sprites rather than every past camera pixel.
    // Separate slots also keep two crops of the same texture independent until
    // Cocos renders all of this frame's nodes after update() has returned.
    const regionId=key+':slot:'+this.si;let region=this.artRegions.get(regionId);
    if(!region){const frame=new SpriteFrame();frame.packable=false;frame.texture=texture;frame.rect=new Rect(x0,y0,x1-x0,y1-y0);region={key,source,frame};this.artRegions.set(regionId,region);}
    else{
      const rect=region.frame.rect;
      if(rect.x!==x0||rect.y!==y0||rect.width!==x1-x0||rect.height!==y1-y0){
        region.frame.rect=new Rect(x0,y0,x1-x0,y1-y0);
        const sprite=this.sprites[this.si];if(sprite?.spriteFrame===region.frame)sprite.markForUpdateRenderData();
      }
    }
    return this.drawArtFrame(region.frame,x,y,w,h,opacity);
  }
  private drawArtFrame(frame:SpriteFrame,x:number,y:number,w:number,h:number,opacity:number):boolean{
    this.flushGraphics();const index=this.si;let s=this.sprites[index];if(!s){const node=this.node('Art '+index);s=node.addComponent(Sprite);this.sprites.push(s);this.spriteTransforms.push(node.getComponent(UITransform)!);s.sizeMode=Sprite.SizeMode.CUSTOM;}this.si++;this.ops++;
    this.place(s.node);if(!s.trim)s.trim=true;if(s.spriteFrame!==frame)s.spriteFrame=frame;const alpha=Math.round(Math.max(0,Math.min(1,opacity))*255);if(s.color.a!==alpha)s.color=new Color(255,255,255,alpha);
    const t=this.spriteTransforms[index],sx=this.artPixel(x),sy=this.artPixel(y),sw=this.artPixel(w),sh=this.artPixel(h);
    if(t.width!==sw||t.height!==sh)t.setContentSize(sw,sh);
    const px=sx+sw/2-240,py=135-sy-sh/2,pos=s.node.position;if(pos.x!==px||pos.y!==py)s.node.setPosition(px,py);return true;
  }
  private releaseArtRegions(key:string){
    this.artRegionSources.delete(key);
    for(const [id,region] of this.artRegions){if(region.key!==key)continue;
      for(const sprite of this.sprites)if(sprite.spriteFrame===region.frame)sprite.spriteFrame=null;
      region.frame.destroy();this.artRegions.delete(id);
    }
  }
  video(key:string,x:number,y:number,w:number,h:number,_elapsedSeconds:number,paused=false,sessionId=0,skin='base',muted=false):EndingVideoState{
    const definition=(ENDING_MEDIA as any)[key];if(!definition)return {visible:false,seconds:0,status:'failed'};
    const media={...definition,...definition.skins?.[skin]};key+=':'+skin;
    this.endingVideoRequested=true;this.endingVideoPaused=paused;
    const now=performance.now();
    if(!this.endingVideoNode){
      this.endingVideoNode=this.node('Ending cinematic');
      this.endingVideoPlayer=this.endingVideoNode.addComponent(VideoPlayer);
      this.endingVideoPlayer.playOnAwake=false;this.endingVideoPlayer.keepAspectRatio=false;
      this.endingVideoNode.active=false;
      this.endingVideoNode.on(VideoPlayer.EventType.READY_TO_PLAY,()=>{
        if(!this.endingVideoRequested)return;
        if(this.endingVideoPaused){this.endingVideoStatus='ready';return;}
        this.endingVideoLastAdvanceMs=this.endingVideoWaitMs;
        this.endingVideoStatus='playing';this.endingVideoPlayer?.play();
      });
      this.endingVideoNode.on(VideoPlayer.EventType.PLAYING,()=>{
        if(this.endingVideoRequested){
          if(this.endingVideoStatus!=='playing')this.endingVideoLastAdvanceMs=this.endingVideoWaitMs;
          this.endingVideoStatus='playing';this.endingVideoProof?.onPlaying(performance.now());
        }
      });
      this.endingVideoNode.on(VideoPlayer.EventType.COMPLETED,()=>{
        if(!this.endingVideoRequested)return;
        // Ignore a previous clip's queued completion while its replacement is loading.
        if(this.endingVideoStatus==='loading'||this.endingVideoStatus==='ready'||this.endingVideoStatus==='idle')return;
        this.endingVideoProof?.observe(this.endingVideoPlayer?.currentTime||0,performance.now());
        // Android can signal COMPLETED on an error. Completion requires decoded progress.
        this.endingVideoStatus=this.endingVideoProof?.completed?'ended':'failed';
      });
      this.endingVideoNode.on(VideoPlayer.EventType.ERROR,()=>{if(this.endingVideoRequested)this.endingVideoStatus='failed';});
    }
    this.endingVideoPlayer!.mute=muted;
    const path=media.resourcePath as string;
    if(this.endingVideoKey!==key||this.endingVideoSession!==sessionId){
      this.releaseEndingVideo();this.endingVideoKey=key;this.endingVideoSession=sessionId;this.endingVideoPath=path;this.endingVideoStatus='loading';
      this.endingVideoProof=new VideoReplayEvidence(media.seconds,sys.isNative);
      this.endingVideoLastWall=now;this.endingVideoWaitMs=this.endingVideoLastAdvanceMs=this.endingVideoLastSeconds=0;
      const token=++this.endingVideoToken;
      resources.load(path,VideoClip,(error,clip)=>{
        // A replaced or destroyed session no longer owns a late clip. Release
        // it even when the callback arrives after the request was cancelled.
        if(token!==this.endingVideoToken||this.endingVideoKey!==key||!this.endingVideoRequested){if(clip)resources.release(path,VideoClip);return;}
        if(error||!clip||!this.endingVideoPlayer||!this.endingVideoNode){if(clip)resources.release(path,VideoClip);this.endingVideoStatus='failed';return;}
        this.endingVideoPlayer.resourceType=VideoPlayer.ResourceType.LOCAL;
        this.endingVideoPlayer.clip=clip;this.endingVideoNode.active=true;
      });
    }else if(paused&&this.endingVideoStatus==='playing'){
      this.endingVideoPlayer?.pause();this.endingVideoProof?.pause(now);this.endingVideoStatus='paused';
    }else if(!paused&&this.endingVideoStatus==='paused'&&this.endingVideoPlayer){
      this.endingVideoNode.active=true;this.endingVideoProof?.resume(now);this.endingVideoPlayer.resume();this.endingVideoStatus='playing';
    }else if(!paused&&this.endingVideoStatus==='ready'&&this.endingVideoPlayer){
      this.endingVideoNode.active=true;
      this.endingVideoLastAdvanceMs=this.endingVideoWaitMs;
      this.endingVideoPlayer.play();this.endingVideoStatus='playing';
    }
    const frameMs=Math.min(100,Math.max(0,now-this.endingVideoLastWall));this.endingVideoLastWall=now;
    if(!paused)this.endingVideoWaitMs+=frameMs;
    const seconds=Math.max(0,Math.min(media.seconds,this.endingVideoPlayer?.currentTime||0));
    if(this.endingVideoStatus==='playing'){
      this.endingVideoProof?.observe(seconds,now);
      if(seconds>this.endingVideoLastSeconds+.01){this.endingVideoLastSeconds=seconds;this.endingVideoLastAdvanceMs=this.endingVideoWaitMs;}
      if(this.endingVideoProof?.completed)this.endingVideoStatus='ended';
      else if(this.endingVideoWaitMs-this.endingVideoLastAdvanceMs>6000)this.endingVideoStatus='failed';
    }else if(this.endingVideoStatus==='loading'&&this.endingVideoWaitMs>8000)this.endingVideoStatus='failed';
    if(this.endingVideoNode&&!paused&&(this.endingVideoStatus==='playing'||this.endingVideoStatus==='paused'||this.endingVideoStatus==='ready'||this.endingVideoStatus==='ended')){
      // Web DOM and Android native video surfaces both cover Graphics. Leave the
      // top controls outside the surface while preserving the film's 16:9 aspect.
      if(x===0&&y===0&&w===480&&h===270){x=32;y=32;w=416;h=234;}
      const sx=this.artPixel(x),sy=this.artPixel(y),sw=this.artPixel(w),sh=this.artPixel(h);
      const t=this.endingVideoNode.getComponent(UITransform)!;
      if(t.width!==sw||t.height!==sh)t.setContentSize(sw,sh);
      const pos=this.endingVideoNode.position,px=sx+sw/2-240,py=135-sy-sh/2;
      if(pos.x!==px||pos.y!==py)this.endingVideoNode.setPosition(px,py);
      this.flushGraphics();
      this.place(this.endingVideoNode);
    }
    // Video surfaces cannot be covered by the Graphics pause menu on either host.
    // Hiding the already-paused surface exposes the matching fallback frame and controls.
    if(paused&&this.endingVideoNode)this.endingVideoNode.active=false;
    const status=this.endingVideoStatus==='failed'?'failed':this.endingVideoStatus==='ended'?'ended':this.endingVideoStatus==='loading'||this.endingVideoStatus==='ready'?'loading':'playing';
    const visible=status!=='failed'&&status!=='loading'&&!!this.endingVideoNode?.active;
    if(status==='failed'){this.endingVideoPlayer?.stop();if(this.endingVideoNode)this.endingVideoNode.active=false;}
    return {visible,seconds:status==='ended'?media.seconds:seconds,status};
  }
  suspendEndingVideo(){if(this.endingVideoStatus==='playing'){this.endingVideoPlayer?.pause();this.endingVideoProof?.pause(performance.now());this.endingVideoStatus='paused';}}
  resumeEndingVideo(){if(this.endingVideoStatus==='paused'&&this.endingVideoRequested){this.endingVideoProof?.resume(performance.now());this.endingVideoPlayer?.resume();this.endingVideoStatus='playing';}}
  private releaseEndingVideo(){
    if(this.endingVideoKey){
      this.endingVideoToken++;this.endingVideoPlayer?.stop();this.endingVideoPlayer&&(this.endingVideoPlayer.clip=null);
      if(this.endingVideoPath)resources.release(this.endingVideoPath,VideoClip);
    }
    this.endingVideoKey='';this.endingVideoPath='';this.endingVideoStatus='idle';this.endingVideoSession=-1;this.endingVideoProof=null;
  }
  private trimFrames(){
    for(const [key,lastUsed] of this.frameLastUsed){
      if(this.canonicalArtKeys.has(key)||this.frameClock-lastUsed<CocosPainter.FRAME_IDLE_FRAMES)continue;
      const frame=this.frames.get(key);if(frame)for(const sprite of this.sprites)if(sprite.spriteFrame===frame)sprite.spriteFrame=null;
      this.releaseArtRegions(key);
      this.frames.delete(key);this.frameLoads.delete(key);this.frameFailures.delete(key);this.frameLastUsed.delete(key);this.prefetchedActions.delete(key.slice(0,key.lastIndexOf('.')+1));
      if(frame){frame.destroy();const path=this.artPaths.get(key);if(path)resources.release(path.replace(/\.[^/.]+$/,'')+'/texture',Texture2D);}
    }
  }
  destroy(){
    this.painterDestroyed=true;this.frameLoads.clear();this.frameFailures.clear();
    for(const key of new Set([...this.artRegions.values()].map(region=>region.key)))this.releaseArtRegions(key);
    this.artRegionSources.clear();
    if(this.endingVideoNode?.active)this.endingVideoPlayer?.pause();this.endingVideoNode&&(this.endingVideoNode.active=false);this.releaseEndingVideo();
    for(const [key,frame] of this.frames){if(frame)frame.destroy();const path=this.artPaths.get(key);if(path)resources.release(path.replace(/\.[^/.]+$/,'')+'/texture',Texture2D);}
    this.frames.clear();this.frameLastUsed.clear();
  }
}
type RawMomentFrame={t:number,pixels:Uint8Array};
type RawNativeMoment={id:string,kind:string,priority:number,time:number,wallTime:number,frames:RawMomentFrame[]};
type NativeVideoMoment={id:string,format:'mp4',kind:string,priority:number,time:number,durationMs:number,path:string};
type NativeLegacyMoment={id:string,format:'legacy-frames',kind:string,priority:number,time:number,durationMs:number,frames:string[]};
type NativeStoredMoment=NativeVideoMoment|NativeLegacyMoment;
type NativeEncoding={raw:RawNativeMoment,index:number,started:number,finishing:boolean};
type NativeEncodedResult={id:string,ok:boolean,path?:string,durationMs?:number,error?:string};
/** Captures the player's real Cocos frames and sends pinned moments to Android's H.264 encoder. */
class NativeMoments {
  private readonly target=new RenderTexture();private camera:Camera;private overlay:Sprite;private video:VideoPlayer;
  private readonly ring:RawMomentFrame[]=[];private pending:RawNativeMoment|null=null;private readonly queue:RawNativeMoment[]=[];
  private readonly base=native.fileUtils.getWritablePath()+'fleeting-life-moments-v2/';
  private readonly legacyBase=native.fileUtils.getWritablePath()+'fleeting-life-moments/';
  private readonly key='fleeting-life-native-moments-v2';
  private readonly legacy:NativeLegacyMoment[];private videos:NativeVideoMoment[]=[];
  private encoding:NativeEncoding|null=null;
  private clock=0;private lastWall=0;private lastSample=-Infinity;private lastCapture=-Infinity;private lastPriority=0;private suspended=false;private suspendedAt=0;
  private active=false;private started=0;private replayPauseAt=0;private partStarted=0;
  private timeline:Array<{moment:NativeStoredMoment,start:number,end:number}>=[];
  private videoProof:VideoReplayEvidence|null=null;private videoCompleted=false;private legacyShown=false;
  private videoRetries=0;
  private replayResult:((success:boolean)=>void)|null=null;
  private lastPart=-1;private lastFrame=-1;private token=0;
  private displayed:SpriteFrame|null=null;private displayedImage:ImageAsset|null=null;
  private previousCallback:((result:NativeEncodedResult)=>void)|undefined;
  private readonly encodedCallback=(result:NativeEncodedResult)=>{this.onEncoded(result);this.previousCallback?.(result);};
  constructor(private root:Node,private getGame:()=>Game){
    native.fileUtils.createDirectory(this.base);this.legacy=this.readLegacy();this.loadIndex();
    const node=new Node('Moment capture camera');node.layer=Layers.Enum.UI_2D;root.addChild(node);node.setPosition(0,0,1000);
    this.camera=node.addComponent(Camera);this.camera.projection=Camera.ProjectionType.ORTHO;this.camera.orthoHeight=135;this.camera.near=0;this.camera.far=2000;this.camera.visibility=Layers.Enum.UI_2D;this.camera.clearColor=new Color(17,25,34);
    this.target.reset({width:480,height:270});this.camera.targetTexture=this.target;this.camera.enabled=false;
    const overlay=new Node('Captured legacy memory');overlay.layer=Layers.Enum.UI_2D;root.addChild(overlay);overlay.addComponent(UITransform).setContentSize(480,270);
    this.overlay=overlay.addComponent(Sprite);this.overlay.sizeMode=Sprite.SizeMode.CUSTOM;overlay.active=false;
    // Android's video SurfaceView sits above Cocos graphics; leave room for the finale title and footer.
    const videoNode=new Node('Captured video');videoNode.layer=Layers.Enum.UI_2D;root.addChild(videoNode);videoNode.addComponent(UITransform).setContentSize(300,168.75);
    this.video=videoNode.addComponent(VideoPlayer);this.video.playOnAwake=false;this.video.keepAspectRatio=false;videoNode.active=false;
    videoNode.on(VideoPlayer.EventType.READY_TO_PLAY,()=>{
      if(this.active&&this.video.node.active&&!this.suspended&&!this.getGame().paused)this.video.play();});
    videoNode.on(VideoPlayer.EventType.PLAYING,()=>{
      if(!this.active||!this.video.node.active||this.suspended)return;
      const now=performance.now();this.videoProof?.onPlaying(now);this.videoProof?.observe(this.video.currentTime,now);
    });
    // Android can also emit COMPLETED after dismissing a decoding error dialog.
    videoNode.on(VideoPlayer.EventType.COMPLETED,()=>{
      if(!this.active||!this.video.node.active||!this.videoProof)return;
      const now=performance.now();this.videoProof.observe(this.video.currentTime,now);
      if(!this.videoProof.completed){
        const part=this.lastPart;
        console.warn('Native moment playback incomplete',part,this.videoProof.snapshot());
        if(part>=0&&this.videoRetries<1&&now-this.started<14000){
          this.videoRetries++;this.startReplayPart(part,now,true);return;
        }
        this.stopReplay();return;
      }
      this.videoCompleted=true;
    });
    this.previousCallback=(globalThis as any).fleetingMomentEncoded;
    (globalThis as any).fleetingMomentEncoded=this.encodedCallback;
    director.on(Director.EVENT_AFTER_DRAW,this.afterDraw,this);
  }
  private validLegacyPath(value:unknown):value is string{return typeof value==='string'&&value.startsWith(this.legacyBase)&&/^[a-zA-Z0-9-]+\.png$/.test(value.slice(this.legacyBase.length));}
  private validVideoPath(value:unknown,id:string):value is string{return typeof value==='string'&&value===this.base+id+'.mp4'&&/^native-\d+-[a-z0-9]+$/.test(id);}
  private readLegacy():NativeLegacyMoment[]{
    try{const old=JSON.parse(sys.localStorage.getItem('fleeting-life-native-moments')||'[]');if(!Array.isArray(old))return [];
      return old.slice(0,3).map((item:any,index:number)=>{
        const frames=Array.isArray(item.frames)?item.frames.filter((path:unknown)=>this.validLegacyPath(path)&&native.fileUtils.isFileExist(path)):[];
        return {id:`legacy-native-${index}-${Number(item.time||0)}`,format:'legacy-frames' as const,kind:String(item.kind||'highlight'),
          priority:Number(item.priority)||1,time:Number(item.time)||index,durationMs:Math.min(3000,frames.length*167),frames};
      }).filter(item=>item.frames.length>0);
    }catch{return [];}
  }
  private rank(items:NativeVideoMoment[]):NativeVideoMoment[]{return items.sort((a,b)=>b.priority-a.priority||b.time-a.time).slice(0,3);}
  private selectReplayMoments():NativeStoredMoment[]{
    const selected:NativeStoredMoment[]=[...this.videos,...this.legacy]
      .sort((a,b)=>b.priority-a.priority||b.time-a.time).slice(0,3);
    if(this.videos.length&&!selected.some(item=>item.format==='mp4')){
      if(selected.length===3)selected.pop();
      selected.push(this.rank(this.videos.slice())[0]);
    }
    return selected.sort((a,b)=>a.time-b.time);
  }
  private writeIndex(videos:NativeVideoMoment[]){sys.localStorage.setItem(this.key,JSON.stringify({version:2,candidates:videos}));}
  private cleanupOrphanedVideos(){
    const keep=new Set(this.videos.map(item=>item.path));
    if(this.encoding)keep.add(this.base+this.encoding.raw.id+'.mp4');
    let entries:string[];
    try{entries=native.fileUtils.listFiles(this.base);}catch(error){console.warn('Native moment video cleanup could not list files',error);return;}
    for(const entry of entries){
      const file=entry.startsWith(this.base)?entry:/^native-\d+-[a-z0-9]+\.mp4$/.test(entry)?this.base+entry:'';
      if(!file||!/^native-\d+-[a-z0-9]+\.mp4$/.test(file.slice(this.base.length))||keep.has(file))continue;
      if(native.fileUtils.isFileExist(file)&&!native.fileUtils.removeFile(file))console.warn('Native moment orphan MP4 could not be removed',file);
    }
  }
  private loadIndex(){
    const stored=sys.localStorage.getItem(this.key);
    let data:any={},canPrune=!stored;
    try{if(stored){data=JSON.parse(stored)||{};canPrune=data.version===2&&Array.isArray(data.candidates);}}catch{}
    const rows=Array.isArray(data.candidates)?data.candidates.slice(0,3):[];
    this.videos=rows.filter((item:any)=>item&&typeof item.id==='string'&&this.validVideoPath(item.path,item.id)&&native.fileUtils.isFileExist(item.path))
      .map((item:any)=>({id:item.id,format:'mp4' as const,kind:String(item.kind||'highlight'),priority:Number(item.priority)||1,
        time:Number(item.time)||0,durationMs:Math.max(100,Math.min(10000,Number(item.durationMs)||3000)),path:item.path}));
    const missing=this.videos.length!==rows.length;
    const needsRepair=missing||(Array.isArray(data.candidates)&&data.candidates.length>3);
    let indexUpdated=!needsRepair;
    if(needsRepair)try{this.writeIndex(this.videos);indexUpdated=true;}catch{}
    if(canPrune&&indexUpdated)this.cleanupOrphanedVideos();
  }
  capture(kind:string){
    if(this.getGame().screen!=='play')return;
    const priority=kind==='hidden'?3:kind==='death'?2:1;
    if(this.pending){if(priority<=this.pending.priority)return;this.pending=null;}
    if(this.clock-this.lastCapture<1100&&priority<=this.lastPriority)return;
    if(this.queue.length>=2){let weakest=-1;for(let i=0;i<this.queue.length;i++)if(this.queue[i].priority<priority&&(weakest<0||this.queue[i].priority<this.queue[weakest].priority))weakest=i;
      if(weakest<0)return;this.queue.splice(weakest,1);}
    this.lastCapture=this.clock;this.lastPriority=priority;this.pending={id:`native-${Date.now()}-${Math.random().toString(36).slice(2,10)}`,
      kind,priority,time:this.clock,wallTime:Date.now(),
      frames:this.ring.filter(frame=>frame.t>=this.clock-2000)};
  }
  update(){
    const now=performance.now(),game=this.getGame();if(!this.lastWall)this.lastWall=now;
    const dt=Math.max(0,Math.min(50,now-this.lastWall));this.lastWall=now;
    this.pumpEncoder(now);
    if(this.active){this.driveReplay(now);return;}
    if(this.suspended||game.screen!=='play'||game.paused)return;
    this.clock+=dt;
    if(this.clock-this.lastSample>=1000/15){this.lastSample=this.clock;this.camera.enabled=true;}
  }
  private afterDraw(){
    if(!this.camera.enabled)return;this.camera.enabled=false;
    const pixels=this.target.readPixels();if(!pixels)return;
    // GLES readback begins at the bottom; MediaCodec receives top-down RGBA.
    const flipped=new Uint8Array(pixels.length),stride=480*4;
    for(let y=0;y<270;y++)flipped.set(pixels.subarray((269-y)*stride,(270-y)*stride),y*stride);
    const frame={t:this.clock,pixels:flipped};this.ring.push(frame);
    while(this.ring.length&&this.ring[0].t<this.clock-3000)this.ring.shift();
    const pending=this.pending;
    if(pending&&frame.t>pending.time&&frame.t<=pending.time+1100)pending.frames.push(frame);
    if(pending&&frame.t>=pending.time+1000){this.pending=null;if(pending.frames.length>=2)this.queue.push(pending);}
  }
  private pumpEncoder(now:number){
    if(this.encoding&&now-this.encoding.started>30000){this.cancelEncoding('timeout');}
    if(!this.encoding&&this.queue.length){
      const raw=this.queue.shift()!;
      if(!this.rank([...this.videos,{id:raw.id,format:'mp4',kind:raw.kind,priority:raw.priority,time:raw.wallTime,durationMs:3000,path:''}]).some(item=>item.id===raw.id))return;
      const bridge=(globalThis as any).fleetingMomentNative;
      if(typeof bridge?.enqueueRgba!=='function'){console.warn('Native moment bridge unavailable');return;}
      try{const ok=native.reflection.callStaticMethod('com/cocos/game/MomentCodec','begin','(Ljava/lang/String;III)Z',raw.id,480,270,15);
        if(ok)this.encoding={raw,index:0,started:now,finishing:false};else console.warn('Native MP4 encoder unavailable');
      }catch(error){console.warn('Native MP4 begin failed',error);}
    }
    const job=this.encoding;if(!job||job.finishing)return;
    const bridge=(globalThis as any).fleetingMomentNative;
    for(let i=0;i<2&&job.index<job.raw.frames.length;i++){
      const frame=job.raw.frames[job.index];const ptsUs=Math.max(0,Math.round((frame.t-job.raw.frames[0].t)*1000));
      let accepted=false;try{accepted=bridge.enqueueRgba(job.raw.id,frame.pixels,ptsUs)===true;}catch(error){console.warn('Native MP4 frame bridge failed',error);this.cancelEncoding('bridge');return;}
      if(!accepted)break;job.index++;
    }
    if(job.index===job.raw.frames.length){job.finishing=true;
      try{native.reflection.callStaticMethod('com/cocos/game/MomentCodec','finish','(Ljava/lang/String;)V',job.raw.id);}
      catch(error){console.warn('Native MP4 finish failed',error);this.cancelEncoding('finish');}}
  }
  private cancelEncoding(reason:string){
    const job=this.encoding;if(!job)return;this.encoding=null;
    try{native.reflection.callStaticMethod('com/cocos/game/MomentCodec','cancel','(Ljava/lang/String;)V',job.raw.id);}catch{}
    console.warn('Native MP4 candidate cancelled:',reason);
  }
  private onEncoded(result:NativeEncodedResult){
    const job=this.encoding;if(!job||!result||result.id!==job.raw.id)return;
    this.encoding=null;
    const raw=job.raw;
    if(!result.ok||!this.validVideoPath(result.path,raw.id)||!native.fileUtils.isFileExist(result.path)){
      console.warn('Native MP4 candidate failed:',result.error||'missing video file');return;
    }
    const candidate:NativeVideoMoment={id:raw.id,format:'mp4',kind:raw.kind,priority:raw.priority,time:raw.wallTime,
      durationMs:Math.max(100,Math.min(10000,Number(result.durationMs)||3000)),path:result.path};
    const keep=this.rank([...this.videos,candidate]);
    if(!keep.some(item=>item.id===candidate.id)){native.fileUtils.removeFile(candidate.path);return;}
    const nextVideos=keep;
    try{this.writeIndex(nextVideos);}catch(error){console.warn('Native MP4 index failed',error);native.fileUtils.removeFile(candidate.path);return;}
    const oldVideos=this.videos.filter(item=>!nextVideos.some(next=>next.id===item.id));
    this.videos=nextVideos;
    for(const old of oldVideos)if(this.validVideoPath(old.path,old.id))native.fileUtils.removeFile(old.path);
  }
  replay(active:boolean,onResult?:(success:boolean)=>void){
    if(!active){this.stopReplay();return;}
    if(this.active){onResult?.(false);return;}
    const selected=this.selectReplayMoments();
    if(!selected.length){onResult?.(false);return;}
    this.timeline=[];let start=0;for(let i=0;i<3;i++){
      const moment=selected[i%selected.length],length=Math.min(3000,Math.max(250,moment.durationMs||3000));
      this.timeline.push({moment,start,end:start+length});start+=length;
    }
    this.active=true;this.replayResult=onResult||null;this.started=performance.now();this.replayPauseAt=0;
    this.lastPart=-1;this.lastFrame=-1;this.camera.enabled=false;
    this.driveReplay(this.started);
  }
  private stopReplay(success=false){
    if(!this.active)return;
    const playedVideo=this.timeline.some(part=>part.moment.format==='mp4');
    this.active=false;this.token++;this.lastPart=-1;this.lastFrame=-1;this.videoProof=null;
    this.video.stop();this.video.node.active=false;
    this.overlay.node.active=false;this.releaseDisplayed();
    const callback=this.replayResult;this.replayResult=null;callback?.(success&&playedVideo);
  }
  private driveReplay(now:number){
    if(this.suspended||this.getGame().paused){
      if(!this.replayPauseAt)this.replayPauseAt=now;
      this.videoProof?.pause(now);
      if(this.video.node.active){this.video.pause();this.video.node.active=false;}
      this.overlay.node.active=false;
      return;
    }
    if(this.replayPauseAt){const pause=now-this.replayPauseAt;this.started+=pause;this.partStarted+=pause;
      this.replayPauseAt=0;this.videoProof?.resume(now);
      if(this.lastPart>=0&&this.timeline[this.lastPart].moment.format==='mp4'){
        this.video.node.active=true;this.video.play();
      }else if(this.lastPart>=0&&this.timeline[this.lastPart].moment.format==='legacy-frames'){
        this.overlay.node.active=true;
      }
    }
    if(now-this.started>=20000){console.error('FLEETING_VIDEO_TIMEOUT',this.lastPart,this.video.currentTime,this.videoProof?.snapshot());this.stopReplay();return;}
    if(this.lastPart<0){this.startReplayPart(0,now);return;}
    const part=this.timeline[this.lastPart],moment=part.moment,local=now-this.partStarted;
    if(moment.format==='mp4'){
      this.videoProof?.observe(this.video.currentTime,now);
      // Some Android MediaPlayer builds reach the final frame without emitting COMPLETED.
      if(!this.videoCompleted&&local>=moment.durationMs&&this.videoProof?.completed){
        console.warn('Native moment reached indexed end without completion event',this.lastPart);
        this.videoCompleted=true;
      }
      if(local>=6000&&!this.videoCompleted&&this.videoRetries<1){
        console.warn('Native moment playback stalled',this.lastPart,this.videoProof?.snapshot());
        this.videoRetries++;this.startReplayPart(this.lastPart,now,true);return;
      }
      if(this.videoCompleted){this.startReplayPart(this.lastPart+1,now);return;}
      return;
    }
    if(moment.format==='legacy-frames'){
      const index=Math.min(moment.frames.length-1,Math.floor(local/moment.durationMs*moment.frames.length));
      if(index>=0&&index!==this.lastFrame){this.lastFrame=index;this.showLegacy(moment.frames[index]);}
      if(local>=part.end-part.start){if(this.legacyShown)this.startReplayPart(this.lastPart+1,now);else this.stopReplay();}
    }
  }
  private startReplayPart(index:number,now:number,retry=false){
    if(index>=this.timeline.length){this.stopReplay(true);return;}
    if(!retry)this.videoRetries=0;
    this.lastPart=-1;this.token++;this.videoProof=null;this.videoCompleted=false;this.legacyShown=false;
    this.video.stop();this.video.node.active=false;this.overlay.node.active=false;this.releaseDisplayed();
    const part=this.timeline[index],moment=part.moment;
    this.lastPart=index;this.partStarted=now;this.lastFrame=-1;
    if(moment.format==='mp4'){
      if(!native.fileUtils.isFileExist(moment.path)){this.stopReplay();return;}
      this.videoProof=new VideoReplayEvidence(moment.durationMs/1000,true);
      this.video.node.active=true;
      const sameVideo=this.video.resourceType===VideoPlayer.ResourceType.REMOTE&&this.video.remoteURL===moment.path;
      this.video.resourceType=VideoPlayer.ResourceType.REMOTE;this.video.remoteURL=moment.path;
      if(sameVideo)this.video.currentTime=0;
      this.video.play();
    }else{
      if(!moment.frames.length){this.stopReplay();return;}
      this.overlay.node.active=true;this.overlay.node.setSiblingIndex(this.root.children.length-1);
    }
  }
  private showLegacy(path:string){const token=++this.token;assetManager.loadRemote<ImageAsset>(path,{ext:'.png'},(error,img)=>{
    if(!this.active||token!==this.token)return;
    if(error||!img){this.stopReplay();return;}
    this.releaseDisplayed();const texture=new Texture2D();texture.image=img;texture.setFilters(Texture2D.Filter.NEAREST,Texture2D.Filter.NEAREST);
    const frame=new SpriteFrame();frame.texture=texture;this.displayed=frame;this.displayedImage=img;this.overlay.spriteFrame=frame;
    this.legacyShown=true;
  });}
  private releaseDisplayed(){this.overlay.spriteFrame=null;if(this.displayed){this.displayed.texture?.destroy();this.displayed.destroy();this.displayed=null;}if(this.displayedImage)assetManager.releaseAsset(this.displayedImage);this.displayedImage=null;}
  pause(){if(this.suspended)return;this.suspended=true;this.suspendedAt=performance.now();this.camera.enabled=false;
    if(this.active){this.replayPauseAt=this.suspendedAt;this.videoProof?.pause(this.suspendedAt);
      if(this.video.node.active){this.video.pause();this.video.node.active=false;}
      this.overlay.node.active=false;}}
  resume(){const now=performance.now();if(this.suspended&&this.encoding)this.encoding.started+=now-this.suspendedAt;this.suspended=false;this.suspendedAt=0;this.lastWall=now;}
  destroy(){
    director.off(Director.EVENT_AFTER_DRAW,this.afterDraw,this);this.cancelEncoding('destroy');this.stopReplay();
    if((globalThis as any).fleetingMomentEncoded===this.encodedCallback)(globalThis as any).fleetingMomentEncoded=this.previousCallback;
    this.camera.node.destroy();this.target.destroy();this.overlay.node.destroy();this.video.node.destroy();
  }
}

@ccclass('Bootstrap')
export class Bootstrap extends Component {
  private moments:BrowserMoments|NativeMoments|null=null;private game!:Game;private painter!:CocosPainter;private audio!:AudioSource;
  private doorAudio!:AudioSource;private doorRequested=false;private doorStarted=false;private doorVoicePaused=false;private doorOffset=0;
  private music!:SceneMusicController;private musicNodes:Node[]=[];
  private clips=new Map<string,AudioClip|null>();private fontAsset:Font|null=null;private destroyed=false;
  private touchId:number|null=null;private mousePressed=false;private backPressed=false;private lastBack=0;
  private stage!:Node;private camera!:Camera;private logicalWidth=480;private logicalHeight=270;private hidden=false;private exited=false;private resetDelta=false;private marginColor='';
  private appliedFrameWidth=0;private appliedFrameHeight=0;private resizing=false;
  private perfIntervals:number[]=[];private perfLastAt:number|null=null;private perfWindowAt=0;
  private perfPhaseTotals=[0,0,0,0,0,0];private perfScriptIntervals:number[]=[];private perfPhaseSamples=0;
  private perfPaintTotals=[0,0,0,0,0];
  start(){
    profiler.hideStats();engineGame.frameRate=60;
    const stage=this.stage=new Node('Game Canvas');stage.layer=Layers.Enum.UI_2D;this.node.addChild(stage);stage.setPosition(240,135,0);stage.addComponent(UITransform).setContentSize(480,270);
    const canvas=stage.addComponent(Canvas);const cameraNode=new Node('UI Camera');cameraNode.layer=Layers.Enum.UI_2D;stage.addChild(cameraNode);cameraNode.setPosition(0,0,1000);
    const camera=this.camera=cameraNode.addComponent(Camera);camera.projection=Camera.ProjectionType.ORTHO;camera.orthoHeight=135;camera.near=0;camera.far=2000;camera.visibility=Layers.Enum.UI_2D;camera.clearColor=new Color(17,25,34);canvas.cameraComponent=camera;
    this.resize();view.on('canvas-resize',this.resize,this);
    this.painter=new CocosPainter(stage);this.audio=this.node.addComponent(AudioSource);
    const doorNode=new Node('Opening door sound');this.node.addChild(doorNode);this.doorAudio=doorNode.addComponent(AudioSource);this.doorAudio.playOnAwake=false;this.doorAudio.loop=false;this.doorAudio.volume=.48;
    this.music=new SceneMusicController(this.createMusicBackend());
    resources.load('fonts/FusionPixel',Font,(err,font)=>{
      if(err||!font){return;}
      if(this.destroyed){resources.release('fonts/FusionPixel',Font);return;}
      this.fontAsset=font;this.painter.font=font;
    });
    this.game=new Game({load:()=>sys.localStorage.getItem('fleeting-life-s1'),save:(value:string)=>sys.localStorage.setItem('fleeting-life-s1',value)},{sound:(name:string)=>this.sound(name),capture:(kind:string)=>this.moments?.capture(kind),replay:(active:boolean,onResult?:(success:boolean)=>void)=>this.moments?.replay(active,onResult),exit:()=>{
      this.music?.destroy();this.audio?.stop();this.doorAudio?.stop();this.doorRequested=false;
      if(sys.isNative){try{native.reflection.callStaticMethod('com/cocos/game/AppActivity','exitGame','()V');}catch(error){console.warn('Fleeting exit unavailable',error);}}
      else if(sys.isBrowser)this.exitBrowserGame();
    },hellCourse:(json:string)=>{
      if(!sys.isNative)return;
      try{native.reflection.callStaticMethod('com/cocos/game/AppActivity','logHellCourse','(Ljava/lang/String;)V',json);}
      catch{console.error('FLEETING_HELL_COURSE '+json);}
    }});
    this.preloadDoorSound();
    // Android's Activity dispatches Back through JSB; Cocos can also emit MOBILE_BACK for the same press.
    if(sys.isNative)(globalThis as any).fleetingLifeBack=()=>this.handleBack();
    if(sys.isNative){this.moments=new NativeMoments(stage,()=>this.game);console.warn('FLEETING_PERF_READY');}
    if(sys.isBrowser){this.moments=new BrowserMoments(()=>this.game);(globalThis as any).fleetingLife={game:this.game,painter:this.painter,moments:this.moments,getLayout:()=>({width:this.logicalWidth,height:this.logicalHeight,core:coreRect(document.getElementById('GameCanvas') as HTMLCanvasElement),frameRate:engineGame.frameRate})};window.addEventListener('blur',this.browserHide);window.addEventListener('focus',this.browserShow);}
    engineGame.on(EngineGame.EVENT_HIDE,this.appHide,this);engineGame.on(EngineGame.EVENT_SHOW,this.appShow,this);
    input.on(Input.EventType.TOUCH_START,this.touchStart,this);input.on(Input.EventType.TOUCH_MOVE,this.touchMove,this);input.on(Input.EventType.TOUCH_END,this.touchEnd,this);input.on(Input.EventType.TOUCH_CANCEL,this.touchCancel,this);
    input.on(Input.EventType.MOUSE_DOWN,this.mouseDown,this);input.on(Input.EventType.MOUSE_MOVE,this.mouseMove,this);input.on(Input.EventType.MOUSE_UP,this.mouseUp,this);
    input.on(Input.EventType.KEY_DOWN,this.keyDown,this);input.on(Input.EventType.KEY_UP,this.keyUp,this);
  }
  private resize(){
    if(this.resizing)return;
    this.resizing=true;
    try{
    const frame=view.getFrameSize(),layout=coreViewport(frame);
    this.appliedFrameWidth=frame.width;this.appliedFrameHeight=frame.height;
    this.logicalWidth=layout.logicalWidth;this.logicalHeight=layout.logicalHeight;
    // Cover the physical frame. The stage is expanded to the visible design size,
    // while input remains anchored to the central 480x270 interaction area.
    view.setDesignResolutionSize(this.logicalWidth,this.logicalHeight,ResolutionPolicy.NO_BORDER);
    this.stage.setPosition(this.logicalWidth/2,this.logicalHeight/2,0);this.stage.getComponent(UITransform)!.setContentSize(this.logicalWidth,this.logicalHeight);this.camera.orthoHeight=this.logicalHeight/2;
    // A mobile reload can leave the on-screen framebuffer and camera aspect at
    // the old size even after View updates. Resize only swapchain windows;
    // the independent moment-capture RenderTexture keeps its authored size.
    if(sys.isBrowser&&engineGame.canvas)director.root?.resize(engineGame.canvas.width,engineGame.canvas.height);
    }finally{this.resizing=false;}
  }
  update(dt:number){if(!this.game||this.hidden)return;
    // Browser frame size can change without canvas-resize after a mobile reload.
    // Apply the design size after the engine has updated its cached frame pixels.
    if(sys.isBrowser){const frame=view.getFrameSize();if(frame.width!==this.appliedFrameWidth||frame.height!==this.appliedFrameHeight)this.resize();}
    const measure=sys.isNative;if(measure)this.sampleNativePerf();const t0=measure?this.nativePerfNow():0;
    this.game.update(this.resetDelta?0:Math.min(dt,.05));this.syncDoorSound();const t1=measure?this.nativePerfNow():0;this.resetDelta=false;this.music?.update(this.game,this.nativePerfNow());const shade=MARGIN_COLORS[this.game.screen==='hall'||this.game.phase==='corridorTransition'?'hall':this.game.theme]||MARGIN_COLORS.dawn;
    if(shade!==this.marginColor){this.marginColor=shade;this.camera.clearColor=color(shade);if(sys.isBrowser)document.body.style.background=shade;}
    const tShade=measure?this.nativePerfNow():0;this.painter.begin(this.game.screen==='hall');drawWideMargins(this.painter,this.game,this.logicalWidth,this.logicalHeight);const t2=measure?this.nativePerfNow():0;
    const mx=Math.max(0,(this.logicalWidth-480)/2),my=Math.max(0,(this.logicalHeight-270)/2);
    if(mx>0){drawSceneBackdrop(this.game,this.painter,{left:-mx,top:0,right:0,bottom:270});drawSceneBackdrop(this.game,this.painter,{left:480,top:0,right:480+mx,bottom:270});}
    if(my>0){drawSceneBackdrop(this.game,this.painter,{left:-mx,top:-my,right:480+mx,bottom:0});drawSceneBackdrop(this.game,this.painter,{left:-mx,top:270,right:480+mx,bottom:270+my});}
    this.game.render(this.painter);drawWideMarginOverlays(this.painter,this.game,this.logicalWidth,this.logicalHeight);const t3=measure?this.nativePerfNow():0;
    this.painter.end();const t4=measure?this.nativePerfNow():0;
    if(this.moments instanceof NativeMoments)this.moments.update();if(measure)this.recordNativePhase(t0,t1,tShade,t2,t3,t4,this.nativePerfNow());}
  private nativePerfNow(){return typeof performance!=='undefined'&&typeof performance.now==='function'?performance.now():Date.now();}
  private resetNativePerf(){this.perfIntervals.length=0;this.perfLastAt=null;this.perfWindowAt=0;this.perfScriptIntervals.length=0;this.perfPhaseSamples=0;this.perfPhaseTotals.fill(0);this.perfPaintTotals.fill(0);}
  private recordNativePhase(t0:number,t1:number,tShade:number,t2:number,t3:number,t4:number,t5:number){
    this.perfPhaseSamples++;this.perfPhaseTotals[0]+=t1-t0;this.perfPhaseTotals[1]+=tShade-t1;
    this.perfPhaseTotals[2]+=t2-tShade;this.perfPhaseTotals[3]+=t3-t2;this.perfPhaseTotals[4]+=t4-t3;this.perfPhaseTotals[5]+=t5-t4;
    this.perfScriptIntervals.push(t5-t0);
    const counts=this.painter.counts;this.perfPaintTotals[0]+=counts.ops;this.perfPaintTotals[1]+=counts.graphics;
    this.perfPaintTotals[2]+=counts.labels;this.perfPaintTotals[3]+=counts.sprites;this.perfPaintTotals[4]+=counts.redrawn;
  }
  private sampleNativePerf(){
    // Measure update start-to-start time; the gameplay dt below is capped at 50 ms.
    const now=this.nativePerfNow();
    if(this.perfLastAt===null){this.perfLastAt=now;this.perfWindowAt=now;return;}
    const gapMs=now-this.perfLastAt;this.perfLastAt=now;
    if(gapMs>0)this.perfIntervals.push(gapMs);
    if(now-this.perfWindowAt<30000)return;
    const samples=this.perfIntervals.length;
    if(samples){
      this.perfIntervals.sort((a,b)=>a-b);
      let totalMs=0,over25=0;for(const ms of this.perfIntervals){totalMs+=ms;if(ms>25)over25++;}
      const p95=this.perfIntervals[Math.ceil(samples*.95)-1],max=this.perfIntervals[samples-1];
      console.warn(`FLEETING_PERF screen=${this.game.screen} samples=${samples} targetFps=${engineGame.frameRate} avgFps=${(samples*1000/totalMs).toFixed(1)} over25Pct=${(over25*100/samples).toFixed(1)} p95DtMs=${p95.toFixed(1)} maxDtMs=${max.toFixed(1)}`);
    }
    if(this.perfPhaseSamples){const n=this.perfPhaseSamples,avg=(value:number)=>(value/n).toFixed(2);
      this.perfScriptIntervals.sort((a,b)=>a-b);const p95=this.perfScriptIntervals[Math.ceil(n*.95)-1],max=this.perfScriptIntervals[n-1];
      console.warn(`FLEETING_PHASE screen=${this.game.screen} samples=${n} gameMs=${avg(this.perfPhaseTotals[0])} shadeMs=${avg(this.perfPhaseTotals[1])} beginMs=${avg(this.perfPhaseTotals[2])} renderMs=${avg(this.perfPhaseTotals[3])} finishMs=${avg(this.perfPhaseTotals[4])} momentsMs=${avg(this.perfPhaseTotals[5])} p95ScriptMs=${p95.toFixed(2)} maxScriptMs=${max.toFixed(2)} paintOps=${avg(this.perfPaintTotals[0])} graphicsNodes=${avg(this.perfPaintTotals[1])} labels=${avg(this.perfPaintTotals[2])} sprites=${avg(this.perfPaintTotals[3])} redrawnGraphics=${avg(this.perfPaintTotals[4])}`);
    }
    this.perfIntervals.length=0;this.perfWindowAt=now;
    this.perfScriptIntervals.length=0;this.perfPhaseSamples=0;this.perfPhaseTotals.fill(0);this.perfPaintTotals.fill(0);
  }
  private exitBrowserGame(){
    if(this.exited)return;
    this.exited=true;this.appHide();
    if(document.fullscreenElement)try{void Promise.resolve(document.exitFullscreen?.()).catch(()=>{});}catch{}
    const screen=document.createElement('main');screen.id='game-exit-screen';screen.setAttribute('aria-label','浮生已退出');
    screen.style.cssText='position:fixed;inset:0;z-index:2147483647;display:grid;place-items:center;padding:24px;background:#172825;color:#efe8d2;text-align:center;font-family:FusionPixel,monospace';
    const card=document.createElement('div');card.style.cssText='max-width:30rem;padding:32px 24px;border:1px solid #60796a;background:#22382f;box-shadow:0 16px 50px #101d19';
    const title=document.createElement('h1');title.textContent='本次游戏已退出';title.style.cssText='margin:0 0 16px;font-size:clamp(20px,4vw,30px);font-weight:normal';
    const message=document.createElement('p');message.textContent='可以关闭这个页面，也可以重新进入。';message.style.cssText='margin:0 0 24px;font-size:clamp(13px,2.5vw,16px);line-height:1.7';
    const restart=document.createElement('button');restart.type='button';restart.textContent='重新进入';restart.style.cssText='min-width:120px;min-height:44px;padding:9px 20px;border:1px solid #d6c99e;background:#d8cfad;color:#23392f;cursor:pointer;font:inherit';
    restart.addEventListener('click',()=>window.location.reload());card.append(title,message,restart);screen.appendChild(card);document.body.appendChild(screen);
  }
  private preloadDoorSound(){
    if(this.clips.has('door'))return;
    this.clips.set('door',null);resources.load('audio/door',AudioClip,(err,clip)=>{
      if(err||!clip){this.clips.delete('door');return;}
      if(this.exited||this.destroyed){resources.release('audio/door',AudioClip);return;}
      this.clips.set('door',clip);this.syncDoorSound();
    });
  }
  private syncDoorSound(){
    if(!this.doorRequested||!this.game)return;
    if(this.exited||this.destroyed||this.game.screen!=='play'||this.game.phase!=='intro'){
      this.doorAudio.stop();this.doorRequested=false;this.doorStarted=false;return;
    }
    this.doorAudio.volume=this.game.settings.muted?0:.48;
    if(this.hidden||this.game.paused){
      if(this.doorStarted&&!this.doorVoicePaused&&this.doorAudio.playing){this.doorOffset=Math.max(0,this.doorAudio.currentTime);this.doorVoicePaused=true;this.doorAudio.pause();}
      return;
    }
    if(!this.doorStarted){
      const clip=this.clips.get('door');if(!clip)return;
      this.doorAudio.clip=clip;this.doorOffset=Math.max(0,this.game.phaseTime);
      const duration=clip.getDuration();if(duration>0&&this.doorOffset>=duration){this.doorRequested=false;return;}
      this.doorAudio.currentTime=this.doorOffset;this.doorAudio.play();this.doorStarted=true;
    }else if(this.doorVoicePaused){
      this.doorVoicePaused=false;
      if(!this.doorAudio.playing){if(Math.abs(this.doorAudio.currentTime-this.doorOffset)>.05)this.doorAudio.currentTime=this.doorOffset;this.doorAudio.play();}
    }
  }
  private sound(name:string){if(this.exited||this.destroyed)return;
    if(name==='door'){this.doorAudio.stop();this.doorRequested=true;this.doorStarted=false;this.doorVoicePaused=false;this.doorOffset=0;this.preloadDoorSound();this.syncDoorSound();return;}
    if(!this.clips.has(name)){this.clips.set(name,null);resources.load('audio/'+name,AudioClip,(err,clip)=>{
      if(err||!clip)return;
      if(this.exited||this.destroyed){resources.release('audio/'+name,AudioClip);return;}
      this.clips.set(name,clip);if(!this.hidden&&!this.game.settings.muted)this.audio.playOneShot(clip,.16);
    });
  }else{const clip=this.clips.get(name);if(clip)this.audio.playOneShot(clip,.16);}}
  private point(e:EventTouch|EventMouse):[number,number]{
    // getUILocation is already divided by the Cocos design scale. Viewport expects frame pixels.
    return pointInCore(e.getLocation(),view.getFrameSize());
  }
  private inside(p:[number,number]){
    // The added scenery is also a valid jump/swipe surface during a run.
    const side=this.game?.screen==='play'?Math.max(0,(this.logicalWidth-480)/2):0;
    return p[0]>=-side&&p[0]<=480+side&&p[1]>=0&&p[1]<=270;
  }
  private touchStart(e:EventTouch){if(this.hidden||this.touchId!==null||this.mousePressed)return;const p=this.point(e);if(!this.inside(p))return;this.touchId=e.getID();this.game.pointerDown(...p);}
  private touchMove(e:EventTouch){if(e.getID()!==this.touchId)return;this.game.pointerMove(...this.point(e));}
  private touchEnd(e:EventTouch){if(e.getID()!==this.touchId)return;this.touchId=null;this.game.pointerUp(...this.point(e));}
  private touchCancel(e:EventTouch){if(e.getID()!==this.touchId)return;this.touchId=null;this.game.pointerCancel();}
  private mouseDown(e:EventMouse){if(this.hidden||this.touchId!==null||e.getButton()!==EventMouse.BUTTON_LEFT)return;const p=this.point(e);if(!this.inside(p))return;this.mousePressed=true;this.game.pointerDown(...p);}
  private mouseMove(e:EventMouse){if(this.touchId!==null||this.hidden)return;this.game.pointerMove(...this.point(e));}
  private mouseUp(e:EventMouse){if(this.touchId!==null||!this.mousePressed||e.getButton()!==EventMouse.BUTTON_LEFT)return;this.mousePressed=false;this.game.pointerUp(...this.point(e));}
  private key(e:EventKeyboard):string {const k=e.keyCode;if(k>=KeyCode.DIGIT_0&&k<=KeyCode.DIGIT_9)return String.fromCharCode(k);if(k>=KeyCode.KEY_A&&k<=KeyCode.KEY_Z)return String.fromCharCode(k).toLowerCase();return ({[KeyCode.ARROW_LEFT]:'ArrowLeft',[KeyCode.ARROW_RIGHT]:'ArrowRight',[KeyCode.ARROW_UP]:'ArrowUp',[KeyCode.ARROW_DOWN]:'ArrowDown',[KeyCode.SPACE]:' ',[KeyCode.ENTER]:'Enter',[KeyCode.ESCAPE]:'Escape'} as Record<number,string>)[k]||'';}
  private handleBack(){const now=Date.now();if(this.hidden||now-this.lastBack<120)return;this.lastBack=now;this.game.back();}
  private keyDown(e:EventKeyboard){if(this.hidden)return;if(e.keyCode===KeyCode.MOBILE_BACK){if(!this.backPressed)this.handleBack();this.backPressed=true;return;}this.game.keyDown(this.key(e));}
  private keyUp(e:EventKeyboard){if(this.exited)return;if(e.keyCode===KeyCode.MOBILE_BACK){this.backPressed=false;return;}this.game.keyUp(this.key(e));}
  private appHide(){if(!this.game||this.hidden)return;this.hidden=true;this.syncDoorSound();if(sys.isNative)this.resetNativePerf();this.moments?.pause();this.painter?.suspendEndingVideo();this.music?.suspend(this.nativePerfNow());this.touchId=null;this.mousePressed=false;this.backPressed=false;this.game.appHide();this.audio.stop();}
  private appShow(){if(!this.game||this.exited||!this.hidden)return;this.hidden=false;if(sys.isNative)this.resetNativePerf();this.resetDelta=true;this.moments?.resume();this.painter?.resumeEndingVideo();this.music?.resume(this.nativePerfNow());this.game.appShow();this.syncDoorSound();}
  private browserHide=()=>this.appHide();private browserShow=()=>{if(!document.hidden)this.appShow();};
  onDestroy(){
    this.destroyed=true;this.moments?.destroy();this.painter?.destroy();this.music?.destroy();this.doorAudio?.stop();if(this.doorAudio)this.doorAudio.clip=null;this.doorRequested=false;
    for(const [name,clip] of this.clips){if(clip)resources.release('audio/'+name,AudioClip);}
    this.clips.clear();if(this.fontAsset){resources.release('fonts/FusionPixel',Font);this.fontAsset=null;}
    if(sys.isNative)delete (globalThis as any).fleetingLifeBack;view.off('canvas-resize',this.resize,this);engineGame.off(EngineGame.EVENT_HIDE,this.appHide,this);engineGame.off(EngineGame.EVENT_SHOW,this.appShow,this);if(sys.isBrowser){window.removeEventListener('blur',this.browserHide);window.removeEventListener('focus',this.browserShow);}input.off(Input.EventType.TOUCH_START,this.touchStart,this);input.off(Input.EventType.TOUCH_MOVE,this.touchMove,this);input.off(Input.EventType.TOUCH_END,this.touchEnd,this);input.off(Input.EventType.TOUCH_CANCEL,this.touchCancel,this);input.off(Input.EventType.MOUSE_DOWN,this.mouseDown,this);input.off(Input.EventType.MOUSE_MOVE,this.mouseMove,this);input.off(Input.EventType.MOUSE_UP,this.mouseUp,this);input.off(Input.EventType.KEY_DOWN,this.keyDown,this);input.off(Input.EventType.KEY_UP,this.keyUp,this);
  }

  private createMusicBackend():SceneMusicBackend {
    return {
      load: (id:SceneMusicId) => new Promise<MusicVoice>((resolve,reject) => {
        const path='audio/bgm/'+id;
        resources.load(path,AudioClip,(error,clip)=>{
          if(error||!clip){reject(error||new Error('BGM unavailable: '+id));return;}
          if(this.destroyed||this.exited){resources.release(path,AudioClip);reject(new Error('Bootstrap inactive'));return;}
          const node=new Node('BGM '+id);node.layer=Layers.Enum.UI_2D;this.node.addChild(node);
          const source=node.addComponent(AudioSource);source.playOnAwake=false;source.volume=0;source.clip=clip;source.loop=true;
          this.musicNodes.push(node);let released=false,voicePaused=false,offset=0;
          const release=()=>{if(released)return;released=true;source.stop();source.clip=null;resources.release(path,AudioClip);const index=this.musicNodes.indexOf(node);if(index>=0)this.musicNodes.splice(index,1);node.destroy();};
          resolve({id,
            setVolume:(volume:number)=>{if(!released)source.volume=Math.max(0,Math.min(1,volume));},
            play:()=>{if(!released&&!source.playing)source.play();},
            pause:()=>{if(released||voicePaused)return;offset=Math.max(0,source.currentTime);voicePaused=true;source.volume=0;source.pause();},
            resume:()=>{if(released||!voicePaused)return;voicePaused=false;
              // Cocos 3.8.8 resumes a paused player, but restarts one already
              // playing. Guard playing and restore a backend-reset offset.
              if(!source.playing){if(Math.abs(source.currentTime-offset)>.05)source.currentTime=offset;source.play();}
            },stop:release});
        });
      }),
    };
  }
}
