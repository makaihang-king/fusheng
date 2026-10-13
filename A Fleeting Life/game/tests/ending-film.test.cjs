'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {Game}=require('../build/Game.js');
const {ENDINGS,ART_MANIFEST,ENDING_MEDIA,ENDING_MEDIA_SECONDS,ENDING_MEDIA_CARD_SECONDS}=require('../build/Content.js');
require('../build/web/game.js');
function fresh(){const g=new Game({load:()=>null,save(){}});g.start();return g;}
function painter(result){
 const calls=[];
 const record=(type,...args)=>{calls.push({type,args});};
 return {
  calls,
  rect(...args){record('rect',...args);},
  line(...args){record('line',...args);},
  circle(...args){record('circle',...args);},
  text(...args){record('text',...args);},
  poly(...args){record('poly',...args);},
  image(key){calls.push({type:'image',key});return true;},
  video(...args){calls.push({type:'video',args});return result;}
 };
}
function advance(g,seconds,p){for(let i=0;i<seconds*60;i++){if(p)g.render(p);g.update(1/60);}}

test('seven complete films have four outfit paths each and stay outside the sprite manifest',()=>{
 assert.equal(Object.keys(ENDING_MEDIA).length,7);assert.deepEqual(globalThis.FleetingLife.ENDING_MEDIA,ENDING_MEDIA);
 assert.equal(ENDING_MEDIA_SECONDS,12);assert.equal(ENDING_MEDIA_CARD_SECONDS,2);
 for(const id of ['morning','backrow','outside','desk','secondGrade','runaway','wall']){
  const m=ENDING_MEDIA[`ending.video.${id}`];assert.equal(m.path,`video/endings/${id}.mp4`);assert.equal(m.seconds,12);assert.equal(ENDINGS[id].duration,14);
  assert.equal(ART_MANIFEST.some(a=>a.key===`ending.video.${id}`),false);
  for(const skin of ['waistJacket','raincoat','namelessNotebook'])assert.equal(m.skins[skin].path,`video/endings/skins/${skin}/${id}.mp4`);
 }
});

test('loading never consumes the first film or prematurely lights its door',()=>{
 const g=fresh();g.startEnding('morning');const p=painter({visible:false,seconds:0,status:'loading'});g.render(p);advance(g,20);
 assert.equal(g.phaseTime,0);assert.equal(g.phase,'ending');assert.deepEqual(g.profile.lights,[]);
 assert.equal(p.calls.find(c=>c.type==='video').args[5],0);assert.ok(p.calls.some(c=>c.key==='ending.sequence.morning.base.00'));
 g.finishEnding();assert.equal(g.phase,'ending');
});

test('actual decoded media time controls the film, pause freezes it, only its complete end begins the two-second card',()=>{
 const g=fresh();g.startEnding('morning');g.render(painter({visible:true,seconds:4,status:'playing'}));advance(g,3);assert.equal(g.phaseTime,4);
 g.paused=true;g.setEndingMediaProgress(6,'playing');advance(g,3);assert.equal(g.phaseTime,4);g.paused=false;
 g.setEndingMediaProgress(11.95,'playing');advance(g,.5);assert.equal(g.phaseTime,11.95);assert.deepEqual(g.profile.lights,[]);
 g.render(painter({visible:true,seconds:12,status:'ended'}));assert.equal(g.phaseTime,12);const card=painter(true);g.render(card);
 assert.equal(card.calls.some(c=>c.type==='video'),false);
 assert.equal(card.calls.some(c=>c.key==='ui.hd.ending_card'),false);
 assert.ok(card.calls.some(c=>c.type==='rect' || c.type==='text'));
 advance(g,1.8);assert.equal(g.phase,'ending');assert.deepEqual(g.profile.lights,[]);advance(g,.3);
 advance(g,8.7);
 assert.equal(g.screen,'hall');assert.deepEqual(g.profile.lights,['morning']);assert.equal(g.profile.progress.endings.morning,1);
});

test('a twelve-second playing position continues querying the player until completion evidence arrives',()=>{
 const g=fresh();g.startEnding('wall',true);g.render(painter({visible:true,seconds:12,status:'playing'}));advance(g,.1);
 const end=painter({visible:true,seconds:12,status:'ended'});g.render(end);assert.ok(end.calls.some(c=>c.type==='video'));assert.equal(g.endingMediaEnded,true);
});

