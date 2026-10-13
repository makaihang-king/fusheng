'use strict';
// 在独立测试profile中真实播放；不修改媒体时钟，不使用玩家存档。
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),assert=require('node:assert/strict');
const {openBrowser,delay}=require('./browser-check.cjs');
const root=path.resolve(__dirname,'..'),qa=path.join(root,'build/qa');
const hash=p=>crypto.createHash('sha256').update(fs.readFileSync(path.join(root,p))).digest('hex');
async function main(){
 fs.mkdirSync(qa,{recursive:true});
 const browser=await openBrowser({width:960,height:540,gpu:true});
 const {send,evaluate,errors,consoleErrors,networkErrors}=browser;
 const report={startedAt:new Date().toISOString(),mode:'owned desktop Edge with hardware GPU; real outside playback',
  url:process.argv[2]||'http://127.0.0.1:4318/build/web-desktop/',
  sourceBootstrapSha256:hash('assets/scripts/Bootstrap.ts'),
  movieSha256:hash('assets/resources/video/endings/outside.mp4'),errors,consoleErrors,networkErrors,passed:false};
 try{
  await send('Emulation.setDeviceMetricsOverride',{width:960,height:540,deviceScaleFactor:1,mobile:false});
  await send('Page.navigate',{url:report.url});
  let ready=false;
  for(let i=0;i<200;i++){if(await evaluate('!!window.fleetingLife?.game&&document.fonts.status==="loaded"')){ready=true;break;}await delay(100);}
  assert.ok(ready,'Cocos game loads');
  await send('Page.bringToFront');
  await send('Input.dispatchMouseEvent',{type:'mousePressed',x:5,y:5,button:'left',clickCount:1});
  await send('Input.dispatchMouseEvent',{type:'mouseReleased',x:5,y:5,button:'left',clickCount:1});
  await evaluate('(()=>{const g=fleetingLife.game;g.toHall();g.profile.equipped="base";g.profile.equippedSlots.skin="base";g.startEnding("outside",true);})()');
  for(let i=0;i<200;i++){
   report.media=await evaluate('(()=>{const g=fleetingLife.game;return {clock:g.phaseTime,status:g.endingMediaStatus,paused:g.paused};})()');
   if(report.media.status==='failed')throw Error('Actual video playback failed');
   if(report.media.status==='playing'&&report.media.clock>=2)break;
   await delay(80);
  }
  assert.equal(report.media.status,'playing');assert.ok(report.media.clock>=2&&!report.media.paused);
  report.domAndGl=await evaluate('(()=>{const c=document.getElementById("GameCanvas"),gl=c.getContext("webgl2")||c.getContext("webgl"),ext=gl&&gl.getExtension("WEBGL_debug_renderer_info"),v=[...document.querySelectorAll("video")].find(v=>getComputedStyle(v).display!=="none"),r=v?.getBoundingClientRect();return {layout:fleetingLife.getLayout(),canvas:{width:c.width,height:c.height},video:r?{x:r.x,y:r.y,width:r.width,height:r.height,seconds:v.currentTime,transform:getComputedStyle(v).transform}:null,gl:gl?{version:gl.getParameter(gl.VERSION),vendor:gl.getParameter(gl.VENDOR),renderer:gl.getParameter(gl.RENDERER),unmaskedVendor:ext?gl.getParameter(ext.UNMASKED_VENDOR_WEBGL):null,unmaskedRenderer:ext?gl.getParameter(ext.UNMASKED_RENDERER_WEBGL):null,contextAttributes:gl.getContextAttributes()}:null};})()');
  assert.ok(report.domAndGl.gl?.unmaskedRenderer,'Actual GPU renderer is readable');
  assert.doesNotMatch(report.domAndGl.gl.unmaskedRenderer,/SwiftShader|llvmpipe|software/i,'Hardware comparison cannot use a software renderer');
  const shot=await send('Page.captureScreenshot',{format:'png'}),bytes=Buffer.from(shot.data,'base64');
  const file='build/qa/gait-revision/cocos-hardware-outside.png';
  fs.mkdirSync(path.dirname(path.join(root,file)),{recursive:true});fs.writeFileSync(path.join(root,file),bytes);
  report.screenshot={path:file,sha256:crypto.createHash('sha256').update(bytes).digest('hex')};
  for(const entries of [errors,consoleErrors,networkErrors])assert.deepEqual(entries,[]);
  report.passed=true;report.capturedAt=new Date().toISOString();
 }finally{fs.writeFileSync(path.join(qa,'cocos-gpu-film-diagnosis.json'),JSON.stringify(report,null,2));await browser.close();}
 console.log(JSON.stringify({passed:report.passed,seconds:report.media.clock,renderer:report.domAndGl.gl.unmaskedRenderer,screenshot:report.screenshot.path}));
}
main().catch(error=>{console.error(error);process.exitCode=1;});
