const fs=require('fs'),path=require('path'),crypto=require('crypto');
const {openBrowser,delay}=require('./browser-check.cjs');
const root=path.resolve(__dirname,'..');
const startedAt=new Date().toISOString(),sourceBootstrapSha256=crypto.createHash('sha256').update(fs.readFileSync(path.join(root,'assets/scripts/Bootstrap.ts'))).digest('hex');
(async()=>{fs.mkdirSync(path.join(root,'build/qa'),{recursive:true});const browser=await openBrowser();
try{
const {send,evaluate,errors,consoleErrors,networkErrors}=browser;
await send('Page.navigate',{url:process.argv[2]||'http://127.0.0.1:4318/build/web-desktop/'});
for(let i=0;i<150;i++){if(await evaluate('!!window.fleetingLife?.game'))break;await delay(100);}await delay(300);
const checks=[];const check=(name,pass,detail)=>{checks.push({name,pass,detail});if(!pass)process.exitCode=1;};
const initial=await evaluate('({title:document.title,game:!!window.fleetingLife,screen:window.fleetingLife?.game.screen,overflow:document.documentElement.scrollWidth>innerWidth||document.documentElement.scrollHeight>innerHeight})');
check('Cocos enters hall without page overflow',initial.game&&initial.screen==='hall'&&!initial.overflow,initial);
const layouts=[];
for(const [width,height,mobile] of [[960,540,false],[852,393,true],[740,360,true],[2560,1080,false],[393,852,true]]){
 await send('Emulation.setDeviceMetricsOverride',{width,height,deviceScaleFactor:1,mobile});await delay(250);
 const layout=await evaluate('fleetingLife.getLayout()'),c=layout.core;
 const pass=c.left>=-.5&&c.top>=-.5&&c.left+c.width<=width+.5&&c.top+c.height<=height+.5&&Math.abs(c.width/c.height-480/270)<.005&&Math.max(c.width/width,c.height/height)>.99;
 layouts.push({viewport:{width,height},layout});check('Cocos safe core fills limiting dimension '+width+'x'+height,pass,layout);
}
check('Cocos requests 60 FPS',layouts.every(x=>Number(x.layout.frameRate)===60),layouts.map(x=>x.layout.frameRate));
await send('Emulation.setDeviceMetricsOverride',{width:960,height:540,deviceScaleFactor:1,mobile:false});await delay(250);
const hall=await send('Page.captureScreenshot',{format:'png'});fs.writeFileSync(path.join(root,'build/qa/cocos-hall.png'),Buffer.from(hall.data,'base64'));
const rect=await evaluate("(()=>{const r=fleetingLife.getLayout().core;return {x:r.left+r.width*50/480,y:r.top+r.height*160/270}})()");await send('Input.dispatchMouseEvent',{type:'mousePressed',x:rect.x,y:rect.y,button:'left',clickCount:1});await send('Input.dispatchMouseEvent',{type:'mouseReleased',x:rect.x,y:rect.y,button:'left',clickCount:1});await delay(100);check('Cocos pointer opens the first chapter',await evaluate("fleetingLife.game.screen==='play'"),{});await evaluate("fleetingLife.game.beginSegment(1)");
await send('Input.dispatchKeyEvent',{type:'keyDown',key:' ',code:'Space',windowsVirtualKeyCode:32,nativeVirtualKeyCode:32});await delay(150);
const jumped=await evaluate('({y:fleetingLife.game.y,jumps:fleetingLife.game.jumps})');await send('Input.dispatchKeyEvent',{type:'keyUp',key:' ',code:'Space',windowsVirtualKeyCode:32,nativeVirtualKeyCode:32});check('Cocos keyboard jumps',jumped.y>0,jumped);

await send('Emulation.setDeviceMetricsOverride',{width:852,height:393,deviceScaleFactor:1,mobile:true});await send('Emulation.setTouchEmulationEnabled',{enabled:true,maxTouchPoints:1});await delay(200);
await evaluate('fleetingLife.game.y=0;fleetingLife.game.vy=0;fleetingLife.game.obstacles=[]');
const beforeCancel=await evaluate('fleetingLife.game.run.jumps');
const touch=await evaluate('(()=>{const r=fleetingLife.getLayout().core;return {x:r.left+r.width/2,y:r.top+r.height*100/270};})()');
await send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{...touch,id:1,radiusX:2,radiusY:2,force:1}]});await delay(70);
await send('Input.dispatchTouchEvent',{type:'touchCancel',touchPoints:[]});await delay(100);
const cancelled=await evaluate('({jumps:fleetingLife.game.run.jumps,held:fleetingLife.game.held,pointer:fleetingLife.game.pointer})');
check('Cocos TOUCH_CANCEL clears input without jumping',cancelled.jumps===beforeCancel&&!cancelled.held&&cancelled.pointer===null,cancelled);
await evaluate("(async()=>{const cc=await System.import('cc');fleetingLife.game.keyDown('e');cc.game.emit(cc.Game.EVENT_HIDE);})()");
const hidden=await evaluate('({paused:fleetingLife.game.paused,held:fleetingLife.game.held,time:fleetingLife.game.time})');await delay(160);
await evaluate("(async()=>{const cc=await System.import('cc');cc.game.emit(cc.Game.EVENT_SHOW);})()");await delay(120);
const shown=await evaluate('({paused:fleetingLife.game.paused,held:fleetingLife.game.held,time:fleetingLife.game.time})');
check('Cocos hide/show clears input and does not auto-resume',hidden.paused&&!hidden.held&&shown.paused&&!shown.held&&shown.time===hidden.time,{hidden,shown});
const back=await evaluate("(async()=>{const cc=await System.import('cc'),bootstrap=cc.director.getScene().getChildByName('Game').getComponent('Bootstrap'),event={keyCode:cc.KeyCode.MOBILE_BACK};bootstrap.keyDown(event);bootstrap.keyUp(event);return fleetingLife.game.screen;})()");
check('Cocos MOBILE_BACK adapter leaves paused run for hall',back==='hall',{screen:back});
await evaluate("fleetingLife.game.start();fleetingLife.game.beginSegment(1);fleetingLife.game.obstacles=[];fleetingLife.game.run.invincible=999");
const gpu=await evaluate(`(async()=>{const cc=await System.import('cc'),stage=cc.director.getScene().getChildByName('Game').getChildByName('Game Canvas'),node=new cc.Node('QA Capture Camera');stage.addChild(node);node.layer=cc.Layers.Enum.UI_2D;node.setPosition(0,0,1000);const camera=node.addComponent(cc.Camera);camera.projection=cc.Camera.ProjectionType.ORTHO;camera.orthoHeight=135;camera.near=0;camera.far=2000;camera.visibility=cc.Layers.Enum.UI_2D;const texture=new cc.RenderTexture();texture.reset({width:480,height:270});camera.targetTexture=texture;await new Promise(r=>cc.director.once(cc.Director.EVENT_AFTER_DRAW,r));const pixels=texture.readPixels();let colors=new Set();for(let i=0;i<pixels.length;i+=128)colors.add(pixels.slice(i,i+3).join(','));node.destroy();texture.destroy();return {bytes:pixels.length,colors:colors.size};})()`);
check('Native-style secondary camera GPU readback',gpu.bytes===480*270*4&&gpu.colors>5,gpu);
await delay(2300);await evaluate("fleetingLife.game.capture('hidden')");
let recording;for(let i=0;i<70;i++){await delay(200);recording=await evaluate("JSON.parse(localStorage.getItem('fleeting-life-cocos-moments-v2')||'{}')");if(recording.candidates?.length)break;}
check('Cocos video candidate persisted',recording.candidates?.length===1&&['webm','mp4'].includes(recording.candidates[0].format)&&recording.candidates[0].durationMs>=2300,recording);
check('Cocos video index contains no newly recorded JPEG frames',recording.version===2&&
 recording.candidates.every(moment=>['webm','mp4'].includes(moment.format)&&!Object.prototype.hasOwnProperty.call(moment,'frames')),
 recording);
