'use strict';
const fs=require('node:fs');
const path=require('node:path');
const assert=require('node:assert/strict');
const {openBrowser,delay}=require('./browser-check.cjs');
const root=path.resolve(__dirname,'..');
const url=process.argv[2]||'http://127.0.0.1:4318/preview/';
const label=process.argv[3]||'obstacle-visual';
if(!/^[a-z0-9-]+$/i.test(label))throw Error('Invalid QA label');
const output=path.join(root,'build/qa',label);
fs.mkdirSync(output,{recursive:true});
(async()=>{
 const browser=await openBrowser({width:960,height:540});
 try{
  const {send,evaluate,errors,consoleErrors,networkErrors}=browser;
  await send('Page.navigate',{url});
  await send('Emulation.setDeviceMetricsOverride',{width:960,height:540,deviceScaleFactor:1,mobile:false});
  for(let i=0;i<100;i++){
   if(await evaluate('!!window.fleetingLife?.game'))break;
   await delay(100);
  }
  assert.ok(await evaluate('!!window.fleetingLife?.game'),'game initializes');
  await evaluate(`(()=>{const g=window.fleetingLife.game;g.start();g.settings.muted=true;g.update=()=>{};})()`);
  const screenshots=[];
  for(const segment of [1,2,3,4,5,6,7]){
   const state=await evaluate(`(()=>{
    const g=window.fleetingLife.game;
    g.beginSegment(${segment});g.pickups=[];g.clearStoryDisplay();g.notice='';g.noticeTime=0;
    g.time=Math.max(0,g.obstacles[0].at-1);g.phaseTime=3;g.sceneTime=3;g.clock=3;
    return {theme:g.theme,time:g.time,obstacle:g.obstacles[0].label};
   })()`);
   await delay(250);
   const name=`run-${String(segment).padStart(2,'0')}-${state.theme}`;
   const screenshot=await send('Page.captureScreenshot',{format:'png'});
   fs.writeFileSync(path.join(output,name+'.png'),Buffer.from(screenshot.data,'base64'));
   screenshots.push({name,...state});
  }
  for(const branch of ['alley','playground']){
   const state=await evaluate(`(()=>{
    const g=window.fleetingLife.game;
    g.beginBranch('${branch}');g.pickups=[];g.clearStoryDisplay();g.notice='';g.noticeTime=0;
    g.time=Math.max(0,g.obstacles[0].at-1);g.phaseTime=3;g.sceneTime=3;g.clock=3;
    return {theme:g.theme,time:g.time,obstacle:g.obstacles[0].label};
   })()`);
   await delay(250);
   const name=`branch-${branch}`;
   const screenshot=await send('Page.captureScreenshot',{format:'png'});
   fs.writeFileSync(path.join(output,name+'.png'),Buffer.from(screenshot.data,'base64'));
   screenshots.push({name,...state});
  }
  assert.deepEqual(errors,[],'no browser exceptions');
  assert.deepEqual(consoleErrors,[],'no console errors');
  assert.deepEqual(networkErrors,[],'no failed network requests');
  fs.writeFileSync(path.join(output,'result.json'),JSON.stringify({pass:true,url,screenshots},null,2));
  console.log(JSON.stringify({pass:true,url,output,screenshots:screenshots.length}));
 }finally{await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
