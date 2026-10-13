'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const path=require('node:path');
const root=process.env.FLEETING_TEST_MODULES||path.resolve(__dirname,'../build');
const {Game}=require(path.join(root,'Game.js'));
const {XIAOMAN_GAIT,CHARACTER_ANIMATIONS}=require(path.join(root,'Content.js'));

function fresh(){const g=new Game({load:()=>null,save(){}});g.start();g.beginSegment(1);return g;}
function actor(g){
 let selected;
 const p={rect(){},line(){},circle(){},poly(){},text(){},image(k,x,y,w,h){
  if(/^character\.pixel\.(?:run|runStart)\./.test(k)){selected={key:k,x,y,w,h};return true;}return false;
 }};
 g.render(p);return selected;
}
function visibleMotion(g){
 let character,scene;
 const p={rect(){},line(){},circle(){},poly(){},text(){},image(key,x,y,w,h){
  if(/^character\.pixel\.(?:idle|runStart|run|jump|doubleJump|dive|land|hurt|sit|slide|slideRecovery|climb|break)\.\d\d$/.test(key)){
   character={key,x,y,w,h};return true;
  }
  if(w>1&&/^scene\.(?:choice\.|scroll\.)/.test(key)){scene={key,x,y,w,h};return true;}
  return false;
 }};
 g.render(p);return {character,scene};
}
function advance(g,seconds){
 for(let i=0;i<Math.round(seconds*60);i++){g.update(1/60);actor(g);}
}

test('run starts with its idle-compatible entry, then advances one frame per two world pixels',()=>{
 const g=fresh();assert.equal(actor(g).key,'character.pixel.runStart.00');
 advance(g,.1);assert.equal(actor(g).key,'character.pixel.run.08');
 for(const delta of [2,4,16,32,64]){
  const before=g.time;g.time+=delta/72;g.sceneTime+=delta/72;
  const actual=actor(g);const travel=(g.time-.1)*72;
  assert.equal(actual.key,`character.pixel.run.${String(Math.floor((.5+travel/XIAOMAN_GAIT.cycleTravel)*16+1e-8)%16).padStart(2,'0')}`);
  assert.deepEqual([actual.x,actual.y,actual.w,actual.h],[72,172,48,48]);
  assert.ok(g.time>before);
 }
 assert.equal(CHARACTER_ANIMATIONS.run.fps,36);
});

test('equal road displacement chooses equal poses even at different elapsed times or umbrella speed',()=>{
 const slow=fresh(),fast=fresh();fast.run.items.push('umbrella');actor(slow);actor(fast);
 advance(slow,.1);advance(fast,.1);
 for(const g of [slow,fast]){g.time=20/72;g.sceneTime=g===slow?2:1;}
 assert.equal(actor(slow).key,actor(fast).key);
 const g=fresh();g.run.items.push('umbrella');actor(g);advance(g,.5);
 const travel=g.time*72;
 const expected=Math.floor((.5+(travel-7.2)/32)*16+1e-8)%16;
 assert.equal(actor(g).key,`character.pixel.run.${String(expected).padStart(2,'0')}`);
 assert.ok(travel>36,'umbrella changes actual road displacement');
});

test('paused time, zero travel and retries cannot silently advance the gait',()=>{
 const g=fresh();actor(g);advance(g,.3);const before=actor(g).key;
 g.paused=true;advance(g,.3);assert.equal(actor(g).key,before);
 g.paused=false;g.sceneTime+=10;assert.equal(actor(g).key,before,'wall time alone is not travel');
 g.time=0;g.sceneTime=0;assert.equal(actor(g).key,'character.pixel.runStart.00','rewind clears the old leg phase');
 advance(g,.1);g.beginSegment(2);assert.equal(actor(g).key,'character.pixel.runStart.00','new route starts smoothly');
});

test('hell and dream sprint use the same coordinate as their moving scenery',()=>{
 const hell=fresh();hell.phase='hell';hell.phaseTime=0;actor(hell);
 hell.phaseTime=.1;hell.sceneTime=.1;assert.equal(actor(hell).key,'character.pixel.run.08');
 hell.phaseTime+=2/72;hell.sceneTime+=2/72;assert.equal(actor(hell).key,'character.pixel.run.09');
 const dream=fresh();dream.phase='reward';dream.reward='dream';dream.phaseTime=30;dream.used.add('sprint');actor(dream);
 dream.phaseTime+=7.2*.65/108;dream.sceneTime+=7.2*.65/108;assert.equal(actor(dream).key,'character.pixel.run.08');
 dream.phaseTime+=2*.65/108;dream.sceneTime+=2*.65/108;assert.equal(actor(dream).key,'character.pixel.run.09');
 assert.equal(actor(dream).w,48*.65,'dream stride must use the actual smaller actor canvas');
});

