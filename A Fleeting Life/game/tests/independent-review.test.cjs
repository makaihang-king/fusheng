'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const {Game}=require('../build/Game');
const {ENDING_MEDIA,SEGMENTS}=require('../build/Content');
const {VideoReplayEvidence}=require('../build/ReplayEvidence');
const {obstacleAppearance,obstacleFrame}=require('../build/ObstacleLogic');
const {drawPhysicalObstacle}=require('../build/ObstacleRendering');
const root=path.resolve(__dirname,'..');
const fresh=()=>new Game({load:()=>null,save(){}});
function advance(game,frames){for(let i=0;i<frames;i++)game.update(1/60);}

function typeScriptRuntime(){
  for(const candidate of [process.env.TYPESCRIPT_PATH,path.resolve(root,'../需要的软件/CocosCreator/3.8.8/resources/app.asar.unpacked/node_modules/typescript'),path.resolve(root,'node_modules/typescript')].filter(Boolean)){
    try{return require(candidate);}catch{}
  }
  assert.fail('TypeScript runtime from installed Cocos is required');
}

/* Run the actual TypeScript CocosPainter class with a minimal scene/video surface.
 * No movie, Cocos application build or device is needed. The stub controls only
 * resource-ready events, media time and the clock; painter code is unmodified. */
function cocosHarness({artEntries=[]}={}){
  const ts=typeScriptRuntime();
  const source=fs.readFileSync(path.join(root,'assets/scripts/Bootstrap.ts'),'utf8');
  const start=source.indexOf('class CocosPainter implements Painter {'),end=source.indexOf('\ntype RawMomentFrame=',start);
  assert.ok(start>=0&&end>start,'real CocosPainter class must be found');
  let wall=0,pendingLoad;const requests=[],releases=[];
  class UITransform{
    width=0;height=0;anchorX=0;anchorY=0;
    setContentSize(w,h){this.width=w;this.height=h;}
    setAnchorPoint(x,y){this.anchorX=x;this.anchorY=y;}
  }
  class Node{
    active=true;position={x:0,y:0};children=[];components=new Map();events=new Map();
    constructor(name){this.name=name;}
    addChild(child){child.parent=this;this.children.push(child);}
    addComponent(Type){const instance=new Type();instance.node=this;this.components.set(Type,instance);return instance;}
    getComponent(Type){return this.components.get(Type);}
    on(name,listener){this.events.set(name,listener);}
    emit(name){this.events.get(name)?.();}
    getSiblingIndex(){return this.parent?.children.indexOf(this)??0;}
    setSiblingIndex(index){const list=this.parent.children,old=list.indexOf(this);list.splice(old,1);list.splice(index,0,this);}
    setPosition(x,y){this.position={x,y};}
  }
  class Graphics{
    operations=[];
    clear(){this.operations=[];}
    rect(...args){this.operations.push(args);}
    fill(){}moveTo(){}lineTo(){}stroke(){}circle(){}close(){}
  }
  class VideoPlayer{
    static EventType={READY_TO_PLAY:'ready',PLAYING:'playing',COMPLETED:'completed',ERROR:'error'};
    static ResourceType={LOCAL:'local'};
    currentTime=0;
    play(){this.node.emit('playing');}
    pause(){}resume(){this.node.emit('playing');}stop(){}
  }
  class VideoClip{}
  class Texture2D{static Filter={NEAREST:'nearest'};constructor(width=2048,height=540){this.width=width;this.height=height;}setFilters(){};}
  const createdFrames=[];
  class SpriteFrame{constructor(){createdFrames.push(this);}destroy(){this.destroyed=true;}}
  class Rect{constructor(x,y,width,height){Object.assign(this,{x,y,width,height});}}
  class Color{constructor(r,g,b,a=255){Object.assign(this,{r,g,b,a});}}
  class Sprite{static SizeMode={CUSTOM:'custom'};trim=false;spriteFrame=null;color=new Color(255,255,255);dirty=0;markForUpdateRenderData(){this.dirty++;}}
  const context={module:{exports:{}},ART_MANIFEST:artEntries,ART_PIXEL_DENSITY:2,ENDING_MEDIA,VideoReplayEvidence,
    Node,UITransform,Graphics,VideoPlayer,VideoClip,Texture2D,SpriteFrame,Rect,Color,Sprite,Layers:{Enum:{UI_2D:1}},sys:{isNative:false},
    resources:{load(resource,type,cb){requests.push({resource,type,callback:cb,at:wall});if(type===VideoClip)pendingLoad=cb;},release(resource,type){releases.push({resource,type});}},performance:{now:()=>wall},color:value=>value};
  const javascript=ts.transpileModule(source.slice(start,end)+'\nmodule.exports=CocosPainter;',
    {compilerOptions:{target:ts.ScriptTarget.ES2020,module:ts.ModuleKind.CommonJS}}).outputText;
  vm.runInNewContext(javascript,context,{filename:'CocosPainter-under-review.js'});
  const scene=new Node('root'),painter=new context.module.exports(scene);
  function render({at=wall,paused=false,sessionId=1}={}){
    wall=at;
    return painter.video('ending.video.morning',0,0,480,270,0,paused,sessionId,'base');
  }
  function ready(){assert.ok(pendingLoad);pendingLoad(null,new VideoClip());painter.endingVideoNode.emit('ready');}
  return {painter,scene,render,ready,pending:()=>pendingLoad,setTime:t=>{painter.endingVideoPlayer.currentTime=t;},
    setWall:t=>{wall=t;},requests,releases,createdFrames,SpriteFrame,Texture2D,Graphics,VideoPlayer,Sprite,UITransform};
}

