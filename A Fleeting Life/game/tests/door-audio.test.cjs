'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('fs'),path=require('path'),vm=require('vm');
const root=path.resolve(__dirname,'..');
const flush=async()=>{for(let i=0;i<8;i++)await Promise.resolve();};
test('door cue uses one Mixkit opening recording and preserves its Cocos identity',()=>{
 const wav=fs.readFileSync(path.join(root,'assets/resources/audio/door.wav'));
 assert.equal(wav.toString('ascii',0,4),'RIFF');assert.equal(wav.toString('ascii',8,12),'WAVE');
 assert.equal(wav.readUInt16LE(20),1);assert.equal(wav.readUInt16LE(22),2);assert.equal(wav.readUInt16LE(34),16);
 const rate=wav.readUInt32LE(24),count=wav.readUInt32LE(40)/4,duration=count/rate;
 assert.ok(Math.abs(duration-2.72)<.005,'the opening cue covers the transition');
 const rms=(start,end)=>{let energy=0,n=0;for(let i=Math.round(start*rate)*2;i<Math.min(count,Math.round(end*rate))*2;i++){energy+=(wav.readInt16LE(44+i*2)/32768)**2;n++;}return Math.sqrt(energy/n);};
 assert.ok(rms(0,.07)<.0005,'the cue leaves a short lead-in before the hand reaches the handle');
 assert.ok(rms(.08,.25)>.02,'the first latch/door movement sound starts at the hand contact');
 for(const [start,end,minimum]of [[.35,.7,.03],[.7,1.0,.022],[1.0,1.3,.01],[1.4,1.8,.009]])
  assert.ok(rms(start,end)>minimum,'the recorded door movement remains audible through its swing: '+start);
 assert.ok(rms(2.3,duration)<.004,'the cue settles before the next scene');
 let peak=0;for(let i=0;i<count*2;i++)peak=Math.max(peak,Math.abs(wav.readInt16LE(44+i*2)/32768));assert.ok(peak>.5&&peak<.8);
 assert.equal(JSON.parse(fs.readFileSync(path.join(root,'assets/resources/audio/door.wav.meta'),'utf8')).uuid,'47159b99-ed7b-4ba3-bc87-6538b931d9fd');
 const sourceNote=fs.readFileSync(path.join(root,'assets/audio-sources/README.md'),'utf8');
 assert.match(sourceNote,/Creaky door open/);assert.match(sourceNote,/Mixkit Sound Effects Free License/);
 assert.ok(fs.existsSync(path.join(root,'assets/audio-sources/mixkit-creaky-door-open-195.wav')));
});
function previewAudioFixture(){
 const text=fs.readFileSync(path.join(root,'preview/host.js'),'utf8');
 const block=text.slice(text.indexOf(' let audio;'),text.indexOf(' let musicContext;'));
 const voices=[],gains=[],requests=[],clip={duration:2.72};
 class Context {
  constructor(){this.currentTime=0;this.destination={};fixture.context=this;}
  resume(){return Promise.resolve();}
  decodeAudioData(){return Promise.resolve(clip);}
  createGain(){const g={values:[],gain:{value:0,setValueAtTime(value,at){g.values.push({value,at});}},connect(){},disconnect(){g.disconnected=true;}};gains.push(g);return g;}
  createBufferSource(){const v={starts:[],connect(){},disconnect(){v.disconnected=true;},start(when,offset){v.starts.push({when,offset});},stop(){v.stops=(v.stops||0)+1;}};voices.push(v);return v;}
 }
 const game={screen:'play',phase:'intro',phaseTime:0,paused:false,settings:{muted:false}};
 const fixture={game,voices,gains,requests,context:null};
 const scope={window:{AudioContext:Context},performance:{now:()=>0},game,hidden:false,exited:false,fetch(url){requests.push(url);return Promise.resolve({ok:true,arrayBuffer:()=>Promise.resolve(new ArrayBuffer(8))});},console};
 vm.createContext(scope);vm.runInContext(block+'\nthis.fx={sound,updateDoorSound,stopDoorSound};',scope);fixture.api=scope.fx;fixture.scope=scope;return fixture;
}
test('preview uses the door WAV, offsets cold decoding, pauses its playhead and never loops or double-fires',async()=>{
 const f=previewAudioFixture();await flush();assert.deepEqual(f.requests,['../assets/resources/audio/door.wav']);
 f.api.sound('door');f.game.phaseTime=.12;await flush();
 assert.equal(f.voices.length,1);assert.equal(f.voices[0].starts.length,1);assert.equal(f.voices[0].starts[0].offset,.12);assert.equal(f.voices[0].loop,undefined);
 f.context.currentTime=.55;f.game.paused=true;f.api.updateDoorSound();assert.equal(f.voices[0].stops,1);
 f.context.currentTime=20;f.api.updateDoorSound();assert.equal(f.voices.length,1);
 f.game.paused=false;f.api.updateDoorSound();assert.equal(f.voices.length,2);assert.ok(Math.abs(f.voices[1].starts[0].offset-.67)<1e-9);
 f.game.settings.muted=true;f.api.updateDoorSound();assert.equal(f.gains[0].values.at(-1).value,0);
 f.game.settings.muted=false;f.api.updateDoorSound();assert.equal(f.gains[0].values.at(-1).value,.48);assert.equal(f.voices.length,2);
 f.game.phase='run';f.api.updateDoorSound();assert.equal(f.voices[1].stops,1);assert.equal(f.gains[0].disconnected,true);
 f.api.updateDoorSound();assert.equal(f.voices.length,2);
});
test('late door decoding cannot play after skip, and background pause resumes at its previous position',async()=>{
 const skipped=previewAudioFixture();skipped.api.sound('door');skipped.game.phase='run';await flush();assert.equal(skipped.voices.length,0);
 const f=previewAudioFixture();f.api.sound('door');await flush();f.context.currentTime=.9;f.scope.hidden=true;f.api.updateDoorSound(true);
 assert.equal(f.voices[0].stops,1);f.context.currentTime=12;f.scope.hidden=false;f.api.updateDoorSound();
 assert.equal(f.voices.length,2);assert.equal(f.voices[1].starts[0].offset,.9);
 f.api.sound('door');await flush();assert.equal(f.voices[1].stops,1);assert.equal(f.voices.length,3);
});