test('bad or short media restarts the complete same-story fallback and never accepts a false completion event',()=>{
 const g=fresh();g.startEnding('morning');g.render(painter({visible:true,seconds:3,status:'playing'}));advance(g,.1);assert.equal(g.phaseTime,3);
 const bad=painter({visible:false,seconds:3,status:'ended'});g.render(bad);assert.equal(g.endingMediaStatus,'failed');assert.equal(g.phaseTime,0);
 const fallback=painter(false);g.render(fallback);assert.ok(fallback.calls.some(c=>c.key==='ending.sequence.morning.base.00'));assert.equal(fallback.calls.some(c=>c.type==='video'),false);
 advance(g,13.5,fallback);assert.deepEqual(g.profile.lights,[]);advance(g,.6,fallback);assert.deepEqual(g.profile.lights,['morning']);
});

test('film replay preserves unlocked memories and always starts a fresh media session in the currently equipped outfit',()=>{
 const g=fresh();g.profile.equippedSlots.skin='raincoat';g.startEnding('outside',true);const first=g.endingPlaybackToken;
 const p=painter({visible:true,seconds:0,status:'playing'});g.render(p);const args=p.calls.find(c=>c.type==='video').args;
 assert.equal(args[7],first);assert.equal(args[8],'raincoat');assert.ok(g.buttons.some(b=>b.label==='回到回廊'));
 const y=g.y,jumps=g.run.jumps;g.jump();g.down();assert.equal(g.y,y);assert.equal(g.run.jumps,jumps);
 g.finishEnding();assert.equal(g.phase,'corridorTransition');advance(g,9);assert.equal(g.screen,'hall');assert.deepEqual(g.profile.lights,[]);
 g.startEnding('outside',true);assert.ok(g.endingPlaybackToken>first);assert.equal(g.phaseTime,0);
});

test('missing fallback frames retain the nearest decoded predecessor without jumping to the opening',()=>{
 const g=fresh();g.startEnding('morning',true);g.setEndingMediaProgress(null,'failed');advance(g,5.1,painter(false));
 const p=painter(false);p.image=key=>{p.calls.push({type:'image',key});return key==='ending.sequence.morning.base.09';};
 g.render(p);const images=p.calls.filter(c=>c.type==='image'&&c.key.startsWith('ending.sequence.')).map(c=>c.key);
 assert.deepEqual(images,['ending.sequence.morning.base.10','ending.sequence.morning.base.09']);
});

test('absent fallback resources freeze at zero, offer retry or return, and never award a memory',()=>{
 const g=fresh();g.startEnding('morning');const missing=painter(false);missing.image=()=>false;g.render(missing);advance(g,30,missing);
 assert.equal(g.phaseTime,0);assert.deepEqual(g.profile.lights,[]);assert.equal(g.endingFallbackBlocked,true);
 assert.ok(g.buttons.some(b=>b.label==='重新播放'));assert.ok(g.buttons.some(b=>b.label==='回到回廊'));
 const token=g.endingPlaybackToken;g.retryEndingMedia();assert.equal(g.endingMediaStatus,'pending');assert.ok(g.endingPlaybackToken>token);g.render(missing);g.cancelEndingMedia();assert.equal(g.screen,'hall');assert.deepEqual(g.profile.lights,[]);
});

test('a previously decoded frame cannot stand in for the missing last frame or award completion',()=>{
 const g=fresh();g.startEnding('morning');const p=painter(false);p.image=key=>key.startsWith('ending.sequence.')&&!key.endsWith('.23');
 g.render(p);advance(g,20,p);assert.ok(g.phaseTime>=11.5&&g.phaseTime<12);assert.equal(g.phase,'ending');assert.deepEqual(g.profile.lights,[]);
 assert.equal(g.endingFallbackFrames.has(0),true);assert.equal(g.endingFallbackFrames.has(23),false);assert.equal(g.endingFallbackBlocked,true);
});

test('an unfinished first film pause offers continuation and replay retains its return control',()=>{
 const g=fresh();g.startEnding('morning');g.paused=true;g.exitConfirm=true;
 g.render(painter({visible:true,seconds:3,status:'playing'}));assert.deepEqual(g.buttons.map(b=>b.label),['继续观看']);
 g.replayEnding=true;g.exitConfirm=false;g.render(painter({visible:true,seconds:3,status:'playing'}));
 assert.ok(g.buttons.some(b=>b.label.includes('返回回廊')));
});