function sceneGroundUnderReview(){
  const ts=typeScriptRuntime(),source=fs.readFileSync(path.join(root,'assets/scripts/SceneGround.ts'),'utf8');
  const context={exports:{},require:()=>require('../build/Content')};
  vm.runInNewContext(ts.transpileModule(source,{compilerOptions:{target:ts.ScriptTarget.ES2020,module:ts.ModuleKind.CommonJS}}).outputText,context,{filename:'SceneGround-under-review.js'});
  return context.exports;
}

function canvasRegionHarness(){
  const source=fs.readFileSync(path.join(root,'preview/host.js'),'utf8');
  const start=source.indexOf(' imageRegion(key,'),end=source.indexOf('\n video(',start);
  assert.ok(start>=0&&end>start,'real Canvas imageRegion must be found');
  const image={complete:true,naturalWidth:2048,naturalHeight:540},calls=[],ctx={globalAlpha:.6,drawImage(...args){calls.push({args,alpha:this.globalAlpha});}};
  const context={ctx,requestArt:()=>image,artLastUsed:new Map(),renderFrame:73,artPixel:v=>Math.round(v*2)/2};
  vm.runInNewContext('this.draw=({'+source.slice(start,end)+'}).imageRegion;',context,{filename:'Canvas-imageRegion-under-review.js'});
  return {draw:context.draw,image,ctx,calls,lastUsed:context.artLastUsed};
}

function canvasArtHarness(){
  const source=fs.readFileSync(path.join(root,'preview/host.js'),'utf8');
  const start=source.indexOf('function requestArt(key){'),end=source.indexOf('\nfunction prefetchAction(',start);
  assert.ok(start>=0&&end>start,'real requestArt must be found');
  let wall=0;const images=[],art=new Map(),artFailures=new Map(),key='character.pixel.run.00';
  class Image{constructor(){images.push(this);}}
  const context={Image,art,artFailures,artLastUsed:new Map(),renderFrame:0,performance:{now:()=>wall},
    artEntries:new Map([[key,{path:'art/pixel/character/hd/run/00.png'}]])};
  vm.runInNewContext(source.slice(start,end)+'\nthis.request=requestArt;',context,{filename:'Canvas-requestArt-under-review.js'});
  return {key,images,art,failures:artFailures,request:()=>context.request(key),setWall:t=>{wall=t;}};
}

