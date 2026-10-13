'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {drawSceneGround,SCENE_FLOOR_TOP}=require('../build/SceneGround');
const {SCENE_SCROLL_CHUNK_COUNTS,SCENE_SCROLL_TILE_WIDTH}=require('../build/Content');
const {GROUND_Y}=require('../build/Geometry');
const {Game}=require('../build/Game');
function capture(){
  const calls=[];
  return {calls,rect(...args){calls.push(['rect',...args]);},line(){},circle(){},text(){},poly(){},
    image(...args){calls.push(['image',...args]);return true;},
    imageRegion(...args){calls.push(['region',...args]);return true;}};
}

test('every supplied scene provides a continuous broad floor containing the unchanged foot plane',()=>{
  assert.equal(GROUND_Y,216);assert.ok(SCENE_FLOOR_TOP<GROUND_Y);
  for(const name of Object.keys(SCENE_SCROLL_CHUNK_COUNTS))for(const scroll of [0,953,1895,-100,1e5]){
    const p=capture();drawSceneGround(p,name,scroll);
    const regions=p.calls.filter(c=>c[0]==='region');assert.ok(regions.length,name);
    for(const c of regions){
      const [,key,sx,sy,sw,sh,x,y,w,h]=c;
      assert.match(key,new RegExp('^scene\\.scroll\\.'+name+'\\.\\d{2}$'));
      assert.ok([sx,sy,sw,sh,x,y,w,h].every(Number.isFinite));
      assert.ok(sy>=.93&&sy+sh<=1+1e-9,'sample the bottom pavement, never the sky or wall');
      assert.equal(sx,0);assert.equal(sw,1);assert.equal(w,SCENE_SCROLL_TILE_WIDTH);
      assert.ok(Math.abs(sh*270-h)<1e-8,'preserve the source vertical pixel density');
    }
    for(let y=SCENE_FLOOR_TOP;y<270;y++){
      const intervals=regions.filter(c=>y>=c[7]&&y<c[7]+c[9]).map(c=>[c[6],c[6]+c[8]]).sort((a,b)=>a[0]-b[0]);
      let covered=0;for(const [left,right] of intervals){assert.ok(left<=covered+1e-8,name+' floor must have no tile gap');covered=Math.max(covered,right);}
      assert.ok(covered>=480,name+' floor reaches the right canvas edge');
    }
  }
});

test('renderer keeps the material beneath characters and translates it together with screen shake',()=>{
  const g=new Game({load:()=>null,save(){}});g.start();g.beginSegment(7);g.obstacles=[];g.pickups=[];
  g.time=18;g.clock=1.1;g.shake=.2;
  const p=capture();g.render(p);
  const isFloor=c=>c[0]==='region'&&c[3]>=.93;
  const region=p.calls.findIndex(isFloor),scene=p.calls.findIndex(c=>c[0]==='region'&&c[1].startsWith('scene.scroll.')&&c[3]===0);
  const character=p.calls.findIndex(c=>c[0]==='image'&&c[1].startsWith('character.pixel.'));
  assert.ok(scene>=0&&scene<region&&region<character,'background, real floor, then Xiaoman');
  const reference=capture();drawSceneGround(reference,'graduate',g.time*72);
  const plain=reference.calls.filter(isFloor),all=p.calls.filter(isFloor),actual=all.slice(-plain.length);
  const dx=Math.sin(g.clock*47)*2*(g.shake/.25),dy=Math.cos(g.clock*53)*1.5*(g.shake/.25);
  assert.equal(all.length,plain.length*2,'the stationary floor backs the shaken floor');
  for(let i=0;i<actual.length;i++){
    assert.equal(actual[i][1],plain[i][1]);
    assert.ok(Math.abs(actual[i][6]-actual[i][2]*plain[i][8]-plain[i][6]-dx)<1e-8,'clipping preserves the translated source pavement');
    assert.ok(Math.abs(actual[i][7]-plain[i][7]-dy)<1e-8);
    assert.ok(actual[i][6]>=0&&actual[i][6]+actual[i][8]<=480+1e-8,'pavement does not spill over native margins');
    assert.ok(Math.abs(actual[i][8]-actual[i][4]*plain[i][8])<1e-8,'crop preserves horizontal pixel density');
  }
  g.settings.reducedMotion=true;
  const first=capture();g.render(first);g.time+=5;g.clock+=5;const second=capture();g.render(second);
  assert.deepEqual(first.calls.filter(c=>c[0]==='region'),second.calls.filter(c=>c[0]==='region'));
});

test('a missing crop still produces full pavement with pixel material rather than a collision outline',()=>{
  const p=capture();p.imageRegion=()=>false;drawSceneGround(p,'graduate',953);
  assert.ok(p.calls.some(c=>c[0]==='rect'&&c[2]===SCENE_FLOOR_TOP&&c[3]===480&&c[4]===270-SCENE_FLOOR_TOP));
  assert.ok(p.calls.filter(c=>c[0]==='rect'&&c[4]>3).length>30,'natural paving slabs remain visible while art loads');
  assert.equal(p.calls.some(c=>c[0]==='rect'&&c[2]===GROUND_Y&&c[3]===480&&c[4]<=2),false);
});
