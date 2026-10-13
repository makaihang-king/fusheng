'use strict';
// Fixture arrangement captures: real prepared obstacle time, not a claim of natural traversal.
const fs=require('fs'),path=require('path'),assert=require('node:assert/strict');
const {openBrowser,delay}=require('./browser-check.cjs');
const root=path.resolve(__dirname,'..'),out=path.join(root,'build/qa/obstacle-qwen-v2/gameplay');
const {SEGMENTS,BRANCHES}=require('../build/Content');
const {obstacleAppearance}=require('../build/ObstacleLogic');
const {obstacleArtwork}=require('../build/ObstacleRendering');
const cases=[['vehicle',1,'开着的车门'],['cabinet',4,'半开的储物柜门'],['banner',7,'低下来的纪念横幅'],
 ['ball',3,'静静的皮球'],['bicycle',2,'倒下的自行车'],['satchel',1,'落在路上的书包'],
 ['step',1,'小小的台阶'],['bucket',3,'拖把桶'],['books',6,'高高的参考书'],['crate',7,'装着旧书的箱子'],
 ['bench',5,'第二排椅背'],['lamp',6,'台灯的横臂'],['rack',7,'合影架的横杆'],
 ['awning','alley','屋檐下的晾衣杆'],['rubble','hell','倒塌走廊的横梁'],['step-dais',3,'讲台的台阶'],
 ['books-cushions',3,'叠起的软垫'],['rack-rope',3,'架起的跳绳'],['rack-shelving',6,'书架的隔板'],
 ['rack-slide',1,'滑梯的横梁'],['crate-folded',7,'收起的课桌'],
 ['football','playground','静止的足球'],['bucket-broom',4,'扫帚与簸箕'],['books-open',6,'摊开的字典'],
 ['books-low',6,'第一摞书'],['crate-paper',4,'办公桌旁的纸箱'],['crate-low','alley','空木箱'],
 ['brick','alley','垫在地上的砖'],['bench-low',4,'倒下的椅子'],['rack-cloth',3,'晾着的抹布架'],
 ['rack-tray',5,'横着的茶水托盘'],['rack-hurdle','playground','第一道跨栏'],['rack-mat','playground','架起的体操垫'],
 ['rubble-low','hell','断砖']];
