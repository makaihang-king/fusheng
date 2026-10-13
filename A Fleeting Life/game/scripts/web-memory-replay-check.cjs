'use strict';
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const assert = require('node:assert/strict');
const { openBrowser, delay } = require('./browser-check.cjs');

const root = path.resolve(__dirname, '..');
const origin = new URL(process.argv[2] || 'http://127.0.0.1:4326/').origin;
const output = path.join(root, 'build', 'qa', 'web-memory-replay-' + new URL(origin).port);
const variants = [
  { name: 'canvas', path: '/preview/', bundle: 'build/web/game.js', input: 'mouse' },
  { name: 'cocos', path: '/build/web-desktop/', bundle: 'build/web-desktop/assets/main/index.js', input: 'touch' },
];
const sha256 = bytes => crypto.createHash('sha256').update(bytes).digest('hex');

async function checkBundle(variant) {
  const local = fs.readFileSync(path.join(root, variant.bundle));
  const response = await fetch(origin + '/' + variant.bundle);
  assert.equal(response.ok, true, `${variant.name} bundle HTTP ${response.status}`);
  const served = Buffer.from(await response.arrayBuffer());
  const localHash = sha256(local), servedHash = sha256(served);
  assert.equal(servedHash, localHash, `${variant.name} HTTP serves another project's bundle`);
  for (const phrase of ['快速重跑本段', '物件的回应'])
    assert.ok(local.toString('utf8').includes(phrase), `${variant.name} bundle lacks ${phrase}`);
  return { path: variant.bundle, bytes: local.length, sha256: localHash, httpMatchesLocal: true };
}