function nativeAudioFixture(){
 const ts=require(path.resolve(root,'../需要的软件/CocosCreator/3.8.8/resources/app.asar.unpacked/node_modules/typescript'));
 const text=fs.readFileSync(path.join(root,'assets/scripts/Bootstrap.ts'),'utf8');
 const start=text.indexOf('  private preloadDoorSound(){'),end=text.indexOf('  private point(',start);assert.ok(start>=0&&end>start);
 const compiled=ts.transpileModule('class DoorHarness {\n'+text.slice(start,end)+'\n}',{compilerOptions:{target:ts.ScriptTarget.ES2020}}).outputText;
 const requests=[],source={playing:false,currentTime:0,starts:[],pauses:0,stops:0,
  play(){this.starts.push(this.currentTime);this.playing=true;},
  pause(){this.pauses++;this.playing=false;this.currentTime=0;},
  stop(){this.stops++;this.playing=false;this.currentTime=0;}};
 const resources={load(name,type,callback){requests.push({name,callback});},release(){}};
 const Harness=new Function('resources','AudioClip',compiled+'\nreturn DoorHarness;')(resources,class{}),api=new Harness();
 Object.assign(api,{clips:new Map(),exited:false,destroyed:false,hidden:false,doorAudio:source,doorRequested:false,doorStarted:false,doorVoicePaused:false,doorOffset:0,game:{screen:'play',phase:'intro',phaseTime:0,paused:false,settings:{muted:false}},audio:{playOneShot(){assert.fail('the opening must use its dedicated source');}}});
 return {api,source,requests,ready(){requests.at(-1).callback(null,{getDuration:()=>2.72});}};
}
test('native preloads without playing, shares the door gain and resumes backend-reset playheads once',()=>{
 const f=nativeAudioFixture();f.api.preloadDoorSound();assert.equal(f.requests.length,1);assert.equal(f.source.starts.length,0);
 f.api.sound('door');assert.equal(f.requests.length,1,'first opening reuses its preload request');
 f.api.game.phaseTime=.42;f.ready();assert.deepEqual(f.source.starts,[.42]);assert.equal(f.source.volume,.48);
 f.source.currentTime=.92;f.api.hidden=true;f.api.syncDoorSound();assert.equal(f.source.pauses,1);
 f.api.syncDoorSound();assert.equal(f.source.pauses,1);f.api.hidden=false;f.api.syncDoorSound();assert.deepEqual(f.source.starts,[.42,.92]);
 f.api.game.settings.muted=true;f.api.syncDoorSound();assert.equal(f.source.volume,0);
 f.api.game.settings.muted=false;f.api.syncDoorSound();assert.equal(f.source.volume,.48);assert.equal(f.source.starts.length,2);
 f.source.playing=false;f.source.currentTime=2.72;f.api.syncDoorSound();assert.equal(f.source.starts.length,2,'end of the cue never starts it again');
 f.api.game.phase='run';f.api.syncDoorSound();assert.equal(f.api.doorRequested,false);
});
test('native late load stays silent through pause or a skipped opening',()=>{
 const paused=nativeAudioFixture();paused.api.sound('door');paused.api.game.paused=true;paused.ready();assert.equal(paused.source.starts.length,0);
 paused.api.game.paused=false;paused.api.game.phaseTime=.28;paused.api.syncDoorSound();assert.deepEqual(paused.source.starts,[.28]);
 const skipped=nativeAudioFixture();skipped.api.sound('door');skipped.api.game.phase='run';skipped.ready();assert.equal(skipped.source.starts.length,0);
});