async function main(){
 fs.mkdirSync(out,{recursive:true});const selected=new Set(process.argv.slice(2));
 for(const id of selected)assert.ok(cases.some(c=>c[0]===id),'Unknown fixture '+id);
 const browser=await openBrowser({width:960,height:540}),report=[];
 try{
  await browser.send('Page.navigate',{url:'http://127.0.0.1:4318/preview/'});
  for(let i=0;i<150;i++){if(await browser.evaluate('!!window.fleetingLife?.game'))break;await delay(100);}
  await browser.send('Emulation.setDeviceMetricsOverride',{width:960,height:540,deviceScaleFactor:1,mobile:false});
  await browser.evaluate(`(()=>{const original=CanvasRenderingContext2D.prototype.drawImage;window.qwenImageProof=[];
   CanvasRenderingContext2D.prototype.drawImage=function(...args){const src=args[0]?.src||'';if(src.includes('/qwen-v2/'))window.qwenImageProof.push(src);return original.apply(this,args);};})()`);
  // Capture the composited browser surface. The preview's backdrop canvas can
  // be mistaken for the game canvas when selected with a CSS ID fallback.
  const capture=async name=>{
   await delay(150);
   const shot=await browser.send('Page.captureScreenshot',{format:'png',fromSurface:true});
   fs.writeFileSync(path.join(out,name+'.png'),Buffer.from(shot.data,'base64'));
  };
  for(const [id,level,label] of cases.filter(c=>!selected.size||selected.has(c[0]))){
   const definition=level==='hell'?{at:9,kind:id==='rubble-low'?'low':'high',label}:
    (typeof level==='number'?SEGMENTS[level-1]:BRANCHES[level]).obstacles.find(o=>o.label===label);
   assert.ok(definition,label);const appearance=obstacleAppearance(label,definition.kind),model=obstacleArtwork(definition);
   const setup=await browser.evaluate(`(()=>{const g=window.fleetingLife.game;g.update=()=>{};g.start();${typeof level==='number'?`g.beginSegment(${level})`:level==='hell'?`g.phase='hell';g.theme='hell';g.title='余烬';g.phaseTime=0;g.hellObstacles=[${JSON.stringify(definition)}]`:`g.beginBranch(${JSON.stringify(level)})`};
     const o=${level==='hell'?'g.hellObstacles[0]':`g.obstacles.find(o=>o.label===${JSON.stringify(label)})`};if(g.phase!=='hell')g.obstacles=[o];
     g.pickups=[];g.level={...g.level,micro:null,lifeAt:null};g.used=new Set(['life','micro','pen','plane','homework','speak','eraser','compare1','compare2','symbol','graffiti']);
     g.clearStoryDisplay();g.noticeTime=0;g.geometryDebugAllowed=true;g.debugGeometry=true;const initial=Math.max(0,o.at-3.3-21/72);
     window.obstacleVisual={o,time:initial,initial};g.time=initial;g.phaseTime=initial;g.sceneTime=initial;g.clock=initial;g.paused=false;return {label:o.label,at:o.at,kind:o.kind};})()`);
   await delay(300);await browser.evaluate('window.qwenImageProof=[]');await delay(80);await capture(id+'-before');
   const beforeProof=await browser.evaluate('[...new Set(window.qwenImageProof)]');
   const frames=appearance.motion==='fixed'?1:9;
   let state;
   for(let i=0;i<frames;i++){
    const delta=appearance.motion==='fixed'?1.3:1.3*i/(frames-1);
    state=await browser.evaluate(`(()=>{const g=window.fleetingLife.game,s=window.obstacleVisual,target=s.initial+${delta};
      while(s.time<target-1e-8){const dt=Math.min(1/60,target-s.time);s.time+=dt;g.time=s.time;g.phaseTime=s.time;g.sceneTime=s.time;g.clock=s.time;
        if(g.phase!=='hell')g.stepRun(dt,0,s.time-dt);}
      g.clearStoryDisplay();g.noticeTime=0;window.qwenImageProof=[];return {time:g.time,eventElapsed:s.o.eventElapsed,cueSeen:s.o.cueSeen,error:document.getElementById('error').textContent};})()`);
    await delay(100);if(appearance.motion!=='fixed')await capture(id+'-motion-'+String(i).padStart(2,'0'));
   }
   await capture(id+'-active');const activeProof=await browser.evaluate('[...new Set(window.qwenImageProof)]');
   const expected=appearance.source==='vehicle'?['vehicle_body','vehicle_door']:appearance.source==='cabinet'?['cabinet_body','cabinet_door']:appearance.source==='banner'?['banner_frame','banner_cloth']:[model.id,...(model.face?[model.face]:[])].map(id=>id.replaceAll('.','_'));
   if(appearance.source==='step'&&!/讲台/.test(label))expected.push('step_wall','face_stone');
   for(const name of expected)assert.ok(activeProof.some(src=>new URL(src).pathname.endsWith('/'+name+'.png')),'No actual Qwen drawImage for '+id+': '+name);
   assert.equal(state.error,'');report.push({id,level,label,motion:appearance.motion,setup,state,beforeProof,activeProof,expected});
   console.log('Captured actual Qwen gameplay: '+id);
  }
  assert.deepEqual(browser.errors,[]);assert.deepEqual(browser.consoleErrors,[]);assert.deepEqual(browser.networkErrors,[]);
  const file=path.join(out,'report.json'),prior=selected.size&&fs.existsSync(file)?JSON.parse(fs.readFileSync(file,'utf8')).cases:[];
  const merged=new Map([...prior,...report].map(r=>[r.id,r]));
  fs.writeFileSync(file,JSON.stringify({createdUtc:new Date().toISOString(),purpose:'Actual Canvas rendering with prepared fixture time; input traversal is verified separately.',
   sourceShader:'Qwen v2 new assets; drawImage URL proof per specimen',cases:cases.map(c=>merged.get(c[0])).filter(Boolean),
   errors:browser.errors,consoleErrors:browser.consoleErrors,networkErrors:browser.networkErrors},null,2));
 }finally{await browser.close();}
}
main().catch(e=>{console.error(e);process.exitCode=1;});