const media=await evaluate(`(async()=>{const m=JSON.parse(localStorage.getItem('fleeting-life-cocos-moments-v2')).candidates[0],db=await new Promise((ok,no)=>{const r=indexedDB.open('fleeting-life-video-moments',1);r.onsuccess=()=>ok(r.result);r.onerror=()=>no(r.error)}),blob=await new Promise((ok,no)=>{const r=db.transaction('clips','readonly').objectStore('clips').get(m.id);r.onsuccess=()=>ok(r.result);r.onerror=()=>no(r.error)}),url=URL.createObjectURL(blob),video=document.createElement('video');video.src=url;await new Promise((ok,no)=>{video.onloadedmetadata=ok;video.onerror=()=>no(Error('decode failed'))});video.currentTime=1;await new Promise((ok,no)=>{video.onseeked=ok;video.onerror=()=>no(Error('seek failed'))});const result={size:blob.size,type:blob.type,width:video.videoWidth,height:video.videoHeight,duration:video.duration,seekTime:video.currentTime};URL.revokeObjectURL(url);db.close();return result})()`);
check('Cocos Web video independently decodes and seeks',media.size>1000&&media.type.startsWith('video/')&&media.width===480&&media.height===270&&media.duration>=2.3&&media.duration<=3.3&&media.seekTime>=.8,media);
await evaluate("fleetingLife.game.hooks.replay(true)");await delay(400);
const replay=await send('Page.captureScreenshot',{format:'png'});fs.writeFileSync(path.join(root,'build/qa/cocos-memory.png'),Buffer.from(replay.data,'base64'));
const videoReplay=await evaluate("[...document.querySelectorAll('video')].some(v=>getComputedStyle(v).display!=='none'&&v.currentTime>=0)");
check('Cocos finale plays the saved video',videoReplay,{visible:videoReplay});
await evaluate("fleetingLife.game.hooks.replay(false)");
await evaluate("(()=>{const source=document.getElementById('GameCanvas'),canvas=document.createElement('canvas');canvas.width=480;canvas.height=270;canvas.getContext('2d').drawImage(source,0,0,480,270);const frame=canvas.toDataURL('image/jpeg',.5);localStorage.setItem('fleeting-life-cocos-moments',JSON.stringify([{kind:'death',priority:2,time:1,frames:[frame,frame]}]));localStorage.removeItem('fleeting-life-cocos-moments-v2')})()");
await send('Page.reload',{ignoreCache:true});for(let i=0;i<100;i++){if(await evaluate('!!window.fleetingLife?.game'))break;await delay(100);}await evaluate('fleetingLife.moments.ready');
const legacy=await evaluate("fleetingLife.moments.memories.map(m=>({format:m.format,frames:m.frames?.length||0}))");
check('Cocos legacy JPEG candidates remain readable',legacy.length===1&&legacy[0].format==='legacy-frames'&&legacy[0].frames===2,legacy);
await evaluate("(()=>{const g=fleetingLife.game;g.profile.lights=['morning','backrow'];g.profile.achievements=['collector'];g.profile.cosmetics=['whiteShirt','raincoat'];g.profile.progress.seats=['seat1'];g.profile.progress.seatRuns=[3,7];g.model.save();})()");
await send('Page.reload',{ignoreCache:true});for(let i=0;i<100;i++){if(await evaluate('!!window.fleetingLife?.game'))break;await delay(100);}
const savedProfile=await evaluate("(()=>{const p=fleetingLife.game.profile;return {lights:p.lights,achievements:p.achievements,cosmetics:p.cosmetics,seats:p.progress.seats,seatRuns:p.progress.seatRuns}})()");
check('Cocos restart preserves lamps, achievements, cosmetics and chair history',
  JSON.stringify(savedProfile)==='{"lights":["morning","backrow"],"achievements":["collector"],"cosmetics":["whiteShirt","raincoat"],"seats":["seat1"],"seatRuns":[3,7]}',savedProfile);
