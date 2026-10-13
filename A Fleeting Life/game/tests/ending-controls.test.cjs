'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {Game}=require('../build/Game');
const painter={rect(){},line(){},circle(){},poly(){},text(){},image(){return false;},
  video(){return {visible:true,seconds:1,status:'playing'};}};
const fresh=()=>new Game({load:()=>null,save(){}});
const fallback={...painter,video:undefined,image(key){return key.startsWith('ending.sequence.');}};
function advanceFallback(game,frames){for(let i=0;i<frames;i++){if(game.phase==='ending')game.render(fallback);game.update(1/60);}}
function click(game,label){
  const b=game.buttons.find(b=>b.label===label);assert.ok(b,label);
  game.pointerDown(b.x+b.w/2,b.y+b.h/2);game.pointerUp(b.x+b.w/2,b.y+b.h/2);
}

test('real cinematic input locks the runner while keeping pause, resume and replay return buttons usable',()=>{
  const game=fresh();game.start();game.startEnding('morning',true);game.render(painter);
  assert.equal(game.endingMediaActive,true);
  game.pointerDown(200,200);game.pointerUp(200,200);game.jump();game.down();
  assert.equal(game.y,0);assert.equal(game.slide,0);assert.equal(game.pointer,null);
  click(game,'Ⅱ');assert.equal(game.paused,true);
  game.render(painter);click(game,'继续向前');assert.equal(game.paused,false);
  game.render(painter);click(game,'回到回廊');assert.equal(game.screen,'hall');
});

test('twelve seconds playing still requests the end proof before letter-card completion',()=>{
  const game=fresh();game.start();game.startEnding('morning');
  let calls=0,status='playing';const live={...painter,video(){calls++;return {visible:true,seconds:12,status};}};
  game.render(live);game.update(1/60);assert.equal(game.phaseTime,12);
  game.render(live);assert.equal(calls,2,'currentTime alone cannot stop polling the actual completion status');
  assert.deepEqual(game.profile.lights,[]);assert.equal(game.endingMediaEnded,false);
  status='ended';game.render(live);assert.equal(game.endingMediaEnded,true);
  for(let i=0;i<119;i++)game.update(1/60);assert.deepEqual(game.profile.lights,[]);
  for(let i=0;i<2;i++)game.update(1/60);assert.ok(game.profile.lights.includes('morning'));
});

test('an early ended callback restarts the full fallback and cannot prematurely light a door',()=>{
  const game=fresh();game.start();game.startEnding('morning');
  game.setEndingMediaProgress(2,'ended');assert.equal(game.endingMediaStatus,'failed');
  assert.equal(game.phaseTime,0);assert.equal(game.endingMediaEnded,false);
  advanceFallback(game,13*60);
  assert.deepEqual(game.profile.lights,[]);
  advanceFallback(game,62);
  assert.ok(game.profile.lights.includes('morning'));
});

test('first cinematic and fallback cannot be left through pause or repeated Back before completion',()=>{
  for(const fail of [false,true]){
    const game=fresh();game.start();game.startEnding('morning');
    if(fail){game.setEndingMediaProgress(null,'failed');game.render(fallback);}else game.render(painter);
    game.keyDown('Escape');game.keyUp('Escape');game.keyDown('Escape');game.keyUp('Escape');
    assert.equal(game.screen,'play');assert.equal(game.phase,'ending');assert.equal(game.paused,true);
    game.toHall();assert.equal(game.phase,'ending');assert.deepEqual(game.profile.lights,[]);
    game.paused=false;if(!fail)game.setEndingMediaProgress(12,'ended');
    if(fail)advanceFallback(game,14*60+2);else for(let i=0;i<2*60+2;i++)game.update(1/60);
    for(let i=0;i<12*60&&game.screen!=='hall';i++)game.update(1/60);
    assert.equal(game.screen,'hall');assert.ok(game.profile.lights.includes('morning'));
  }
});

test('missing fallback frames stop the clock, retry from the beginning and allow leaving without a reward',()=>{
  const game=fresh();game.start();game.startEnding('morning');game.setEndingMediaProgress(null,'failed');
  const absent={...fallback,image(){return false;}};game.render(absent);
  for(let i=0;i<600;i++)game.update(1/60);
  assert.equal(game.phaseTime,0);assert.equal(game.endingFallbackBlocked,true);assert.deepEqual(game.profile.lights,[]);
  game.phaseTime=14;game.finishEnding();assert.deepEqual(game.profile.lights,[],'no frame proof means no completion award');
  const token=game.endingPlaybackToken;game.retryEndingMedia();
  assert.equal(game.endingPlaybackToken,token+1);assert.equal(game.phaseTime,0);assert.equal(game.endingMediaStatus,'pending');
  game.setEndingMediaProgress(null,'failed');game.render(absent);game.cancelEndingMedia();
  assert.equal(game.screen,'hall');assert.deepEqual(game.profile.lights,[]);
});

test('a previous frame is not evidence that the next required fallback frame was visible',()=>{
  const game=fresh();game.start();game.startEnding('morning');game.setEndingMediaProgress(null,'failed');
  game.setEndingFallbackProgress(0,true);for(let i=0;i<32;i++)game.update(1/60);
  const stoppedAt=game.phaseTime;assert.ok(stoppedAt>=.5-1e-8&&stoppedAt<.52);assert.equal(game.endingFallbackBlocked,true);
  game.setEndingFallbackProgress(0,true);for(let i=0;i<60;i++)game.update(1/60);assert.equal(game.phaseTime,stoppedAt);
  game.setEndingFallbackProgress(1,true);game.update(1/60);assert.ok(game.phaseTime>stoppedAt);
  assert.deepEqual(game.profile.lights,[]);
});

test('a currently unavailable frame cannot keep advancing from an earlier successful draw',()=>{
  const game=fresh();game.start();game.startEnding('morning');game.setEndingMediaProgress(null,'failed');
  game.setEndingFallbackProgress(0,true);game.update(1/60);const shownAt=game.phaseTime;
  game.setEndingFallbackProgress(0,false);for(let i=0;i<10;i++)game.update(1/60);
  assert.equal(game.phaseTime,shownAt);assert.equal(game.endingFallbackBlocked,true);
  game.setEndingFallbackProgress(0,true);game.update(1/60);assert.ok(game.phaseTime>shownAt);
});
