'use strict';
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const {Game}=require('../build/Game'),{drawGame:draw}=require('../build/Renderer');
const output=path.resolve(__dirname,'../build/qa/logic-soak.json');
const cases=[];let frames=0,renderCalls=0;
const painter={rect:finite,line:finite,circle:finite,poly(points){for(const p of points)finite(...p);},text(_t,x,y,size){finite(x,y,size);},image(_k,x,y,w,h){finite(x,y,w,h);return false;}};
function finite(...args){for(const n of args)if(typeof n==='number')assert.ok(Number.isFinite(n),'render coordinate is finite');}
function rng(seed){let x=seed>>>0;return()=>{x=(Math.imul(x,1664525)+1013904223)>>>0;return x/4294967296;};}
for(let i=0;i<32;i++){
 const seed=2026092900+i,random=rng(seed),seen=new Set(),endings=new Set();let stored=null,restarts=0;
 const g=new Game({load:()=>stored,save:s=>{JSON.parse(s);stored=s;}});
 g.start();
 for(let f=0;f<60*360;f++){
  if(g.screen==='hall'){restarts++;g.start();}
  if(random()<.035){const keys=[' ','ArrowDown','ArrowUp','e','1','2','3'],key=keys[Math.floor(random()*keys.length)];g.keyDown(key);g.keyUp(key);}
  if(random()<.0007){g.appHide();g.appShow();g.paused=false;}
  g.update(1/60);frames++;seen.add(g.phase);if(g.phase==='ending')endings.add(g.ending);
  if(f%30===0||g.phase==='ending'&&g.endingMediaStatus==='pending'){draw(g,painter);renderCalls++;}
  finite(g.time,g.phaseTime,g.y,g.vy,g.slide,g.slideRecovery,g.clock);
  assert.ok(g.slide>=0&&g.slideRecovery>=0,'posture timers never underflow');
  for(const value of Object.values(g.run.stats))assert.ok(value>=0&&value<=100,'stats stay in 0–100');
  assert.ok(g.run.lives>=0&&g.run.lives<=3,'lives stay within authored bounds');
  assert.ok(g.profile.lights.every(x=>['morning','backrow','outside','desk'].includes(x)),'only normal endings light doors');
  assert.equal(new Set(g.profile.lights).size,g.profile.lights.length,'lights never duplicate');
 }
 cases.push({seed,seconds:360,phases:[...seen],endings:[...endings],restarts,savedBytes:stored?.length||0});
}
const report={generatedAt:new Date().toISOString(),method:'32 reproducible random public keyboard input runs, fixed 60 Hz, fallback ending renderer; real media playback checked separately',frames,renderCalls,simulatedSeconds:32*360,cases,passed:true};
fs.mkdirSync(path.dirname(output),{recursive:true});fs.writeFileSync(output,JSON.stringify(report,null,2));
console.log(JSON.stringify({passed:true,seeds:cases.length,frames,simulatedSeconds:report.simulatedSeconds,output}));
