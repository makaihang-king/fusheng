'use strict';
// Real recordings and real-time replay, in an owned browser profile. The unlocked
// secondGrade precondition is a fixture; this does not claim a natural route clear.
const fs=require('fs'),path=require('path'),assert=require('node:assert/strict');
const {openBrowser,delay}=require('./browser-check.cjs');
const root=path.resolve(__dirname,'..'),url=process.argv[2]||'http://127.0.0.1:4318/preview/';
const cocos=new URL(url).pathname.includes('/build/web-desktop/'),host=cocos?'cocos-web':'canvas';
const out=path.join(root,'build/qa/personal-finale');fs.mkdirSync(out,{recursive:true});
const report={generatedAt:new Date().toISOString(),url,host,passed:false,
  scope:'Owned desktop Edge. Real canvas frames -> MediaRecorder -> IndexedDB -> reload -> actual three-clip private finale. Four normal lights and completed secondGrade are fixtures; no natural route or native-device claim. No currentTime/phaseTime edits, fake blobs, accelerated updates, or injected replay results.',checks:[]};

(async()=>{
 const browser=await openBrowser({width:960,height:540});
 const {send,evaluate,errors,consoleErrors,networkErrors}=browser;
 const read=expression=>evaluate('(()=>{const g=window.fleetingLife.game,m=window.fleetingLife.moments;return ('+expression+');})()');
 const setup=code=>evaluate('(()=>{const g=window.fleetingLife.game,m=window.fleetingLife.moments;'+code+';return true;})()');
 const wait=async(expression,timeout=20000)=>{
  const end=Date.now()+timeout;while(Date.now()<end){const value=await read(expression);if(value)return value;await delay(100);}throw Error('Real-time condition timed out: '+expression);
 };
 const ready=async()=>{
  const end=Date.now()+30000;while(Date.now()<end){if(await evaluate('!!window.fleetingLife?.game&&!!window.fleetingLife?.moments')){await evaluate('window.fleetingLife.moments.ready');return;}await delay(100);}throw Error('Game and recorder did not load');
 };
 const point=async(x,y)=>{
  const r=await evaluate('(()=>{const c=document.querySelector("#game,#GameCanvas"),r=window.fleetingLife.getLayout?.().core||c.getBoundingClientRect();return {x:r.left,y:r.top,w:r.width,h:r.height};})()');
  return {x:r.x+x*r.w/480,y:r.y+y*r.h/270};
 };
 const click=async(label)=>{
  const b=await read('g.buttons.find(b=>b.label==='+JSON.stringify(label)+')');assert.ok(b,'Enabled mouse button: '+label);assert.ok(!b.disabled);
  const p=await point(b.x+b.w/2,b.y+b.h/2);
  await send('Input.dispatchMouseEvent',{type:'mousePressed',...p,button:'left',buttons:1,clickCount:1});await delay(30);
  await send('Input.dispatchMouseEvent',{type:'mouseReleased',...p,button:'left',buttons:0,clickCount:1});await delay(80);
 };
 const key=async(key)=>{
  const code=key===' '?'Space':key,virtualCode=key===' '?32:key==='Escape'?27:undefined;
  const event={key,code,...(virtualCode===undefined?{}:{windowsVirtualKeyCode:virtualCode,nativeVirtualKeyCode:virtualCode})};
  await send('Input.dispatchKeyEvent',{type:'keyDown',...event});await delay(35);
  await send('Input.dispatchKeyEvent',{type:'keyUp',...event});await delay(65);
 };
 const shot=async(name)=>{const image=await send('Page.captureScreenshot',{format:'png'});fs.writeFileSync(path.join(out,host+'-'+name+'.png'),Buffer.from(image.data,'base64'));};
 const clips=()=>evaluate('(async()=>{const m=window.fleetingLife.moments;await m.ready;const index=JSON.parse(localStorage.getItem(m.indexKey)||"{}"),list=[];for(const item of index.candidates||[]){const blob=await m.blob(item.id),sha256=blob?Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256",await blob.arrayBuffer())),n=>n.toString(16).padStart(2,"0")).join(""):null;list.push({...item,blobBytes:blob?.size||0,blobMime:blob?.type||"",isBlob:blob instanceof Blob,sha256});}return {indexKey:m.indexKey,clips:list};})()');
 try{
  await send('Emulation.setDeviceMetricsOverride',{width:960,height:540,deviceScaleFactor:1,mobile:false});
  await send('Page.navigate',{url});await ready();await delay(300);
  // Only this invocation's temporary browser profile is used; there is no user save here.
  assert.equal(await read('g.screen'),'hall');assert.equal(await read('m.memories.length'),0);
  await click('出发');await wait('g.phase==="run"');
  // Keep a safe recording specimen on the real first route; no time or speed edits.
  await setup('g.obstacles=[];g.pickups=[]');await delay(2150);
  for(const kind of ['highlight','death','hidden']){
   await key(' ');assert.ok(await read('g.y>0'),'the captured actor really responds to keyboard input');
   await setup('g.capture('+JSON.stringify(kind)+')');await delay(1250);
  }
  await wait('m.videos.length===3&&!m.pending&&!m.encoding',30000);
  report.recordings=await clips();assert.equal(report.recordings.clips.length,3);
  assert.deepEqual(report.recordings.clips.map(c=>c.kind).sort(),['death','hidden','highlight']);
  for(const clip of report.recordings.clips){assert.ok(clip.isBlob&&clip.blobBytes>100);assert.ok(['webm','mp4'].includes(clip.format));assert.ok(clip.durationMs>=2300&&clip.durationMs<=3100);assert.match(clip.sha256,/^[a-f0-9]{64}$/);}
  report.checks.push('Three genuine moving canvas clips recorded with MediaRecorder and stored as IndexedDB blobs.');
  console.log('PASS actual recordings '+JSON.stringify(report.recordings.clips.map(c=>({kind:c.kind,format:c.format,durationMs:c.durationMs,bytes:c.blobBytes}))));

  await send('Page.reload',{ignoreCache:true});await ready();await delay(200);
  report.reloaded=await clips();assert.deepEqual(report.reloaded,report.recordings);assert.equal(await read('g.screen'),'hall');
  report.checks.push('A real page reload recovers exactly the same three blob IDs, MIME types, byte sizes, durations and full-content SHA256 hashes.');
  // The direct entry fixture does not supply the normal ending-card mouse input.
  // Restore real canvas keyboard focus after reload with a harmless trusted click.
  const focusPoint=await point(5,5);
  await send('Input.dispatchMouseEvent',{type:'mousePressed',...focusPoint,button:'left',buttons:1,clickCount:1});
  await send('Input.dispatchMouseEvent',{type:'mouseReleased',...focusPoint,button:'left',buttons:0,clickCount:1});await delay(80);
  report.canvasFocusAfterReload=await evaluate('({tag:document.activeElement?.tagName,id:document.activeElement?.id})');
  // Transparently observe the real recorder methods and video events. They still
  // call their originals with unchanged arguments, clocks and actual callbacks.
  await setup(`
   const q=window.__personalFinaleQA={events:[],keyboard:[],began:0,context:null,attached:false};
   for(const type of ['keydown','keyup'])window.addEventListener(type,e=>q.keyboard.push({type,key:e.key,code:e.code,keyCode:e.keyCode,isTrusted:e.isTrusted}),true);
   const snapshot=()=>({wallMs:performance.now()-q.began,phaseTime:g.phaseTime,finaleTime:g.finaleTime,paused:g.paused,finalePlayed:g.profile.finalePlayed,index:m.segmentIndex,videoTime:m.video?.currentTime||0});
   const log=(type,extra={})=>q.events.push({type,...snapshot(),...extra});
   const originalKeyDown=g.keyDown;g.keyDown=function(key){log('game:keyDown',{key});return originalKeyDown.call(this,key);};
   const start=m.startSegment;
   m.startSegment=function(index){
    const part=this.timeline[index],clip=part.m||part.moment;q.context={index,id:clip.id,kind:clip.kind,format:clip.format,durationMs:clip.durationMs};
    if(!q.attached){q.attached=true;
     for(const type of ['loadedmetadata','loadeddata','playing','pause','timeupdate','ended','waiting','stalled','error'])this.video.addEventListener(type,()=>{
      log('video:'+type,{...q.context,readyState:this.video.readyState,ended:this.video.ended,mediaDuration:Number.isFinite(this.video.duration)?this.video.duration:null,width:this.video.videoWidth,height:this.video.videoHeight});
     });
    }
    log('clip:start',q.context);return start.call(this,index);
   };
   // The game can observe video.ended and load the next source before the queued
   // DOM ended event runs. Preserve real decoded evidence before that source swap.
   const advance=m.advanceSegment;m.advanceSegment=function(){
    log('clip:decoded-complete',{...q.context,ended:this.video.ended,readyState:this.video.readyState,mediaDuration:Number.isFinite(this.video.duration)?this.video.duration:null,width:this.video.videoWidth,height:this.video.videoHeight});
    return advance.call(this);
   };
   const stop=m.stopReplay;m.stopReplay=function(success){if(this.active)log('replay:stop',{success:!!success});return stop.call(this,success);};
   const replay=g.hooks.replay;
   g.hooks.replay=function(active,callback){
    if(active){q.began=performance.now();log('replay:begin');return replay(active,success=>{log('replay:result',{success});callback?.(success);log('replay:result-applied',{success});});}
    return replay(active,callback);
   };
   g.profile.lights=['morning','backrow','outside','desk'];g.profile.progress.endings.secondGrade=1;
   if(!g.profile.achievements.includes('secondGrade'))g.profile.achievements.push('secondGrade');
   if(!g.profile.cosmetics.includes('namelessNotebook'))g.profile.cosmetics.push('namelessNotebook');
   g.profile.progress.chalk=true;g.profile.finalePlayed=false;g.model.save();
   g.startEnding('secondGrade',true);g.finishEnding();
  `);
  report.entryFixture={fourLights:true,secondGradePreviouslyCompleted:true,generatedFilmRewatchBypassed:true,
   privateEntry:'Game.startEnding("secondGrade",true); Game.finishEnding();',fakePlaybackResult:false};
  assert.equal(await read('g.phase'),'finale');assert.equal(await read('g.profile.finalePlayed'),false);
  await wait('m.video?.currentTime>.65&&m.video.readyState>=2');await shot('first-clip');
  report.firstPlay=await read('({phaseTime:g.phaseTime,index:m.segmentIndex,currentTime:m.video.currentTime,readyState:m.video.readyState,finalePlayed:g.profile.finalePlayed})');
  await key('Escape');assert.equal(await read('g.paused'),true);await delay(150);
  const before=await read('({phaseTime:g.phaseTime,finaleTime:g.finaleTime,currentTime:m.video.currentTime,index:m.segmentIndex,played:g.profile.finalePlayed,wall:performance.now()})');
  await shot('paused');await delay(1050);
  const after=await read('({phaseTime:g.phaseTime,finaleTime:g.finaleTime,currentTime:m.video.currentTime,index:m.segmentIndex,played:g.profile.finalePlayed,wall:performance.now()})');
  assert.equal(after.phaseTime,before.phaseTime);assert.equal(after.finaleTime,before.finaleTime);assert.equal(after.index,before.index);
  assert.ok(Math.abs(after.currentTime-before.currentTime)<.04);assert.equal(after.played,false);
  report.pause={before,after,wallDurationMs:after.wall-before.wall};
  await click('继续向前');assert.equal(await read('g.paused'),false);
  report.checks.push('Real Escape pauses both game time and decoded video; mouse Continue resumes them.');
  await wait('m.segmentIndex===1&&m.video?.currentTime>.4');await shot('second-clip');
  await wait('m.segmentIndex===2&&m.video?.currentTime>.4');await shot('third-clip');
  await wait('g.profile.finalePlayed||g.finaleReplayStopped',16000);
  report.playbackResult=await read('({phase:g.phase,phaseTime:g.phaseTime,finaleTime:g.finaleTime,finalePlayed:g.profile.finalePlayed,replayStopped:g.finaleReplayStopped})');
  report.events=await evaluate('window.__personalFinaleQA.events');
  const starts=report.events.filter(e=>e.type==='clip:start'),ended=report.events.filter(e=>e.type==='clip:decoded-complete');
  assert.equal(starts.length,3);assert.equal(ended.length,3,'every actual blob must reach a real decoded end before the source changes');
  assert.equal(new Set(starts.map(e=>e.id)).size,3,'all three independent recorded clips must be replayed');
  assert.deepEqual(ended.map(e=>e.id),starts.map(e=>e.id));
  for(const end of ended){assert.equal(end.ended,true);assert.ok(end.readyState>=2&&end.width>0&&end.height>0);assert.ok(end.videoTime>=end.durationMs/1000-.13);assert.equal(end.finalePlayed,false,'the final award follows actual movie completion');}
  report.decodedCompletion=ended;report.domEndedEvents=report.events.filter(e=>e.type==='video:ended');
  const completed=report.events.find(e=>e.type==='replay:result');assert.ok(completed?.success);assert.ok(completed.phaseTime<10,'all three clips finish within the actual ten-second deadline');
  assert.equal(report.playbackResult.finalePlayed,true);await shot('all-clips-complete');
  report.checks.push('Three real decoded videos reach ended=true in order before phaseTime 10, observed before source swaps; DOM events remain recorded separately. Only the real successful replay callback sets finalePlayed.');
  console.log('PASS full three-clip playback '+JSON.stringify({completedAt:completed.phaseTime,ended:ended.map(e=>({kind:e.kind,videoTime:e.videoTime,phaseTime:e.phaseTime}))}));
  await wait('g.finaleTime>=10.1');await shot('black-gap');
  await wait('g.finaleTime>=11.15');await shot('quote');
  await wait('g.finaleTime>=13.15');await shot('thanks');
  await wait('g.screen==="hall"');await shot('returned-hall');
  report.finished=await read('({screen:g.screen,phaseTime:g.phaseTime,finaleTime:g.finaleTime,finalePlayed:g.profile.finalePlayed,endingCount:g.profile.progress.endings.secondGrade,wallMs:performance.now()-window.__personalFinaleQA.began,savedFinalePlayed:JSON.parse(localStorage.getItem("fleeting-life-s1")).finalePlayed})');
  assert.ok(report.finished.phaseTime>=15&&report.finished.phaseTime<15.1);assert.equal(report.finished.finalePlayed,true);assert.equal(report.finished.savedFinalePlayed,true);assert.equal(report.finished.endingCount,1);
  assert.ok(report.finished.wallMs>15000,'pause adds wall time, it cannot reduce the required game time');
  report.checks.push('The independent private sequence reaches black/quote/thanks, returns at game time 15, and persists its award without increasing the ending count.');
  assert.equal(await evaluate('document.getElementById("error")?.textContent||""'),'');
  assert.deepEqual(errors,[]);assert.deepEqual(consoleErrors,[]);assert.deepEqual(networkErrors,[]);
  report.checks.push('No browser exceptions, error console entries, failed HTTP responses or network errors.');report.passed=true;
 }catch(error){report.failure=error.stack||String(error);await shot('failure').catch(()=>{});
  report.events=await evaluate('window.__personalFinaleQA?.events||[]').catch(()=>[]);
  report.failureState=await read('({screen:g.screen,phase:g.phase,phaseTime:g.phaseTime,paused:g.paused,finalePlayed:g.profile.finalePlayed,active:m.active,index:m.segmentIndex,currentTime:m.video?.currentTime,readyState:m.video?.readyState,ended:m.video?.ended,error:m.video?.error?.message})').catch(()=>null);process.exitCode=1;
 }finally{
  report.keyboard=await evaluate('window.__personalFinaleQA?.keyboard||[]').catch(()=>[]);
  report.errors=errors;report.consoleErrors=consoleErrors;report.networkErrors=networkErrors;
  fs.writeFileSync(path.join(out,host+'-report.json'),JSON.stringify(report,null,2));
  console.log(JSON.stringify({host,passed:report.passed,checks:report.checks,finished:report.finished,failure:report.failure,report:path.join(out,host+'-report.json')},null,2));
  await browser.close();
 }
})().catch(error=>{console.error(error);process.exitCode=1;});