test('a jump landing finishes before the road slides a stride under still feet',()=>{
 const g=fresh();g.obstacles=[];g.pickups=[];visibleMotion(g);g.jump();
 let touchdown;
 for(let i=0;i<90;i++){
  const airborne=g.y>1;g.update(1/60);
  const frame=visibleMotion(g);
  if(airborne&&g.y<=1){touchdown={time:g.time,frame};break;}
 }
 assert.ok(touchdown,'the actual jump returns to the road');
 assert.match(touchdown.frame.character.key,/^character\.pixel\.land\./);
 for(let i=0;i<5;i++){g.update(1/60);visibleMotion(g);}
 const resumed=visibleMotion(g);
 assert.ok((g.time-touchdown.time)*72>=4.8,'the road really advanced');
 assert.match(resumed.character.key,/^character\.pixel\.run\./,
  'the actor resumes the moving stride without restarting the standing entrance pose');
 const before=resumed.character.key;
 for(let i=0;i<2;i++){g.update(1/60);visibleMotion(g);}
 assert.notEqual(visibleMotion(g).character.key,before,'feet keep stepping after landing');
});

test('the piano interlude keeps its floor fixed while the actor stands still',()=>{
 const g=fresh();g.phase='piano';g.choice=4;g.theme='dusk';g.phaseTime=0;
 const floor=()=>{
  const plates=[],movingFloor=[];
  const p={rect(x,y,w,h,color){
   if(y===207&&h===9)movingFloor.push({x,y,w,h,color});
  },line(){},circle(){},poly(){},text(){},image(key,x,y,w,h){
   if(key==='scene.choice.04')plates.push({x,y,w,h});
   return true;
  }};
  g.render(p);return {plates,movingFloor};
 };
 const before=floor();g.phaseTime=1.25;g.sceneTime+=1.25;
 const after=floor();
 assert.deepEqual(after.plates,before.plates,'the room remains in place during piano practice');
 assert.deepEqual(after.movingFloor,before.movingFloor,'the floor cannot slide under an idle character');
});

test('retrying while airborne begins a new stride instead of inventing a landing',()=>{
 const g=fresh();g.obstacles=[];g.pickups=[];visibleMotion(g);g.jump();
 for(let i=0;i<12;i++){g.update(1/60);visibleMotion(g);}
 assert.ok(g.y>1);
 g.restart();
 assert.equal(visibleMotion(g).character.key,'character.pixel.runStart.00');
});

test('choice plates, alley exit, rewards and rewind animate feet with their visible travel',()=>{
 for(const choice of [1,2,3,4,5,6]){
  const g=fresh();g.beginChoice(choice);
  const before=visibleMotion(g);
  for(let i=0;i<6;i++)g.update(1/60);
  const after=visibleMotion(g);
  assert.equal(after.scene.key,`scene.choice.${String(choice).padStart(2,'0')}`);
  assert.ok(after.scene.x<before.scene.x,`choice ${choice} plate travels`);
  assert.match(after.character.key,/^character\.pixel\.run\./,`choice ${choice} walks with the plate`);
 }
 const cases=[
  ['alley exit',g=>{g.phase='alleyExit';g.phaseTime=0;g.theme='alley';},'scene.choice.alley',-1],
  ['heaven reward',g=>{g.phase='reward';g.reward='heaven';g.phaseTime=0;g.theme='heaven';},'scene.scroll.heaven.',-1],
  ['grounded dream reward',g=>{g.phase='reward';g.reward='dream';g.phaseTime=2;g.theme='dream';},'scene.scroll.dream.',-1],
  ['rewind',g=>{g.phase='reverse';g.phaseTime=0;g.theme='night';},'scene.scroll.night.',1],
 ];
 for(const [label,setup,sceneKey,direction] of cases){
  const g=fresh();setup(g);const before=visibleMotion(g);
  for(let i=0;i<6;i++)g.update(1/60);
  const after=visibleMotion(g);
  assert.ok(after.scene.key.startsWith(sceneKey),`${label} scene`);
  assert.equal(after.scene.key,before.scene.key,`${label} stays on the same visible tile`);
  assert.ok((after.scene.x-before.scene.x)*direction>0,`${label} scene travels`);
  assert.match(after.character.key,/^character\.pixel\.run\./,`${label} feet keep moving`);
 }
});
