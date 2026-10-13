const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const { openBrowser, delay } = require('./browser-check.cjs');
const output = path.resolve(__dirname, '../build/qa/corridor-transition-v4');
fs.mkdirSync(output, { recursive: true });

(async () => {
  const browser = await openBrowser({ width: 960, height: 540 });
  const { send, evaluate, errors, consoleErrors, networkErrors } = browser;
  const state = () => evaluate(`(()=>{const g=window.fleetingLife.game;return {
    screen:g.screen,phase:g.phase,t:g.corridorTransitionTime,paused:g.paused,
    y:g.y,jumps:g.run.jumps,lives:g.run.lives,door:g.corridorDoorX,
    attached:g.corridorFragments.filter(f=>!f.detached).length,
    landed:g.corridorFragments.filter(f=>f.landed).length,
    fragmentCount:g.corridorFragments.length,
    tileSizes:[...new Set(g.corridorFragments.map(f=>f.size))],
    reducedMotion:g.settings.reducedMotion,
    sourceKeys:[...new Set(g.corridorFragments.map(f=>f.sourceKey).filter(Boolean))],
    visibleFragments:g.corridorFragments.filter(f=>f.hasPixels&&f.height>0&&f.alpha>0).length,
    belowFloor:g.corridorFragments.some(f=>f.hasPixels&&f.height>0&&f.y+f.height>(f.groundY??216)+0.0001),
    skin:g.profile.equippedSlots.skin,
    buttons:g.buttons.map(b=>b.label),hidden:window.fleetingLife.getLayout().hidden
  }})()`);
  const wait = async predicate => {
    const deadline = Date.now() + 18000;
    while (Date.now() < deadline) { const current = await state(); if (predicate(current)) return current; await delay(30); }
    throw Error('corridor wait timed out: ' + JSON.stringify(await state()));
  };
  const shot = async name => {
    const result = await send('Page.captureScreenshot', { format: 'png' });
    fs.writeFileSync(path.join(output, name + '.png'), Buffer.from(result.data, 'base64'));
  };
  const tap = async label => {
    const point = await evaluate(`(()=>{const b=window.fleetingLife.game.buttons.find(b=>b.label===${JSON.stringify(label)}),r=document.getElementById('game').getBoundingClientRect();if(!b)throw Error('missing button');return {x:r.x+(b.x+b.w/2)*r.width/480,y:r.y+(b.y+b.h/2)*r.height/270}})()`);
    await send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ ...point, id: 1 }] });
    await delay(30);
    await send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    await delay(70);
  };
  try {
    await send('Emulation.setDeviceMetricsOverride', { width: 960, height: 540, deviceScaleFactor: 1, mobile: false });
    await send('Page.navigate', { url: 'http://127.0.0.1:4318/preview/' });
    for (let i = 0; i < 100; i++) {
      if (await evaluate('!!window.fleetingLife?.game && document.fonts.status === "loaded"')) break;
      await delay(100);
    }
    await delay(250);
    // This isolated browser profile never changes the user's live save.
    await evaluate(`(()=>{const g=window.fleetingLife.game;g.settings.reducedMotion=false;
      g.profile.equippedSlots.skin='whiteShirt';
      g.start();g.ending='morning';g.profile.lights.push('morning');g.toHall(true);
      g.paused=true;})()`);
    await delay(300);
    await evaluate(`(()=>{
      const canvas=document.getElementById('game'),stream=canvas.captureStream(30);
      const mime=['video/webm;codecs=vp9','video/webm'].find(m=>MediaRecorder.isTypeSupported(m));
      const recorder=new MediaRecorder(stream,{mimeType:mime,videoBitsPerSecond:1800000}),parts=[];
      window.__corridorRecorder=recorder;window.__corridorRecording=new Promise(resolve=>{
        recorder.ondataavailable=e=>{if(e.data.size)parts.push(e.data)};
        recorder.onstop=()=>{for(const track of stream.getTracks())track.stop();const reader=new FileReader();
          reader.onload=()=>resolve(reader.result.split(',')[1]);reader.readAsDataURL(new Blob(parts,{type:mime}));};
      });recorder.start();window.fleetingLife.game.paused=false;
    })()`);
    const samples = [];
    for (const [seconds, name] of [[.3,'01-door'],[1.5,'02-walk'],[2.3,'03-before-shedding'],[3.5,'04-fragments'],[4.8,'05-late-fragments'],[6.9,'06-ground']]) {
      const current = await wait(s => s.phase === 'corridorTransition' && s.t >= seconds);
      assert.equal(current.belowFloor, false);
      assert.equal(current.y, 0);
      assert.deepEqual(current.buttons, ['暂停']);
      if (name === '01-door') assert.equal(current.skin, 'whiteShirt');
      samples.push(current); await shot(name);
    }
    const finished = await wait(s => s.screen === 'hall');
    assert.equal(finished.attached, 0); assert.equal(finished.landed, 0);
    await shot('07-invisible-player-hall'); await delay(250);
    await evaluate('window.__corridorRecorder.stop()');
    const recording = await evaluate('window.__corridorRecording');
    fs.writeFileSync(path.join(output, 'corridor-transition.webm'), Buffer.from(recording, 'base64'));

    await send('Emulation.setDeviceMetricsOverride', { width: 852, height: 393, deviceScaleFactor: 1, mobile: true });
    await send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 1 });
    await evaluate(`(()=>{const g=window.fleetingLife.game;g.profile.equippedSlots.skin='raincoat';
      g.start();g.run.stats={personality:100,relationship:50,will:50,appearance:50};
      g.ending='desk';g.toHall(true);})()`);
    await wait(s => s.t >= 3.4);
    const raincoatSample = await state();
    assert.equal(raincoatSample.skin, 'raincoat');
    assert.equal(raincoatSample.belowFloor, false);
    assert.ok(raincoatSample.sourceKeys.some(key => key.includes('.variant.rebel.run.')),
      'raincoat fragments use the selected stat variant');
    await shot('08-raincoat-mobile');
    await tap('暂停');
    const paused = await state(); assert.equal(paused.paused, true);
    await delay(350); assert.equal((await state()).t, paused.t);
    await shot('09-touch-pause');
    await tap('继续回到回廊');
    assert.equal((await state()).paused, false);
    await evaluate('window.dispatchEvent(new Event("blur"))');
    const hidden = await state(); assert.equal(hidden.paused, true);
    await evaluate('window.dispatchEvent(new Event("focus"))');
    await delay(100); assert.equal((await state()).paused, true);
    await tap('继续回到回廊');
    await wait(s => s.screen === 'hall');
    await shot('10-mobile-hall');

    const reducedMotionStart = await evaluate(`(()=>{const g=window.fleetingLife.game;g.settings.reducedMotion=true;
      g.start();g.ending='morning';g.profile.lights.push('morning');g.toHall(true);
      return {screen:g.screen,phase:g.phase,fragmentCount:g.corridorFragments.length,
        tileSizes:[...new Set(g.corridorFragments.map(f=>f.size))],reducedMotion:g.settings.reducedMotion};})()`);
    assert.equal(reducedMotionStart.fragmentCount, 18, JSON.stringify(reducedMotionStart));
    const reducedMotionSample = await wait(s => s.phase === 'corridorTransition' && s.t >= 3.5);
    assert.equal(reducedMotionSample.fragmentCount, 18);
    assert.deepEqual(reducedMotionSample.tileSizes, [8]);
    assert.equal(reducedMotionSample.belowFloor, false);
    assert.ok(reducedMotionSample.attached < 18, 'reduced-motion tiles visibly detach during the sampled phase');
    await shot('11-reduced-motion-fragments');
    const reducedMotionFinished = await wait(s => s.screen === 'hall');
    assert.equal(reducedMotionFinished.fragmentCount, 0, 'the transition releases its tiles after reaching the hall');
    assert.equal(reducedMotionFinished.belowFloor, false);
    await shot('12-reduced-motion-hall');

    assert.deepEqual(errors, []); assert.deepEqual(consoleErrors, []); assert.deepEqual(networkErrors, []);
    const report = { generatedAt: new Date().toISOString(), samples, finished,
      appearances: {
        normal: { skin: samples[0].skin, screenshot: '01-door.png', sample: samples[0] },
        raincoat: { skin: raincoatSample.skin, screenshot: '08-raincoat-mobile.png', sample: raincoatSample }
      },
      mobileTouchPause: true, hiddenRequiresResume: true,
      reducedMotion: { enabled: true, sample: reducedMotionSample, finished: reducedMotionFinished,
        start: reducedMotionStart,
        sampleScreenshot: '11-reduced-motion-fragments.png', finishedScreenshot: '12-reduced-motion-hall.png',
        expectedFragmentCount: 18, expectedTileSize: 8 },
      errors, consoleErrors, networkErrors, recording: 'corridor-transition.webm' };
    fs.writeFileSync(path.join(output, 'report.json'), JSON.stringify(report, null, 2));
    console.log(JSON.stringify(report));
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