test('late resource readiness starts a full film rather than inheriting the loading time as a playback stall',()=>{
  const h=cocosHarness();
  assert.equal(h.render({at:0}).status,'loading');
  for(let i=1;i<=70;i++)assert.equal(h.render({at:i*100}).status,'loading');
  h.ready();
  assert.equal(h.render({at:7016.67}).status,'playing','a seven-second valid load must receive its own playback stall window');
});

test('a genuinely stalled film still fails after six seconds without decoded progress',()=>{
  const h=cocosHarness();h.render({at:0});h.ready();
  assert.equal(h.render({at:16.67}).status,'playing');
  let result;
  for(let i=1;i<=61;i++)result=h.render({at:16.67+i*100});
  assert.equal(result.status,'failed');
});

test('a movie which becomes ready while paused remains ready and receives a fresh playback window on resume',()=>{
  const h=cocosHarness();h.render({at:0});
  for(let i=1;i<=70;i++)h.render({at:i*100});
  h.render({at:7016.67,paused:true});h.ready();
  assert.equal(h.render({at:20000,paused:true}).status,'loading');
  assert.equal(h.render({at:40000,paused:true}).status,'loading');
  const resumed=h.render({at:40016.67});assert.equal(resumed.status,'playing');assert.equal(resumed.visible,true);
});

test('a delayed resource callback from an earlier replay cannot replace the fresh playback session',()=>{
  const h=cocosHarness();h.render({at:0,sessionId:1});const old=h.pending();
  h.render({at:16.67,sessionId:2});const current=h.pending();assert.notEqual(current,old);
  const releasesBefore=h.releases.filter(r=>r.resource==='video/endings/morning').length;
  old(null,{id:'stale-clip'});
  assert.equal(h.releases.filter(r=>r.resource==='video/endings/morning').length,releasesBefore+1,
    'a stale video callback must release the clip it no longer owns');
  assert.equal(h.painter.endingVideoPlayer.clip,null);assert.equal(h.render({at:33.33,sessionId:2}).status,'loading');
  h.ready();assert.equal(h.render({at:50,sessionId:2}).status,'playing');
  assert.notEqual(h.painter.endingVideoPlayer.clip?.id,'stale-clip');
});

test('graphics drawn after a visible video occupy a new layer above that video',()=>{
  const h=cocosHarness();h.render({at:0});h.ready();
  h.painter.begin();h.painter.rect(0,0,480,270,'#eeeade');
  assert.equal(h.render({at:16.67}).visible,true);
  h.painter.rect(445,12,23,18,'#334941');h.painter.end();
  const videoIndex=h.scene.children.findIndex(n=>n.getComponent(h.VideoPlayer));
  const overlayIndex=h.scene.children.findIndex(n=>n.getComponent(h.Graphics)?.operations.some(r=>r[0]===205&&r[2]===23));
  assert.ok(overlayIndex>videoIndex,'the fallback pause-button background must remain in front of the video even while its icon loads');
});

test('diving during the final piano-practice frame cannot silently resolve the following choice',()=>{
  const game=fresh();game.start();game.beginSegment(4);game.finishSegment();
  assert.equal(game.phase,'piano');
  advance(game,890);game.jump();advance(game,9);game.down();advance(game,2);
  assert.equal(game.phase,'choice','entering a choice discards the preceding scene movement');
  assert.equal(game.choice,4);assert.equal(game.choiceResult,'');
  assert.equal(game.run.events.includes('pianoSmash'),false);
});

test('a retry discards a preceding dive and its paper-plane glide without fabricating a landing',()=>{
  const game=fresh();game.start();game.beginSegment(3);game.obstacles=[];game.pickups=[];
  game.storyEffect('plane');game.jump();advance(game,5);game.down();
  // A pending paper-plane effect can be active when the route is restarted.
  game.storyEffect('plane');const sounds=[];game.hooks.sound=name=>sounds.push(name);
  game.restart();
  assert.equal(game.diving,false);assert.equal(game.glide,0);advance(game,1);
  assert.equal(sounds.includes('land'),false,'retry starts on the ground rather than completing a cancelled dive');
});

