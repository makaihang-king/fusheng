'use strict';
const fs=require('node:fs');
const path=require('node:path');
const assert=require('node:assert/strict');
const {openBrowser,delay}=require('./browser-check.cjs');

const root=path.resolve(__dirname,'..');
const url=process.argv[2]||'http://127.0.0.1:4318/preview/';
const output=path.join(root,'build/qa/motion-visual');
fs.mkdirSync(output,{recursive:true});

(async()=>{
 const browser=await openBrowser({width:960,height:540});
 const observations=[];
 try{
  const {send,evaluate,errors,consoleErrors,networkErrors}=browser;
  await send('Page.navigate',{url});
  await send('Emulation.setDeviceMetricsOverride',{width:960,height:540,deviceScaleFactor:1,mobile:false});
  for(let i=0;i<100;i++){
   if(await evaluate('!!window.fleetingLife?.game'))break;
   await delay(100);
  }
  assert.ok(await evaluate('!!window.fleetingLife?.game'),'game initializes');
  await evaluate(`(()=>{
   const g=window.fleetingLife.game;
   g.start();g.beginSegment(1);g.time=4;g.obstacles=[];g.pickups=[];
   g.settings.muted=true;g.notice='';g.noticeTime=0;
   g.subtitle='';g.subtitleTime=0;g.clearStoryDisplay();
   g.__qaAdvance=g.update.bind(g);g.update=()=>{};
  })()`);
  await delay(400);
  const shot=async(name,state)=>{
   await delay(35);
   const screenshot=await send('Page.captureScreenshot',{format:'png'});
   fs.writeFileSync(path.join(output,name+'.png'),Buffer.from(screenshot.data,'base64'));
   observations.push({name,...state});
  };
  const step=()=>evaluate(`(()=>{const g=window.fleetingLife.game;g.__qaAdvance(1/60);return {y:g.y,vy:g.vy,time:g.time,phase:g.phase,phaseTime:g.phaseTime};})()`);
  await shot('00-run',await evaluate('({y:window.fleetingLife.game.y,time:window.fleetingLife.game.time})'));
  await evaluate('window.fleetingLife.game.jump()');
  let airborne=false,descending=false,landed=false;
  for(let i=1;i<=80;i++){
   const state=await step();
   if(state.y>1)airborne=true;
   if(i===1||i===16||i===23)await shot('jump-'+String(i).padStart(2,'0'),state);
   if(airborne&&!descending&&state.y<12&&state.vy<0){
    descending=true;await shot('jump-descend',state);
   }
   if(airborne&&state.y<=1){
    landed=true;await shot('land-00',state);
    for(let j=1;j<=8;j++)await shot('land-'+String(j).padStart(2,'0'),await step());
    break;
   }
  }
  assert.ok(landed,'jump lands on the moving road');
  await evaluate(`(()=>{const g=window.fleetingLife.game;g.beginChoice(2);g.phaseTime=0;g.sceneTime=0;g.obstacles=[];g.pickups=[];g.clearStoryDisplay();})()`);
  await shot('choice-00',await evaluate('({phase:window.fleetingLife.game.phase,phaseTime:window.fleetingLife.game.phaseTime})'));
  for(let i=1;i<=12;i++){
   const state=await step();
   if([3,6,9,12].includes(i))await shot('choice-'+String(i).padStart(2,'0'),state);
  }
  assert.deepEqual(errors,[],'no browser exceptions');
  assert.deepEqual(consoleErrors,[],'no console errors');
  assert.deepEqual(networkErrors,[],'no network errors');
  fs.writeFileSync(path.join(output,'observations.json'),JSON.stringify({pass:true,url,observations},null,2));
  console.log(JSON.stringify({pass:true,url,output,frames:observations.length,landed}));
 }finally{await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
