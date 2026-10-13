'use strict';
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),assert=require('node:assert/strict');
const {openBrowser,delay}=require('./browser-check.cjs');
const root=path.resolve(__dirname,'..'),out=path.join(root,'build/qa/gait-revision/canvas-motion');
const instrumentation=`(()=>{
 let value;Object.defineProperty(window,'fleetingLife',{configurable:true,get(){return value},set(v){
  value=v;const g=v.game,p=v.painter,original=g.render.bind(g),image=p.image.bind(p),rect=p.rect.bind(p);
  window.characterMotionSamples=[];let current=null,last=0;
  p.image=(key,x,y,w,h,opacity)=>{const loaded=image(key,x,y,w,h,opacity);if(current&&key.startsWith('character.'))current.images.push({key,x,y,w,h,loaded});return loaded};
  p.rect=(...args)=>{if(current)current.rects++;return rect(...args)};
  g.render=(paint)=>{const now=performance.now();current={at:now,delta:last?now-last:0,time:g.sceneTime,y:g.y,vy:g.vy,jumps:g.jumps,slide:g.slide,recovery:g.slideRecovery,images:[],rects:0};last=now;original(paint);current.fallback=!current.images.some(i=>i.loaded);window.characterMotionSamples.push(current);current=null};
  g.start();g.beginSegment(1);g.obstacles=[];g.pickups=[];g.run.stats={personality:50,relationship:50,will:50,appearance:50};g.clearStoryDisplay();g.noticeTime=0;
 }});
})()`;
async function main(){
 fs.mkdirSync(out,{recursive:true});const b=await openBrowser({width:960,height:540});
 try{
  await b.send('Emulation.setDeviceMetricsOverride',{width:960,height:540,deviceScaleFactor:1,mobile:false});
  await b.send('Page.addScriptToEvaluateOnNewDocument',{source:instrumentation});
  await b.send('Page.navigate',{url:process.argv[2]||'http://127.0.0.1:4318/preview/'});
  for(let i=0;i<100;i++){if(await b.evaluate('!!window.fleetingLife?.game&&characterMotionSamples.length>0'))break;await delay(20);}
  const shot=async(id)=>{const r=await b.send('Page.captureScreenshot',{format:'png'});fs.writeFileSync(path.join(out,id+'.png'),Buffer.from(r.data,'base64'))};
  const key=async(value)=>{await b.send('Input.dispatchKeyEvent',{type:'keyDown',key:value,code:value});await delay(20);await b.send('Input.dispatchKeyEvent',{type:'keyUp',key:value,code:value})};
  await delay(130);await shot('01-run');await key('ArrowUp');await delay(130);await shot('02-jump');
  await key('ArrowUp');await delay(100);await shot('03-double-jump');await key('ArrowDown');await delay(50);await shot('04-dive');
  await delay(240);await shot('05-land');await delay(140);await key('ArrowDown');await delay(190);await shot('06-slide');
  await delay(620);await shot('07-recovery');await delay(260);await shot('08-run-after');
  const samples=await b.evaluate('characterMotionSamples');
  const poses=new Set(samples.flatMap(s=>s.images.filter(i=>i.loaded).map(i=>i.key.split('.')[2])));
  for(const pose of ['run','jump','doubleJump','dive','land','slide','slideRecovery'])assert.ok(poses.has(pose),'actual keyboard sequence missed '+pose);
  const loaded=samples.flatMap(s=>s.images.filter(i=>i.loaded));
  assert.ok(loaded.length>20);assert.ok(loaded.every(i=>i.w===48&&i.h===48),'every live action stays at the same 48px scale');
  assert.ok(loaded.every(i=>i.key.startsWith('character.pixel.')),'cold playback cannot revert to a legacy character');
  assert.ok(samples.filter(s=>s.fallback).every(s=>s.rects>100),'missing textures must draw the same source rig instead of blank');
  assert.deepEqual(b.errors,[]);assert.deepEqual(b.consoleErrors,[]);assert.deepEqual(b.networkErrors,[]);
  const deltas=samples.slice(1).map(s=>s.delta).sort((a,b)=>a-b);
  const sourceHashes=Object.fromEntries(['assets/scripts/Renderer.ts','assets/scripts/Game.ts','assets/scripts/Content.ts','preview/host.js','scripts/xiaoman_rig.py'].map(file=>[file,crypto.createHash('sha256').update(fs.readFileSync(path.join(root,file))).digest('hex')]));
  const report={capturedAt:new Date().toISOString(),sourceHashes,scope:'Owned cold-load Canvas; fixtures remove hazards only, real keyboard inputs and real game update/render throughout; no accelerated clocks.',realKeyboardInput:true,frames:samples.length,poses:[...poses],fixedScale:[48,48],sameSourceFallbackFrames:samples.filter(s=>s.fallback).length,
   frameIntervalsMs:{median:deltas[Math.floor(deltas.length*.5)],p95:deltas[Math.floor(deltas.length*.95)],max:Math.max(...deltas),over50:deltas.filter(v=>v>50).length,over100:deltas.filter(v=>v>100).length},errors:b.errors,consoleErrors:b.consoleErrors,networkErrors:b.networkErrors};
  fs.writeFileSync(path.join(out,'report.json'),JSON.stringify({...report,samples},null,2));console.log(JSON.stringify(report));
 }finally{await b.close();}
}
main().catch(e=>{console.error(e);process.exitCode=1});