test('returning from second-grade replay honors the button even when the personal finale was never completed',()=>{
  const game=fresh();game.profile.lights.push('secondGrade');game.profile.progress.endings.secondGrade=1;
  game.startEnding('secondGrade',true);
  game.render({rect(){},line(){},circle(){},poly(){},text(){},image(){return false;},
    video(){return {visible:true,seconds:1,status:'playing'};}});
  const button=game.buttons.find(b=>b.label==='回到回廊');assert.ok(button);
  game.pointerDown(button.x+button.w/2,button.y+button.h/2);
  game.pointerUp(button.x+button.w/2,button.y+button.h/2);
  assert.equal(game.screen,'hall','manual replay exit must not start another fifteen-second finale');
  assert.equal(game.profile.finalePlayed,false);assert.deepEqual(game.profile.lights,['secondGrade']);
  assert.equal(game.profile.progress.endings.secondGrade,1);
});

test('every lamp shade is physically connected to its arm rather than floating below the support',()=>{
  const lamps=SEGMENTS.flatMap(s=>s.obstacles).filter(o=>obstacleAppearance(o.label,o.kind).source==='lamp');
  assert.ok(lamps.length>0);
  for(const lamp of lamps){
    const lines=[],b=obstacleFrame(lamp,lamp.at).bounds;
    drawPhysicalObstacle({rect(){},circle(){},poly(){},text(){},image(){return false;},line(...args){lines.push(args);}},lamp,lamp.at,'#637b75');
    const inside=(x,y)=>x>=b.x&&x<=b.x+b.w&&y>=b.y&&y<=b.y+b.h;
    assert.ok(lines.some(([x1,y1,x2,y2])=>inside(x1,y1)!==inside(x2,y2)),lamp.label+' must include a support crossing into the shade');
  }
});

test('Cocos canonical frames recover after a transient load failure without losing their pinned identity',()=>{
  const key='character.pixel.run.00',h=cocosHarness({artEntries:[{key,path:'art/pixel/character/hd/run/00.png'}]});
  assert.equal(h.requests.length,1);h.requests[0].callback(new Error('temporary decoding failure'));
  for(let t=0;t<1000;t+=16){h.setWall(t);h.painter.loadArtFrame(key);}
  assert.equal(h.requests.length,1);
  h.setWall(1000);h.painter.loadArtFrame(key);assert.equal(h.requests.length,2);
  const texture=new h.Texture2D();h.requests[1].callback(null,texture);
  assert.equal(h.painter.frames.get(key).texture,texture);assert.equal(h.painter.frameFailures.has(key),false);
  h.painter.frameClock=1000;h.painter.trimFrames();assert.equal(h.painter.frames.get(key).texture,texture);
});

test('Cocos permanent frame failure uses bounded exponential backoff rather than issuing a request every draw',()=>{
  const key='character.pixel.run.00',h=cocosHarness({artEntries:[{key,path:'art/pixel/character/hd/run/00.png'}]});
  h.requests[0].callback(new Error('missing resource'));
  for(let frame=1;frame<=3600;frame++){
    h.setWall(frame*1000/60);const previous=h.requests.length;h.painter.loadArtFrame(key);
    if(h.requests.length>previous)h.requests.at(-1).callback(new Error('missing resource'));
  }
  assert.equal(h.requests.length,6,'one minute of 60fps drawing allows only six failed attempts');
  const delays=[1000,2000,4000,8000,16000];
  for(let i=1;i<h.requests.length;i++)assert.ok(h.requests[i].at-h.requests[i-1].at>=delays[i-1]);
});

test('Cocos stale texture callbacks cannot overwrite a newly requested frame after cache eviction',()=>{
  const key='character.pixel.skin.raincoat.run.00',h=cocosHarness({artEntries:[{key,path:'art/pixel/character/hd/skins/raincoat/run/00.png'}]});
  h.painter.loadArtFrame(key);const old=h.requests[0];
  h.painter.frameClock=181;h.painter.trimFrames();h.setWall(3100);h.painter.loadArtFrame(key);
  assert.equal(h.requests.length,2);old.callback(null,new h.Texture2D());
  assert.equal(h.painter.frames.get(key),null,'old completed load must leave the new request pending');
  assert.equal(h.releases.filter(r=>r.resource.endsWith('/skins/raincoat/run/00/texture')).length,1,
    'a stale texture completed after eviction must be released');
  const current=new h.Texture2D();h.requests[1].callback(null,current);assert.equal(h.painter.frames.get(key).texture,current);
});

