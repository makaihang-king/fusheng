'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {Game}=require('../build/Game');
const {drawSceneBackdrop,sceneTravel}=require('../build/SceneBackdrop');
const {SCENE_SCROLL_CHUNK_COUNTS}=require('../build/Content');
function fresh(){const game=new Game({load:()=>null,save(){}});game.start();game.beginSegment(1);return game;}
function capture(available=()=>true){const calls=[];return {calls,image:key=>available(key),imageRegion(key,sx,sy,sw,sh,x,y,w,h,opacity=1){calls.push({key,sx,sy,sw,sh,x,y,w,h,opacity});return available(key);}};}
function coverage(calls,b){
  for(const y of [b.top+.01,(b.top+b.bottom)/2,b.bottom-.01]){
    const spans=calls.filter(c=>c.opacity>0&&y>=c.y&&y<c.y+c.h).map(c=>[c.x,c.x+c.w]).sort((a,b)=>a[0]-b[0]);
    let covered=b.left;for(const [left,right] of spans){assert.ok(left<=covered+1e-6,'no outer gap');covered=Math.max(covered,right);}assert.ok(covered>=b.right-1e-6,'outer art covers full width');
  }
  for(const c of calls){assert.ok(c.x>=b.left-1e-6&&c.x+c.w<=b.right+1e-6);assert.ok(c.y>=b.top-1e-6&&c.y+c.h<=b.bottom+1e-6);assert.ok(c.sx>=0&&c.sy>=0&&c.sx+c.sw<=1+1e-6&&c.sy+c.sh<=1+1e-6);}
}
test('the actual authored background covers all four sides and corners across every scroll boundary',()=>{
  const game=fresh(),b={left:-101.5,top:-57,right:581.5,bottom:327};
  for(const [name,count] of Object.entries(SCENE_SCROLL_CHUNK_COUNTS))for(let tile=0;tile<count;tile++)for(const d of [-1,0,1]){
    game.theme=name;game.time=Math.max(0,(tile*960+d)/72);const p=capture();assert.equal(drawSceneBackdrop(game,p,b),true);coverage(p.calls,b);
  }
});
test('outer scenery uses a complete matching fallback if any visible tile is still loading',()=>{
  const game=fresh(),b={left:-80,top:0,right:1100,bottom:270};
  const p=capture(key=>key==='scene.pixel.dawn'||key==='scene.scroll.dawn.00');
  assert.equal(drawSceneBackdrop(game,p,b),true);coverage(p.calls,b);
  assert.ok(p.calls.every(c=>c.key==='scene.pixel.dawn'),'a late neighbouring tile cannot leave a partial margin');
});
test('world-boundary margins extend the adjacent tile instead of wrapping to its opposite end',()=>{
  const game=fresh(),b={left:-80,top:0,right:560,bottom:270};
  const p=capture();game.theme='dawn';drawSceneBackdrop(game,p,b);
  assert.ok(p.calls.some(c=>c.key==='scene.scroll.dawn.00'&&c.x===-80),'start margin uses the first tile edge');
  assert.ok(!p.calls.some(c=>c.key==='scene.scroll.dawn.03'&&c.x<0),'start margin never imports the final tile');
  const left=capture();drawSceneBackdrop(game,left,{left:-80,top:0,right:0,bottom:270});
  assert.ok(left.calls.some(c=>c.key==='scene.scroll.dawn.00'&&c.x===-80),'the isolated left band still receives the first tile edge');
  const right=capture();game.time=60;drawSceneBackdrop(game,right,{left:480,top:0,right:560,bottom:270});
  assert.ok(right.calls.some(c=>c.key==='scene.scroll.dawn.03'&&c.x===480),'the isolated right band receives the last tile edge');
  game.time=60;const q=capture();drawSceneBackdrop(game,q,b);
  assert.ok(q.calls.every(c=>c.key!=='scene.scroll.dawn.00'||c.x>=0),'a boundary draw does not wrap the opening tile into the left margin');
});
test('hall, seven choice plates and portrait surplus stay inside their outer strip',()=>{
  const game=fresh(),bands=[{left:-90,top:0,right:0,bottom:270},{left:480,top:0,right:570,bottom:270},{left:-90,top:-310,right:570,bottom:0},{left:-90,top:270,right:570,bottom:580}];
  const stages=[()=>game.toHall(),...Array.from({length:6},(_,i)=>()=>{game.screen='play';game.beginChoice(i+1);game.phaseTime=.3;}),()=>{game.screen='play';game.beginBranch('alley');game.phase='alleyExit';game.phaseTime=2;}];
  for(const stage of stages){stage();for(const b of bands){const p=capture();assert.equal(drawSceneBackdrop(game,p,b),true);coverage(p.calls,b);}}
});
test('outer travel shares reverse, reward sprint, choice and reduced motion semantics',()=>{
  const game=fresh();game.phase='reverse';game.phaseTime=0;assert.equal(sceneTravel(game),-.001);
  game.phaseTime=2;assert.equal(sceneTravel(game),-160);
  game.beginChoice(2);game.phaseTime=3;assert.equal(sceneTravel(game),216);
  game.phase='piano';assert.equal(sceneTravel(game),0);
  game.phase='reward';game.reward='dream';game.phaseTime=45;game.rewardSprintAt=40;assert.equal(sceneTravel(game),game.rewardClock()*72);
  game.settings.reducedMotion=true;const p=capture(),b={left:-50,top:0,right:530,bottom:270};drawSceneBackdrop(game,p,b);
  game.phaseTime=59;const q=capture();drawSceneBackdrop(game,q,b);assert.deepEqual(q.calls,p.calls);
});
