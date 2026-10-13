'use strict';
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const {openBrowser,delay}=require('./browser-check.cjs');
const root=path.resolve(__dirname,'..'),out=path.join(root,'build/qa/xiaoman-fixed-rig/gameplay');
async function main(){
 fs.mkdirSync(out,{recursive:true});const browser=await openBrowser({width:960,height:540});
 try{
  await browser.send('Emulation.setDeviceMetricsOverride',{width:960,height:540,deviceScaleFactor:1,mobile:false});
  await browser.send('Page.navigate',{url:process.argv[2]||'http://127.0.0.1:4318/preview/'});
  for(let i=0;i<100;i++){if(await browser.evaluate('!!window.fleetingLife?.game'))break;await delay(100);}
  await delay(500);
  const fixtures={
   'idle':"g.phase='poem';g.sceneTime=0",
   'run':"g.sceneTime=.24",
   'jump':"g.y=30;g.jumps=1;g.sceneTime=.18",
   'slide-entry':"g.slide=.76;g.sceneTime=.04",
   'slide-low':"g.slide=.48;g.sceneTime=.32",
   'slide-release':"g.slideRecovery=.125;g.sceneTime=.9",
   'seat':"g.beginChoice(2);g.phase='seat';g.choice=2;g.seat=1;g.chairFreezeTime=1.4;g.phaseTime=.6;g.y=16",
   'bench':"g.beginSegment(5);const m=g.level.micro;g.time=m.at<=1?g.duration*m.at:m.at;g.benchSitRemaining=1;g.y=16",
   'umbrella':"g.run.items=['umbrella'];g.sceneTime=.25",
   'raincoat':"g.profile.equippedSlots.skin='raincoat';g.sceneTime=.25",
  };
  for(const [id,setup] of Object.entries(fixtures)){
   await browser.evaluate(`(()=>{const g=window.fleetingLife.game;g.update=()=>{};g.start();g.beginSegment(1);g.obstacles=[];g.pickups=[];g.run.stats={personality:50,relationship:50,will:50,appearance:50};g.profile.equippedSlots.skin='';g.run.items=[];g.hurtPulse=0;${setup};g.clearStoryDisplay();g.noticeTime=0;g.subtitleTime=0;return true})()`);
   await delay(200);const shot=await browser.send('Page.captureScreenshot',{format:'png'});
   fs.writeFileSync(path.join(out,id+'.png'),Buffer.from(shot.data,'base64'));
  }
  assert.deepEqual(browser.errors,[]);assert.deepEqual(browser.consoleErrors,[]);assert.deepEqual(browser.networkErrors,[]);
  const report={frames:Object.keys(fixtures),errors:browser.errors,consoleErrors:browser.consoleErrors,networkErrors:browser.networkErrors};
  fs.writeFileSync(path.join(out,'report.json'),JSON.stringify(report,null,2));console.log(JSON.stringify(report));
 }finally{await browser.close();}
}
main().catch(e=>{console.error(e);process.exitCode=1;});
