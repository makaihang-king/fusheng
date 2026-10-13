'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { SceneMusicController, selectSceneMusic, SCENE_MUSIC_IDS } = require('../build/SceneMusic');
const { Game } = require('../build/Game');
const play = (segment, extra={}) => ({screen:'play',phase:'run',segment,...extra});
const flush = async () => { await Promise.resolve(); await Promise.resolve(); };
function close(actual,expected,message='gain') { assert.ok(Math.abs(actual-expected)<1e-6,`${message}: ${actual} != ${expected}`); }
function fixture(options) {
  const requests=[], voices=[], events=[];
  const backend={load(id){return new Promise((resolve,reject)=>requests.push({id,resolve,reject}));},unlock(){events.push(['unlock']);}};
  const music=new SceneMusicController(backend,options);
  const resolve=index=>{
    const request=requests[index];
    const v={id:request.id,volume:0,stopped:false,plays:0,resumes:0,
      setVolume(value){this.volume=value;events.push(['gain',this.id,value]);},
      play(loop){this.plays++;this.loop=loop;events.push(['play',this.id]);},
      pause(){this.paused=true;events.push(['pause',this.id]);},
      resume(){this.resumes++;this.paused=false;events.push(['resume',this.id]);},
      stop(){this.stopped=true;events.push(['stop',this.id]);}};
    voices.push(v);request.resolve(v);return v;
  };
  return {music,requests,voices,events,resolve};
}

test('every logical BGM is reachable, including classroom choices and both dream acts',()=>{
  const states=[
    [{screen:'hall'},'corridor'],
    ...['morning','rain','playground','injustice','dusk','night','graduation'].map((id,i)=>[play(i+1),id]),
    [play(2,{phase:'choice',choice:2}),'classroom'],[play(2,{phase:'seat',choice:2}),'classroom'],
    [play(3,{phase:'choice',choice:3}),'classroom'],[play(4,{phase:'piano'}),'piano'],
    [play(4,{phase:'choice',choice:4}),'piano'],[play(6,{phase:'choice',choice:6}),'crossroads'],
    [play(6,{phase:'reverse'}),'crossroads'],[play(1,{branch:'alley'}),'alley'],
    [play(1,{phase:'alleyExit'}),'alley'],[play(2,{branch:'playground'}),'playground'],
    [play(6,{phase:'reward',reward:'dream',phaseTime:29.99}),'dream1'],
    [play(6,{phase:'reward',reward:'dream',phaseTime:30}),'dream2'],
    [play(6,{phase:'reward',reward:'heaven'}),'heaven'],[play(2,{phase:'hell'}),'hell'],
    [play(3,{phase:'poem'}),'corridor'],[{screen:'hall',phase:'corridorTransition'},'corridor'],
    [play(7,{phase:'finale'}),'finale'],
    ...['morning','backrow','outside','desk','wall','runaway','secondGrade'].map(ending=>[play(7,{phase:'ending',ending}),'ending_'+ending]),
    [{screen:'memory',phase:'memory',memoryReplay:{segment:2,stage:'choice'}},'classroom'],
    [{screen:'memory',phase:'memory',memoryReplay:{segment:3,stage:'object'}},'playground'],
    [{screen:'memory',phase:'memory',memoryReplay:{segment:3,stage:'choice'}},'classroom'],
    [{screen:'memory',phase:'memory',memoryReplay:{segment:4,stage:'object'}},'injustice'],
    [{screen:'memory',phase:'memory',memoryReplay:{segment:4,stage:'choice'}},'piano'],
    [{screen:'memory',phase:'memory',memoryReplay:{segment:6,stage:'choice'}},'crossroads'],
    [{screen:'memory',phase:'memory',memoryReplay:{segment:2,stage:'poem'}},'corridor'],
  ];
  for(const [state,id] of states)assert.equal(selectSceneMusic(state),id,JSON.stringify(state));
  assert.deepEqual([...new Set(states.map(x=>x[1]))].sort(),[...SCENE_MUSIC_IDS].sort());
  assert.equal(selectSceneMusic(play(1,{phase:'choice',choice:1})),'morning');
  assert.equal(selectSceneMusic(play(1,{phase:'intro'})),null);
  assert.equal(selectSceneMusic(play(1,{openingMusicDelay:.1})),null);
  assert.equal(selectSceneMusic(play(7,{phase:'ending',ending:'morning',endingMediaActive:true})),null);
  assert.equal(selectSceneMusic(play(7,{phase:'ending',ending:'missing'})),null);
});

test('real Game classroom and playground transitions select the intended cue',()=>{
  const game=new Game({load:()=>null,save(){}});
  game.start();assert.equal(selectSceneMusic(game),null);
  game.beginSegment(2);assert.equal(selectSceneMusic(game),'rain');
  game.beginChoice(2);assert.equal(selectSceneMusic(game),'classroom');
  game.beginSegment(3);assert.equal(game.title,'课间十分钟');assert.equal(selectSceneMusic(game),'playground');
  game.beginChoice(3);assert.equal(selectSceneMusic(game),'classroom');
  game.beginSegment(4);assert.equal(selectSceneMusic(game),'injustice');
  game.beginChoice(4);assert.equal(selectSceneMusic(game),'piano');
  game.beginSegment(6);game.beginChoice(6);assert.equal(selectSceneMusic(game),'crossroads');
});

