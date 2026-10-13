'use strict';
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),assert=require('node:assert/strict');
const {openBrowser,delay}=require('./browser-check.cjs');
const root=path.resolve(__dirname,'..'),ids=['morning','backrow','outside','desk','runaway','wall','secondGrade'];

async function main(options={}){
 const url=process.argv[2]||'http://127.0.0.1:4318/preview/',variant=new URL(url).pathname.includes('web-desktop')?'cocos':'canvas';
 const out=path.join(root,'build/qa/ending-playback-'+variant);fs.mkdirSync(out,{recursive:true});
 const browser=await openBrowser({width:960,height:540}),{send,evaluate,errors,consoleErrors,networkErrors}=browser;
 const report={url,capturedAt:new Date().toISOString(),method:'real decoded media playback; no phaseTime/currentTime seek or accelerated game update',endings:[],outfits:[],errors,consoleErrors,networkErrors};
 const read=expr=>evaluate('(()=>{const g=fleetingLife.game;return '+expr+';})()');
 const state=()=>read('({screen:g.screen,phase:g.phase,ending:g.ending,phaseTime:g.phaseTime,duration:g.duration,mediaStatus:g.endingMediaStatus,mediaEnded:g.endingMediaEnded,replay:g.replayEnding,paused:g.paused,lights:g.profile.lights.slice(),completed:{...g.profile.progress.endings},token:g.endingPlaybackToken,buttons:g.buttons.map(b=>b.label)})');
 const waitFor=async(expr,timeout=20000)=>{const until=Date.now()+timeout;while(Date.now()<until){const s=await state();if(s.mediaStatus==='failed')throw Error('Decoder/playback failure: '+JSON.stringify(s));if(await read(expr))return s;await delay(80);}throw Error('Playback wait timed out: '+expr);};
 const shot=async(name)=>{const s=await send('Page.captureScreenshot',{format:'png'}),bytes=Buffer.from(s.data,'base64'),file=path.join(out,name+'.png');fs.writeFileSync(file,bytes);return {file,sha256:crypto.createHash('sha256').update(bytes).digest('hex'),state:await state()};};
 const tap=async(label)=>{const b=await read('g.buttons.find(b=>b.label==='+JSON.stringify(label)+')');assert.ok(b,'button: '+label);const p=await evaluate('(()=>{const r=fleetingLife.getLayout().core;return {x:r.left+r.width*'+(b.x+b.w/2)+'/480,y:r.top+r.height*'+(b.y+b.h/2)+'/270};})()');await send('Input.dispatchMouseEvent',{type:'mousePressed',...p,button:'left',clickCount:1});await delay(30);await send('Input.dispatchMouseEvent',{type:'mouseReleased',...p,button:'left',clickCount:1});await delay(80);};
 const setup=code=>evaluate('(()=>{const g=fleetingLife.game;'+code+';})()');
 try{
  await send('Emulation.setDeviceMetricsOverride',{width:960,height:540,deviceScaleFactor:1,mobile:false});await send('Page.navigate',{url});
  for(let i=0;i<150;i++){if(await evaluate('!!window.fleetingLife?.game&&document.fonts.status==="loaded"'))break;await delay(100);}await send('Page.bringToFront');
  // 与玩家开始游戏相同的真实输入，允许有声媒体遵守浏览器自动播放策略。
  await send('Input.dispatchMouseEvent',{type:'mousePressed',x:5,y:5,button:'left',clickCount:1});
  await send('Input.dispatchMouseEvent',{type:'mouseReleased',x:5,y:5,button:'left',clickCount:1});
  for(const id of (options.ids||ids)){
   await setup('g.toHall();g.profile.equipped="base";g.profile.equippedSlots.skin="base";g.profile.finalePlayed=true;g.profile.lights=g.profile.lights.filter(x=>x!=='+JSON.stringify(id)+');delete g.profile.progress.endings['+JSON.stringify(id)+'];g.start();g.startEnding('+JSON.stringify(id)+')');
   const beganAt=Date.now(),first=await waitFor('g.endingMediaStatus==="playing"&&g.phaseTime>=.25');assert.equal(first.duration,14);assert.equal(first.mediaEnded,false);assert.equal(first.completed[id]||0,0);
   const early=await shot(id+'-early');assert.equal(first.buttons.includes('回到回廊'),false);
   await setup('g.finishEnding()');assert.equal((await state()).phase,'ending');
   await waitFor('g.phaseTime>=3');await tap('Ⅱ');const paused=await state();assert.equal(paused.paused,true);await delay(700);const frozen=await state();assert.ok(Math.abs(frozen.phaseTime-paused.phaseTime)<.08,'paused movie clock stays still');await tap('继续观看');
   await waitFor('g.phaseTime>=6');const middle=await shot(id+'-middle');await waitFor('g.phaseTime>=10.5');const late=await shot(id+'-late');
   assert.equal(late.state.completed[id]||0,0);assert.equal(late.state.lights.includes(id),false);assert.notEqual(early.sha256,middle.sha256);assert.notEqual(middle.sha256,late.sha256);
   await waitFor('g.endingMediaEnded&&g.phaseTime>=12');const card=await shot(id+'-card');assert.equal(card.state.completed[id]||0,0);
   await waitFor('g.screen==="hall"');const completed=await state();assert.equal(completed.completed[id],1);if(['morning','backrow','outside','desk'].includes(id))assert.equal(completed.lights.includes(id),true);
   assert.ok(Date.now()-beganAt>=13500,'first completion waits for complete real media plus card');
   const before=completed.completed[id],token=completed.token;
   await setup('g.startEnding('+JSON.stringify(id)+',true)');await waitFor('g.endingMediaStatus==="playing"&&g.phaseTime>=.25');const replay=await state();assert.ok(replay.token>token);assert.ok(replay.phaseTime<1);await tap('回到回廊');assert.equal((await state()).screen,'hall');assert.equal((await state()).completed[id],before);
   report.endings.push({id,first,paused,frozen,completed,replay,wallMilliseconds:Date.now()-beganAt,screenshots:[early,middle,late,card]});console.log('PASS real film '+id);
  }
  if(!options.ids)for(const skin of ['base','waistJacket','raincoat','namelessNotebook']){
   await setup('g.toHall();g.profile.equipped='+JSON.stringify(skin)+';g.profile.equippedSlots.skin='+JSON.stringify(skin)+';g.startEnding("morning",true)');
   await waitFor('g.endingMediaStatus==="playing"&&g.phaseTime>=2');const image=await shot('morning-'+skin);await tap('回到回廊');
   report.outfits.push({skin,screenshot:image});console.log('PASS outfit '+skin);
  }
  assert.deepEqual(errors,[]);assert.deepEqual(consoleErrors,[]);assert.deepEqual(networkErrors,[]);
 }finally{report.completedAt=new Date().toISOString();fs.writeFileSync(path.join(out,'report.json'),JSON.stringify(report,null,2));await browser.close();}
 console.log(JSON.stringify({output:out,endings:report.endings.length,outfits:report.outfits.length,errors:errors.length,consoleErrors:consoleErrors.length,networkErrors:networkErrors.length}));return report;
}
module.exports={main};if(require.main===module)main().catch(e=>{console.error(e);process.exitCode=1;});