test('Cocos destroying a painter prevents new frame loads and rejects late texture callbacks',()=>{
  const key='character.pixel.run.00',h=cocosHarness({artEntries:[{key,path:'art/pixel/character/hd/run/00.png'}]});
  const pending=h.requests[0];h.painter.destroy();pending.callback(null,new h.Texture2D());
  h.setWall(60000);h.painter.loadArtFrame(key);
  assert.equal(h.requests.length,1);assert.equal(h.painter.frames.size,0);assert.equal(h.painter.frameLoads.size,0);
  assert.ok(h.releases.length>0,'late textures are released rather than retained by a destroyed painter');
});

test('Canvas art retry keeps a pending Image stable and recovers successfully after transient failure',()=>{
  const h=canvasArtHarness(),first=h.request();first.onerror();
  h.setWall(999);assert.equal(h.request(),first);h.setWall(1000);const second=h.request();assert.notEqual(second,first);
  for(let frame=0;frame<120;frame++){h.setWall(1000+frame*16);assert.equal(h.request(),second);}
  assert.equal(h.images.length,2,'a pending retry cannot create a fresh Image each frame');
  first.onerror();assert.equal(h.failures.has(h.key),false,'stale first load errors cannot poison the new request');
  second.onload();assert.equal(h.failures.has(h.key),false);h.setWall(60000);assert.equal(h.request(),second);
});

test('Canvas permanent art failures back off without flooding Image requests',()=>{
  const h=canvasArtHarness();h.request().onerror();
  for(let frame=1;frame<=3600;frame++){
    h.setWall(frame*1000/60);const previous=h.images.length,current=h.request();
    if(h.images.length>previous)current.onerror();
  }
  assert.equal(h.images.length,6);assert.equal(h.failures.get(h.key).attempts,6);
});

test('SceneGround and Cocos use bottom-only source rows and stretch a trimmed region to its requested contact plane',()=>{
  const {drawSceneGround,SCENE_FLOOR_TOP}=sceneGroundUnderReview();
  const content=require('../build/Content'),regions=[];
  for(const name of [...Object.keys(content.SCENE_SCROLL_CHUNK_COUNTS),'corridor']){
    for(const scroll of [0,-17,9000])drawSceneGround({rect(){},imageRegion(...args){regions.push({name,args});return true;}},name,scroll);
  }
  assert.equal(SCENE_FLOOR_TOP,205);assert.ok(regions.length>0);
  for(const {name,args:[key,sx,sy,sw,sh,x,y,w,h]} of regions){
    assert.ok(key.startsWith('scene.scroll.'+name+'.')||key==='scene.pixel.'+name);
    assert.equal(sx,0);assert.equal(sy,252/270);assert.equal(sw,1);
    assert.equal(sh,h/270);assert.ok(h===18||h===11);
    assert.ok(sy>=252/270&&sy+sh<=1,'source rows must remain entirely inside the supplied floor');
    assert.ok(y>=205&&y+h<=270);assert.ok(x<480&&x+w>0);
    assert.equal(w,key.startsWith('scene.scroll.')?content.SCENE_SCROLL_TILE_WIDTH:480);
  }
  const key='scene.scroll.dawn.00',h=cocosHarness({artEntries:[{key,path:'art/pixel/scene/scroll/dawn/00.png'}]});
  h.painter.begin();assert.equal(h.painter.imageRegion(key,0,252/270,1,18/270,0,205,1024,18,.5),false);
  const texture=new h.Texture2D();h.requests[0].callback(null,texture);
  assert.equal(h.painter.imageRegion(key,0,252/270,1,18/270,0,205,1024,18,.5),true);
  const region=[...h.painter.artRegions.values()][0],sprite=h.painter.sprites[0],transform=sprite.node.getComponent(h.UITransform);
  assert.deepEqual({...region.frame.rect},{x:0,y:504,width:2048,height:36},'Rect.y is top-origin, so the crop must target bottom rows 504..539');
  assert.equal(region.frame.texture,texture);assert.equal(sprite.trim,true);
  assert.equal(transform.width,1024);assert.equal(transform.height,18);
  assert.deepEqual(sprite.node.position,{x:272,y:-79});assert.equal(sprite.color.a,128);
  h.painter.begin();h.painter.imageRegion(key,0,252/270,1,18/270,0,223,1024,18);
  assert.equal(h.painter.artRegions.size,1);assert.equal(h.painter.sprites[0].spriteFrame,region.frame,'identical source crop must reuse its region despite a different destination');
  assert.equal(h.painter.imageRegion(key,0,0,1,0,0,205,1024,18),false);
  assert.equal(h.painter.imageRegion(key,0,NaN,1,1,0,205,1024,18),false);
  assert.equal(h.requests.length,1);
});