const hellReturn=await evaluate("(()=>{const g=fleetingLife.game;g.start();g.beginSegment(1);g.obstacles=[];g.run.lives=1;g.run.invincible=0;g.run.hellUsed=false;g.used.add('pen');g.damage();return {phase:g.phase,used:g.returnScene?.used}})()");
check('Cocos hell saves the interrupted scene marker',hellReturn.phase==='hell'&&JSON.stringify(hellReturn.used)==='["pen"]',hellReturn);
await send('Page.reload',{ignoreCache:true});
for(let i=0;i<100;i++){if(await evaluate('!!window.fleetingLife?.game'))break;await delay(100);}
await delay(200);
await send('Page.bringToFront');
const focusPoint=await evaluate('(()=>{const r=fleetingLife.getLayout().core;return {x:r.left+r.width*50/480,y:r.top+r.height*160/270}})()');
await send('Input.dispatchMouseEvent',{type:'mousePressed',...focusPoint,button:'left',clickCount:1});
await send('Input.dispatchMouseEvent',{type:'mouseReleased',...focusPoint,button:'left',clickCount:1});
await delay(100);
await evaluate("(()=>{const g=fleetingLife.game;g.toHall();g.start();g.beginSegment(6);g.model.chooseReward(0);g.startReward()})()");
await send('Input.dispatchKeyEvent',{type:'keyDown',key:'ArrowDown',code:'ArrowDown',windowsVirtualKeyCode:40,nativeVirtualKeyCode:40});
await delay(80);
await send('Input.dispatchKeyEvent',{type:'keyUp',key:'ArrowDown',code:'ArrowDown',windowsVirtualKeyCode:40,nativeVirtualKeyCode:40});
for(let i=0;i<25&&!await evaluate('fleetingLife.game.rewardGround');i++)await delay(100);
const dreamGround=await evaluate('({reward:fleetingLife.game.reward,ground:fleetingLife.game.rewardGround,phaseTime:fleetingLife.game.phaseTime})');
const dreamNearEnd=await evaluate('(()=>{const g=fleetingLife.game;for(let i=0;i<700&&g.phase==="reward"&&g.phaseTime<59.5;i++)g.update(.1);return {phase:g.phase,phaseTime:g.phaseTime,ground:g.rewardGround,rewardEvent:g.run.events.includes("dreamReward")}})()');
const dreamComplete=await evaluate('(()=>{const g=fleetingLife.game;for(let i=0;i<20&&g.phase==="reward";i++)g.update(.1);return {phase:g.phase,choice:g.choice,rewardEvent:g.run.events.includes("dreamReward")}})()');
check('Cocos dream floor contact preserves the sixty-second reward',
 dreamGround.reward==='dream'&&dreamGround.ground&&dreamNearEnd.phase==='reward'&&dreamNearEnd.phaseTime>=59.5&&dreamNearEnd.phaseTime<60&&dreamNearEnd.ground&&!dreamNearEnd.rewardEvent&&dreamComplete.phase==='choice'&&dreamComplete.choice===6&&dreamComplete.rewardEvent,
 {dreamGround,dreamNearEnd,dreamComplete});
