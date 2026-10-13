const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const { openBrowser, delay } = require('./browser-check.cjs');

const root = path.resolve(__dirname, '..');
const url = process.argv[2] || 'http://127.0.0.1:4318/preview/';
const cocos = new URL(url).pathname.includes('/build/web-desktop/');
const key = cocos ? 'fleeting-life-cocos-moments-v2' : 'fleeting-life-s1-moments-v2';
const out = path.join(root, 'build', 'qa');
fs.mkdirSync(out, { recursive: true });

async function main() {
  const browser = await openBrowser({ width: 960, height: 540 });
  const { send, evaluate, errors, consoleErrors, networkErrors } = browser;
  try {
    await send('Page.navigate', { url });
    for (let i = 0; i < 100; i++) {
      if (await evaluate('!!window.fleetingLife?.game')) break;
      await delay(100);
    }
    assert.equal(await evaluate('!!window.fleetingLife?.game'), true);
    await evaluate('window.fleetingLife.game.start();window.fleetingLife.game.beginSegment(1);window.fleetingLife.game.obstacles=[];window.fleetingLife.game.run.invincible=999');
    await delay(2300);
    await evaluate('window.fleetingLife.game.capture("death")');
    await delay(150);
    await evaluate('window.fleetingLife.game.capture("hidden")');
    let index;
    for (let i = 0; i < 90; i++) {
      await delay(200);
      index = await evaluate(`JSON.parse(localStorage.getItem(${JSON.stringify(key)})||'{}')`);
      if (index.candidates?.length) break;
    }
    if (!index.candidates?.length) {
      const state = await evaluate('(()=>{const m=window.fleetingLife.moments,c=m.encodeControl;return {mime:m.mime,db:!!m.db,clock:m.clock,ring:m.ring.length,pending:!!m.pending,queue:m.queue.length,encoding:m.encoding,memories:m.memories.length,control:c&&{state:c.recorder.state,started:c.started,pauseAt:c.pauseAt,timer:c.timer,elapsed:performance.now()-c.started},suspended:m.suspended};})()');
      console.error('Moment debug', { index, state, errors, consoleErrors, networkErrors });
    }
    assert.equal(index.candidates?.length, 1, 'a video candidate must persist');
    const candidate = index.candidates[0];
    assert.equal(candidate.kind, 'hidden', 'overlapping hidden event must replace a lower-priority death event');
    assert.ok(['webm', 'mp4'].includes(candidate.format));
    assert.ok(candidate.durationMs >= 2500 && candidate.durationMs <= 3100, 'pre/post event duration');

    const result = await evaluate(`(async()=>{
      const id=${JSON.stringify(candidate.id)};
      const db=await new Promise((resolve,reject)=>{const r=indexedDB.open('fleeting-life-video-moments',1);r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error);});
      const blob=await new Promise((resolve,reject)=>{const r=db.transaction('clips','readonly').objectStore('clips').get(id);r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error);});
      if(!(blob instanceof Blob))throw Error('missing IndexedDB video Blob');
      const objectUrl=URL.createObjectURL(blob),video=document.createElement('video');video.muted=true;video.src=objectUrl;
      await Promise.race([new Promise((resolve,reject)=>{video.onloadedmetadata=resolve;video.onerror=()=>reject(Error('video decode failed'));}),new Promise((_,reject)=>setTimeout(()=>reject(Error('video metadata timeout')),5000))]);
      video.currentTime=1;
      await Promise.race([new Promise((resolve,reject)=>{video.onseeked=resolve;video.onerror=()=>reject(Error('video seek failed'));}),new Promise((_,reject)=>setTimeout(()=>reject(Error('video seek timeout')),5000))]);
      const file=await new Promise((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(reader.result);reader.onerror=()=>reject(reader.error);reader.readAsDataURL(blob);});
      const info={size:blob.size,mime:blob.type,width:video.videoWidth,height:video.videoHeight,duration:video.duration,seekTime:video.currentTime,file};
      URL.revokeObjectURL(objectUrl);db.close();return info;
    })()`);
    assert.equal(result.width, 480);
    assert.equal(result.height, 270);
    assert.ok(result.size > 1000);
    assert.ok(result.seekTime >= .8 && result.seekTime <= 1.2);
    const ext = candidate.format;
    const samplePath = path.join(out, cocos ? `cocos-moment.${ext}` : `preview-moment.${ext}`);
    fs.writeFileSync(samplePath, Buffer.from(result.file.split(',')[1], 'base64'));
    delete result.file;

    await send('Page.reload', { ignoreCache: true });
    for (let i = 0; i < 100; i++) {
      if (await evaluate('!!window.fleetingLife?.game')) break;
      await delay(100);
    }
    await evaluate('window.fleetingLife.moments.ready');
    const persisted = await evaluate('window.fleetingLife.moments.memories.map(x=>({id:x.id,format:x.format}))');
    assert.equal(persisted.some(value => value.id === candidate.id && value.format === candidate.format), true);
    await evaluate('window.fleetingLife.game.hooks.replay(true)');
    await delay(600);
    const replay = await evaluate('({video:[...document.querySelectorAll("video")].find(x=>getComputedStyle(x).display!=="none")?.currentTime,visible:[...document.querySelectorAll("video")].some(x=>getComputedStyle(x).display!=="none")})');
    assert.equal(replay.visible, true, 'finale must use a video element');
    await evaluate('window.fleetingLife.game.hooks.replay(false)');
    const legacyKey = cocos ? 'fleeting-life-cocos-moments' : 'fleeting-life-s1-moments';
    await evaluate(`(()=>{const c=document.createElement('canvas');c.width=480;c.height=270;c.getContext('2d').fillRect(0,0,480,270);
      const frame=c.toDataURL('image/jpeg',.5);localStorage.setItem(${JSON.stringify(legacyKey)},JSON.stringify([{kind:'death',priority:2,time:1,frames:[frame,frame]}]));
      localStorage.removeItem(${JSON.stringify(key)});})()`);
    await send('Page.reload', { ignoreCache: true });
    for (let i = 0; i < 100; i++) {
      if (await evaluate('!!window.fleetingLife?.game')) break;
      await delay(100);
    }
    await evaluate('window.fleetingLife.moments.ready');
    const legacy = await evaluate('window.fleetingLife.moments.memories.map(x=>({format:x.format,frames:x.frames?.length||0}))');
    assert.deepEqual(legacy, [{ format: 'legacy-frames', frames: 2 }]);
    await evaluate('window.fleetingLife.game.hooks.replay(true)');
    await delay(200);
    assert.equal(await evaluate('!!window.fleetingLife.moments.oldCanvas&&getComputedStyle(window.fleetingLife.moments.oldCanvas).display!=="none"'), true);
    await evaluate('window.fleetingLife.game.hooks.replay(false)');
    assert.deepEqual(errors, []);
    assert.deepEqual(consoleErrors, []);
    assert.deepEqual(networkErrors, []);
    const report = { candidate, samplePath, media: result, persisted, replay, legacy, errors, consoleErrors, networkErrors };
    fs.writeFileSync(path.join(out, cocos ? 'cocos-video-moments.json' : 'preview-video-moments.json'), JSON.stringify(report, null, 2));
    console.log(JSON.stringify(report, null, 2));
  } finally { await browser.close(); }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
