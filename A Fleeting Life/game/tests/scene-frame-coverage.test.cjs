'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {Game}=require('../build/Game');
const {coreImagePainter}=require('../build/ImageBounds');
const {SCENE_SCROLL_CHUNK_COUNTS,SCENE_SCROLL_TILE_STRIDE}=require('../build/Content');

function recorder(ready=()=>true){
  const calls=[];
  return {calls,rect(...args){calls.push({type:'rect',args});},line(){},circle(){},poly(){},text(){},
    image(key,x,y,w,h,opacity=1){const shown=ready(key);calls.push({type:'image',key,x,y,w,h,opacity,shown});return shown;},
    imageRegion(key,sx,sy,sw,sh,x,y,w,h,opacity=1){const shown=ready(key);calls.push({type:'region',key,sx,sy,sw,sh,x,y,w,h,opacity,shown});return shown;}};
}
function fresh(){const game=new Game({load:()=>null,save(){}});game.start();game.beginSegment(1);game.obstacles=[];game.pickups=[];return game;}
function backgrounds(calls){return calls.filter(c=>/^scene\.(scroll|pixel|choice)\./.test(c.key||'')&&c.shown&&c.opacity>0&&c.y===0&&c.h===270);}
function fullCoverage(calls){
  const spans=backgrounds(calls).map(c=>[c.x,c.x+c.w]).sort((a,b)=>a[0]-b[0]);
  let covered=0;for(const [left,right] of spans){if(right<=0)continue;assert.ok(left<=covered+1e-6,'loaded images leave no gap');covered=Math.max(covered,right);}
  assert.ok(covered>=480-1e-6,'loaded images cover the full authored scene');
}

test('only ready visible tiles suppress the complete fallback during asynchronous loads',()=>{
  for(const time of [0,8,959/72,960/72,961/72]){
    const game=fresh();game.time=time;
    const p=recorder(key=>key==='scene.pixel.dawn'||key==='scene.scroll.dawn.01');game.render(p);
    fullCoverage(p.calls);
    if(time<960/72)assert.ok(p.calls.some(c=>c.key==='scene.pixel.dawn'&&c.opacity>0),'an absent left tile must use the complete plate');
  }
});

test('all twelve scrolling themes stay clipped and fully covered across every tile boundary',()=>{
  const game=fresh();
  for(const [name,count] of Object.entries(SCENE_SCROLL_CHUNK_COUNTS)){
    game.theme=name;
    for(let tile=0;tile<count;tile++)for(const delta of [-1,0,1]){
      game.time=Math.max(0,(tile*SCENE_SCROLL_TILE_STRIDE+delta)/72);
      const p=recorder();game.render(p);fullCoverage(p.calls);
      for(const c of backgrounds(p.calls))assert.ok(c.x>=0&&c.x+c.w<=480+1e-6&&c.y>=0&&c.y+c.h<=270+1e-6,name+' never spills over the native margins');
    }
  }
});

test('choice entry retains the preceding complete scene while the new plate is unavailable',()=>{
  for(let id=1;id<=6;id++)for(const at of [0,.3,1]){
    const game=fresh();game.beginChoice(id);game.phaseTime=at;
    const p=recorder(key=>/^scene\.pixel\./.test(key));game.render(p);fullCoverage(p.calls);
  }
  const game=fresh();game.beginBranch('alley');game.phase='alleyExit';game.phaseTime=1;
  const p=recorder(key=>key==='scene.pixel.alley');game.render(p);fullCoverage(p.calls);
});

test('image clipping preserves the source coordinates and isolates simultaneous regions',()=>{
  const raw=recorder(),p=coreImagePainter(raw);
  assert.equal(p.image('scene.scroll.dawn.00',-959,0,1024,270),true);
  const crop=raw.calls.at(-1);assert.equal(crop.type,'region');assert.equal(crop.x,0);assert.equal(crop.w,65);
  assert.equal(crop.sx,959/1024);assert.equal(crop.sw,65/1024);
  p.imageRegion('scene.choice.01',.2,.1,.5,.8,-40,-10,200,160);
  const second=raw.calls.at(-1);assert.equal(second.x,0);assert.equal(second.y,0);assert.equal(second.w,160);assert.equal(second.h,150);
  assert.ok(Math.abs(second.sx-.3)<1e-9);assert.ok(Math.abs(second.sy-.15)<1e-9);
  assert.equal(p.image('outside',500,0,100,100),false);
  assert.equal(p.image('next',960,0,1024,270,0),true,'offscreen requests still prefetch invisibly');
});

test('camera shake retains a stationary real plate underneath its exposed top and side strips',()=>{
  const game=fresh();game.time=8;game.clock=1.1;game.shake=.25;
  const p=recorder();game.render(p);fullCoverage(p.calls);
  assert.ok(backgrounds(p.calls).some(c=>c.x===0),'the real scene backs the shifted image');
});