test('opening yields to the door, waits 0.7 playable seconds, and never delays a chapter retry',async()=>{
  const sounds=[],game=new Game({load:()=>null,save(){}},{sound:name=>sounds.push(name)}),f=fixture();
  f.music.update(game,0);const corridor=f.resolve(0);await flush();f.music.update(game,1500);
  game.start();f.music.update(game,1500);assert.equal(selectSceneMusic(game),null);assert.deepEqual(sounds,['door']);
  f.music.update(game,1720);assert.equal(corridor.stopped,true,'corridor music clears before the hinge starts');
  assert.equal(f.requests.length,1,'morning music is not requested through the opening');
  while(game.phase==='intro')game.update(1/60);
  assert.ok(game.openingMusicDelay>=.68&&game.openingMusicDelay<=.7);
  for(let i=0;i<27;i++)game.update(1/60);
  assert.equal(selectSceneMusic(game),null);
  const remaining=game.openingMusicDelay;game.paused=true;
  for(let i=0;i<60;i++)game.update(1/60);
  assert.equal(game.openingMusicDelay,remaining,'pausing keeps the silence gap frozen');
  game.appHide();game.appShow();assert.equal(game.openingMusicDelay,remaining);game.paused=false;
  for(let i=0;i<18;i++)game.update(1/60);
  assert.equal(selectSceneMusic(game),'morning');f.music.update(game,4200);
  assert.equal(f.requests.length,2);assert.equal(f.requests[1].id,'morning');
  const morning=f.resolve(1);await flush();assert.equal(morning.volume,0);
  f.music.update(game,5700);close(morning.volume,.72);
  assert.equal(sounds.filter(name=>name==='door').length,1,'the hinge is triggered once per opening');
  game.beginSegment(1);assert.equal(game.openingMusicDelay,0);assert.equal(selectSceneMusic(game),'morning');
  game.beginSegment(2);assert.equal(selectSceneMusic(game),'rain');
});

test('skipping a previously seen opening preserves its small music gap and reduced motion also completes',()=>{
  const game=new Game({load:()=>JSON.stringify({progress:{introSeen:true},settings:{reducedMotion:true}}),save(){}});
  game.start();assert.equal(selectSceneMusic(game),null);game.jump();assert.equal(game.phase,'run');
  assert.equal(selectSceneMusic(game),null);for(let i=0;i<44;i++)game.update(1/60);
  assert.equal(selectSceneMusic(game),'morning');
  game.start();while(game.phase==='intro')game.update(1/60);assert.equal(game.phase,'run');
  assert.equal(selectSceneMusic(game),null);game.restart();assert.equal(selectSceneMusic(game),'morning');
  game.start();while(game.phase==='intro')game.update(1/60);for(let i=0;i<44;i++)game.update(1/60);
  assert.equal(selectSceneMusic(game),'morning');
});

test('initial fade is 1.5 seconds, equal-power switch is 2 seconds, same cue never restarts',async()=>{
  const f=fixture();f.music.update(play(1),0);const morning=f.resolve(0);await flush();
  close(morning.volume,0);f.music.update(play(1),750);close(morning.volume,.72/Math.sqrt(2));
  f.music.update(play(1),1500);close(morning.volume,.72);assert.equal(morning.plays,1);
  f.music.update(play(2),1500);const rain=f.resolve(1);await flush();
  f.music.update(play(2),2500);close(morning.volume,.72/Math.sqrt(2));close(rain.volume,.72/Math.sqrt(2));
  assert.equal(morning.stopped,false);f.music.update(play(2),3500);assert.equal(morning.stopped,true);close(rain.volume,.72);
  f.music.update(play(2),5000);assert.equal(rain.plays,1);assert.equal(f.requests.length,2);
});

test('corridor switch uses 2.5 seconds and carries its own relative volume',async()=>{
  const f=fixture();f.music.update(play(1),0);const morning=f.resolve(0);await flush();f.music.update(play(1),1500);
  f.music.update({screen:'hall'},1500);const corridor=f.resolve(1);await flush();
  f.music.update({screen:'hall'},2750);close(morning.volume,.72/Math.sqrt(2));close(corridor.volume,.72*.75/Math.sqrt(2));
  f.music.update({screen:'hall'},3999);assert.equal(morning.stopped,false);
  f.music.update({screen:'hall'},4000);assert.equal(morning.stopped,true);close(corridor.volume,.72*.75);
});

test('rapid A to B to C retains every audible outgoing source until its fade finishes',async()=>{
  const f=fixture();f.music.update(play(1),0);const a=f.resolve(0);await flush();f.music.update(play(1),1500);
  f.music.update(play(2),1500);const b=f.resolve(1);await flush();f.music.update(play(2),2000);
  const priorA=a.volume,priorB=b.volume;
  f.music.update(play(3),2000);const c=f.resolve(2);await flush();
  assert.equal(a.stopped,false);assert.equal(b.stopped,false);close(a.volume,priorA);close(b.volume,priorB);close(c.volume,0);
  f.music.update(play(3),3000);assert.ok(a.volume>0&&b.volume>0&&c.volume>0);
  f.music.update(play(3),4000);assert.equal(a.stopped,true);assert.equal(b.stopped,true);close(c.volume,.72);
});

