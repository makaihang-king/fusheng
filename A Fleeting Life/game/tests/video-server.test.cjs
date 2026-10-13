'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {createServer}=require('../scripts/serve.cjs');

test('local ending media supports byte seeks, suffix ranges, HEAD and invalid-range recovery',async()=>{
 const tmpRoot=fs.realpathSync(os.tmpdir()),fixture=fs.mkdtempSync(path.join(tmpRoot,'fleeting-video-range-'));
 fs.writeFileSync(path.join(fixture,'clip.mp4'),Buffer.from('0123456789'));
 const server=createServer(fixture);
 try{
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  const url=`http://127.0.0.1:${server.address().port}/clip.mp4`;
  const whole=await fetch(url);assert.equal(whole.status,200);assert.equal(await whole.text(),'0123456789');
  const middle=await fetch(url,{headers:{Range:'bytes=2-5'}});
  assert.equal(middle.status,206);assert.equal(middle.headers.get('content-range'),'bytes 2-5/10');assert.equal(await middle.text(),'2345');
  const suffix=await fetch(url,{headers:{Range:'bytes=-3'}});assert.equal(suffix.status,206);assert.equal(await suffix.text(),'789');
  const rest=await fetch(url,{headers:{Range:'bytes=7-'}});assert.equal(await rest.text(),'789');
  const head=await fetch(url,{method:'HEAD'});assert.equal(head.headers.get('content-length'),'10');assert.equal(await head.text(),'');
  for(const Range of ['bytes=10-','bytes=8-2','bytes=-0','bytes=0-1,3-4','bytes=-','not-a-range']){
   const invalid=await fetch(url,{headers:{Range}});assert.equal(invalid.status,416,Range);assert.equal(invalid.headers.get('content-range'),'bytes */10');
  }
  const after=await fetch(url);assert.equal(after.status,200);assert.equal(await after.text(),'0123456789');
 }finally{
  await new Promise(resolve=>server.close(resolve));
  if(path.dirname(fixture)!==tmpRoot||!/^fleeting-video-range-[A-Za-z0-9]+$/.test(path.basename(fixture)))throw Error('Unexpected QA fixture path');
  fs.rmSync(fixture,{recursive:true,force:true});
 }
});
