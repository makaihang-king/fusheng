'use strict';
const fs=require('node:fs');
const path=require('node:path');
const assert=require('node:assert/strict');
const {openBrowser,delay}=require('./browser-check.cjs');

const root=path.resolve(__dirname,'..');
const url=process.argv[2]||'http://127.0.0.1:4318/preview/';
const label=process.argv[3]||'final-visual';
if(!/^[a-z0-9-]+$/i.test(label))throw Error('QA label must be alphanumeric');
const output=path.join(root,'build/qa',label);
fs.mkdirSync(output,{recursive:true});

(async()=>{
 const browser=await openBrowser({width:960,height:540});
 try{
  const {send,evaluate,errors,consoleErrors,networkErrors,resourceResponses}=browser;
  await send('Page.navigate',{url});
  await send('Emulation.setDeviceMetricsOverride',{width:960,height:540,deviceScaleFactor:1,mobile:false});
  for(let i=0;i<100;i++){
   if(await evaluate('!!window.fleetingLife?.game'))break;
   await delay(100);
  }
  assert.ok(await evaluate('!!window.fleetingLife?.game'),'game initializes');
  const shot=async(name)=>{
   await delay(250);
   const screenshot=await send('Page.captureScreenshot',{format:'png'});
   fs.writeFileSync(path.join(output,name+'.png'),Buffer.from(screenshot.data,'base64'));
  };
  await shot('00-corridor');
  const setup=async(code)=>evaluate(`(()=>{
   const g=window.fleetingLife.game;
   ${code}
   g.obstacles=[];g.pickups=[];g.notice='';g.noticeTime=0;
   g.subtitle='';g.subtitleTime=0;g.clock=4;g.sceneTime=4;
   g.settings.muted=true;g.update=()=>{};
   return {screen:g.screen,phase:g.phase,theme:g.theme,segment:g.segment,branch:g.branch};
  })()`);
  await setup('g.start();g.beginSegment(1);g.run.items=[];g.time=4;');
  const runs=[
   [1,'dawn'],[2,'rain'],[3,'noon'],[4,'gray'],[5,'dusk'],[6,'night'],[7,'graduate']
  ];
  for(const [segment,theme] of runs){
   const state=await setup(`g.beginSegment(${segment});g.time=4;`);
   assert.equal(state.theme,theme);
   await shot(`run-${String(segment).padStart(2,'0')}-${theme}`);
  }
  for(const branch of ['alley','playground']){
   const state=await setup(`g.beginBranch('${branch}');g.time=4;`);
   assert.equal(state.branch,branch);
   await shot(`branch-${branch}`);
  }
  for(const theme of ['dream','heaven','hell']){
   const state=await setup(`g.beginSegment(6);g.theme='${theme}';g.time=4;`);
   assert.equal(state.theme,theme);
   await shot(`special-${theme}`);
  }
  for(let choice=1;choice<=6;choice++){
   const state=await setup(`g.beginChoice(${choice});g.phaseTime=2;`);
   assert.equal(state.phase,'choice');
   await shot(`choice-${String(choice).padStart(2,'0')}`);
  }
  const alley=await setup("g.beginBranch('alley');g.phase='alleyExit';g.phaseTime=2;");
  assert.equal(alley.phase,'alleyExit');
  await shot('choice-alley');

  assert.deepEqual(errors,[],'no browser exceptions');
  assert.deepEqual(consoleErrors,[],'no console errors');
  assert.deepEqual(networkErrors,[],'no failed network requests');
  const loaded=resourceResponses.filter(item=>item.status===200&&/art\/pixel\/scene\//.test(decodeURIComponent(item.url)));
  assert.ok(loaded.length>=19,'scene resources loaded from the selected web build');
  const result={pass:true,url,screenshots:output,count:20,sceneResponses:loaded.length};
  fs.writeFileSync(path.join(output,'result.json'),JSON.stringify(result,null,2));
  console.log(JSON.stringify(result));
 }finally{await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