test('returning to a still-fading cue reuses its playhead rather than restarting it',async()=>{
  const f=fixture();f.music.update(play(1),0);const a=f.resolve(0);await flush();f.music.update(play(1),1500);
  f.music.update(play(2),1500);const b=f.resolve(1);await flush();f.music.update(play(2),2000);
  f.music.update(play(1),2000);assert.equal(f.requests.length,2);assert.equal(a.plays,1);
  f.music.update(play(1),4000);close(a.volume,.72);assert.equal(b.stopped,true);
});

test('pause ducks over 250 ms, resume restores over 400 ms and mute is immediate',async()=>{
  const f=fixture();f.music.update(play(1),0);const a=f.resolve(0);await flush();f.music.update(play(1),1500);
  f.music.update(play(1,{paused:true}),1600);close(a.volume,.72);
  f.music.update(play(1,{paused:true}),1725);close(a.volume,.72*.59);
  f.music.update(play(1,{paused:true}),1850);close(a.volume,.72*.18);
  f.music.update(play(1),1900);close(a.volume,.72*.18);
  f.music.update(play(1),2100);close(a.volume,.72*.59);
  f.music.update(play(1),2300);close(a.volume,.72);
  f.music.update(play(1,{settings:{muted:true}}),2400);close(a.volume,0);
  f.music.update(play(1),2500);close(a.volume,.72);assert.equal(a.plays,1);
});

test('quiet scene gains and choice/poem duck use voice-relative and smooth bus volume',async()=>{
  const f=fixture();f.music.update(play(6),0);const night=f.resolve(0);await flush();f.music.update(play(6),1500);close(night.volume,.72*.32);
  f.music.update(play(6,{phase:'choice',choice:6}),1500);const crossroads=f.resolve(1);await flush();
  f.music.update(play(6,{phase:'choice',choice:6}),3500);close(crossroads.volume,.72*.55*.7);
  f.music.update(play(6,{phase:'poem'}),3500);const corridor=f.resolve(2);await flush();
  f.music.update(play(6,{phase:'poem'}),6000);close(corridor.volume,.72*.75*.55);
});

test('hidden time freezes both fade envelopes and resumes only once',async()=>{
  const f=fixture();f.music.update(play(1),0);const a=f.resolve(0);await flush();f.music.update(play(1),750);
  const halfway=a.volume;f.music.suspend(750);close(a.volume,0);assert.equal(a.paused,true);
  f.music.resume(5750);close(a.volume,halfway);assert.equal(a.resumes,1);
  f.music.resume(5750);assert.equal(a.resumes,1);f.music.update(play(1),6500);close(a.volume,.72);
});

test('failed new load retries while previous music remains active',async()=>{
  const f=fixture();f.music.update(play(1),0);const a=f.resolve(0);await flush();f.music.update(play(1),1500);
  f.music.update(play(2),1500);f.requests[1].reject(Error('transient load failure'));await flush();
  f.music.update(play(2),2499);assert.equal(f.requests.length,2);assert.equal(a.stopped,false);close(a.volume,.72);
  f.music.update(play(2),2500);assert.equal(f.requests.length,3);const b=f.resolve(2);await flush();
  f.music.update(play(2),4500);close(b.volume,.72);assert.equal(a.stopped,true);
});

test('stale, hidden and destroyed load results never play and release their voice',async()=>{
  const f=fixture();f.music.update(play(1),0);f.music.update(play(2),10);
  const stale=f.resolve(0);await flush();assert.equal(stale.stopped,true);assert.equal(stale.plays,0);
  f.music.suspend(10);const hidden=f.resolve(1);await flush();assert.equal(hidden.stopped,true);assert.equal(hidden.plays,0);
  f.music.resume(100);assert.equal(f.requests.length,3);const b=f.resolve(2);await flush();assert.equal(b.plays,1);
  f.music.update(play(3),100);f.music.destroy();const late=f.resolve(3);await flush();
  assert.equal(b.stopped,true);assert.equal(late.stopped,true);assert.equal(late.plays,0);
  f.music.update(play(1),200);f.music.unlock();assert.equal(f.requests.length,4);
});

test('silence transition fades every outstanding cue rather than leaving an old track audible',async()=>{
  const f=fixture();f.music.update(play(1),0);const a=f.resolve(0);await flush();f.music.update(play(1),1500);
  f.music.update(play(2),1500);const b=f.resolve(1);await flush();f.music.update(play(2),2000);
  const video=play(7,{phase:'ending',ending:'morning',endingMediaActive:true});f.music.update(video,2000);
  f.music.update(video,4000);assert.equal(a.stopped,true);assert.equal(b.stopped,true);assert.equal(f.music.currentId,null);
});
