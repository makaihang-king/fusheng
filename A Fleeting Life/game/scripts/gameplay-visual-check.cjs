'use strict';
const fs=require('fs'),path=require('path'),assert=require('node:assert/strict');
const {openBrowser,delay}=require('./browser-check.cjs');
const root=path.resolve(__dirname,'..'),url=process.argv[2]||'http://127.0.0.1:4318/preview/';
const label=process.argv[3]||'after',out=path.join(root,'build/qa');

(async()=>{
  fs.mkdirSync(out,{recursive:true});
  const browser=await openBrowser({width:960,height:540});
  try{
    await browser.send('Page.navigate',{url});
    for(let i=0;i<60;i++){
      if(await browser.evaluate('!!window.fleetingLife?.game && document.fonts.status==="loaded"'))break;
      await delay(100);
    }
    assert.ok(await browser.evaluate('!!window.fleetingLife?.game'));
    const shot=async(name,setup)=>{
      await browser.evaluate('(()=>{const g=window.fleetingLife.game;g.update=()=>{};'+setup+';return true;})()');
      await delay(100);
      const png=await browser.send('Page.captureScreenshot',{format:'png'});
      fs.writeFileSync(path.join(out,'gameplay-'+label+'-'+name+'.png'),Buffer.from(png.data,'base64'));
    };
    await shot('fragment-4-14','g.start();g.beginSegment(4);g.time=14;g.phaseTime=14;g.subtitleTime=0;g.noticeTime=0');
    await shot('chairs-0','g.beginChoice(2);g.phaseTime=0;g.subtitleTime=0');
    await shot('chairs-2_5','g.phaseTime=2.5');
    await shot('chairs-4_5','g.phaseTime=4.5');
    await shot('chairs-6','g.phaseTime=5.99');
    await shot('hit','g.start();g.beginSegment(1);g.obstacles=[];g.subtitleTime=0;g.damage()');
    assert.deepEqual(browser.errors,[]);assert.deepEqual(browser.networkErrors,[]);
    console.log(JSON.stringify({label,url,shots:6,errors:browser.errors,networkErrors:browser.networkErrors}));
  }finally{await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
