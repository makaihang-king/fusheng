const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),crypto=require('node:crypto');
const {openBrowser,delay}=require('./browser-check.cjs');

const root=path.resolve(__dirname,'..');
const args=process.argv.slice(2);
const outputArg=args.find(arg=>arg.startsWith('--out='))?.slice('--out='.length)||(args.includes('--out')?args[args.indexOf('--out')+1]:null);
assert.ok(!args.includes('--out')||outputArg&&!outputArg.startsWith('--'),'--out requires a path');
const output=path.resolve(root,outputArg||'build/qa/intro-doorway-v2');
const url=args.find(arg=>/^https?:\/\//.test(arg))||'http://127.0.0.1:4318/preview/';
const record=args.includes('--record');
const chosenCase=args.find(arg=>arg.startsWith('--case='))?.slice('--case='.length);
const scenarios=[
 {name:'desktop-normal',width:960,height:540,mobile:false,reducedMotion:false},
 {name:'desktop-reduced',width:960,height:540,mobile:false,reducedMotion:true},
 {name:'mobile-normal',width:852,height:393,mobile:true,reducedMotion:false},
 {name:'mobile-reduced',width:852,height:393,mobile:true,reducedMotion:true}
].filter(s=>!chosenCase||s.name===chosenCase);
assert.ok(scenarios.length,'--case must name desktop-normal, desktop-reduced, mobile-normal or mobile-reduced');
const targets=[.2,.55,.9,1.3,1.6,2,2.4,2.9];
fs.mkdirSync(output,{recursive:true});

// This observer runs only in the owned QA page. Each real context still plays
// to its original destination; a parallel branch copies that same signal into
// a MediaStreamDestination. The recorder mixer combines those context streams
// into one audio track, without replacing assets, voices or production gains.
function observeOpeningAudio(){
 const NativeContext=window.AudioContext||window.webkitAudioContext;
 const q=window.__introAudioQa={contexts:[],fetches:[],decoded:[],starts:[],stops:[],requests:[],connections:[],energies:[],transitions:[],musicTargets:[]};
 const bytesIds=new WeakMap(),bufferIds=new WeakMap(),contextEntries=new WeakMap(),tapped=new WeakSet();
 const gameState=()=>{const g=window.fleetingLife?.game;return {wall:performance.now(),phase:g?.phase,phaseTime:g?.phaseTime,screen:g?.screen,openingMusicDelay:g?.openingMusicDelay,paused:g?.paused,muted:g?.settings.muted,musicTarget:window.fleetingLife?.music?.targetId};};
 const originalFetch=window.fetch;
 window.fetch=async function(...args){
  const requested=String(args[0]?.url||args[0]),match=requested.match(/\/audio\/(bgm\/)?([^/?]+)\.(?:wav|ogg)(?:[?#]|$)/);
  const response=await originalFetch.apply(this,args);
  if(match){const id=(match[1]?'bgm:':'')+match[2];q.fetches.push({id,url:response.url,status:response.status,...gameState()});
   const arrayBuffer=response.arrayBuffer.bind(response);response.arrayBuffer=async()=>{const bytes=await arrayBuffer();bytesIds.set(bytes,id);return bytes;};
  }return response;
 };
 const originalSlice=ArrayBuffer.prototype.slice;
 ArrayBuffer.prototype.slice=function(...args){const copy=originalSlice.apply(this,args),id=bytesIds.get(this);if(id)bytesIds.set(copy,id);return copy;};
 const originalNodeConnect=AudioNode.prototype.connect;
 AudioNode.prototype.connect=function(destination,...args){
  const result=originalNodeConnect.call(this,destination,...args),entry=contextEntries.get(this.context);
  if(entry&&destination===this.context.destination&&!tapped.has(this)){
   tapped.add(this);originalNodeConnect.call(this,entry.destination);q.connections.push({context:entry.index,node:this.constructor.name,...gameState()});
  }return result;
 };
 class ObservedContext extends NativeContext{
  constructor(...args){super(...args);const entry={index:q.contexts.length,context:this,destination:this.createMediaStreamDestination()};
   q.contexts.push(entry);contextEntries.set(this,entry);if(q.mixer)q.connectMixer(entry);
  }
  decodeAudioData(bytes,...args){const id=bytesIds.get(bytes);return super.decodeAudioData(bytes,...args).then(buffer=>{
   if(id){bufferIds.set(buffer,id);q.decoded.push({id,duration:buffer.duration,rate:buffer.sampleRate,channels:buffer.numberOfChannels,context:contextEntries.get(this).index,...gameState()});}return buffer;
  });}
  createBufferSource(){const source=super.createBufferSource(),context=this,start=source.start.bind(source),stop=source.stop.bind(source),connect=source.connect.bind(source);let gain;
   source.connect=function(destination,...args){if(destination instanceof GainNode)gain=destination;return connect(destination,...args);};
   source.start=function(...args){const id=bufferIds.get(source.buffer);if(id)q.starts.push({id,context:contextEntries.get(context).index,contextState:context.state,at:context.currentTime,loop:source.loop,args,gain,source,...gameState()});return start(...args);};
   source.stop=function(...args){const id=bufferIds.get(source.buffer);if(id)q.stops.push({id,at:context.currentTime,args,...gameState()});return stop(...args);};return source;
  }
 }
 window.AudioContext=ObservedContext;if(window.webkitAudioContext)window.webkitAudioContext=ObservedContext;
 q.connectMixer=entry=>{if(entry.mixerSource)return;entry.mixerSource=q.mixer.createMediaStreamSource(entry.destination.stream);entry.mixerSource.connect(q.mixGain);};
 q.startCapture=async()=>{
  q.mixer=new NativeContext();q.mixGain=q.mixer.createGain();q.mixDestination=q.mixer.createMediaStreamDestination();q.mixGain.connect(q.mixDestination);
  q.analyser=q.mixer.createAnalyser();q.analyser.fftSize=2048;q.mixGain.connect(q.analyser);
  for(const entry of q.contexts)q.connectMixer(entry);await q.mixer.resume();q.recordingAt=performance.now();
  q.baseline={starts:q.starts.length,stops:q.stops.length,requests:q.requests.length,transitions:q.transitions.length,musicTargets:q.musicTargets.length};return q.mixDestination.stream;
 };
 q.snapshot=()=>{const state=gameState(),m=window.fleetingLife?.music;
  const active=q.starts.slice(q.baseline?.starts||0).map(s=>({id:s.id,context:s.context,gain:s.gain?.gain.value,offset:s.args[1]||0}));
  let rms=0,peak=0;if(q.analyser){const data=new Float32Array(q.analyser.fftSize);q.analyser.getFloatTimeDomainData(data);for(const value of data){rms+=value*value;peak=Math.max(peak,Math.abs(value));}rms=Math.sqrt(rms/data.length);}
  const energy={...state,rms,peak};if(q.mixer)q.energies.push(energy);
  return {...state,musicCurrent:m?.currentId,musicSuspended:m?.isSuspended,voices:(m?.voices||[]).map(v=>({id:v.voice.id,from:v.from,to:v.to,duration:v.duration,startedAt:v.startedAt})),active,rms,peak,contexts:q.contexts.map(e=>({index:e.index,state:e.context.state,time:e.context.currentTime})),starts:q.starts.length,requests:q.requests.length};
 };
 q.summary=()=>({fetches:q.fetches,decoded:q.decoded,connections:q.connections,recordingAt:q.recordingAt,baseline:q.baseline,
  starts:q.starts.map(({gain,source,...event})=>({...event,gain:gain?.gain.value})),stops:q.stops,requests:q.requests,energies:q.energies,transitions:q.transitions,musicTargets:q.musicTargets});
 q.hookGame=()=>{const g=window.fleetingLife.game,m=window.fleetingLife.music,original=g.hooks.sound;if(g.__introAudioHooked)return;g.__introAudioHooked=true;
  g.hooks.sound=name=>{q.requests.push({name,...gameState()});return original?.(name);};
  const begin=g.beginSegment.bind(g);g.beginSegment=(...args)=>{const before=gameState(),result=begin(...args);if(before.phase==='intro')q.transitions.push({kind:'opening-run',before,...gameState()});return result;};
  const update=m.update.bind(m);m.update=(...args)=>{const before=m.targetId,result=update(...args);if(before!==m.targetId)q.musicTargets.push({before,target:m.targetId,...gameState()});return result;};
 };
 q.decodeRecording=async blob=>{const context=new NativeContext();try{
  const buffer=await context.decodeAudioData(await blob.arrayBuffer());let peak=0,energy=0;const windows=[];
  for(let start=0;start<buffer.duration;start+=.25){let sum=0,n=0,max=0;for(let channel=0;channel<buffer.numberOfChannels;channel++){
   const data=buffer.getChannelData(channel);for(let i=Math.round(start*buffer.sampleRate);i<Math.min(data.length,Math.round((start+.25)*buffer.sampleRate));i++){const value=data[i];sum+=value*value;max=Math.max(max,Math.abs(value));n++;}
  }peak=Math.max(peak,max);energy+=sum;windows.push({seconds:Number(start.toFixed(2)),rms:Math.sqrt(sum/n),peak:max});}
  return {duration:buffer.duration,channels:buffer.numberOfChannels,rate:buffer.sampleRate,peak,rms:Math.sqrt(energy/(buffer.length*buffer.numberOfChannels)),windows};
 }finally{await context.close();}};
}

(async()=>{
 const browser=await openBrowser({width:960,height:540});
 const {send,evaluate,errors,consoleErrors,networkErrors}=browser;
 await send('Page.addScriptToEvaluateOnNewDocument',{source:'('+observeOpeningAudio.toString()+')();'});
 const report={generatedAt:new Date().toISOString(),url,output,
  sampling:'Real input starts the intro. The test page freezes game.update; the original update advances only in explicit 1/60 s steps. Each screenshot records and checks phaseTime before and after capture.',
  audioCapture:'Owned QA page taps each real AudioContext destination in parallel, mixes effects and BGM into one recorder track, and decodes the resulting WebM audio. Production voices, connections and gains retain their normal output.',
  scenarios:[],recordings:[],errors,consoleErrors,networkErrors};
 const state=()=>evaluate('(()=>{const g=window.fleetingLife.game;return {'+
  'screen:g.screen,phase:g.phase,phaseTime:g.phaseTime,sceneTime:g.sceneTime,clock:g.clock,'+
  'paused:g.paused,reducedMotion:g.settings.reducedMotion,introSeen:g.profile.progress.introSeen,openingMusicDelay:g.openingMusicDelay,musicTarget:window.fleetingLife.music.targetId,'+
  'frames:window.__introQa?.frames??null,hidden:window.fleetingLife.getLayout().hidden,'+
  'runtimeError:document.getElementById("error")?.textContent||"",audio:window.__introAudioQa?.snapshot()}})()');
 const awaitGame=async()=>{
  for(let i=0;i<120;i++){
   if(await evaluate('!!window.fleetingLife?.game && document.fonts.status==="loaded"'))return;
   await delay(100);
  }
  throw Error('game did not become ready');
 };
 const screenshot=async(filename)=>{
  const before=await state();
  const shot=await send('Page.captureScreenshot',{format:'png'});
  fs.writeFileSync(path.join(output,filename),Buffer.from(shot.data,'base64'));
  const after=await state();
  assert.equal(after.phaseTime,before.phaseTime,'phaseTime must remain frozen while the screenshot is captured');
  assert.equal(after.clock,before.clock,'game clock must remain frozen while the screenshot is captured');
  assert.equal(after.phase,before.phase,'phase must remain frozen while the screenshot is captured');
  return {file:filename,before,after};
 };
 const prepare=async(scenario,{frozen=true}={})=>{
  await send('Emulation.setDeviceMetricsOverride',{width:scenario.width,height:scenario.height,deviceScaleFactor:1,mobile:scenario.mobile});
  await send('Emulation.setTouchEmulationEnabled',{enabled:scenario.mobile,maxTouchPoints:1});
  await send('Page.navigate',{url});await awaitGame();
  // openBrowser owns an isolated temporary profile; this never changes a user's live save.
  await evaluate('localStorage.removeItem("fleeting-life-s1");localStorage.removeItem("fleeting-life-s1-moments");localStorage.removeItem("fleeting-life-s1-moments-v2")');
  await send('Page.reload',{ignoreCache:true});await awaitGame();
  await evaluate('window.__introAudioQa.hookGame()');
  await evaluate('(()=>{const api=window.fleetingLife,g=api.game;'+
   'g.settings.reducedMotion='+scenario.reducedMotion+';g.clock=0;g.accumulator=0;'+
   'const original=g.update.bind(g);'+
   'window.__introQa={frames:0,frozen:'+frozen+',advanceTo(target){'+
    'if(!this.frozen)throw Error("deterministic advance requires a frozen update");'+
    'if(target<this.frames)throw Error("intro QA cannot seek backwards");'+
    'while(this.frames<target){original(1/60);this.frames++;}'+
    'g.render(api.painter);}};'+
   'g.update=dt=>{if(!window.__introQa.frozen)original(dt);};'+
   'g.render(api.painter);})()');
  // Native rendering stays active to load art and compose the backdrop, but game time is frozen.
  await delay(350);
  const current=await state();assert.equal(current.screen,'hall');assert.equal(current.runtimeError,'');
  return current;
 };
 const clickStart=async(mobile)=>{
  const point=await evaluate('(()=>{const g=window.fleetingLife.game,b=g.buttons.find(b=>b.label==="出发"),r=document.getElementById("game").getBoundingClientRect();'+
   'if(!b||b.disabled)throw Error("start door is missing or disabled");'+
   'return {x:r.x+(b.x+b.w/2)*r.width/480,y:r.y+(b.y+b.h/2)*r.height/270};})()');
  if(mobile){
   await send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{...point,id:1,radiusX:2,radiusY:2,force:1}]});
   await delay(30);await send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
  }else{
   await send('Input.dispatchMouseEvent',{type:'mousePressed',...point,button:'left',clickCount:1,buttons:1});
   await delay(30);await send('Input.dispatchMouseEvent',{type:'mouseReleased',...point,button:'left',clickCount:1,buttons:0});
  }
  const started=await state();assert.equal(started.screen,'play');assert.equal(started.phase,'intro');
  if(await evaluate('window.__introQa.frozen'))assert.equal(started.phaseTime,0,'real start input must enter a frozen intro at zero');
  return started;
 };
 try{
  for(const scenario of scenarios){
   const result={...scenario,input:scenario.mobile?'touch':'mouse',hall:await prepare(scenario),samples:[]};
   report.scenarios.push(result);
   result.hallScreenshot=await screenshot(scenario.name+'-hall.png');
   result.started=await clickStart(scenario.mobile);
   // First render requests the school's art; waiting cannot advance the controlled game clock.
   await evaluate('window.fleetingLife.game.render(window.fleetingLife.painter)');await delay(400);
   for(const requestedSeconds of targets){
    const requestedFrame=Math.round(requestedSeconds*60);
    await evaluate('window.__introQa.advanceTo('+requestedFrame+')');
    // One native frame composes resized mobile margins; the update is still frozen.
    await delay(40);
    const capture=await screenshot(scenario.name+'-'+requestedSeconds.toFixed(requestedSeconds===.55?2:1)+'s.png');
    assert.equal(capture.before.phase,'intro');assert.equal(capture.before.frames,requestedFrame);
    assert.ok(Math.abs(capture.before.phaseTime-requestedFrame/60)<1e-9,'phaseTime matches the requested simulation frame');
    assert.equal(capture.before.reducedMotion,scenario.reducedMotion);
    result.samples.push({requestedSeconds,requestedFrame,actualPhaseTime:capture.before.phaseTime,...capture});
   }
   await evaluate('window.__introQa.advanceTo(195)');await delay(40);
   result.finished=await state();assert.equal(result.finished.screen,'play');assert.equal(result.finished.phase,'run');
   assert.equal(result.finished.introSeen,true);assert.equal(result.finished.paused,false);assert.equal(result.finished.hidden,false);
   result.runScreenshot=await screenshot(scenario.name+'-run.png');
   result.persistedIntroSeen=await evaluate('JSON.parse(localStorage.getItem("fleeting-life-s1")).progress.introSeen');
   assert.equal(result.persistedIntroSeen,true);
   console.log('PASS '+scenario.name+' — exact sampled frames '+result.samples.map(s=>s.requestedFrame).join(', '));
  }
  if(record)for(const scenario of scenarios){
   await prepare(scenario);
   // Preload the entry frame before returning to the hall. The actual recording still starts via input.
   await clickStart(scenario.mobile);await evaluate('window.fleetingLife.game.render(window.fleetingLife.painter)');await delay(400);
   await evaluate('window.fleetingLife.game.toHall(false);window.fleetingLife.game.render(window.fleetingLife.painter)');
   await delay(1700);
   await evaluate('(async()=>{const q=window.__introAudioQa,audioStream=await q.startCapture();'+
    'const surface=document.createElement("canvas");surface.width=innerWidth;surface.height=innerHeight;const paint=surface.getContext("2d");paint.imageSmoothingEnabled=false;'+
    'let composing=true;const compose=()=>{if(!composing)return;paint.fillStyle=getComputedStyle(document.body).backgroundColor;paint.fillRect(0,0,surface.width,surface.height);'+
     'for(const canvas of [document.getElementById("backdrop"),document.getElementById("game")]){if(!canvas)continue;const r=canvas.getBoundingClientRect();paint.drawImage(canvas,r.x,r.y,r.width,r.height);}requestAnimationFrame(compose);};compose();'+
    'const videoStream=surface.captureStream(30),stream=new MediaStream([...videoStream.getVideoTracks(),...audioStream.getAudioTracks()]);'+
    'if(stream.getVideoTracks().length!==1||stream.getAudioTracks().length!==1)throw Error("Recorder requires one real video and one mixed audio track");'+
    'q.captureTracks=stream.getTracks().map(track=>({kind:track.kind,label:track.label,settings:track.getSettings()}));'+
    'const mime=["video/webm;codecs=vp9,opus","video/webm;codecs=vp8,opus","video/webm"].find(type=>MediaRecorder.isTypeSupported(type));'+
    'if(!mime)throw Error("No supported WebM recorder");'+
    'const recorder=new MediaRecorder(stream,{mimeType:mime,videoBitsPerSecond:2000000,audioBitsPerSecond:128000}),chunks=[];q.recorderAt=performance.now();'+
    'window.__introRecorder=recorder;window.__introRecording=new Promise(resolve=>{'+
     'recorder.ondataavailable=event=>{if(event.data.size)chunks.push(event.data);};'+
     'recorder.onstop=async()=>{composing=false;for(const track of stream.getTracks())track.stop();const blob=new Blob(chunks,{type:mime}),reader=new FileReader();let decodedAudio;'+
      'try{decodedAudio=await q.decodeRecording(blob);}catch(error){decodedAudio={error:error.message};}'+
      'reader.onload=()=>resolve({base64:String(reader.result).split(";base64,")[1],mime,bytes:blob.size,tracks:q.captureTracks,decodedAudio,recorderAt:q.recorderAt});reader.readAsDataURL(blob);};'+
    '});recorder.start();window.__introQa.frozen=false;})()');
   await delay(150);
   const started=await clickStart(scenario.mobile),startedAt=Date.now(),samples=[];
   const deadline=Date.now()+12000;
   while(Date.now()<deadline){const current=await state(),audio=current.audio;samples.push({wallElapsedMs:Date.now()-startedAt,...current});
    if(current.phase==='run'&&audio.musicCurrent==='morning'&&audio.active.some(v=>v.id==='bgm:morning'&&v.gain>.71))break;await delay(50);
   }
   const finished=await state();assert.equal(finished.phase,'run');assert.equal(finished.introSeen,true);
   await delay(300);await evaluate('window.__introRecorder.stop()');
   const recording=await evaluate('window.__introRecording');
   const audio=await evaluate('window.__introAudioQa.summary()'),file=scenario.name+'-intro.webm',diskPath=path.join(output,file),encoded=Buffer.from(recording.base64,'base64');
   assert.equal(encoded.length,recording.bytes,'base64 must retain every byte of the recorded AV blob');assert.ok(encoded.length>100000);assert.equal(encoded.subarray(0,4).toString('hex'),'1a45dfa3','real WebM EBML header');
   fs.writeFileSync(diskPath,encoded);const disk=fs.readFileSync(diskPath);assert.ok(disk.equals(encoded),'read the saved bytes back from disk');
   const diskSha256=crypto.createHash('sha256').update(disk).digest('hex');
   const diskUrl=new URL('/'+path.relative(root,diskPath).split(path.sep).join('/'),url).href;
   const savedPlayback=await evaluate('(async()=>{const response=await fetch('+JSON.stringify(diskUrl)+');if(!response.ok)throw Error("Saved AV HTTP "+response.status);'+
    'const bytes=await response.arrayBuffer(),hash=Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256",bytes))).map(b=>b.toString(16).padStart(2,"0")).join("");'+
    'const blob=new Blob([bytes],{type:"video/webm"}),audio=await window.__introAudioQa.decodeRecording(blob),video=document.createElement("video"),source=URL.createObjectURL(blob);video.muted=true;video.playsInline=true;video.preload="auto";video.src=source;'+
    'try{await video.play();const until=performance.now()+5000;while(video.currentTime<.75&&performance.now()<until){if(video.error)throw Error("Saved video decode "+video.error.message);await new Promise(resolve=>setTimeout(resolve,30));}'+
     'if(video.currentTime<.7||!video.videoWidth)throw Error("Saved video did not actually advance");const canvas=document.createElement("canvas");canvas.width=video.videoWidth;canvas.height=video.videoHeight;canvas.getContext("2d").drawImage(video,0,0);'+
     'return {url:'+JSON.stringify(diskUrl)+',status:response.status,bytes:bytes.byteLength,sha256:hash,audio,video:{width:video.videoWidth,height:video.videoHeight,currentTime:video.currentTime,decodedFrames:video.getVideoPlaybackQuality?.().totalVideoFrames||0},frame:canvas.toDataURL("image/png")};'+
    '}finally{video.pause();video.removeAttribute("src");video.load();URL.revokeObjectURL(source);}})()');
   const savedFrame=scenario.name+'-saved-video-frame.png';fs.writeFileSync(path.join(output,savedFrame),Buffer.from(savedPlayback.frame.split(';base64,')[1],'base64'));delete savedPlayback.frame;
   const {base64,...media}=recording,result={file,...scenario,mode:'Real runtime clock after actual '+(scenario.mobile?'touch':'mouse')+' input; no deterministic stepping; AV captures the actual game canvas layers and real mixed output',started,finished,samples,audio,media,checks:[]};
   result.savedPlayback={...savedPlayback,frameFile:savedFrame,diskSha256};
   report.recordings.push(result);
   const check=(name,fn)=>{fn();result.checks.push({name,pass:true});};
   const starts=audio.starts.slice(audio.baseline.starts),doorStarts=starts.filter(s=>s.id==='door'),morningStarts=starts.filter(s=>s.id==='bgm:morning');
   const doorRequest=audio.requests.slice(audio.baseline.requests).find(r=>r.name==='door'),runStart=audio.transitions.slice(audio.baseline.transitions).find(t=>t.kind==='opening-run'),morningTarget=audio.musicTargets.slice(audio.baseline.musicTargets).find(t=>t.target==='morning');
   const relative=event=>event&&Number(((event.wall-doorRequest.wall)/1000).toFixed(4));
   result.timeline={origin:'Actual door sound request from the real start input; seconds on performance.now()',doorRequest:0,doorSourceStart:relative(doorStarts[0]),doorSourceOffset:doorStarts[0]?.args[1]||0,
    latchInAuthoredCue:.08,hingeInAuthoredCue:.30,runStart:relative(runStart),morningTarget:relative(morningTarget),morningSourceStart:relative(morningStarts[0]),
    targetGapAfterRun:runStart&&morningTarget?Number(((morningTarget.wall-runStart.wall)/1000).toFixed(4)):null,
    fullMorningGain:relative(samples.find(s=>s.audio.active.some(v=>v.id==='bgm:morning'&&v.gain>.71))?.audio),fadeDurationMs:1500};
   check('door.wav is served and decoded once per QA page',()=>{
    assert.equal(audio.fetches.filter(f=>f.id==='door').length,1);assert.equal(audio.fetches.find(f=>f.id==='door').status,200);
    const decoded=audio.decoded.filter(d=>d.id==='door');assert.equal(decoded.length,1);assert.ok(Math.abs(decoded[0].duration-2.72)<.005);assert.equal(decoded[0].channels,2);
   });
   check('each actual opening triggers one non-looping WAV at the live intro cursor',()=>{
    assert.equal(audio.requests.slice(audio.baseline.requests).filter(r=>r.name==='door').length,1);assert.equal(doorStarts.length,1);assert.equal(doorStarts[0].loop,false);
    assert.equal(doorStarts[0].contextState,'running');assert.ok(Math.abs((doorStarts[0].args[1]||0)-doorStarts[0].phaseTime)<.025);
   });
   check('the door owns the intro while the corridor cue fades out',()=>{
    const intro=samples.filter(s=>s.phase==='intro'&&s.phaseTime>0);assert.ok(intro.length>15);assert.ok(intro.every(s=>s.audio.musicTarget===null),'the real host update yields BGM from its first advanced intro frame');
    assert.ok(intro.filter(s=>s.phaseTime>.38&&s.phaseTime<1.8).some(s=>s.audio.rms>.01),'real tapped door signal is audible during hinge motion');
   });
   check('morning waits 0.7 playable seconds and fades in for 1.5 seconds only once',()=>{
    assert.equal(morningStarts.length,1);assert.equal(morningStarts[0].phase,'run');assert.ok(morningStarts[0].phaseTime>=.69);assert.equal(morningStarts[0].openingMusicDelay,0);
    const gap=samples.filter(s=>s.phase==='run'&&s.openingMusicDelay>0);assert.ok(gap.length>5);assert.ok(gap.every(s=>s.audio.musicTarget===null));
    const fade=samples.filter(s=>s.audio.active.some(v=>v.id==='bgm:morning'));assert.ok(fade.length>15);assert.ok(fade[0].audio.active.find(v=>v.id==='bgm:morning').gain<.25);
    assert.ok(fade.at(-1).audio.active.find(v=>v.id==='bgm:morning').gain>.71);assert.ok(fade.some(s=>s.audio.voices.some(v=>v.id==='morning'&&v.duration===1500)));
    for(let i=1;i<fade.length;i++)assert.ok(fade[i].audio.active.find(v=>v.id==='bgm:morning').gain+.002>=fade[i-1].audio.active.find(v=>v.id==='bgm:morning').gain);
   });
   check('saved AV contains one video track and one real decodable audio track',()=>{
    assert.equal(media.tracks.filter(t=>t.kind==='video').length,1);assert.equal(media.tracks.filter(t=>t.kind==='audio').length,1);
    assert.ok(!media.decodedAudio.error,media.decodedAudio.error);assert.ok(media.decodedAudio.duration>5);assert.ok(media.decodedAudio.peak>.06);assert.ok(media.decodedAudio.rms>.006);
   });
   check('the actual saved WebM is served byte-for-byte and its video/audio both decode',()=>{
    assert.equal(savedPlayback.bytes,media.bytes);assert.equal(savedPlayback.sha256,diskSha256);assert.equal(savedPlayback.status,200);
    assert.ok(savedPlayback.audio.duration>5);assert.ok(savedPlayback.audio.peak>.06);assert.ok(savedPlayback.audio.rms>.006);assert.ok(savedPlayback.video.currentTime>=.7);assert.ok(savedPlayback.video.decodedFrames>=3);
    const videoTrack=media.tracks.find(t=>t.kind==='video');assert.equal(savedPlayback.video.width,videoTrack.settings.width);assert.equal(savedPlayback.video.height,videoTrack.settings.height);
   });
   fs.writeFileSync(path.join(output,scenario.name+'-audio-timing.json'),JSON.stringify(result,null,2));
   await evaluate('window.__introAudioQa.mixer.close()');
   console.log('PASS '+scenario.name+' real opening AV; door x1, delayed morning x1, decoded audio '+media.decodedAudio.duration.toFixed(2)+' s');
  }
  assert.deepEqual(errors,[]);assert.deepEqual(consoleErrors,[]);assert.deepEqual(networkErrors,[]);
  report.pass=true;
 }catch(error){report.pass=false;report.failure=error.stack||error.message;throw error;}
 finally{
  fs.writeFileSync(path.join(output,'report.json'),JSON.stringify(report,null,2));
  await browser.close();
 }
 console.log(JSON.stringify({output,pass:report.pass,scenarios:report.scenarios.map(s=>s.name),recordings:report.recordings.map(r=>r.file),errors,consoleErrors,networkErrors}));
})().catch(error=>{console.error(error);process.exitCode=1;});