test('Canvas bottom-floor imageRegion uses the nine-argument drawImage contract and restores opacity',()=>{
  const h=canvasRegionHarness(),key='scene.scroll.dawn.00';
  assert.equal(h.draw(key,0,252/270,1,18/270,-29.2,205.2,1024,18,.5),true);
  const first=h.calls[0];assert.equal(first.args.length,9);assert.equal(first.args[0],h.image);
  const expected=[0,504,2048,36,-29,205,1024,18];
  first.args.slice(1).forEach((value,i)=>assert.ok(Math.abs(value-expected[i])<1e-9,'Canvas drawImage source/destination argument '+i));
  assert.equal(first.alpha,.3);assert.equal(h.ctx.globalAlpha,.6);assert.equal(h.lastUsed.get(key),73);
  assert.equal(h.draw(key,-.1,.95,.2,.1,0,259,1024,11,2),true);
  const clipped=h.calls[1];assert.ok(Math.abs(clipped.args[1])<1e-9);
  assert.ok(Math.abs(clipped.args[3]-204.8)<1e-9);assert.ok(Math.abs(clipped.args[2]-513)<1e-9);
  assert.ok(Math.abs(clipped.args[4]-27)<1e-9);assert.equal(clipped.alpha,.6);assert.equal(h.ctx.globalAlpha,.6);
  assert.equal(h.draw(key,0,1.1,1,.1,0,205,1024,18),false);
  assert.equal(h.draw(key,0,0,1,1,0,205,1024,0),false);
  assert.equal(h.draw(key,0,0,1,1,0,205,Infinity,18),false);
  h.image.complete=false;assert.equal(h.draw(key,0,252/270,1,18/270,0,205,1024,18),false);
  assert.equal(h.calls.length,2,'invalid or incomplete images must not draw a full image as a crop substitute');
});

test('Cocos cropped child frames detach and release with their parent and cannot resurrect through stale loads or destruction',()=>{
  const key='scene.scroll.dawn.00',other='scene.scroll.dawn.01',h=cocosHarness({artEntries:[
    {key,path:'art/pixel/scene/scroll/dawn/00.png'},{key:other,path:'art/pixel/scene/scroll/dawn/01.png'}]});
  const draw=k=>h.painter.imageRegion(k,0,252/270,1,18/270,0,205,1024,18);
  h.painter.begin();draw(key);h.requests[0].callback(null,new h.Texture2D());assert.equal(draw(key),true);h.painter.end();
  const parent=h.painter.frames.get(key),child=[...h.painter.artRegions.values()][0].frame,sprite=h.painter.sprites[0];
  h.painter.frameClock=182;h.painter.trimFrames();
  assert.equal(child.destroyed,true);assert.equal(parent.destroyed,true);assert.equal(sprite.spriteFrame,null);
  assert.equal(h.painter.artRegions.size,0);assert.equal(h.painter.frames.has(key),false);
  assert.equal(h.releases.filter(r=>r.resource.endsWith('/dawn/00/texture')).length,1);
  assert.equal(draw(key),false);const stale=h.requests[1];
  h.painter.frameClock=364;h.painter.trimFrames();assert.equal(draw(key),false);const current=h.requests[2];
  stale.callback(null,new h.Texture2D());assert.equal(h.painter.frames.get(key),null);assert.equal(h.painter.artRegions.size,0);
  const newTexture=new h.Texture2D();current.callback(null,newTexture);h.painter.begin();assert.equal(draw(key),true);
  const newChild=[...h.painter.artRegions.values()][0].frame;assert.notEqual(newChild,child);assert.equal(newChild.texture,newTexture);
  assert.equal(draw(other),false);const afterDestroy=h.requests.at(-1),requests=h.requests.length;
  h.painter.destroy();afterDestroy.callback(null,new h.Texture2D());
  assert.equal(newChild.destroyed,true);assert.equal(h.painter.artRegions.size,0);assert.equal(h.painter.frames.size,0);
  assert.equal(sprite.spriteFrame,null);assert.equal(draw(key),false);assert.equal(h.requests.length,requests);
  assert.equal(h.releases.filter(r=>r.resource.endsWith('/dawn/00/texture')).length,3,
    'trim, stale callback, and the live texture are each released exactly once');
});

