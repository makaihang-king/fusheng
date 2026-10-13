'use strict';
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const {openBrowser,delay}=require('./browser-check.cjs');
const root=path.resolve(__dirname,'..'),out=path.join(root,'build/qa/gameplay-detail-v6');
fs.mkdirSync(out,{recursive:true});

(async()=>{
 const browser=await openBrowser({width:960,height:540});
 try{
  const {send,evaluate,errors,consoleErrors,networkErrors,resourceResponses}=browser;
  await send('Page.navigate',{url:'http://127.0.0.1:4318/preview/?v=gameplay-detail-v6'});
  for(let i=0;i<120;i++){
   if(await evaluate('!!window.fleetingLife?.game'))break;
   await delay(100);
  }
  assert.equal(await evaluate('!!window.fleetingLife?.game'),true,'game is available');
  await evaluate(`(()=>{
   const g=window.fleetingLife.game;g.settings.muted=true;g.start();g.beginSegment(1);
   g.time=g.duration*.82;g.clock=1.6;g.obstacles=[];g.notice='';g.noticeTime=0;
   g.subtitle='';g.subtitleTime=0;g.update=()=>{};return true;
  })()`);
  await delay(700);
  let view=await evaluate(`(()=>{const g=window.fleetingLife.game;return {
   phase:g.phase,segment:g.segment,buttons:g.buttons.filter(b=>b.label==='Ⅱ').map(b=>[b.x,b.y,b.w,b.h])
  };})()`);
  assert.equal(view.phase,'run');assert.equal(view.segment,1);
  assert.deepEqual(view.buttons,[[445,40,23,18]],'pause control retains its gameplay hitbox');
  const cage=await send('Page.captureScreenshot',{format:'png'});
  fs.writeFileSync(path.join(out,'birdcage-and-hud.png'),Buffer.from(cage.data,'base64'));
  assert.ok(resourceResponses.some(r=>r.status===200&&decodeURIComponent(r.url).includes('birdcage-detail-v6-')),
   'a detailed birdcage state loads in the gameplay preview');

  await evaluate(`(()=>{const g=window.fleetingLife.game;g.beginSegment(2);g.time=9;g.clock=2.1;
   g.obstacles=[];g.notice='';g.noticeTime=0;g.subtitle='';g.subtitleTime=0;g.settings.reducedMotion=false;return true;})()`);
  await delay(350);
  const rain=await send('Page.captureScreenshot',{format:'png'});
  fs.writeFileSync(path.join(out,'rain-and-hud.png'),Buffer.from(rain.data,'base64'));
  await send('Emulation.setDeviceMetricsOverride',{width:852,height:393,deviceScaleFactor:1,mobile:true});
  await evaluate('window.fleetingLife.game.settings.reducedMotion=true');await delay(250);
  const reduced=await send('Page.captureScreenshot',{format:'png'});
  fs.writeFileSync(path.join(out,'rain-and-hud-mobile-reduced.png'),Buffer.from(reduced.data,'base64'));
  assert.deepEqual(errors,[]);assert.deepEqual(consoleErrors,[]);assert.deepEqual(networkErrors,[]);
  console.log(JSON.stringify({pass:true,art:resourceResponses.filter(r=>r.url.includes('birdcage-detail-v6')),screenshots:out,errors:errors.length,consoleErrors:consoleErrors.length,networkErrors:networkErrors.length}));
 }finally{await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
