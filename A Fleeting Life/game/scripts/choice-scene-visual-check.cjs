'use strict';
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const {openBrowser,delay}=require('./browser-check.cjs');
const root=path.resolve(__dirname,'..');
const output=path.join(root,'build/qa/choice-scenes');
const url=process.argv[2]||'http://127.0.0.1:4318/preview/';

(async()=>{
 fs.mkdirSync(output,{recursive:true});
 const browser=await openBrowser({width:960,height:540});
 try{
  await browser.send('Page.navigate',{url});
  for(let i=0;i<160;i++){
   if(await browser.evaluate('!!window.fleetingLife?.game&&document.fonts.status==="loaded"'))break;
   await delay(100);
  }
  assert.equal(await browser.evaluate('!!window.fleetingLife?.game'),true);
  const cases=[
   {name:'school-gate',choice:1,time:0},
   {name:'school-wall',choice:1,time:4.7},
   {name:'umbrella-stand',choice:1,time:6.0},
   {name:'classroom-entry',choice:2,time:0},
   {name:'first-seat',choice:2,time:5.3},
   {name:'exam-entry',choice:3,time:0},
   {name:'exam-dissolve',choice:3,time:.45},
   {name:'exam-paper',choice:3,time:5.4},
   {name:'piano-entry',choice:4,time:0},
   {name:'piano-room',choice:4,time:5.0},
   {name:'office-entry',choice:5,time:0},
   {name:'office-bench',choice:5,time:5.4},
   {name:'office-door',choice:5,time:6.8},
   {name:'night-entry',choice:6,time:0},
   {name:'night-dissolve',choice:6,time:.45},
   {name:'old-self',choice:6,time:5.3,allLit:true},
   {name:'alley-entry',branch:'alley',time:0},
   {name:'alley-wall',branch:'alley',time:5.4},
   {name:'playground-door-entry',branch:'playground',time:19.1},
   {name:'playground-door',branch:'playground',time:24.5},
  ];
  const checks=[];
  for(const item of cases){
   const setup=item.branch==='alley'
    ?'g.start();g.beginBranch("alley");g.phase="alleyExit";g.phaseTime='+item.time+';g.duration=7.2;'
    :item.branch==='playground'
    ?'g.start();g.beginBranch("playground");g.time='+item.time+';g.phaseTime='+item.time+';'
    :'g.start();'+(item.allLit?'g.profile.lights=["morning","backrow","outside","desk"];':'')+
      'g.beginChoice('+item.choice+');g.phaseTime='+item.time+';';
   await browser.evaluate('(()=>{const g=window.fleetingLife.game;g.update=()=>{};'+setup+'g.subtitleTime=0;g.noticeTime=0;g.subtitles.clear();return true;})()');
   // The first authored plate may still be decoding after the game object exists.
   // Wait for the canvas to paint a non-background frame before capturing it.
   await delay(650);
   const png=await browser.send('Page.captureScreenshot',{format:'png'});
   const file=path.join(output,item.name+'.png');fs.writeFileSync(file,Buffer.from(png.data,'base64'));
   checks.push({name:item.name,path:path.relative(root,file).replace(/\\/g,'/'),phaseTime:item.time,bytes:fs.statSync(file).size});
  }
  assert.ok(checks.every(x=>x.bytes>5000),'screenshots must contain actual scene pixels');
  assert.deepEqual(browser.errors,[]);assert.deepEqual(browser.consoleErrors,[]);assert.deepEqual(browser.networkErrors,[]);
  const report={capturedAt:new Date().toISOString(),url,checks,errors:browser.errors,
   consoleErrors:browser.consoleErrors,networkErrors:browser.networkErrors};
  fs.writeFileSync(path.join(output,'report.json'),JSON.stringify(report,null,2));
  const cards=checks.map(item=>`<figure><a href="${item.name}.png"><img src="${item.name}.png" alt="${item.name}"></a><figcaption>${item.name} · ${item.phaseTime}s</figcaption></figure>`).join('');
  fs.writeFileSync(path.join(output,'index.html'),`<!doctype html><html lang="zh-CN"><meta charset="utf-8"><title>浮生 · 选择节点实机画面</title><style>body{margin:0;background:#17201e;color:#eee6d2;font:16px system-ui,sans-serif}header{padding:28px 4vw}h1{margin:0 0 8px;font-size:26px}p{margin:0;color:#b6c1b5}main{display:grid;grid-template-columns:repeat(auto-fit,minmax(360px,1fr));gap:18px;padding:0 4vw 40px}figure{margin:0;padding:10px;background:#26312d;border:1px solid #4f6256}img{width:100%;display:block;image-rendering:pixelated}figcaption{padding:10px 2px 2px;color:#e6d7b7;font-size:14px}</style><header><h1>浮生 · 选择节点实机画面</h1><p>入口与接触时刻 · ${checks.length} 张 · ${report.capturedAt}</p></header><main>${cards}</main></html>`);
  console.log(JSON.stringify({passed:true,scenes:checks.length,report:path.join(output,'report.json')}));
 }finally{await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
