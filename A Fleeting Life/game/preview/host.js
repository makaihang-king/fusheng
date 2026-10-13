(function(){
'use strict';
const shell=document.getElementById('shell'),stage=document.getElementById('stage');
const canvas=document.getElementById('game'),ctx=canvas.getContext('2d',{alpha:true}),errorBox=document.getElementById('error');
const backdrop=document.getElementById('backdrop'),backdropCtx=backdrop.getContext('2d',{alpha:false});
const art=new Map();
const artLastUsed=new Map();
const artFailures=new Map();
let renderFrame=0;
const artEntries=new Map(FleetingLife.ART_MANIFEST.filter(entry=>entry.path).map(entry=>[entry.key,entry]));
const canonicalArtKeys=new Set([...artEntries.keys()].filter(key=>/^character\.pixel\.[^.]+\.\d+$/.test(key)));
const prefetchedActions=new Set();
function requestArt(key){
 const failure=artFailures.get(key);
 if(art.has(key)&&(!failure||performance.now()<failure.nextAt))return art.get(key);
 const entry=artEntries.get(key);if(!entry)return null;
 const img=new Image();art.set(key,img);artLastUsed.set(key,renderFrame);artFailures.delete(key);
 img.onload=()=>{if(art.get(key)===img)artFailures.delete(key);};
 img.onerror=()=>{if(art.get(key)!==img)return;const attempts=Math.min(6,(failure?.attempts||0)+1);artFailures.set(key,{attempts,nextAt:performance.now()+Math.min(30000,1000*2**(attempts-1))});};
 img.src='../assets/resources/'+entry.path;return img;
}
function prefetchAction(key){
 // 动作首帧出现时一起载入同一链，避免每换一帧才开始下载导致停顿。
 if(!/^character\..+\.\d+$/.test(key))return;
 const prefix=key.slice(0,key.lastIndexOf('.')+1);if(prefetchedActions.has(prefix))return;
 prefetchedActions.add(prefix);
 for(const candidate of artEntries.keys())if(candidate.startsWith(prefix)&&/^\d+$/.test(candidate.slice(prefix.length)))requestArt(candidate);
}
function prefetchSequence(key){
 if(!/^ending\.sequence\..+\.\d+$/.test(key))return;
 const prefix=key.slice(0,key.lastIndexOf('.')+1),frame=Number(key.slice(prefix.length));
 for(let i=frame+1;i<=frame+3;i++)requestArt(prefix+String(i).padStart(2,'0'));
}
for(const key of canonicalArtKeys)requestArt(key);
const artDensity=Number(FleetingLife.ART_PIXEL_DENSITY)||2;
const artPixel=value=>Math.round(value*artDensity)/artDensity;
ctx.imageSmoothingEnabled=false;
const endingVideo=document.createElement('video');
endingVideo.playsInline=true;endingVideo.preload='auto';endingVideo.controls=false;endingVideo.muted=false;
let activeEndingVideoKey='',currentEndingVideoKey='',endingVideoSession=-1;
let endingVideoOpenedAt=0,endingVideoLastAt=0,endingVideoActiveMs=0,endingVideoFurthest=0,endingVideoAdvances=0,endingVideoProven=false;
let endingVideoLoadWaitMs=0,endingVideoLastAdvanceMs=0;
let endingVideoAutoMuted=false;
endingVideo.addEventListener('error',()=>{if(currentEndingVideoKey&&endingVideo.error)endingVideo.dataset.failed='true';});
function releaseEndingVideo(){
 if(!currentEndingVideoKey)return;
 endingVideo.pause();endingVideo.removeAttribute('src');endingVideo.load();
 delete endingVideo.dataset.failed;currentEndingVideoKey='';
 endingVideoSession=-1;endingVideoActiveMs=endingVideoFurthest=endingVideoAdvances=0;endingVideoProven=false;
 endingVideoLoadWaitMs=endingVideoLastAdvanceMs=0;
 endingVideoAutoMuted=false;
}
const painter={
 rect(x,y,w,h,c){ctx.fillStyle=c;ctx.fillRect(Math.round(x),Math.round(y),Math.round(w),Math.round(h));},
 line(x1,y1,x2,y2,c,w=1){ctx.strokeStyle=c;ctx.lineWidth=w;ctx.beginPath();ctx.moveTo(x1,y1);ctx.lineTo(x2,y2);ctx.stroke();},
 circle(x,y,r,c){ctx.fillStyle=c;ctx.beginPath();ctx.arc(x,y,r,0,Math.PI*2);ctx.fill();},
 poly(points,c){if(!points.length)return;ctx.fillStyle=c;ctx.beginPath();ctx.moveTo(...points[0]);points.slice(1).forEach(p=>ctx.lineTo(...p));ctx.closePath();ctx.fill();},
 text(value,x,y,size,c,align='left'){ctx.font=size+'px FusionPixel,monospace';ctx.textBaseline='top';ctx.textAlign=align;ctx.fillStyle=c;ctx.fillText(value,Math.round(x),Math.round(y));},
 image(key,x,y,w,h,opacity=1){const img=requestArt(key);if(!img)return false;prefetchAction(key);prefetchSequence(key);artLastUsed.set(key,renderFrame);if(!img.complete||!img.naturalWidth)return false;const previous=ctx.globalAlpha;ctx.globalAlpha=previous*Math.max(0,Math.min(1,opacity));ctx.drawImage(img,artPixel(x),artPixel(y),artPixel(w),artPixel(h));ctx.globalAlpha=previous;return true;},
 imageRegion(key,sx,sy,sw,sh,x,y,w,h,opacity=1){
  if(![sx,sy,sw,sh,x,y,w,h,opacity].every(Number.isFinite)||sw<=0||sh<=0||w<=0||h<=0)return false;
  const left=Math.max(0,sx),top=Math.max(0,sy),right=Math.min(1,sx+sw),bottom=Math.min(1,sy+sh);if(right<=left||bottom<=top)return false;
  const img=requestArt(key);if(!img)return false;artLastUsed.set(key,renderFrame);if(!img.complete||!img.naturalWidth)return false;
  const previous=ctx.globalAlpha;ctx.globalAlpha=previous*Math.max(0,Math.min(1,opacity));
  ctx.drawImage(img,left*img.naturalWidth,top*img.naturalHeight,(right-left)*img.naturalWidth,(bottom-top)*img.naturalHeight,artPixel(x),artPixel(y),artPixel(w),artPixel(h));ctx.globalAlpha=previous;return true;
 },
 video(key,x,y,w,h,_elapsedSeconds,paused=false,sessionId=0,skin='base',muted=!!game.settings.muted){
  const definition=FleetingLife.ENDING_MEDIA[key];if(!definition)return {visible:false,seconds:0,status:'failed'};
  const media={...definition,...definition.skins?.[skin]};key+=':'+skin;activeEndingVideoKey=key;
  const now=performance.now();
  if(currentEndingVideoKey!==key||endingVideoSession!==sessionId){
   releaseEndingVideo();currentEndingVideoKey=key;endingVideoSession=sessionId;endingVideoOpenedAt=endingVideoLastAt=now;
   endingVideo.muted=muted;endingVideo.src='../assets/resources/'+media.path;endingVideo.load();
  }
  endingVideo.muted=muted||endingVideoAutoMuted;
  const frameMs=Math.min(100,Math.max(0,now-endingVideoLastAt));endingVideoLastAt=now;
  if(endingVideo.dataset.failed==='true')return {visible:false,seconds:endingVideoFurthest,status:'failed'};
  if(paused||hidden)endingVideo.pause();
  else if(endingVideo.paused&&!endingVideo.ended){
   const token=endingVideoSession;
   const attempt=endingVideo.play();if(attempt&&typeof attempt.catch==='function')attempt.catch(()=>{
    if(token!==endingVideoSession)return;
    endingVideoAutoMuted=true;endingVideo.muted=true;endingVideo.play().catch(()=>{if(token===endingVideoSession)endingVideo.dataset.failed='true';});
   });
  }
  const ready=endingVideo.readyState>=HTMLMediaElement.HAVE_CURRENT_DATA&&endingVideo.videoWidth>0;
  if(!ready){
   if(!paused&&!hidden)endingVideoLoadWaitMs+=frameMs;
   if(endingVideoLoadWaitMs>8000){endingVideo.dataset.failed='true';return {visible:false,seconds:0,status:'failed'};}
   return {visible:false,seconds:0,status:'loading'};
  }
  if(!paused&&!hidden&&!endingVideo.paused)endingVideoActiveMs+=frameMs;
  const mediaTime=Math.max(0,Math.min(media.seconds,endingVideo.currentTime));
  if(mediaTime>endingVideoFurthest+.01){endingVideoAdvances++;endingVideoFurthest=mediaTime;endingVideoLastAdvanceMs=endingVideoActiveMs;}
  endingVideoProven=endingVideoFurthest>=media.seconds-.08&&endingVideoAdvances>=30&&endingVideoActiveMs>=media.seconds*900;
  if(endingVideo.ended&&!endingVideoProven){endingVideo.dataset.failed='true';return {visible:false,seconds:0,status:'failed'};}
  if(!paused&&!hidden&&endingVideoActiveMs-endingVideoLastAdvanceMs>6000){endingVideo.dataset.failed='true';return {visible:false,seconds:0,status:'failed'};}
  const smooth=ctx.imageSmoothingEnabled;ctx.imageSmoothingEnabled=true;
  ctx.drawImage(endingVideo,artPixel(x),artPixel(y),artPixel(w),artPixel(h));ctx.imageSmoothingEnabled=smooth;
  return {visible:true,seconds:endingVideoProven?media.seconds:mediaTime,status:endingVideoProven?'ended':'playing'};
 }
 };
function trimArtCache(){
 if(renderFrame%120!==0)return;
 for(const [key,lastUsed] of artLastUsed){if(canonicalArtKeys.has(key)||renderFrame-lastUsed<600)continue;const image=art.get(key);if(image){image.onload=image.onerror=null;image.src='';}art.delete(key);artFailures.delete(key);artLastUsed.delete(key);prefetchedActions.delete(key.slice(0,key.lastIndexOf('.')+1));}
}
 let audio;
 // Fetch before the first gesture; decoding happens only after audio is
 // unlocked. The door is the same authored WAV used by the native build.
 const doorBytes=fetch('../assets/resources/audio/door.wav').then(response=>{if(!response.ok)throw Error('Door WAV HTTP '+response.status);return response.arrayBuffer();});
 doorBytes.catch(()=>{});
 let doorBuffer=null,doorPlayback=null,doorRequest=0;
 function stopDoorSound(){doorRequest++;if(doorPlayback){doorPlayback.stop();doorPlayback=null;}}
 function updateDoorSound(forcePause=false){
  if(!doorPlayback)return;
  if(exited||game.screen!=='play'||game.phase!=='intro'){stopDoorSound();return;}
  doorPlayback.setMuted(!!game.settings.muted);
  if(forcePause||hidden||game.paused)doorPlayback.pause();else doorPlayback.resume();
 }
 function openingDoorSound(){
  stopDoorSound();const token=doorRequest;
  doorBuffer=doorBuffer||doorBytes.then(bytes=>audio.decodeAudioData(bytes.slice(0)));
  void doorBuffer.then(buffer=>{
   if(token!==doorRequest||exited||game.screen!=='play'||game.phase!=='intro'||game.phaseTime>=buffer.duration)return;
   const gain=audio.createGain();gain.gain.value=game.settings.muted?0:.48;gain.connect(audio.destination);
   let source=null,offset=Math.max(0,game.phaseTime),startedAt=0,stopped=false;
   const pause=()=>{if(!source)return;offset=Math.min(buffer.duration,offset+audio.currentTime-startedAt);source.onended=null;try{source.stop();}catch{}source.disconnect();source=null;};
   const stop=()=>{if(stopped)return;pause();stopped=true;gain.disconnect();};
   const resume=()=>{if(stopped||source||offset>=buffer.duration)return;
    source=audio.createBufferSource();source.buffer=buffer;source.connect(gain);startedAt=audio.currentTime;
    source.onended=()=>{offset=buffer.duration;source.disconnect();source=null;stop();};source.start(0,offset);
   };
   doorPlayback={pause,resume,stop,setMuted(value){if(!stopped)gain.gain.setValueAtTime(value?0:.48,audio.currentTime);}};
   updateDoorSound();
  }).catch(error=>{doorBuffer=null;console.warn('Door sound unavailable',error);});
 }
 const memorySoundNames=new Set(['memoryGate','memoryRain','memoryPaper','memoryCorridor','memoryBench','memoryLamp','memoryPhoto']);
 const memoryClips=new Map();
 function memoryClip(name){
  if(memoryClips.has(name))return memoryClips.get(name);
  const request=fetch('../assets/resources/audio/'+name+'.wav')
   .then(response=>{if(!response.ok)throw new Error('WAV '+name+' HTTP '+response.status);return response.arrayBuffer();})
   .then(bytes=>audio.decodeAudioData(bytes));
  memoryClips.set(name,request);
  request.catch(()=>{if(memoryClips.get(name)===request)memoryClips.delete(name);});
  return request;
 }
 function sound(name){
  if(hidden)return;
  try{
   audio=audio||new (window.AudioContext||window.webkitAudioContext)();
   void audio.resume().catch(()=>{});
   if(name==='door'){openingDoorSound();return;}
   if(memoryClips.size===0)for(const cue of memorySoundNames)void memoryClip(cue).catch(()=>{});
   if(memorySoundNames.has(name)){
    const requestedAt=performance.now();
    void memoryClip(name).then(clip=>{
     if(hidden||game?.settings?.muted||performance.now()-requestedAt>800)return;
     const source=audio.createBufferSource(),gain=audio.createGain();
     source.buffer=clip;gain.gain.value=.16;
     source.connect(gain);gain.connect(audio.destination);
     source.onended=()=>{source.disconnect();gain.disconnect();};
     source.start();
    }).catch(error=>console.warn('Memory sound unavailable',name,error));
    return;
   }
   const osc=audio.createOscillator(),gain=audio.createGain();
   const tones={jump:460,land:140,break:180,confirm:660,click:520,collect:880,fall:90,bell:1046};
   const start=audio.currentTime;
   osc.type=name==='bell'?'sine':'triangle';
   osc.frequency.setValueAtTime(tones[name]||320,start);
   osc.frequency.exponentialRampToValueAtTime(Math.max(45,(tones[name]||320)*.65),start+.1);
   gain.gain.setValueAtTime(.045,start);
   gain.gain.exponentialRampToValueAtTime(.001,start+.15);
   osc.connect(gain);gain.connect(audio.destination);
   osc.onended=()=>{osc.disconnect();gain.disconnect();};
   osc.start();osc.stop(start+.16);
  }catch{}
 }
 let musicContext;
 const musicBuffers=new Map();
 const musicRequests=new Set();let musicDisposed=false;
 function getMusicContext(){
  if(musicDisposed)throw new Error('BGM context disposed');
  musicContext=musicContext||new (window.AudioContext||window.webkitAudioContext)();
  return musicContext;
 }
 function createMusicVoice(id,buffer){
  const context=getMusicContext(),gain=context.createGain();gain.gain.value=0;gain.connect(context.destination);
  let source=null,offset=0,startedAt=0,volume=0,stopped=false;
  const stopSource=()=>{if(source){try{source.stop();}catch{}source.disconnect();source=null;}};
  const play=loop=>{if(stopped||source)return;source=context.createBufferSource();source.buffer=buffer;source.loop=loop;source.connect(gain);startedAt=context.currentTime;source.start(0,offset%Math.max(.001,buffer.duration));};
  return {id,setVolume(value){if(stopped)return;volume=Math.max(0,Math.min(1,value));
    if(volume===0){gain.gain.cancelScheduledValues(context.currentTime);gain.gain.setValueAtTime(0,context.currentTime);}
    else gain.gain.setTargetAtTime(volume,context.currentTime,.02);
   },play,
   pause(){if(!source)return;offset=(offset+context.currentTime-startedAt)%Math.max(.001,buffer.duration);stopSource();},
   resume(){if(!stopped)play(true);},
   stop(){stopped=true;stopSource();offset=0;gain.disconnect();},};
 }
 const musicBackend={
  load(id){
   if(musicDisposed)return Promise.reject(new Error('BGM context disposed'));
   const cacheKey=id;
   const cached=musicBuffers.get(cacheKey);if(cached)return cached.then(buffer=>createMusicVoice(id,buffer));
   const abort=new AbortController();musicRequests.add(abort);
   const request=fetch('../assets/resources/audio/bgm/'+id+'.ogg',{signal:abort.signal}).then(response=>{if(!response.ok)throw new Error('BGM '+id+' HTTP '+response.status);return response.arrayBuffer();})
    .then(bytes=>getMusicContext().decodeAudioData(bytes)).finally(()=>musicRequests.delete(abort));
   musicBuffers.set(cacheKey,request);request.catch(()=>{if(musicBuffers.get(cacheKey)===request)musicBuffers.delete(cacheKey);});
   return request.then(buffer=>createMusicVoice(id,buffer));
  },
  unlock(){try{void getMusicContext().resume().catch(()=>{});}catch{}}
 };
 const sceneMusic=new FleetingLife.SceneMusicController(musicBackend);
 class PreviewMoments {
  constructor(source,getGame){
   this.source=source;this.getGame=getGame;this.indexKey='fleeting-life-s1-moments-v2';
   this.ring=[];this.pending=null;this.queue=[];this.encoding=false;this.clock=0;this.lastWall=0;this.lastSample=-Infinity;this.lastCapture=-Infinity;this.lastPriority=0;this.sampling=false;
   this.videos=[];this.legacy=this.readLegacy();this.memories=this.legacy.slice(0,3);this.urls=new Map();this.images=new Map();
   this.active=false;this.suspended=false;this.replayToken=0;this.replayStart=0;this.replayPauseAt=-1;this.segmentIndex=-1;this.segmentStartedAt=-1;this.segmentMediaStart=0;this.videoAttempt=0;this.replayResult=null;this.timeline=[];this.encodeControl=null;
   const formats=['video/webm;codecs=vp8','video/webm;codecs=vp9','video/webm','video/mp4;codecs=avc1.42E01E','video/mp4'];
   this.mime=typeof MediaRecorder==='function'&&typeof MediaRecorder.isTypeSupported==='function'?formats.find(x=>MediaRecorder.isTypeSupported(x))||'':'';
   this.ready=this.load();
  }
  readLegacy(){
   try{const old=JSON.parse(localStorage.getItem('fleeting-life-s1-moments')||'[]');if(!Array.isArray(old))return [];
    return old.slice(0,3).filter(x=>Array.isArray(x.frames)&&x.frames.every(f=>typeof f==='string'&&f.startsWith('data:image/jpeg'))).map((x,i)=>({
     id:'legacy-preview-'+i+'-'+Number(x.time||0),format:'legacy-frames',kind:String(x.kind||'highlight'),priority:Number(x.priority)||1,
     time:Number(x.time)||i,durationMs:Math.min(3000,x.frames.length*167),frames:x.frames
    }));}catch{return [];}
  }
  rank(items){return items.sort((a,b)=>b.priority-a.priority||b.time-a.time).slice(0,3);}
  selectReplayMoments(){
   const selected=[...this.videos,...this.legacy].sort((a,b)=>b.priority-a.priority||b.time-a.time).slice(0,3);
   if(this.videos.length&&!selected.some(x=>x.format!=='legacy-frames')){
    if(selected.length===3)selected.pop();
    selected.push(this.rank([...this.videos])[0]);
   }
   return selected.sort((a,b)=>a.time-b.time);
  }
  refresh(){this.memories=[...this.videos,...this.legacy];}
  openDb(){return new Promise((resolve,reject)=>{const request=indexedDB.open('fleeting-life-video-moments',1);
   request.onupgradeneeded=()=>{if(!request.result.objectStoreNames.contains('clips'))request.result.createObjectStore('clips');};
   request.onsuccess=()=>resolve(request.result);request.onerror=()=>reject(request.error||Error('IndexedDB open failed'));
  });}
  blob(id){return new Promise((resolve,reject)=>{const request=this.db.transaction('clips','readonly').objectStore('clips').get(id);
   request.onsuccess=()=>resolve(request.result instanceof Blob?request.result:null);request.onerror=()=>reject(request.error||Error('Video read failed'));
  });}
  put(id,blob){return new Promise((resolve,reject)=>{const tx=this.db.transaction('clips','readwrite');tx.objectStore('clips').put(blob,id);
   tx.oncomplete=()=>resolve();tx.onerror=()=>reject(tx.error||Error('Video write failed'));tx.onabort=()=>reject(tx.error||Error('Video write aborted'));
  });}
  remove(id){return new Promise((resolve,reject)=>{const tx=this.db.transaction('clips','readwrite');tx.objectStore('clips').delete(id);
   tx.oncomplete=()=>resolve();tx.onerror=()=>reject(tx.error||Error('Video delete failed'));tx.onabort=()=>reject(tx.error||Error('Video delete aborted'));
  });}
  writeIndex(videos){localStorage.setItem(this.indexKey,JSON.stringify({version:2,candidates:videos}));}
  async load(){
   if(typeof indexedDB==='undefined')return;
   let saved={};try{saved=JSON.parse(localStorage.getItem(this.indexKey)||'{}')||{};}catch{}
   try{this.db=await this.openDb();const checked=[];
    for(const x of Array.isArray(saved.candidates)?saved.candidates.slice(0,3):[]){
     if(!x||typeof x.id!=='string'||!/^preview-\d+-[a-z0-9]+$/.test(x.id)||!['webm','mp4'].includes(x.format))continue;
     const blob=await this.blob(x.id);if(!blob||blob.size<100)continue;
     checked.push({id:x.id,format:x.format,kind:String(x.kind||'highlight'),priority:Number(x.priority)||1,time:Number(x.time)||0,
      durationMs:Math.max(100,Math.min(10000,Number(x.durationMs)||3000)),mime:blob.type||x.mime||'video/webm'});
    }
    this.videos=checked;this.refresh();
    if(checked.length!==(Array.isArray(saved.candidates)?saved.candidates.length:0))this.writeIndex(checked);
   }catch(error){console.warn('Moment video storage unavailable',error);this.db=null;this.refresh();}
  }
  pin(frame){frame.pins++;return frame;}
  release(frame){frame.pins--;if(!frame.inRing&&frame.pins===0)frame.image.close();}
  dropOld(){while(this.ring.length&&this.ring[0].t<this.clock-3000){const f=this.ring.shift();f.inRing=false;if(f.pins===0)f.image.close();}}
  capture(kind){
   if(!this.mime||!this.source.captureStream||this.getGame().screen!=='play')return;
   const priority=kind==='hidden'?3:kind==='death'?2:1;
   if(this.pending){if(priority<=this.pending.priority)return;for(const frame of this.pending.frames)this.release(frame);this.pending=null;}
   if(this.clock-this.lastCapture<1100&&priority<=this.lastPriority)return;
   if(this.queue.length>=3){let weakest=-1;for(let i=0;i<this.queue.length;i++)if(this.queue[i].priority<priority&&(weakest<0||this.queue[i].priority<this.queue[weakest].priority))weakest=i;
    if(weakest<0)return;for(const frame of this.queue.splice(weakest,1)[0].frames)this.release(frame);}
   this.lastCapture=this.clock;this.lastPriority=priority;
   this.pending={id:'preview-'+Date.now()+'-'+Math.random().toString(36).slice(2,10),kind,priority,
    time:this.clock,wallTime:Date.now(),frames:this.ring.filter(f=>f.t>=this.clock-2000).map(f=>this.pin(f))};
  }
  sample(now){
   const game=this.getGame();if(!this.lastWall)this.lastWall=now;
   const dt=Math.max(0,Math.min(50,now-this.lastWall));this.lastWall=now;
   if(this.active||this.suspended||game.screen!=='play'||game.paused)return;
   this.clock+=dt;if(!this.mime||!this.source.captureStream||this.sampling||this.clock-this.lastSample<1000/15)return;
   const at=this.clock;this.lastSample=at;this.sampling=true;
   void createImageBitmap(this.source).then(image=>{
    const frame={t:at,image,pins:0,inRing:true};this.ring.push(frame);this.dropOld();
    const p=this.pending;if(p&&at>p.time&&at<=p.time+1100)p.frames.push(this.pin(frame));
    if(p&&at>=p.time+1000){this.pending=null;if(p.frames.length>=2){this.queue.push(p);void this.drain();}else for(const f of p.frames)this.release(f);}
   }).catch(error=>{console.warn('Moment frame capture failed',error);}).finally(()=>{this.sampling=false;});
  }
  async drain(){
   if(this.encoding)return;this.encoding=true;
   try{while(this.queue.length){const raw=this.queue.shift();try{
     await this.ready;if(!this.db)continue;
     if(!this.rank([...this.videos,{format:'webm',priority:raw.priority,time:raw.wallTime,id:raw.id}]).some(x=>x.id===raw.id))continue;
     const encoded=await this.encode(raw.frames);await this.commit(raw,encoded);
    }catch(error){console.warn('Moment video encoding failed',error);}finally{for(const f of raw.frames)this.release(f);}}
   }finally{this.encoding=false;}
  }
  encode(frames){return new Promise((resolve,reject)=>{
   const out=document.createElement('canvas');out.width=480;out.height=270;const context=out.getContext('2d',{alpha:false});
   if(!context){reject(Error('Canvas context unavailable'));return;}
   let stream=out.captureStream(0),track=stream.getVideoTracks()[0],manual=typeof track?.requestFrame==='function';
   if(!manual){stream.getTracks().forEach(x=>x.stop());stream=out.captureStream(15);track=stream.getVideoTracks()[0];}
   let recorder;try{recorder=new MediaRecorder(stream,{mimeType:this.mime,videoBitsPerSecond:850000});}catch(error){stream.getTracks().forEach(x=>x.stop());reject(error);return;}
   const durationMs=Math.max(250,Math.min(3100,frames[frames.length-1].t-frames[0].t+1000/15));
   const chunks=[];let finished=false,frameIndex=0,tick=0;
   const control={recorder,started:0,pauseAt:0,timer:0,pump:null};this.encodeControl=control;
   const cleanup=()=>{clearTimeout(control.timer);stream.getTracks().forEach(x=>x.stop());if(this.encodeControl===control)this.encodeControl=null;};
   const fail=error=>{if(finished)return;finished=true;try{if(recorder.state!=='inactive')recorder.stop();}catch{}cleanup();reject(error);};
   const drawAt=elapsed=>{while(frameIndex+1<frames.length&&frames[frameIndex+1].t-frames[0].t<=elapsed)frameIndex++;
    context.drawImage(frames[frameIndex].image,0,0,480,270);if(manual)track.requestFrame();};
   control.pump=()=>{
    if(finished||control.pauseAt)return;
    const elapsed=performance.now()-control.started;
    if(tick*1000/15<=elapsed+4&&tick*1000/15<=durationMs){drawAt(tick*1000/15);tick++;}
    if(elapsed>=durationMs+50){try{recorder.stop();}catch(error){fail(error);}return;}
    control.timer=setTimeout(control.pump,Math.max(4,Math.min(24,control.started+tick*1000/15-performance.now())));
   };
   recorder.ondataavailable=e=>{if(e.data?.size)chunks.push(e.data);};
   recorder.onerror=e=>fail(e.error||Error('MediaRecorder error'));
   recorder.onstop=()=>{if(finished)return;finished=true;cleanup();const blob=new Blob(chunks,{type:recorder.mimeType||this.mime});
    if(blob.size<100){reject(Error('Empty recorded video'));return;}resolve({blob,durationMs,mime:blob.type});};
   recorder.onstart=()=>{};
   try{recorder.start();control.started=performance.now();if(this.suspended){control.pauseAt=control.started;recorder.pause();}else control.pump();}catch(error){fail(error);}
  });}
  async commit(raw,encoded){
   const format=encoded.mime.includes('mp4')?'mp4':'webm';const candidate={id:raw.id,format,kind:raw.kind,priority:raw.priority,
    time:raw.wallTime,durationMs:encoded.durationMs,mime:encoded.mime};
   const keep=this.rank([...this.videos,candidate]);
   if(!keep.some(x=>x.id===candidate.id))return;
   await this.put(candidate.id,encoded.blob);
   const nextVideos=keep;
   try{this.writeIndex(nextVideos);}catch(error){await this.remove(candidate.id).catch(()=>{});throw error;}
   const evicted=this.videos.filter(x=>!nextVideos.some(n=>n.id===x.id));this.videos=nextVideos;this.refresh();
   for(const old of evicted){const url=this.urls.get(old.id);if(url)URL.revokeObjectURL(url);this.urls.delete(old.id);await this.remove(old.id).catch(()=>{});}
  }
  overlay(){
   if(this.layer)return;
   const layer=document.createElement('div');layer.style.cssText='position:absolute;inset:0;z-index:5;pointer-events:none;overflow:hidden;display:none;background:#111923';
   const video=document.createElement('video');video.muted=true;video.playsInline=true;video.preload='auto';video.style.cssText='display:none;width:100%;height:100%;object-fit:fill;image-rendering:auto';
   const old=document.createElement('canvas');old.width=480;old.height=270;old.style.cssText='display:none;width:100%;height:100%;image-rendering:pixelated';
   const tint=document.createElement('div');tint.style.cssText='position:absolute;inset:0;background:repeating-linear-gradient(0deg,transparent 0px,transparent 3px,rgba(8,16,24,.11) 4px),rgba(11,17,23,.19)';
   const title=document.createElement('div');title.textContent='那时，你这样走过。';title.style.cssText='position:absolute;left:0;right:0;bottom:7%;text-align:center;color:#ebdfc8;font:12px FusionPixel,monospace;text-shadow:1px 1px #111923';
   layer.append(video,old,tint,title);document.getElementById('stage').appendChild(layer);this.layer=layer;this.video=video;this.oldCanvas=old;
  }
  replay(active,onResult){
   if(!active){this.stopReplay(false);return;}
   if(this.active)this.stopReplay(false);
   this.active=true;this.replayResult=onResult||null;this.replayStart=performance.now();
   this.replayPauseAt=this.suspended||this.getGame().paused?this.replayStart:-1;
   this.timeline=[];this.segmentIndex=-1;
   const token=++this.replayToken;
   void (async()=>{
    await this.ready;if(!this.active||token!==this.replayToken)return;
    const selected=this.selectReplayMoments();
    if(!selected.length){this.stopReplay(false);return;}
    this.overlay();
    for(const m of selected)if(m.format!=='legacy-frames'&&!this.urls.has(m.id)){
     const blob=this.db?await this.blob(m.id).catch(()=>null):null;
     if(!this.active||token!==this.replayToken)return;
     if(!blob){this.stopReplay(false);return;}
     this.urls.set(m.id,URL.createObjectURL(blob));
    }
    if(!this.active||token!==this.replayToken)return;
    this.timeline=[];let start=0;
    for(let i=0;i<3;i++){
     const m=selected[i%selected.length],length=Math.min(3000,Math.max(250,m.durationMs||3000));
     this.timeline.push({m,start,end:start+length});start+=length;
    }
    this.layer.style.display='block';this.drawReplay(performance.now());
   })().catch(error=>{
    if(!this.active||token!==this.replayToken)return;
    console.warn('Moment playback failed',error);this.stopReplay(false);
   });
  }
  stopReplay(success=false){
   if(!this.active)return;
   const playedVideo=this.timeline.some(part=>part.m.format!=='legacy-frames');
   const onResult=this.replayResult;this.replayResult=null;
   this.active=false;this.replayToken++;this.videoAttempt++;this.segmentIndex=-1;this.segmentStartedAt=-1;this.replayPauseAt=-1;this.timeline=[];
   if(this.video){this.video.pause();this.video.style.display='none';this.video.removeAttribute('src');this.video.load();}
   if(this.layer)this.layer.style.display='none';
   try{onResult?.(success&&playedVideo);}catch(error){console.warn('Moment playback result failed',error);}
  }
  playVideo(index){
   const token=this.replayToken,attempt=++this.videoAttempt;
   try{void this.video.play().catch(error=>{
    if(!this.active||token!==this.replayToken||index!==this.segmentIndex||attempt!==this.videoAttempt)return;
    console.warn('Moment video play failed',error);this.stopReplay(false);
   });}catch(error){
    if(this.active&&token===this.replayToken&&index===this.segmentIndex){console.warn('Moment video play failed',error);this.stopReplay(false);}
   }
  }
  startSegment(index){
   this.segmentIndex=index;this.segmentStartedAt=-1;this.segmentMediaStart=0;
   this.videoAttempt++;this.video.pause();
   const m=this.timeline[index].m;
   if(m.format==='legacy-frames'){this.video.style.display='none';this.oldCanvas.style.display='block';return;}
   const url=this.urls.get(m.id);if(!url){this.stopReplay(false);return;}
   this.oldCanvas.style.display='none';this.video.style.display='block';
   this.video.src=url;this.video.load();this.segmentMediaStart=this.video.currentTime;
   this.playVideo(index);
  }
  advanceSegment(){
   if(this.segmentIndex+1===this.timeline.length)this.stopReplay(true);
   else this.startSegment(this.segmentIndex+1);
  }
  drawReplay(now){
   if(!this.active)return;
   if(this.suspended||this.getGame().paused){
    if(this.replayPauseAt<0)this.replayPauseAt=now;
    this.videoAttempt++;this.video?.pause();if(this.layer)this.layer.style.display='none';return;
   }
   if(this.replayPauseAt>=0){
    const pauseMs=now-this.replayPauseAt;this.replayStart+=pauseMs;
    if(this.segmentStartedAt>=0)this.segmentStartedAt+=pauseMs;
    this.replayPauseAt=-1;
    if(this.layer)this.layer.style.display='block';
    if(this.video&&this.segmentIndex>=0&&this.video.style.display!=='none')this.playVideo(this.segmentIndex);
   }
   if(now-this.replayStart>=20000){this.stopReplay(false);return;}
   if(!this.timeline.length||!this.layer||!this.video||!this.oldCanvas)return;
   if(this.segmentIndex<0)this.startSegment(0);
   if(!this.active)return;
   const part=this.timeline[this.segmentIndex],m=part.m,lengthMs=part.end-part.start;
   if(m.format!=='legacy-frames'){
    if(this.video.error){this.stopReplay(false);return;}
    if(this.video.readyState<2||this.video.videoWidth<=0)return;
    const advanced=this.video.currentTime-this.segmentMediaStart;
    if(!Number.isFinite(advanced)||advanced<-.1){this.stopReplay(false);return;}
    if(this.segmentStartedAt<0){this.segmentStartedAt=now;return;}
    const duration=m.durationMs/1000;
    const minimum=Math.max(.15,duration-Math.min(.12,Math.max(.03,duration*.04)));
    if(this.video.ended&&advanced>=minimum)this.advanceSegment();
    return;
   }
   if(!m.frames.length){this.stopReplay(false);return;}
   const local=this.segmentStartedAt<0?0:now-this.segmentStartedAt;
   const frame=Math.min(m.frames.length-1,Math.floor(local/lengthMs*m.frames.length));
   const src=m.frames[frame];let image=this.images.get(src);
   if(!image){image=new Image();image.src=src;this.images.set(src,image);}
   if(!image.complete||!image.naturalWidth)return;
   try{this.oldCanvas.getContext('2d').drawImage(image,0,0,480,270);}
   catch(error){console.warn('Moment frame playback failed',error);this.stopReplay(false);return;}
   if(this.segmentStartedAt<0)this.segmentStartedAt=now;
   if(now-this.segmentStartedAt>=lengthMs)this.advanceSegment();
  }
  pause(){this.suspended=true;const now=performance.now();if(this.active&&this.replayPauseAt<0){this.replayPauseAt=now;this.videoAttempt++;this.video?.pause();}
   if(this.active&&this.layer)this.layer.style.display='none';
   const c=this.encodeControl;if(c&&!c.pauseAt){c.pauseAt=now;clearTimeout(c.timer);if(c.recorder.state==='recording')c.recorder.pause();}}
  resume(){const now=performance.now();this.suspended=false;this.lastWall=now;
   const c=this.encodeControl;if(c&&c.pauseAt){if(c.started)c.started+=now-c.pauseAt;c.pauseAt=0;if(c.recorder.state==='paused')c.recorder.resume();if(c.started)c.pump();}}
 }
 const moments=new PreviewMoments(canvas,()=>game);
 function capture(kind){moments.capture(kind);}
 function replay(active,onResult){moments.replay(active,onResult);}
 function sample(now){moments.sample(now);}
 function drawReplay(now){moments.drawReplay(now);}
 let hidden=false,exited=false,last=performance.now();
function leaveGame(){
 if(exited)return;
 exited=true;appHide();
 stopDoorSound();sceneMusic.destroy();musicDisposed=true;for(const request of musicRequests)request.abort();musicRequests.clear();musicBuffers.clear();if(musicContext)void musicContext.close().catch(()=>{});if(audio)void audio.close().catch(()=>{});
 if(document.fullscreenElement)try{void Promise.resolve(document.exitFullscreen?.()).catch(()=>{});}catch{}
 const screen=document.createElement('main');screen.id='game-exit-screen';screen.setAttribute('aria-label','浮生已退出');
 screen.style.cssText='position:fixed;inset:0;z-index:2147483647;display:grid;place-items:center;padding:24px;background:#172825;color:#efe8d2;text-align:center;font-family:FusionPixel,monospace';
 const card=document.createElement('div');card.style.cssText='max-width:30rem;padding:32px 24px;border:1px solid #60796a;background:#22382f;box-shadow:0 16px 50px #101d19';
 const title=document.createElement('h1');title.textContent='本次游戏已退出';title.style.cssText='margin:0 0 16px;font-size:clamp(20px,4vw,30px);font-weight:normal';
 const message=document.createElement('p');message.textContent='可以关闭这个页面，也可以重新进入。';message.style.cssText='margin:0 0 24px;font-size:clamp(13px,2.5vw,16px);line-height:1.7';
 const restart=document.createElement('button');restart.type='button';restart.textContent='重新进入';restart.style.cssText='min-width:120px;min-height:44px;padding:9px 20px;border:1px solid #d6c99e;background:#d8cfad;color:#23392f;cursor:pointer;font:inherit';
 restart.addEventListener('click',()=>location.reload());card.append(title,message,restart);screen.appendChild(card);document.body.appendChild(screen);
 shell.style.display='none';
}
let game;try{game=new FleetingLife.Game({load:()=>localStorage.getItem('fleeting-life-s1'),save:value=>localStorage.setItem('fleeting-life-s1',value)},{sound,capture,replay,exit:leaveGame});}catch(e){fail(e);return;}
const marginColors={hall:'#344941',dawn:'#a9b4a1',rain:'#739293',noon:'#c4ab74',gray:'#91a69b',dusk:'#9e7d74',night:'#1a303f',graduate:'#3b6568',dream:'#655679',heaven:'#d4c18d',hell:'#281e26'};
let lastTheme='';function theme(){const key=game.screen==='hall'||game.phase==='corridorTransition'?'hall':game.theme;if(key===lastTheme)return;lastTheme=key;document.body.style.backgroundColor=marginColors[key]||marginColors.dawn;}
const backdropPalettes={
 dawn:['#ecebd9','#d2d9ba','#a9b4a1','#657d68','#eee0b8'],
 rain:['#aebfc4','#94abad','#739293','#476d6c','#cfddd5'],
 noon:['#f0dfac','#e2c68b','#c4ab74','#817856','#f4e8c8'],
 gray:['#cbd0c7','#aebcaf','#91a69b','#597970','#e2dbb8'],
 dusk:['#e6c49e','#c59b81','#9e7d74','#635c5e','#f6d698'],
 night:['#22394b','#344d60','#3f6070','#1a303f','#e8d59e'],
 graduate:['#778c9c','#7d9a98','#658981','#3b6568','#efe2b7'],
 dream:['#8b7aa8','#b39ec8','#d6b9d5','#655679','#f4e0b8'],
 heaven:['#f1ecda','#e6dab7','#d4c18d','#a68a4f','#fff8db'],
 hell:['#35282c','#533336','#743c3b','#281e26','#d48b5a']
};
let backdropBounds={left:0,top:0,right:480,bottom:270};
function bRect(x,y,w,h,color){if(w<=0||h<=0)return;backdropCtx.fillStyle=color;backdropCtx.fillRect(x,y,w,h);}
function bLine(x1,y1,x2,y2,color,width=1){backdropCtx.strokeStyle=color;backdropCtx.lineWidth=width;backdropCtx.beginPath();backdropCtx.moveTo(x1,y1);backdropCtx.lineTo(x2,y2);backdropCtx.stroke();}
function bPoly(points,color){backdropCtx.fillStyle=color;backdropCtx.beginPath();backdropCtx.moveTo(...points[0]);for(let i=1;i<points.length;i++)backdropCtx.lineTo(...points[i]);backdropCtx.closePath();backdropCtx.fill();}
function bCircle(x,y,r,color){backdropCtx.fillStyle=color;backdropCtx.beginPath();backdropCtx.arc(x,y,r,0,Math.PI*2);backdropCtx.fill();}
function tiled(base,gap,left,right,draw){const first=Math.floor((left-base)/gap)-1,last=Math.ceil((right-base)/gap)+1;for(let i=first;i<=last;i++)draw(base+i*gap,i);}
function mod(n,m){return (n%m+m)%m;}
function drawEdgeRain(b){
 if(b.left>=0&&b.top>=0&&b.right<=480&&b.bottom<=270)return;
 backdropCtx.save();backdropCtx.beginPath();backdropCtx.rect(b.left,b.top,b.right-b.left,b.bottom-b.top);backdropCtx.rect(0,0,480,270);backdropCtx.clip('evenodd');
 FleetingLife.drawRainWeather({line:bLine,circle:bCircle},game.clock,game.settings.reducedMotion,b);
 backdropCtx.restore();
}
function hallBackdrop(b){
 const ceiling=x=>50-x*18/480,floor=x=>218-x*17/480;
 bRect(b.left,b.top,b.right-b.left,b.bottom-b.top,'#e9e9dd');
 bPoly([[b.left,ceiling(b.left)],[b.right,ceiling(b.right)],[b.right,floor(b.right)],[b.left,floor(b.left)]],'#dce2d5');
 bPoly([[b.left,floor(b.left)],[b.right,floor(b.right)],[b.right,b.bottom],[b.left,b.bottom]],'#c9d1c2');
 for(let i=-16;i<24;i++){const near=i*76-70,far=240+(i-4)*35;bLine(far,203,far+(b.bottom-203)*(near-far)/67,b.bottom,'#bdc8b9');}
 bLine(b.left,floor(b.left),b.right,floor(b.right),'#adbcac');
 for(let y=270;y<b.bottom+30;y+=37)bLine(b.left,y,b.right,y-5,'rgba(173,188,172,0.30)');
 for(let y=Math.floor(b.top/64)*64;y<0;y+=64){bRect(b.left,y+25,b.right-b.left,1,'rgba(138,159,139,0.12)');tiled(-42,82,b.left,b.right,x=>bRect(x,y+16,3,2,'rgba(110,137,115,0.16)'));}
 const alcove=x=>{bRect(x,105,46,101,'#b9c8b8');bRect(x+3,109,40,94,'#e0e7d9');bRect(x+8,119,30,67,'#d2dfd1');bRect(x+21,119,2,68,'#acbdad');bRect(x+7,190,32,2,'#afc0ae');};
 for(let x=-65;x>b.left-55;x-=83)alcove(x);
 for(let x=499;x<b.right+55;x+=83)alcove(x);
 for(const x of [-41,520]){bCircle(x,96,10,'rgba(237,218,162,0.27)');bRect(x-4,92,8,2,'#40574c');bRect(x-3,94,6,5,'#dfd3ab');bRect(x-4,99,8,2,'#40574c');}
 for(let x=Math.floor(b.left/41)*41;x<b.right;x+=41)for(let y=71;y<202;y+=57){const n=mod(x*13+y*7,31);if(n<15)bRect(x+mod(n,11),y+mod(n,8),1,2,'rgba(93,118,93,0.11)');}
 for(let y=290;y<b.bottom+24;y+=28)tiled(-26+mod(y,23),53,b.left,b.right,x=>bRect(x,y,9+mod(x,9),1,'rgba(245,248,231,0.12)'));
}
function playBackdrop(b){
 const pal=backdropPalettes[game.theme]||backdropPalettes.dawn;
 const visualTheme=game.branch||game.theme;
 const scroll=game.settings.reducedMotion?0:game.phase==='reverse'?-game.phaseTime*80:(game.phase==='reward'?game.rewardClock():(game.time||game.phaseTime))*72;
 const indoor=['gray','dusk','night'].includes(game.theme)||(game.phase==='choice'||game.phase==='seat')&&game.choice>=2||game.phase==='piano';
 bRect(b.left,b.top,b.right-b.left,b.bottom-b.top,pal[0]);
 if(game.theme==='dream'||game.theme==='heaven'){
  bCircle(383,60,35,'rgba(255,245,211,0.32)');
  tiled(-90-scroll*.12,93,b.left-60,b.right+60,(x,i)=>{const y=60+mod(i,3)*40;bRect(x,y,50,13,pal[1]);bRect(x+9,y-8,27,10,pal[1]);});
  if(game.theme==='dream'){
   tiled(-38-scroll*.06,104,b.left-55,b.right+55,(x,i)=>{const h=56+mod(i,3)*17;bRect(x,157-h,44,h,'rgba(92,82,122,0.38)');bRect(x+5,163-h,34,h-8,'rgba(190,169,203,0.17)');bRect(x+16,166-h,12,14,'rgba(251,238,205,0.42)');});
   tiled(-60-scroll*.18,151,b.left-55,b.right+55,(x,i)=>{const y=77+mod(i,2)*45;bRect(x,y,53,3,'rgba(249,230,242,0.22)');bRect(x+9,y-14,3,31,'rgba(249,230,242,0.22)');bRect(x+43,y-10,3,25,'rgba(249,230,242,0.22)');});
  }else tiled(-28-scroll*.37,102,b.left-55,b.right+55,x=>{bPoly([[x,216],[x+23,123],[x+48,216]],'rgba(255,251,224,0.45)');bCircle(x+24,128,7,'rgba(255,255,238,0.42)');});
 }else if(game.theme==='hell'){
  tiled(-50-scroll*.4,55,b.left-55,b.right+55,(x,i)=>bPoly([[x,216],[x+20,100+mod(i,3)*23],[x+46,216]],pal[1]));
  tiled(-30-scroll*.7,85,b.left-55,b.right+55,(x,i)=>{bPoly([[x,216],[x+18,140+mod(i,3)*12],[x+42,216]],'#64404b');bLine(x+8,188,x+35,170,'#aa5b47');});
 }else if(indoor){
  bRect(b.left,49,b.right-b.left,148,pal[1]);bRect(b.left,191,b.right-b.left,25,pal[2]);
  tiled(-96-scroll*.25,96,b.left-75,b.right+75,x=>{bRect(x,66,67,83,pal[3]);bRect(x+4,70,59,74,game.theme==='night'?'#243e54':pal[4]);bRect(x+32,69,3,76,pal[2]);bRect(x+2,105,64,3,pal[2]);bRect(x-3,147,73,5,pal[2]);if(game.theme!=='night')bPoly([[x+4,152],[x+65,152],[x+125,216],[x+53,216]],'rgba(252,235,179,0.12)');});
  if(visualTheme==='night')tiled(-39-scroll*.28,94,b.left-55,b.right+55,x=>bCircle(x+35,126,5,'rgba(248,216,148,0.22)'));
 }else{
  bCircle(387,51,23,game.theme==='rain'?'#cfdbd1':pal[4]);
  tiled(-85-scroll*.09,85,b.left-80,b.right+80,(x,i)=>{const h=48+mod(i,3)*19;bRect(x,163-h,69,h,pal[1]);bPoly([[x-4,163-h],[x+34,147-h],[x+73,163-h]],pal[2]);for(let j=0;j<3;j++)bRect(x+10+j*18,177-h,9,11,pal[4]);});
  tiled(-100-scroll*.24,126,b.left-70,b.right+70,x=>{bRect(x+18,93,7,113,pal[3]);bRect(x-4,71,50,46,pal[2]);bRect(x+4,57,36,64,pal[2]);bRect(x-12,84,65,27,pal[2]);bRect(x+7,64,24,11,pal[1]);});
  bRect(b.left,177,b.right-b.left,29,pal[2]);tiled(-scroll*.4,23,b.left,b.right,x=>bRect(x,179,2,28,pal[3]));
  if(visualTheme==='rain')tiled(-scroll*.37,86,b.left-70,b.right+70,x=>{bRect(x,117,68,82,'#8aa6a1');bRect(x-3,114,74,5,'#526f70');bRect(x+13,136,35,40,'#c2d2c9');});
  if(visualTheme==='graduate')tiled(-scroll*.35,136,b.left-100,b.right+100,x=>{bRect(x,106,94,110,'#628179');bPoly([[x,106],[x+47,75],[x+94,106]],'#45695f');});
  if(visualTheme==='alley')tiled(-scroll*.41,91,b.left-80,b.right+80,x=>{bRect(x,56,78,160,'#77909a');bRect(x+5,77,66,56,'#a6b7b5');bRect(x+12,84,29,43,'#536d75');});
  if(visualTheme==='playground')tiled(-scroll*.24,141,b.left-100,b.right+100,x=>{bRect(x,103,101,113,'#8c9f8e');bRect(x+6,111,89,90,'#ced1b8');bRect(x+20,143,13,20,'#82988a');});
 }
 bRect(b.left,216,b.right-b.left,b.bottom-216,pal[3]);bRect(b.left,216,b.right-b.left,3,pal[4]);bRect(b.left,221,b.right-b.left,2,pal[2]);
 for(let y=234;y<b.bottom+16;y+=28)tiled(-scroll*.5+mod(y,19),37,b.left,b.right,(x,i)=>bRect(x,y+mod(i,3)*3,10+mod(i,4)*3,1,'rgba(255,255,230,0.10)'));
 if(b.top<0){for(let y=Math.floor(b.top/64)*64;y<0;y+=64)tiled(-scroll*.03+mod(y,43),91,b.left,b.right,(x,i)=>{bRect(x,y+22+mod(i,4)*5,18,3,'rgba(255,249,222,0.16)');bRect(x+5,y+18+mod(i,4)*5,9,4,'rgba(255,249,222,0.12)');});}
 if(game.theme==='rain')drawEdgeRain(b);
}
function finaleBackdrop(b){
 bRect(b.left,b.top,b.right-b.left,b.bottom-b.top,'#172825');
 for(const x of [-57,506]){bRect(x,63,30,153,'#1c342e');bRect(x+4,68,22,144,'#254339');bRect(x+7,98,16,4,'#597660');bRect(x+9,129,12,2,'#a89c69');bRect(x+10,154,10,17,'#385c49');}
 for(let x=Math.floor(b.left/17)*17;x<b.right;x+=17)for(let y=Math.floor(b.top/43)*43;y<b.bottom;y+=43){if(x>-7&&x<487&&y>-7&&y<277)continue;const seed=mod(x*11+y*19,37);if(seed<5)bRect(x+mod(seed,4),y+mod(seed*3,11),seed===0?2:1,seed===0?2:1,seed===0?'#ab956c':'#466555');}
 for(let y=276;y<b.bottom;y+=32)bLine(b.left,y,b.right,y,'rgba(99,130,105,0.14)');
}
function drawBackdrop(){
 if(!backdropCtx||backdrop.style.display==='none')return;
 const b=backdropBounds;
 // Clear in backing pixels first: centered odd sizes can have half-pixel bounds.
 backdropCtx.setTransform(1,0,0,1,0,0);
 backdropCtx.fillStyle=game.screen==='hall'||game.phase==='corridorTransition'?'#e9e9dd':(backdropPalettes[game.theme]||backdropPalettes.dawn)[0];
 backdropCtx.fillRect(0,0,backdrop.width,backdrop.height);
 backdropCtx.setTransform(1,0,0,1,-b.left,-b.top);backdropCtx.imageSmoothingEnabled=false;
 if(game.screen==='play'&&game.phase==='finale')finaleBackdrop(b);
 else if(game.screen==='hall'||game.phase==='corridorTransition')hallBackdrop(b);
 else playBackdrop(b);
 FleetingLife.drawSceneBackdrop(game,{
  image(key){const img=requestArt(key);if(!img)return false;artLastUsed.set(key,renderFrame);return img.complete&&img.naturalWidth>0;},
  imageRegion(key,sx,sy,sw,sh,x,y,w,h,opacity=1){const img=requestArt(key);if(!img?.complete||!img.naturalWidth)return false;artLastUsed.set(key,renderFrame);const old=backdropCtx.globalAlpha;backdropCtx.globalAlpha=old*opacity;backdropCtx.drawImage(img,sx*img.naturalWidth,sy*img.naturalHeight,sw*img.naturalWidth,sh*img.naturalHeight,x,y,w,h);backdropCtx.globalAlpha=old;return true;}
 },b);
 if(game.panel){bRect(b.left,b.top,b.right-b.left,b.bottom-b.top,'rgba(29,46,40,0.45)');
  for(const x of [-45,500]){bRect(x,44,22,30,'rgba(238,234,222,0.55)');bRect(x+4,51,14,1,'#9daea0');bRect(x+4,57,11,1,'#9daea0');bRect(x+4,63,13,1,'#9daea0');}}
 if(game.paused)bRect(b.left,b.top,b.right-b.left,b.bottom-b.top,'rgba(23,40,34,0.65)');
 // The four-pixel seam copies the live stage edge, including panels and pauses.
 const sourceScale=canvas.width/480;
 if(b.left<0)backdropCtx.drawImage(canvas,0,0,sourceScale,canvas.height,-4,0,4,270);
 if(b.right>480)backdropCtx.drawImage(canvas,canvas.width-sourceScale,0,sourceScale,canvas.height,480,0,4,270);
 if(b.top<0)backdropCtx.drawImage(canvas,0,0,canvas.width,sourceScale,0,-4,480,4);
 if(b.bottom>270)backdropCtx.drawImage(canvas,0,canvas.height-sourceScale,canvas.width,sourceScale,0,270,480,4);
}
function resize(){
 const width=Math.max(1,shell.clientWidth),height=Math.max(1,shell.clientHeight);
 const fit=Math.min(width/480,height/270),scale=fit<artDensity?fit:Math.floor(fit/artDensity)*artDensity;
 const stageWidth=480*scale,stageHeight=270*scale;
 stage.style.width=stageWidth+'px';stage.style.height=stageHeight+'px';
 if(canvas.width!==480*artDensity||canvas.height!==270*artDensity){canvas.width=480*artDensity;canvas.height=270*artDensity;ctx.setTransform(artDensity,0,0,artDensity,0,0);ctx.imageSmoothingEnabled=false;}
 if(backdropCtx){backdrop.width=Math.max(1,Math.ceil(width/scale));backdrop.height=Math.max(1,Math.ceil(height/scale));
  backdropBounds={left:(480-backdrop.width)/2,top:(270-backdrop.height)/2,right:(480+backdrop.width)/2,bottom:(270+backdrop.height)/2};
  backdrop.style.display=width-stageWidth<.5&&height-stageHeight<.5?'none':'block';}
}
addEventListener('resize',resize);window.visualViewport?.addEventListener('resize',resize);resize();theme();
function point(e){const r=canvas.getBoundingClientRect();return [(e.clientX-r.left)*480/r.width,(e.clientY-r.top)*270/r.height];}
let pointer=null;canvas.addEventListener('pointerdown',e=>{if(exited||pointer!==null||e.button!==0)return;pointer=e.pointerId;canvas.setPointerCapture(pointer);canvas.focus({preventScroll:true});sceneMusic.unlock();appShow();game.pointerDown(...point(e));e.preventDefault();});
canvas.addEventListener('pointermove',e=>{if(pointer===e.pointerId||pointer===null)game.pointerMove(...point(e));});
function releasePointer(){const id=pointer;pointer=null;if(id!==null&&canvas.hasPointerCapture(id))canvas.releasePointerCapture(id);}
function up(e){if(pointer!==e.pointerId)return;releasePointer();game.pointerUp(...point(e));e.preventDefault();}
function cancel(e){if(pointer!==e.pointerId)return;releasePointer();game.pointerCancel();e.preventDefault();}
canvas.addEventListener('pointerup',up);canvas.addEventListener('pointercancel',cancel);canvas.addEventListener('lostpointercapture',cancel);canvas.addEventListener('contextmenu',e=>e.preventDefault());
addEventListener('keydown',e=>{if(exited)return;if([' ','ArrowUp','ArrowDown','ArrowLeft','ArrowRight','Tab'].includes(e.key))e.preventDefault();if(!hidden&&!e.repeat){sceneMusic.unlock();game.keyDown(e.key);}});addEventListener('keyup',e=>{if(!exited)game.keyUp(e.key);});
 function appHide(){if(hidden)return;hidden=true;moments.pause();endingVideo.pause();releasePointer();updateDoorSound(true);sceneMusic.suspend(performance.now());if(musicContext)void musicContext.suspend().catch(()=>{});game.appHide();if(audio)void audio.suspend().catch(()=>{});}
 function appShow(){if(exited||document.hidden)return;const wasHidden=hidden;hidden=false;last=performance.now();if(wasHidden){sceneMusic.resume(performance.now());if(musicContext)void musicContext.resume().catch(()=>{});if(audio)void audio.resume().catch(()=>{});}moments.resume();game.appShow();updateDoorSound();}
addEventListener('blur',appHide);addEventListener('focus',appShow);addEventListener('pagehide',appHide);addEventListener('pageshow',appShow);document.addEventListener('visibilitychange',()=>document.hidden?appHide():appShow());
function frame(now){try{const dt=Math.min((now-last)/1000,.05);last=now;if(!hidden&&!exited){game.update(dt);updateDoorSound();sceneMusic.update(game,now);theme();renderFrame++;activeEndingVideoKey='';game.render(painter);if(!activeEndingVideoKey)releaseEndingVideo();trimArtCache();sample(now);drawReplay(now);drawBackdrop();}requestAnimationFrame(frame);}catch(e){fail(e);}}function fail(e){console.error(e);errorBox.style.display='block';errorBox.textContent='运行出错，请将此信息提供给开发者：\n'+(e.stack||e);}
 document.fonts.ready.then(()=>requestAnimationFrame(frame));window.game=game;window.fleetingLife={game,painter,capture,replay,moments,music:sceneMusic,get memories(){return moments.memories;},getLayout(){const r=canvas.getBoundingClientRect();return {core:{left:r.left,top:r.top,width:r.width,height:r.height},scale:r.width/480,hidden};}};
})();