await send('Emulation.setTouchEmulationEnabled',{enabled:false,maxTouchPoints:1});
// Real brief film playback after both portrait and landscape reloads. Return
// before completion, then keep the final desktop ending's full 12+2 second wait.
const resizeFilmSamples=[];
for(const [width,height,name] of [[393,852,'portrait'],[852,393,'landscape']]){
 await send('Emulation.setDeviceMetricsOverride',{width,height,deviceScaleFactor:1,mobile:true});
 await send('Page.reload',{ignoreCache:true});
 for(let i=0;i<150;i++){if(await evaluate('!!window.fleetingLife?.game'))break;await delay(100);}await delay(200);
 await send('Page.bringToFront');
 const point=await evaluate('(()=>{const r=fleetingLife.getLayout().core;return {x:r.left+r.width*.5,y:r.top+r.height*.5}})()');
 await send('Input.dispatchMouseEvent',{type:'mousePressed',...point,button:'left',clickCount:1});
 await send('Input.dispatchMouseEvent',{type:'mouseReleased',...point,button:'left',clickCount:1});
 await evaluate("(()=>{const g=fleetingLife.game;g.toHall();g.start();g.startEnding('outside')})()");
 const deadline=Date.now()+12000;let layout;
 do{layout=await outsideVideoLayout();if(outsideLayoutValid(layout)&&layout.mediaStatus==='playing'&&layout.mediaClock>=.1)break;await delay(60);}while(Date.now()<deadline);
 const screenshot='cocos-resize-'+name+'-film.png',capture=await send('Page.captureScreenshot',{format:'png'});
 fs.writeFileSync(path.join(root,'build/qa/'+screenshot),Buffer.from(capture.data,'base64'));
 resizeFilmSamples.push({name,screenshot,layout,pass:outsideLayoutValid(layout)&&layout.mediaStatus==='playing'&&layout.mediaClock>=.1});
 await evaluate('fleetingLife.game.toHall()');
}
const outsideResizeOrigin=await evaluate('(async()=>{const cc=await System.import("cc"),c=document.getElementById("GameCanvas");return {frame:cc.view.getFrameSize(),canvasPixels:{width:c.width,height:c.height},layout:fleetingLife.getLayout()};})()');
await send('Emulation.setDeviceMetricsOverride',{width:960,height:540,deviceScaleFactor:1,mobile:false});await delay(150);
await evaluate("(()=>{const g=fleetingLife.game;g.toHall();g.start();g.startEnding('outside')})()");
// Only observe the live player clock. No ending seek, phase-time assignment or
// accelerated update is allowed here: twelve decoded seconds precede a two-second card.
const outsideBeganAt=Date.now(),outsideSamples=[],outsideInputs=[];
const outsideState=()=>evaluate('(()=>{const g=fleetingLife.game;return {screen:g.screen,phase:g.phase,ending:g.ending,duration:g.duration,phaseTime:g.phaseTime,mediaClock:g.endingMediaClock,mediaStatus:g.endingMediaStatus,mediaEnded:g.endingMediaEnded,paused:g.paused,token:g.endingPlaybackToken,obstacles:g.obstacles.map(o=>o.label),pickups:g.pickups.length,buttons:g.buttons.map(b=>b.label),y:g.y,vy:g.vy,jumps:g.run.jumps,airJumps:g.jumps,slide:g.slide,recovery:g.slideRecovery,diving:g.diving,glide:g.glide,lives:g.run.lives,drops:g.run.drops,retries:g.profile.progress.retries,completed:g.profile.progress.endings.outside||0,lit:g.profile.lights.includes("outside")}})()');
const outsideSample=async()=>{const state=await outsideState();state.wallMilliseconds=Date.now()-outsideBeganAt;outsideSamples.push(state);return state;};
const outsideInitial=await outsideSample();
function outsideVideoLayout(){return evaluate(`(async()=>{const cc=await System.import('cc'),g=fleetingLife,stage=cc.director.getScene().getChildByName('Game').getChildByName('Game Canvas'),camera=stage.getChildByName('UI Camera').getComponent(cc.Camera),player=stage.children.map(n=>n.getComponent(cc.VideoPlayer)).find(Boolean),video=player?.nativeVideo,r=video?.getBoundingClientRect(),canvas=document.getElementById('GameCanvas'),layout=g.getLayout(),core=layout.core,style=video?getComputedStyle(video):null;return {layout,frame:cc.view.getFrameSize(),design:cc.view.getDesignResolutionSize(),scale:{x:cc.view.getScaleX(),y:cc.view.getScaleY()},viewport:cc.view.getViewportRect(),canvasPixels:{width:canvas.width,height:canvas.height},dpr:devicePixelRatio,stage:{position:stage.position,size:stage.getComponent(cc.UITransform).contentSize},camera:{orthoHeight:camera.orthoHeight,worldPosition:camera.node.worldPosition,aspect:camera.camera?.aspect,windowSize:{width:camera.camera?.window?.width,height:camera.camera?.window?.height}},video:r?{x:r.x,y:r.y,width:r.width,height:r.height,display:style.display,transform:style.transform,transformOrigin:style.transformOrigin}:null,expectedVideo:{x:core.left+core.width*32/480,y:core.top+core.height*32/270,width:core.width*416/480,height:core.height*234/270},mediaStatus:g.game.endingMediaStatus,mediaClock:g.game.endingMediaClock};})()`);}
function outsideLayoutValid(l){
 const near=(a,b,t=2)=>Number.isFinite(a)&&Math.abs(a-b)<=t;
 const aspect=l.frame.width/l.frame.height,logicalWidth=Math.max(480,270*aspect),logicalHeight=Math.max(270,480/aspect);
 return !!l.video&&l.video.display!=='none'&&['x','y','width','height'].every(k=>near(l.video[k],l.expectedVideo[k]))&&
  near(l.layout.width,logicalWidth,.05)&&near(l.layout.height,logicalHeight,.05)&&near(l.design.width,l.layout.width,.05)&&near(l.design.height,l.layout.height,.05)&&
  near(l.camera.orthoHeight,l.layout.height/2,.05)&&near(l.canvasPixels.width,l.frame.width*l.dpr)&&near(l.canvasPixels.height,l.frame.height*l.dpr)&&
  near(l.camera.aspect,l.frame.width/l.frame.height,.005)&&near(l.camera.windowSize.width,l.canvasPixels.width)&&near(l.camera.windowSize.height,l.canvasPixels.height)&&
  near(l.scale.x,l.frame.width*l.dpr/l.design.width,.01)&&near(l.scale.y,l.frame.height*l.dpr/l.design.height,.01);
}
const saveOutsideShot=async name=>{await delay(100);const s=await send('Page.captureScreenshot',{format:'png'});fs.writeFileSync(path.join(root,'build/qa/'+name+'.png'),Buffer.from(s.data,'base64'));};
const outsideWait=async(predicate,label,timeout=20000)=>{
 const deadline=Date.now()+timeout;
 while(Date.now()<deadline){
  const state=await outsideSample();
  if(state.mediaStatus==='failed')throw Error('Outside movie decode/playback failed: '+JSON.stringify(state));
  if(state.screen==='play'&&state.phase==='ending'&&(state.lit||state.completed!==outsideInitial.completed))throw Error('Outside lamp awarded before the card completed: '+JSON.stringify(state));
  if(predicate(state))return state;
  if(state.screen!=='play'||state.phase!=='ending')throw Error('Outside left the movie before '+label+': '+JSON.stringify(state));
  await delay(60);
 }
 throw Error('Outside real playback timed out waiting for '+label+': '+JSON.stringify(outsideSamples.at(-1)));
};
const outsideMovement=state=>[state.y,state.vy,state.jumps,state.airJumps,state.slide,state.recovery,state.diving,state.glide];
const outsideScreenshots=['cocos-outside-gate.png','cocos-outside-input-locked.png','cocos-outside-middle.png','cocos-outside-before-end.png','cocos-outside-card.png'];
try{
 const outsidePlaying=await outsideWait(s=>s.mediaStatus==='playing'&&s.mediaClock>=.25,'real media playback');
 const resizeDeadline=Date.now()+1500;let outsideLayout;
 do{outsideLayout=await outsideVideoLayout();if(outsideLayoutValid(outsideLayout))break;await delay(60);}while(Date.now()<resizeDeadline);
 check('Cocos portrait and landscape reload then desktop resize keep actual film DOM at the 32px inset',
  resizeFilmSamples.every(s=>s.pass)&&Math.abs(outsideResizeOrigin.frame.width-852)<2&&Math.abs(outsideResizeOrigin.frame.height-393)<2&&outsideLayoutValid(outsideLayout),
  {method:'actual public VideoPlayer.nativeVideo DOM rect, bitmap, design, scale, camera and renderWindow; no private matrix patch',portraitAndLandscapeReloads:resizeFilmSamples,mobileReloadOrigin:outsideResizeOrigin,afterDesktopResize:outsideLayout});
 await saveOutsideShot('cocos-outside-gate');
 await send('Input.dispatchKeyEvent',{type:'keyDown',key:' ',code:'Space',windowsVirtualKeyCode:32,nativeVirtualKeyCode:32});await delay(150);
 outsideInputs.push({input:'keyboard jump held',state:await outsideSample()});
 await send('Input.dispatchKeyEvent',{type:'keyUp',key:' ',code:'Space',windowsVirtualKeyCode:32,nativeVirtualKeyCode:32});
 await send('Input.dispatchKeyEvent',{type:'keyDown',key:'ArrowDown',code:'ArrowDown',windowsVirtualKeyCode:40,nativeVirtualKeyCode:40});await delay(100);
 outsideInputs.push({input:'keyboard down held',state:await outsideSample()});
 await send('Input.dispatchKeyEvent',{type:'keyUp',key:'ArrowDown',code:'ArrowDown',windowsVirtualKeyCode:40,nativeVirtualKeyCode:40});
 const filmPoint=await evaluate('(()=>{const r=fleetingLife.getLayout().core;return {x:r.left+r.width*.5,y:r.top+r.height*130/270,downY:r.top+r.height*195/270}})()');
 await send('Input.dispatchMouseEvent',{type:'mousePressed',x:filmPoint.x,y:filmPoint.y,button:'left',clickCount:1});await delay(45);
 await send('Input.dispatchMouseEvent',{type:'mouseReleased',x:filmPoint.x,y:filmPoint.y,button:'left',clickCount:1});await delay(100);
 outsideInputs.push({input:'mouse jump click',state:await outsideSample()});
 await send('Input.dispatchMouseEvent',{type:'mousePressed',x:filmPoint.x,y:filmPoint.y,button:'left',clickCount:1});await delay(45);
 await send('Input.dispatchMouseEvent',{type:'mouseMoved',x:filmPoint.x,y:filmPoint.downY,button:'left',buttons:1});await delay(100);
 outsideInputs.push({input:'mouse downward gesture held',state:await outsideSample()});
 await send('Input.dispatchMouseEvent',{type:'mouseReleased',x:filmPoint.x,y:filmPoint.downY,button:'left',clickCount:1});await delay(100);
 outsideInputs.push({input:'mouse downward gesture released',state:await outsideSample()});
 await saveOutsideShot('cocos-outside-input-locked');
 check('Cocos outside cinematic ignores real keyboard and mouse jump/down movement',
  outsideInputs.every(x=>x.state.screen==='play'&&x.state.phase==='ending'&&!x.state.paused&&
   JSON.stringify(outsideMovement(x.state))===JSON.stringify(outsideMovement(outsideInitial))),{outsideInitial,outsideInputs});
 await outsideWait(s=>s.mediaStatus==='playing'&&s.mediaClock>=5.5,'movie midpoint');await saveOutsideShot('cocos-outside-middle');
 const outsideNearEnd=await outsideWait(s=>s.mediaStatus==='playing'&&s.mediaClock>=11.1&&s.mediaClock<12,'last decoded second before completion');
 await saveOutsideShot('cocos-outside-before-end');
 const outsideCard=await outsideWait(s=>s.mediaEnded&&s.mediaStatus==='ended'&&s.phaseTime>=12,'complete twelve-second film');
 await saveOutsideShot('cocos-outside-card');
 const outsideLateCard=await outsideWait(s=>s.mediaEnded&&s.phaseTime>=13.55&&s.phaseTime<14,'the final half-second of the two-second card',5000);
 const outsideFinished=await outsideWait(s=>s.screen==='hall','automatic return to the corridor',5000);
 const outsidePlaybackWallMilliseconds=outsideFinished.wallMilliseconds-outsidePlaying.wallMilliseconds+outsidePlaying.mediaClock*1000;
 check('Cocos outside awards its lamp only after twelve real film seconds and the two-second card',
  outsideInitial.screen==='play'&&outsideInitial.phase==='ending'&&outsideInitial.ending==='outside'&&outsideInitial.duration===14&&!outsideInitial.lit&&
  outsidePlaying.mediaClock<1&&!outsidePlaying.mediaEnded&&outsideNearEnd.phase==='ending'&&!outsideNearEnd.lit&&!outsideNearEnd.mediaEnded&&
  outsideCard.phase==='ending'&&outsideCard.mediaClock===12&&!outsideCard.lit&&outsideCard.completed===outsideInitial.completed&&
  outsideLateCard.phase==='ending'&&!outsideLateCard.lit&&outsideLateCard.completed===outsideInitial.completed&&
  outsideFinished.screen==='hall'&&outsideFinished.lit&&outsideFinished.completed===outsideInitial.completed+1&&
  outsidePlaybackWallMilliseconds>=13500&&outsideFinished.wallMilliseconds-outsideCard.wallMilliseconds>=1800,
  {outsideInitial,outsidePlaying,outsideNearEnd,outsideCard,outsideLateCard,outsideFinished,outsidePlaybackWallMilliseconds,screenshots:outsideScreenshots});
 check('Cocos outside keeps movie props out of live collisions and never loses life or retries',
  outsideSamples.every(s=>s.obstacles.length===0&&s.pickups===0&&s.lives===outsideInitial.lives&&s.drops===outsideInitial.drops&&s.retries===outsideInitial.retries),
  {method:'real twelve-second decoded film plus two-second card; no seek or accelerated ending update',samples:outsideSamples});
}catch(error){
 check('Cocos outside real movie playback completes successfully',false,{error:String(error),outsideInitial,outsideInputs,samples:outsideSamples,screenshots:outsideScreenshots});
}
check('No runtime or network errors',errors.length===0&&consoleErrors.length===0&&networkErrors.length===0,{errors,consoleErrors,networkErrors});
const report={startedAt,capturedAt:new Date().toISOString(),sourceBootstrapSha256,url:process.argv[2]||'http://127.0.0.1:4318/build/web-desktop/',checks,errors,consoleErrors,networkErrors};
fs.writeFileSync(path.join(root,'build/qa/cocos-runtime-results.json'),JSON.stringify(report,null,2));console.log(JSON.stringify(report,null,2));
}finally{await browser.close();}})().catch(e=>{console.error(e);process.exitCode=1;});