test('Cocos camera crops reuse independent draw-slot frames across six thousand scrolling frames',()=>{
  const key='scene.scroll.dawn.00',h=cocosHarness({artEntries:[{key,path:'art/pixel/scene/scroll/dawn/00.png'}]});
  h.painter.begin();h.painter.imageRegion(key,0,0,1,1,0,0,480,270);
  h.requests[0].callback(null,new h.Texture2D());
  let first,second;
  for(let frame=0;frame<6000;frame++){
    const sx=(frame%2047)/2048;
    h.painter.begin();
    assert.equal(h.painter.imageRegion(key,sx,0,.2,1,0,0,480,270),true);
    const a=h.painter.sprites[0].spriteFrame,rectA={...a.rect};
    assert.equal(h.painter.imageRegion(key,sx,.9,.3,.1,0,216,480,54),true);
    const b=h.painter.sprites[1].spriteFrame;
    assert.notEqual(a,b,'two crops in one frame own different mutable children');
    assert.deepEqual({...a.rect},rectA,'the second crop cannot rewrite the first pending draw');
    if(!first){first=a;second=b;}
    assert.equal(a,first);assert.equal(b,second);
    assert.equal(h.painter.artRegions.size,2,'camera movement cannot add cache entries');
    h.painter.end();
  }
  assert.equal(h.createdFrames.length,3,'one parent and two children suffice for the whole scrolling sequence');
  assert.equal(first.packable,false);assert.equal(second.packable,false,'mutable crops cannot enter a static dynamic-atlas slot');
  assert.ok(h.painter.sprites.every(s=>s.dirty>1000),'crop changes refresh the existing sprite mesh as well as the UVs');
  assert.equal(h.requests.length,1);
});

test('Cocos crops stay attached to their own source when scenes share a draw slot, and source replacement releases every old child',()=>{
  const key='scene.scroll.dawn.00',other='scene.scroll.rain.00',h=cocosHarness({artEntries:[
    {key,path:'art/pixel/scene/scroll/dawn/00.png'},{key:other,path:'art/pixel/scene/scroll/rain/00.png'}]});
  const draw=(k,sx=0)=>h.painter.imageRegion(k,sx,0,.25,1,0,0,480,270);
  h.painter.begin();draw(key);draw(other);
  const textureA=new h.Texture2D(),textureB=new h.Texture2D();
  h.requests[0].callback(null,textureA);h.requests[1].callback(null,textureB);
  h.painter.begin();draw(key);draw(key,.5);h.painter.end();
  const original=[h.painter.sprites[0].spriteFrame,h.painter.sprites[1].spriteFrame];
  h.painter.begin();draw(other);h.painter.end();
  const rain=h.painter.sprites[0].spriteFrame;
  assert.equal(rain.texture,textureB);assert.notEqual(rain,original[0]);
  h.painter.begin();draw(key,.2);h.painter.end();
  assert.equal(h.painter.sprites[0].spriteFrame,original[0]);assert.equal(original[0].texture,textureA);
  const replacement=new h.SpriteFrame(),replacementTexture=new h.Texture2D(512,256);replacement.texture=replacementTexture;
  h.painter.frames.set(key,replacement);
  h.painter.begin();draw(key,.5);
  assert.ok(original.every(frame=>frame.destroyed),'replacing a source releases its old children at every slot');
  assert.equal(h.painter.sprites[1].spriteFrame,null,'old nodes detach before a child frame is destroyed');
  const current=h.painter.sprites[0].spriteFrame;
  assert.equal(current.texture,replacementTexture);assert.deepEqual({...current.rect},{x:256,y:0,width:128,height:256});
  h.painter.frameClock=185;h.painter.begin();draw(key);h.painter.trimFrames();
  assert.equal(rain.destroyed,true,'unused scene crops follow their parent cache eviction');
  assert.equal(current.destroyed,undefined,'the active replacement remains live');
  assert.equal(h.painter.artRegions.size,1);
  h.painter.destroy();assert.equal(current.destroyed,true);assert.equal(h.painter.artRegions.size,0);
});

