'use strict';
// Rendering arrangements only. Traversability is verified separately by input-only game tests.
const fs=require('fs'),path=require('path'),assert=require('node:assert/strict'),{execFileSync}=require('child_process');
const root=path.resolve(__dirname,'..'),cli=process.argv[2];
assert.ok(cli&&fs.existsSync(cli),'Pass the installed agent-browser binary path as the first argument.');
const out=path.join(root,'build/qa/obstacle-sources');fs.mkdirSync(out,{recursive:true});
const run=(args,input)=>execFileSync(cli,['--session','obstacle-qa',...args],{cwd:root,windowsHide:true,input,encoding:'utf8',maxBuffer:8*1024*1024});
run(['open','http://127.0.0.1:4318/preview/']);run(['wait','500']);
const {SEGMENTS,BRANCHES}=require('../build/Content'),{obstacleAppearance}=require('../build/ObstacleLogic');
const cases=[
  ['vehicle',1,'开着的车门'],['cabinet',4,'半开的储物柜门'],['banner',7,'低下来的纪念横幅'],
  ['ball',3,'静静的皮球'],['bicycle',2,'倒下的自行车'],['satchel',1,'落在路上的书包'],
  ['step',1,'小小的台阶'],['bucket',3,'拖把桶'],['books',6,'高高的参考书'],
  ['crate',7,'装着旧书的箱子'],['bench',5,'垂下的成绩单架'],['lamp',6,'台灯的横臂'],
  ['rack',7,'合影架的横杆'],['awning','alley','屋檐下的晾衣杆'],['rubble','hell','倒塌走廊的横梁'],
  ['step-dais',3,'讲台的台阶'],['books-cushions',3,'叠起的软垫'],
  ['rack-rope',3,'架起的跳绳'],['rack-shelving',6,'书架的隔板'],
  ['rack-slide',1,'滑梯的横梁'],['crate-folded',7,'收起的课桌'],
];
// The bench specimen uses a sufficiently late encounter to keep the entire preview on the route.
cases.find(c=>c[0]==='bench')[2]='第二排椅背';
const requested=new Set(process.argv.slice(3)),report=[];
if(requested.size)for(const id of requested)assert.ok(cases.some(c=>c[0]===id),'Unknown source: '+id);
for(const [id,level,label] of cases.filter(c=>!requested.size||requested.has(c[0]))){
  const definition=level==='hell'?{at:9,kind:'high',label}:
    (typeof level==='number'?SEGMENTS[level-1]:BRANCHES[level]).obstacles.find(o=>o.label===label);
  assert.ok(definition,label);const motion=obstacleAppearance(label,definition.kind).motion;
  const initialize=`(()=>{const g=window.fleetingLife.game;g.update=()=>{};g.start();${
    typeof level==='number'?`g.beginSegment(${level})`:level==='hell'?`g.phase='hell';g.theme='hell';g.title='余烬';g.phaseTime=0;g.hellObstacles=[${JSON.stringify(definition)}]`:`g.beginBranch(${JSON.stringify(level)})`};
    const o=${level==='hell'?'g.hellObstacles[0]':`g.obstacles.find(o=>o.label===${JSON.stringify(label)})`};
    if(g.phase!=='hell')g.obstacles=[o];g.pickups=[];g.level={...g.level,micro:null,lifeAt:null};
    g.used=new Set(['life','micro','pen','plane','homework','speak','eraser','compare1','compare2','symbol','graffiti']);
    g.clearStoryDisplay();g.noticeTime=0;g.geometryDebugAllowed=true;g.debugGeometry=true;
    const initial=Math.max(0,o.at-3.3-21/72);window.obstacleVisual={o,at:o.at,time:initial,initial};g.time=initial;g.phaseTime=g.time;g.sceneTime=g.time;g.clock=g.time;g.paused=false;
    return {label:o.label,at:o.at,kind:o.kind};})()`;
  run(['eval','--stdin'],initialize);run(['wait','200']);
  run(['screenshot',path.join(out,id+'-before.png')]);
  const frames=motion==='fixed'?1:9;
  for(let i=0;i<frames;i++){
    const delta=motion==='fixed'?1.3:1.3*i/(frames-1);
    const update=`(()=>{const g=window.fleetingLife.game,s=window.obstacleVisual,target=s.initial+${delta};
      while(s.time<target-1e-8){const step=Math.min(1/60,target-s.time);s.time+=step;g.time=s.time;g.phaseTime=s.time;g.sceneTime=s.time;g.clock=s.time;
        if(g.phase==='hell')continue;g.stepRun(step,0,s.time-step);}
      g.clearStoryDisplay();g.noticeTime=0;return {time:g.time,eventElapsed:s.o.eventElapsed,cueSeen:s.o.cueSeen,done:s.o.done,error:document.getElementById('error').textContent};})()`;
    const state=run(['eval','--stdin'],update);run(['wait','100']);
    if(motion!=='fixed')run(['screenshot',path.join(out,id+'-motion-'+String(i).padStart(2,'0')+'.png')]);
    if(i===frames-1)report.push({id,level,label,motion,state:JSON.parse(state)});
  }
  run(['screenshot',path.join(out,id+'-active.png')]);
  console.log('Visual source captured: '+id+' / '+label);
}
const reportPath=path.join(out,'report.json');
const previous=requested.size&&fs.existsSync(reportPath)?JSON.parse(fs.readFileSync(reportPath,'utf8')).cases:[];
const updated=new Map([...previous,...report].map(item=>[item.id,item]));
fs.writeFileSync(reportPath,JSON.stringify({purpose:'Visual arrangements only; input-only traversal is a separate test suite.',cases:cases.map(c=>updated.get(c[0])).filter(Boolean)},null,2));
console.log('Screenshots: '+out);
