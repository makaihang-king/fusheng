const fs=require('fs'),path=require('path'),assert=require('node:assert/strict');
const {openBrowser,delay}=require('./browser-check.cjs');
const {CHAIRS,CHOICE_PROPS}=require('../build/Geometry.js');
const root=path.resolve(__dirname,'..');
const url=process.argv[2]||'http://127.0.0.1:4318/preview/';
const checks=[];
const output=path.join(root,'build/qa');fs.mkdirSync(output,{recursive:true});
(async()=>{
 const browser=await openBrowser({width:960,height:540});
 const {send,evaluate,errors,networkErrors,consoleErrors,resourceResponses}=browser;
 try {
  const read=expr=>evaluate('(()=>{const g=window.fleetingLife.game;return ('+expr+');})()');
  const setup=code=>evaluate('(()=>{const g=window.fleetingLife.game;'+code+';return true;})()');
  const bounds=()=>evaluate('(()=>{const r=document.getElementById("game").getBoundingClientRect();return {x:r.x,y:r.y,w:r.width,h:r.height};})()');
  const point=async(x,y)=>{const r=await bounds();return {x:r.x+x*r.w/480,y:r.y+y*r.h/270};};
  const mouse=async(x,y,type='mousePressed')=>send('Input.dispatchMouseEvent',{type,...await point(x,y),button:'left',clickCount:1,buttons:type==='mouseReleased'?0:1});
  const tap=async(x,y,touch=false)=>{
   if(touch){const p=await point(x,y);await send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{...p,id:1,radiusX:2,radiusY:2,force:1}]});await delay(30);await send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});}
   else{await mouse(x,y);await delay(30);await mouse(x,y,'mouseReleased');}
   await delay(65);
  };
  const swipe=async(x1,y1,x2,y2,touch=false)=>{
   if(touch){
    await send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{...await point(x1,y1),id:1,radiusX:2,radiusY:2,force:1}]});
    for(let i=1;i<=4;i++){await send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{...await point(x1+(x2-x1)*i/4,y1+(y2-y1)*i/4),id:1,radiusX:2,radiusY:2,force:1}]});await delay(15);}
    await send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
   }else{
    await mouse(x1,y1);await mouse(x2,y2,'mouseMoved');await mouse(x2,y2,'mouseReleased');
   }await delay(50);
  };
  const click=async(label,touch=false)=>{
   const b=await read('g.buttons.find(b=>b.label === '+JSON.stringify(label)+')');
   assert.ok(b,'button exists: '+label);assert.equal(!!b.disabled,false,'button enabled: '+label);
   await tap(b.x+b.w/2,b.y+b.h/2,touch);
  };
  const key=async(key,hold=40)=>{
   const code=key===' '?'Space':key==='Escape'?'Escape':key.startsWith('Arrow')?key:'Key'+key.toUpperCase();
   await send('Input.dispatchKeyEvent',{type:'keyDown',key,code});await delay(hold);await send('Input.dispatchKeyEvent',{type:'keyUp',key,code});await delay(60);
  };
  const shot=async(name)=>{const s=await send('Page.captureScreenshot',{format:'png'});fs.writeFileSync(path.join(output,name+'.png'),Buffer.from(s.data,'base64'));};
  const waitFilm=async(expr,timeout=22000)=>{const until=Date.now()+timeout;while(Date.now()<until){if(await read('g.endingMediaStatus==="failed"'))throw Error('ending video failed instead of playing');if(await read(expr))return;await delay(100);}throw Error('real ending playback timed out: '+expr);};
  const check=async(name,fn)=>{try{const detail=await fn();checks.push({name,pass:true,detail});console.log('PASS '+name);}catch(e){checks.push({name,pass:false,error:e.message});console.log('FAIL '+name+': '+e.message);await shot('failure-'+checks.length).catch(()=>{});}};
  const awaitGame=async()=>{for(let i=0;i<50;i++){if(await evaluate('!!window.fleetingLife?.game && document.fonts.status==="loaded"'))return;await delay(100);}throw Error('game did not become ready');await delay(100);};
  await send('Runtime.enable');await send('Page.enable');await send('Network.enable');
  // 动作预载与录像使长流程超过浏览器默认资源记录容量；保留最初的真实请求证据。
  await send('Page.addScriptToEvaluateOnNewDocument',{source:'performance.setResourceTimingBufferSize(20000)'});
  await send('Emulation.setDeviceMetricsOverride',{width:960,height:540,deviceScaleFactor:1,mobile:false});
  await send('Page.navigate',{url});await awaitGame();
  await evaluate('localStorage.removeItem("fleeting-life-s1");localStorage.removeItem("fleeting-life-s1-moments");localStorage.removeItem("fleeting-life-s1-moments-v2")');
  await send('Page.reload',{ignoreCache:true});await delay(250);await awaitGame();await delay(300);
  await check('font loaded and desktop canvas is 960x540',async()=>{
   const f=await evaluate('({status:document.fonts.status,check:document.fonts.check("12px FusionPixel","浮生学堂"),faces:Array.from(document.fonts).map(f=>({family:f.family,status:f.status})),error:document.getElementById("error").textContent})');
   assert.equal(f.status,'loaded');assert.equal(f.check,true);assert.ok(f.faces.some(x=>x.family==='FusionPixel'&&x.status==='loaded'));assert.equal(f.error,'');
   const r=await bounds();assert.equal(r.w,960);assert.equal(r.h,540);return {font:f,canvas:r};
  });
  await check('achievement panel and pagination via mouse',async()=>{
   await click('成就墙');assert.equal(await read('g.panel'),'achievements');await shot('achievements');
   await click('下一页');assert.equal(await read('g.panelPage'),1);await click('×');assert.equal(await read('g.panel'),'');
  });
  await check('shop purchase via mouse and next-run inventory',async()=>{
   await setup('g.profile.fragments=500;g.profile.wrappers=200;g.model.save()');await click('小卖部');await shot('shop');
   await click('60 碎片');assert.equal(await read('g.profile.inventory.shield'),1);assert.equal(await read('g.profile.fragments'),440);await click('×');
  });
  await check('wardrobe purchase and equip via mouse',async()=>{
   await click('换装');await click('80 糖纸');await click('换上');assert.equal(await read('g.profile.equippedSlots.skin'),'raincoat');await shot('wardrobe');await click('×');
  });
  await check('chapter panel shows four reserved chapters',async()=>{
   await click('章节');const locked=await read('g.buttons.filter(b=>b.label==="尚待书写").length');assert.equal(locked,4);await shot('chapters');await click('×');
  });
  await check('settings toggles persist through actual input',async()=>{
   await click('设置');await click('声音：开启');await click('动态效果：标准');assert.deepEqual(await read('g.settings'),{muted:true,reducedMotion:true});await shot('settings');await click('×');
  });
  await check('start door and keyboard jump/down',async()=>{
   await click('出发');assert.equal(await read('g.screen'),'play');await delay(3250);assert.equal(await read('g.phase'),'run');assert.equal(await read('g.profile.progress.introSeen'),true);
   const before=await read('g.run.jumps');await key(' ');assert.ok(await read('g.y>0'));assert.equal(await read('g.run.jumps'),before+1);
   await key('ArrowDown');assert.ok(await read('g.diving || g.y===0'));
  });
  await check('item button consumes UI pointer without jumping',async()=>{
   await setup('g.y=0;g.vy=0;g.jumps=0');const before=await read('g.run.jumps');
   await click('盾 1');assert.ok(await read('g.run.usedItems.includes("shield")'));assert.equal(await read('g.run.jumps'),before);
  });
  await check('pause stops time and reload keeps profile, resets run',async()=>{
   await key('Escape');assert.equal(await read('g.paused'),true);const time=await read('g.time');await delay(180);assert.equal(await read('g.time'),time);
   await shot('paused');await send('Page.reload',{ignoreCache:true});await delay(250);await awaitGame();await delay(200);
   assert.equal(await read('g.screen'),'hall');assert.equal(await read('g.run.active'),false);
   assert.deepEqual(await read('g.settings'),{muted:true,reducedMotion:true});assert.equal(await read('g.completedIntro'),true);
   assert.equal(await read('g.profile.equippedSlots.skin'),'raincoat');assert.equal(await read('g.profile.inventory.shield'),0);
  });
  await check('rain scene, real mouse jump and down swipe',async()=>{
   await setup('g.start();g.beginSegment(2);g.obstacles=[];g.time=9;g.event("umbrella");g.subtitleTime=0');await delay(120);await shot('rain');
   await tap(240,110);assert.ok(await read('g.y>0'));await swipe(240,100,240,145);assert.ok(await read('g.diving || g.y===0'));
  });
  await check('seat choice through keyboard jump and acute drop',async()=>{
   await setup(`g.beginChoice(2);g.phaseTime=${CHAIRS[0].at-1};g.subtitleTime=0`);await delay(100);await shot('seats');
   await setup(`g.phaseTime=${CHAIRS[0].at-.3};g.y=0;g.vy=0`);
   await key(' ');await key('ArrowDown');await delay(180);assert.ok(await read('g.run.events.includes("seat1")'));
  });
  await check('piano choice through real E long press',async()=>{
   await setup(`g.beginChoice(4);g.phaseTime=${CHOICE_PROPS.piano.at-1.6};g.subtitleTime=0`);await delay(100);await shot('piano');
   await setup(`g.phaseTime=${CHOICE_PROPS.piano.at-.35}`);
   await key('e',720);assert.ok(await read('g.run.events.includes("pianoClose")'));assert.ok(await read('g.profile.achievements.includes("sharpEyes")'));
  });
  await check('dream float and down use actual input',async()=>{
   await setup('g.model.beginRun();g.beginSegment(6);g.model.chooseReward(0);g.startReward();g.phaseTime=10;g.y=95;g.subtitleTime=0');await delay(100);await shot('dream');
   await tap(240,100);assert.ok(await read('g.vy>0'));await swipe(240,100,240,145);assert.ok(await read('g.vy<0'));
  });

  await check('dream act two lands on physical table then accelerates into sprint',async()=>{
   await setup('g.phaseTime=29.9;g.y=100;g.vy=-20;g.subtitleTime=0');
   await delay(850);assert.ok(await read('g.used.has("tableLanded")'));assert.ok(await read('g.run.events.includes("tableEdge")'));
   assert.equal(await read('g.y'),65);await shot('dream-act2');
   await key('ArrowDown');await delay(1750);assert.ok(await read('g.used.has("sprint")'));
   assert.ok(await read('g.rewardClock()>g.phaseTime'));return await read('({phaseTime:g.phaseTime,tableLanded:g.used.has("tableLanded"),sprint:g.used.has("sprint"),rewardClock:g.rewardClock()})');
  });
  await check('first desk ending cannot be skipped and lights at completion boundary',async()=>{
   await setup('g.startEnding("desk");g.subtitleTime=0');await delay(100);await shot('ending');
   const first=await read('({screen:g.screen,phase:g.phase,duration:g.duration,buttons:g.buttons.map(b=>b.label),lit:g.profile.lights.includes("desk")})');
   assert.equal(first.phase,'ending');assert.equal(first.duration,14);assert.equal(first.lit,false);
   assert.equal(first.buttons.includes('看完这一幕'),false);assert.equal(first.buttons.includes('回到回廊'),false);
   await tap(420,248);assert.equal(await read('g.phase'),'ending');assert.equal(await read('g.profile.lights.includes("desk")'),false);
   await waitFilm('g.endingMediaEnded && g.phaseTime>=12');
   const nearEnd=await read('({screen:g.screen,phase:g.phase,phaseTime:g.phaseTime,lit:g.profile.lights.includes("desk"),mediaStatus:g.endingMediaStatus})');
   assert.equal(nearEnd.phase,'ending');assert.equal(nearEnd.lit,false);await shot('ending-desk-late');
   await waitFilm('g.screen==="hall"');
   const complete=await read('({screen:g.screen,phaseTime:g.phaseTime,lit:g.profile.lights.includes("desk")})');
   assert.equal(complete.screen,'hall');assert.equal(complete.lit,true);return {first,nearEnd,complete};
  });

  await check('own canvas moments persist as independently playable videos and render in finale',async()=>{
   await setup('g.toHall();g.start();g.beginSegment(1);g.obstacles=[];g.run.invincible=999');
   await delay(2100);
   for(const kind of ['highlight','death','hidden','hidden']){
    await key(' ');await setup('g.capture('+JSON.stringify(kind)+')');await delay(1250);
   }
   let stored;for(let i=0;i<90;i++){stored=await evaluate('JSON.parse(localStorage.getItem("fleeting-life-s1-moments-v2")||"{}")');if(stored.candidates?.length===3)break;await delay(200);}
   assert.equal(stored.candidates?.length,3);assert.ok(stored.candidates.every(m=>['webm','mp4'].includes(m.format)&&m.durationMs>=2300&&m.durationMs<=3100));
   assert.ok(stored.candidates.some(m=>m.kind==='hidden'));
   const media=await evaluate('(async()=>{const index=JSON.parse(localStorage.getItem("fleeting-life-s1-moments-v2")),db=await new Promise((ok,no)=>{const r=indexedDB.open("fleeting-life-video-moments",1);r.onsuccess=()=>ok(r.result);r.onerror=()=>no(r.error)});const clips=[];for(const m of index.candidates){const blob=await new Promise((ok,no)=>{const r=db.transaction("clips","readonly").objectStore("clips").get(m.id);r.onsuccess=()=>ok(r.result);r.onerror=()=>no(r.error)});clips.push({id:m.id,size:blob?.size||0,type:blob?.type||""});}const blob=await new Promise((ok,no)=>{const r=db.transaction("clips","readonly").objectStore("clips").get(index.candidates[0].id);r.onsuccess=()=>ok(r.result);r.onerror=()=>no(r.error)}),url=URL.createObjectURL(blob),video=document.createElement("video");video.src=url;await new Promise((ok,no)=>{video.onloadedmetadata=ok;video.onerror=()=>no(Error("video decode failed"))});video.currentTime=1;await new Promise((ok,no)=>{video.onseeked=ok;video.onerror=()=>no(Error("video seek failed"))});const result={clips,width:video.videoWidth,height:video.videoHeight,duration:video.duration,seekTime:video.currentTime};URL.revokeObjectURL(url);db.close();return result})()');
   assert.ok(media.clips.every(m=>m.size>1000&&m.type.startsWith('video/')));assert.equal(media.width,480);assert.equal(media.height,270);assert.ok(media.duration>=2.3&&media.duration<=3.3);assert.ok(media.seekTime>=.8);
   await send('Page.reload',{ignoreCache:true});await delay(250);await awaitGame();await delay(180);
   await evaluate('window.fleetingLife.moments.ready');
   assert.equal(await evaluate('window.fleetingLife.memories.length'),stored.candidates.length);
   await evaluate('(()=>{const g=window.fleetingLife.game;g.screen="play";g.phase="finale";g.phaseTime=0;g.hooks.replay(true);})()');
   await delay(450);const rendered=await evaluate('({visible:[...document.querySelectorAll("video")].some(v=>getComputedStyle(v).display!=="none"),time:[...document.querySelectorAll("video")].find(v=>getComputedStyle(v).display!=="none")?.currentTime})');assert.equal(rendered.visible,true);
   await shot('recording-replay');await setup('g.hooks.replay(false);g.toHall()');return {stored,media,rendered};
  });
  await check('legacy JPEG moments stay readable without creating new JPEG candidates',async()=>{
   await evaluate('(()=>{const frame=document.getElementById("game").toDataURL("image/jpeg",.5);localStorage.setItem("fleeting-life-s1-moments",JSON.stringify([{kind:"death",priority:2,time:1,frames:[frame,frame]}]));window.__qaVideoIndex=localStorage.getItem("fleeting-life-s1-moments-v2");localStorage.removeItem("fleeting-life-s1-moments-v2")})()');
   await send('Page.reload',{ignoreCache:true});await delay(250);await awaitGame();await delay(180);
   const legacy=await evaluate('window.fleetingLife.memories.map(m=>({format:m.format,frames:m.frames?.length||0}))');assert.deepEqual(legacy,[{format:'legacy-frames',frames:2}]);
   await evaluate('window.fleetingLife.game.hooks.replay(true)');await delay(180);
   assert.equal(await evaluate('!!window.fleetingLife.moments.oldCanvas&&getComputedStyle(window.fleetingLife.moments.oldCanvas).display!=="none"'),true);
   await evaluate('window.fleetingLife.game.hooks.replay(false)');return legacy;
  });
  await check('mobile landscape touch mapping including letterboxing',async()=>{
   await send('Emulation.setDeviceMetricsOverride',{width:852,height:393,deviceScaleFactor:1,mobile:true});
   await send('Emulation.setTouchEmulationEnabled',{enabled:true,maxTouchPoints:1});await delay(200);
   let r=await bounds();for(let i=0;i<20&&(r.w>852||r.h>393);i++){await delay(100);r=await bounds();}console.log('MOBILE '+JSON.stringify({r,viewport:await evaluate('({width:innerWidth,height:innerHeight})')}));assert.ok(r.w<=852.5&&r.h<=393.5);assert.ok(r.x>0&&r.y>=-.5);assert.ok(Math.abs(r.h-393)<1,'mobile canvas must use the full available height');assert.ok(Math.abs(r.w/r.h-480/270)<.005);
   await click('章节',true);assert.equal(await read('g.panel'),'chapters');await shot('chapters-mobile');await click('×',true);
   await setup('g.profile.inventory.magnet=1;g.start();g.beginSegment(1);g.obstacles=[]');
   await delay(100);const before=await read('g.run.jumps');await tap(240,100,true);assert.ok(await read('g.y>0'));assert.equal(await read('g.run.jumps'),before+1);
   await swipe(240,100,240,155,true);assert.ok(await read('g.diving || g.y===0'));
   await setup('g.y=0;g.vy=0;g.jumps=0');const count=await read('g.run.jumps');await click('磁 1',true);
   assert.ok(await read('g.run.magnet'));assert.equal(await read('g.run.jumps'),count);await shot('mobile-touch');return {canvas:r,viewport:{width:852,height:393}};
  });
  await check('touch cancellation neither jumps nor activates a menu button',async()=>{
   await setup('g.toHall();g.start();g.beginSegment(1);g.obstacles=[];g.y=0;g.vy=0;g.jumps=0');await delay(80);
   const count=await read('g.run.jumps');
   await send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{...await point(240,100),id:1,radiusX:2,radiusY:2,force:1}]});await delay(70);
   await send('Input.dispatchTouchEvent',{type:'touchCancel',touchPoints:[]});await delay(100);
   assert.equal(await read('g.run.jumps'),count);assert.equal(await read('g.held'),false);assert.equal(await read('g.pointer'),null);
   await setup('g.toHall()');await delay(80);
   const b=await read('g.buttons.find(b=>b.label==="章节")');assert.ok(b);
   await send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{...await point(b.x+b.w/2,b.y+b.h/2),id:1,radiusX:2,radiusY:2,force:1}]});
   await send('Input.dispatchTouchEvent',{type:'touchCancel',touchPoints:[]});await delay(80);
   assert.equal(await read('g.panel'),'');await click('章节',true);assert.equal(await read('g.panel'),'chapters');await click('×',true);
  });
  await check('background clears held input and requires explicit resume',async()=>{
   await setup('g.start();g.beginSegment(1);g.obstacles=[]');await delay(80);
   await send('Input.dispatchKeyEvent',{type:'keyDown',key:'e',code:'KeyE'});
   await evaluate('window.dispatchEvent(new Event("blur"))');assert.equal(await read('g.paused'),true);assert.equal(await read('g.held'),false);assert.equal(await read('g.keyHeld.size'),0);
   const time=await read('g.time');await delay(180);assert.equal(await read('g.time'),time);
   await send('Page.bringToFront');await evaluate('window.dispatchEvent(new Event("focus"));document.getElementById("game").focus({preventScroll:true})');
   await delay(100);assert.equal(await evaluate('window.fleetingLife.getLayout().hidden'),false);assert.equal(await read('g.paused'),true);assert.equal(await read('g.time'),time);
   await send('Input.dispatchKeyEvent',{type:'keyUp',key:'e',code:'KeyE'});await key('Escape');assert.equal(await read('g.screen'),'hall');
   await click('章节',true);await key('Escape');assert.equal(await read('g.panel'),'');assert.equal(await read('g.screen'),'hall');
  });
  await check('dream touching the floor still runs for the full sixty seconds',async()=>{
   await send('Page.reload',{ignoreCache:true});await delay(250);await awaitGame();await send('Page.bringToFront');
   assert.equal(await evaluate('window.fleetingLife.getLayout().hidden'),false);
   await setup('g.start();g.beginSegment(6);g.model.chooseReward(0);g.startReward()');
   assert.equal(await read('g.reward'),'dream');
   await swipe(240,100,240,155,true);
   for(let i=0;i<25&&!await read('g.rewardGround');i++)await delay(100);
   assert.equal(await read('g.rewardGround'),true);
   const before=await read('({phase:g.phase,phaseTime:g.phaseTime,ground:g.rewardGround})');
   const nearEnd=await evaluate('(()=>{const g=window.fleetingLife.game;for(let i=0;i<700&&g.phase==="reward"&&g.phaseTime<59.5;i++)g.update(.1);return {phase:g.phase,phaseTime:g.phaseTime,ground:g.rewardGround,events:g.run.events}})()');
   assert.equal(nearEnd.phase,'reward');assert.ok(nearEnd.phaseTime>=59.5&&nearEnd.phaseTime<60);
   assert.equal(nearEnd.ground,true);assert.equal(nearEnd.events.includes('dreamReward'),false);
   const complete=await evaluate('(()=>{const g=window.fleetingLife.game;for(let i=0;i<20&&g.phase==="reward";i++)g.update(.1);return {phase:g.phase,choice:g.choice,events:g.run.events}})()');
   assert.equal(complete.phase,'choice');assert.equal(complete.choice,6);
   assert.equal(complete.events.includes('dreamReward'),true);
   return {before,nearEnd,complete};
  });
  await check('outside ending plays twelve real seconds and a two-second card with no live collision',async()=>{
   await send('Emulation.setTouchEmulationEnabled',{enabled:false,maxTouchPoints:1});
   await send('Emulation.setDeviceMetricsOverride',{width:960,height:540,deviceScaleFactor:1,mobile:false});await delay(150);
   await setup('g.toHall();g.start();g.startEnding("outside")');
   const initial=await read('({screen:g.screen,phase:g.phase,ending:g.ending,duration:g.duration,obstacles:g.obstacles.map(o=>o.label),buttons:g.buttons.map(b=>b.label),lives:g.run.lives,drops:g.run.drops,retries:g.profile.progress.retries,lit:g.profile.lights.includes("outside")})');
   assert.equal(initial.screen,'play');assert.equal(initial.phase,'ending');assert.equal(initial.duration,14);
   assert.deepEqual(initial.obstacles,[]);assert.equal(initial.buttons.includes('看完这一幕'),false);assert.equal(initial.lit,false);
   await delay(100);await shot('outside-gate');
   const jumps=await read('g.run.jumps');await key(' ');assert.equal(await read('g.y'),0);assert.equal(await read('g.run.jumps'),jumps);
   await key('ArrowDown');assert.ok(await read('g.diving||g.y===0'));
   await waitFilm('g.phaseTime>=8.5');const fork=await read('({phase:g.phase,phaseTime:g.phaseTime})');assert.equal(fork.phase,'ending');await shot('outside-fork');
   await waitFilm('g.endingMediaEnded');const nearEnd=await read('({phase:g.phase,phaseTime:g.phaseTime,lit:g.profile.lights.includes("outside")})');assert.equal(nearEnd.phase,'ending');assert.equal(nearEnd.lit,false);
   await waitFilm('g.screen==="hall"');const finished=await read('({screen:g.screen,phaseTime:g.phaseTime,lit:g.profile.lights.includes("outside"),lives:g.run.lives,drops:g.run.drops})');assert.equal(finished.screen,'hall');assert.equal(finished.lit,true);
   assert.equal(finished.drops,initial.drops);assert.equal(finished.lives,initial.lives);
   assert.equal(await read('g.profile.progress.retries'),initial.retries);
   return {initial,fork,nearEnd,finished,screenshots:['outside-gate.png','outside-fork.png']};
  });
  await check('no browser exceptions, missing resources, or error overlay',async()=>{
   const overlay=await evaluate('document.getElementById("error").textContent');assert.equal(overlay,'');assert.equal(await evaluate('!!document.getElementById("notice")'),false);
   assert.deepEqual(errors,[]);assert.deepEqual(consoleErrors,[]);assert.deepEqual(networkErrors,[]);
   // 此流程实际重载页面验证存档；CDP证据跨重载保留，Performance只记录当前文档。
   const resources=resourceResponses.filter(r=>r.status<400).map(r=>r.url);
   const artRequests=resources.filter(u=>u.includes('/assets/resources/')&&!u.includes('/fonts/'));
   assert.ok(artRequests.some(u=>/\/art\/pixel\/(?:scene\/dawn\.png|scroll\/dawn\/\d+\.png)$/.test(new URL(u).pathname)),'the authored dawn scene or scrolling dawn tile must load in the playable run');
   assert.ok(artRequests.some(u=>u.includes('/art/pixel/character/hd/')),'a pixel character animation frame must load');
   return {artRequests:artRequests.length,sceneRequests:artRequests.filter(u=>u.includes('/art/pixel/scene/'))};
  });
  const report={generatedAt:new Date().toISOString(),url,checks,errors,consoleErrors,networkErrors,passed:checks.filter(c=>c.pass).length,total:checks.length};
  fs.writeFileSync(path.join(output,'browser-flow-report.json'),JSON.stringify(report,null,2));
  console.log(JSON.stringify({passed:report.passed,total:report.total,errors,networkErrors}));
  if(report.passed!==report.total)process.exitCode=1;
 } finally {await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});