test('Cocos crop bounds clamp normalized edges, reject empty or non-finite regions and retain a single source pixel',()=>{
  const key='scene.scroll.dawn.00',h=cocosHarness({artEntries:[{key,path:'art/pixel/scene/scroll/dawn/00.png'}]});
  const draw=(sx,sy,sw,sh)=>h.painter.imageRegion(key,sx,sy,sw,sh,0,0,480,270);
  h.painter.begin();draw(0,0,1,1);h.requests[0].callback(null,new h.Texture2D());
  assert.equal(draw(-.2,-.2,.4,.4),true);
  assert.deepEqual({...h.painter.sprites[0].spriteFrame.rect},{x:0,y:0,width:410,height:108});
  h.painter.begin();assert.equal(draw(1-Number.EPSILON,1-Number.EPSILON,Number.EPSILON,Number.EPSILON),true);
  assert.deepEqual({...h.painter.sprites[0].spriteFrame.rect},{x:2047,y:539,width:1,height:1});
  assert.equal(h.painter.artRegions.size,1);
  for(const bounds of [[1,0,1,1],[0,1,1,1],[-2,0,1,1],[0,0,0,1],[NaN,0,1,1],[0,0,Infinity,1]])assert.equal(draw(...bounds),false);
  const texture=h.painter.frames.get(key).texture;texture.width=Infinity;
  assert.equal(draw(0,0,1,1),false);texture.width=2048;
  assert.equal(h.painter.artRegions.size,1,'invalid regions do not consume a draw slot or grow the pool');
});

test('a replacement crop source invalidates old slots before an uncached slot creates this frame\'s first draw',()=>{
  const key='scene.scroll.dawn.00',h=cocosHarness({artEntries:[{key,path:'art/pixel/scene/scroll/dawn/00.png'}]});
  const draw=sx=>h.painter.imageRegion(key,sx,0,.25,1,0,0,480,270);
  h.painter.begin();draw(0);h.requests[0].callback(null,new h.Texture2D());
  h.painter.begin();h.painter.image(key,0,0,480,270);draw(.25);h.painter.end();
  const oldChild=h.painter.sprites[1].spriteFrame;
  const source=new h.SpriteFrame();source.texture=new h.Texture2D(512,256);h.painter.frames.set(key,source);
  h.painter.begin();draw(0);
  const first=h.painter.sprites[0].spriteFrame;
  assert.equal(oldChild.destroyed,true,'all old-source children detach before the first replacement child draws');
  draw(.5);const second=h.painter.sprites[1].spriteFrame;
  assert.equal(h.painter.sprites[0].spriteFrame,first,'the later old slot cannot remove this frame\'s first replacement draw');
  assert.equal(first.destroyed,undefined);assert.notEqual(first,second);
  assert.equal(first.texture,source.texture);assert.equal(second.texture,source.texture);
  assert.equal(h.painter.artRegions.size,2);assert.equal(h.painter.artRegionSources.size,1);
  h.painter.destroy();assert.equal(h.painter.artRegionSources.size,0);
});