async function runVariant(variant) {
  const browser = await openBrowser({ width: 852, height: 393 });
  const { send, evaluate, errors, consoleErrors, networkErrors } = browser;
  const result = { name: variant.name, url: origin + variant.path, input: variant.input, screenshots: {} };
  const state = () => evaluate(`(()=>{const g=window.fleetingLife?.game;return g&&{
    screen:g.screen,panel:g.panel,panelPage:g.panelPage,
    stage:g.memoryReplay?.stage||null,elapsed:g.memoryReplay?.elapsed||0,
    totalElapsed:g.memoryReplay?.totalElapsed||0,selected:g.memoryReplay?.selected||'',
    touchResponse:g.memoryReplay?.touchResponse||'',buttons:g.buttons.map(b=>b.label),
    runActive:g.run.active,error:document.querySelector('#error')?.textContent||''
  };})()`);
  const waitState = async (predicate, label, timeoutMs = 5000) => {
    const until = Date.now() + timeoutMs;
    let current;
    while (Date.now() < until) {
      current = await state();
      if (current && predicate(current)) return current;
      await delay(50);
    }
    throw Error(`${variant.name}: timed out waiting for ${label}; last=${JSON.stringify(current)}`);
  };
  const shot = async label => {
    const name = `${variant.name}-${label}.png`;
    const screenshot = await send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false });
    fs.writeFileSync(path.join(output, name), Buffer.from(screenshot.data, 'base64'));
    result.screenshots[label] = name;
  };
  const button = label => evaluate(`(()=>{const b=window.fleetingLife.game.buttons.find(b=>b.label===${JSON.stringify(label)});
    return b&&{x:b.x,y:b.y,w:b.w,h:b.h,label:b.label,disabled:!!b.disabled};})()`);
  const click = async label => {
    const b = await button(label);
    assert.ok(b, `${variant.name}: missing button ${label}`);
    assert.equal(b.disabled, false, `${variant.name}: disabled button ${label}`);
    const core = await evaluate('window.fleetingLife.getLayout().core');
    const x = core.left + (b.x + b.w / 2) * core.width / 480;
    const y = core.top + (b.y + b.h / 2) * core.height / 270;
    if (variant.input === 'touch') {
      await send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y, id: 1, radiusX: 2, radiusY: 2, force: 1 }] });
      await delay(55);
      await send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    } else {
      await send('Input.dispatchMouseEvent', { type: 'mousePressed', x, y, button: 'left', clickCount: 1, buttons: 1 });
      await delay(55);
      await send('Input.dispatchMouseEvent', { type: 'mouseReleased', x, y, button: 'left', clickCount: 1, buttons: 0 });
    }
    await delay(70);
    return { label, x: Math.round(x), y: Math.round(y) };
  };

  try {
    await send('Emulation.setDeviceMetricsOverride', { width: 852, height: 393, deviceScaleFactor: 1, mobile: true });
    await send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 1 });
    await send('Page.navigate', { url: result.url });
    await waitState(s => s.screen === 'hall', 'initial hall', 15000);
    await evaluate(`(()=>{const g=window.fleetingLife.game;
      g.profile.progress.runs=Math.max(1,g.profile.progress.runs||0);
      g.profile.progress.segments['1']={clear:true,full:false,noHit:false,noItem:false};
      g.model.save();return true;})()`);
    await send('Page.reload', { ignoreCache: true });
    const hall = await waitState(s => s.screen === 'hall' && s.buttons.includes('记忆册'), 'seeded hall', 15000);
    assert.ok(hall.buttons.includes('退出'), `${variant.name}: hall lacks exit button`);
    result.viewport = await evaluate('({width:innerWidth,height:innerHeight,devicePixelRatio})');
    assert.equal(result.viewport.width, 852);
    assert.equal(result.viewport.height, 393);
    result.hallButtons = hall.buttons;
    await shot('hall');

    result.clicks = [];
    result.clicks.push(await click('记忆册'));
    await waitState(s => s.panel === 'memoryBook' && s.buttons.includes('记忆:segment:1'), 'memory book');
    result.clicks.push(await click('记忆:segment:1'));
    const card = await waitState(s => s.panel === 'memoryBook' && s.panelPage === -1 && s.buttons.includes('快速重跑本段'), 'first segment card');
    result.cardButtons = card.buttons;
    await shot('card');
    const savedBefore = await evaluate(`localStorage.getItem('fleeting-life-s1')`);
    const runBefore = await evaluate('JSON.stringify(window.fleetingLife.game.run)');
    assert.ok(savedBefore, `${variant.name}: seed did not persist`);

    const replayStartedAt = Date.now();
    result.clicks.push(await click('快速重跑本段'));
    const object = await waitState(s => s.screen === 'memory' && s.stage === 'object', 'memory object');
    assert.equal(object.runActive, false);
    await shot('object');
    const objectButton = object.buttons.find(label => label.startsWith('触碰'));
    assert.ok(objectButton, `${variant.name}: object is not touchable`);
    result.clicks.push(await click(objectButton));
    const feedback = await waitState(s => s.stage === 'touchResponse', 'touch feedback');
    assert.ok(feedback.touchResponse.includes('帽子'), `${variant.name}: missing hat response`);
    assert.ok(!feedback.buttons.some(label => label.includes('走大路')), `${variant.name}: choice leaked into feedback`);
    result.feedback = { text: feedback.touchResponse, totalElapsed: feedback.totalElapsed, buttons: feedback.buttons };
    await shot('feedback');
    await delay(500);
    assert.equal((await state()).stage, 'touchResponse', `${variant.name}: feedback is too brief`);
    const choice = await waitState(s => s.stage === 'choice', 'choice after feedback', 3000);
    assert.ok(choice.totalElapsed >= 1.7 && choice.totalElapsed < 2.5,
      `${variant.name}: feedback duration ${choice.totalElapsed.toFixed(2)} seconds`);
    result.choice = { totalElapsed: choice.totalElapsed, buttons: choice.buttons };
    await shot('choice');

    const core = await evaluate('window.fleetingLife.getLayout().core');
    const logical = (x, y) => ({ x: core.left + x * core.width / 480,
      y: core.top + y * core.height / 270 });
    const start = logical(340, 135), end = logical(200, 135);
    if (variant.input === 'touch') {
      await send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ ...start, id: 2, radiusX: 2, radiusY: 2, force: 1 }] });
      await send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ ...end, id: 2, radiusX: 2, radiusY: 2, force: 1 }] });
      await send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    } else {
      await send('Input.dispatchMouseEvent', { type: 'mousePressed', ...start, button: 'left', clickCount: 1, buttons: 1 });
      await send('Input.dispatchMouseEvent', { type: 'mouseMoved', ...end, button: 'left', buttons: 1 });
      await send('Input.dispatchMouseEvent', { type: 'mouseReleased', ...end, button: 'left', buttons: 0 });
    }
    const blocked = await state();
    const blockedRipple = await evaluate('window.fleetingLife.game.inputRipples.at(-1)');
    assert.equal(blocked.stage, 'choice', `${variant.name}: blocked swipe changed the stage`);
    assert.equal(blocked.selected, '', `${variant.name}: blocked swipe selected a choice`);
    assert.equal(blockedRipple?.kind, 'blocked', `${variant.name}: blocked swipe gave no feedback`);
    await shot('blocked-swipe');
    result.blockedSwipe = { stage: blocked.stage, selected: blocked.selected, ripple: blockedRipple.kind };

    const choices = await evaluate(`window.fleetingLife.game.buttons
      .filter(b=>b.y>=175&&b.y<225&&!b.disabled)
      .sort((a,b)=>a.x-b.x).map(b=>b.label)`);
    assert.ok(choices.length >= 2, `${variant.name}: first segment choice buttons missing`);
    result.clicks.push(await click(choices[0]));
    const response = await waitState(s => s.stage === 'response' && s.selected === 'umbrella', 'umbrella response');
    result.response = { selected: response.selected, totalElapsed: response.totalElapsed };
    await shot('response');
    const poem = await waitState(s => s.stage === 'poem', 'poem after response', 5000);
    result.poem = { totalElapsed: poem.totalElapsed };
    await shot('poem');
    const returned = await waitState(s => s.screen === 'hall' && s.panel === 'memoryBook' && s.panelPage === -1,
      'automatic return to original card', 10000);
    assert.ok(returned.buttons.includes('快速重跑本段'));
    assert.equal(returned.runActive, false);
    result.returned = { panel: returned.panel, panelPage: returned.panelPage, buttons: returned.buttons };
    await shot('returned');
    const savedAfter = await evaluate(`localStorage.getItem('fleeting-life-s1')`);
    const runAfter = await evaluate('JSON.stringify(window.fleetingLife.game.run)');
    assert.equal(savedAfter, savedBefore, `${variant.name}: replay changed saved bytes`);
    assert.equal(runAfter, runBefore, `${variant.name}: replay changed run`);
    result.save = { bytes: Buffer.byteLength(savedBefore, 'utf8'), sha256: sha256(Buffer.from(savedBefore)), unchanged: true };
    result.replaySeconds = Math.round((Date.now() - replayStartedAt) / 10) / 100;
    assert.ok(result.replaySeconds < 20, `${variant.name}: replay exceeded 20 seconds`);
    result.errors = { runtime: errors, console: consoleErrors, network: networkErrors, overlay: returned.error };
    assert.deepEqual(result.errors, { runtime: [], console: [], network: [], overlay: '' });
    result.pass = true;
    return result;
  } catch (error) {
    await shot('failure').catch(() => {});
    result.pass = false;
    result.error = error.stack || String(error);
    result.errors = { runtime: errors, console: consoleErrors, network: networkErrors };
    return result;
  } finally {
    await browser.close();
  }
}

async function main() {
  fs.mkdirSync(output, { recursive: true });
  const report = { origin, viewport: '852x393 landscape', createdAt: new Date().toISOString(), bundles: {}, variants: [] };
  for (const variant of variants) {
    try {
      report.bundles[variant.name] = await checkBundle(variant);
      report.variants.push(await runVariant(variant));
    } catch (error) {
      report.variants.push({ name: variant.name, pass: false, error: error.stack || String(error) });
    }
  }
  const reportPath = path.join(output, 'report.json');
  fs.writeFileSync(reportPath, JSON.stringify(report, null, 2) + '\n');
  console.log(`Web memory replay QA: ${report.variants.filter(v => v.pass).length}/${variants.length} passed`);
  console.log(reportPath);
  for (const variant of report.variants) if (!variant.pass) console.error(variant.error);
  if (!report.variants.every(v => v.pass)) process.exitCode = 1;
}

main().catch(error => { console.error(error); process.exitCode = 1; });
