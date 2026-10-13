'use strict';
// Technical QA only: observes real browser audio and the live controller. No listening claims.
const fs = require('fs'), path = require('path'), assert = require('node:assert/strict');
const { openBrowser, delay } = require('./browser-check.cjs');
const root = path.resolve(__dirname, '..');
const output = path.join(root, 'build/qa/bgm-runtime');
const url = process.argv[2] || 'http://127.0.0.1:4318/preview/';

const observeAudio = `(() => {
  const q = window.__bgmQa = { contexts: [], decoded: [], starts: [], stops: [], voices: [], fetches: [] };
  const bytesIds = new WeakMap(), bufferIds = new WeakMap();
  const originalFetch = window.fetch;
  window.fetch = async function(...args) {
    const response = await originalFetch.apply(this, args);
    const requested = String(args[0]?.url || args[0]);
    const match = requested.match(/\\/audio\\/bgm\\/([^/?]+)\\.ogg(?:[?#]|$)/);
    if (match) {
      q.fetches.push({ id: match[1], url: response.url, status: response.status });
      const originalArrayBuffer = response.arrayBuffer.bind(response);
      response.arrayBuffer = async () => { const bytes = await originalArrayBuffer(); bytesIds.set(bytes, match[1]); return bytes; };
    }
    return response;
  };
  const NativeContext = window.AudioContext || window.webkitAudioContext;
  class ObservedContext extends NativeContext {
    constructor(...args) { super(...args); this.__qaIndex = q.contexts.length; q.contexts.push(this); }
    decodeAudioData(bytes, ...args) {
      const id = bytesIds.get(bytes);
      return super.decodeAudioData(bytes, ...args).then(buffer => {
        if (id) { bufferIds.set(buffer, id); q.decoded.push({ id, duration: buffer.duration, sampleRate: buffer.sampleRate, channels: buffer.numberOfChannels, context: this.__qaIndex }); }
        return buffer;
      });
    }
    createBufferSource() {
      const source = super.createBufferSource(), context = this;
      const originalStart = source.start.bind(source), originalStop = source.stop.bind(source), originalConnect = source.connect.bind(source);
      let connectedGain;
      source.connect = function(destination, ...args) { if (destination instanceof GainNode) connectedGain = destination; return originalConnect(destination, ...args); };
      source.start = function(...args) {
        const id = bufferIds.get(source.buffer);
        if (id) q.starts.push({ id, context: context.__qaIndex, contextState: context.state, at: context.currentTime, loop: source.loop, args, source, gain: connectedGain });
        return originalStart(...args);
      };
      source.stop = function(...args) { const id = bufferIds.get(source.buffer); if (id) q.stops.push({ id, at: context.currentTime, args }); return originalStop(...args); };
      return source;
    }
  }
  window.AudioContext = ObservedContext;
  if (window.webkitAudioContext) window.webkitAudioContext = ObservedContext;
})();`;

const snapshotExpression = `(() => {
  const m = window.fleetingLife.music, q = window.__bgmQa;
  return {
    wall: performance.now(), currentId: m.currentId, targetId: m.targetId, suspended: m.isSuspended,
    screen: window.game.screen, phase: window.game.phase, segment: window.game.segment, paused: window.game.paused, muted: window.game.settings.muted,
    contexts: q.contexts.map(c => ({ index: c.__qaIndex, state: c.state, time: c.currentTime })),
    voices: (m.voices || []).map(item => ({ id: item.voice.id, token: item.voice.__bgmQaToken, from: item.from, to: item.to, startedAt: item.startedAt, duration: item.duration, volume: q.voices.find(v => v.token === item.voice.__bgmQaToken)?.volume })),
    latestGains: q.starts.slice(-8).map(s => ({ id: s.id, gain: s.gain?.gain.value, offset: s.args[1] || 0, context: s.context })),
    starts: q.starts.length, stops: q.stops.length, loads: q.voices.length
  };
})()`;

async function main() {
  fs.mkdirSync(output, { recursive: true });
  const { SCENE_MUSIC_IDS } = require('../build/SceneMusic');
  assert.equal(SCENE_MUSIC_IDS.length, 24);
  for (const id of SCENE_MUSIC_IDS) assert.ok(fs.statSync(path.join(root, 'assets/resources/audio/bgm', id + '.ogg')).size > 100000, id + ' real OGG must exist');
  assert.ok(fs.statSync(path.join(root, 'build/web/game.js')).mtimeMs >= fs.statSync(path.join(root, 'assets/scripts/SceneMusic.ts')).mtimeMs, 'Build must include latest SceneMusic');
  const browser = await openBrowser();
  const report = { kind: 'technical-runtime-qa', url, createdAt: new Date().toISOString(), temporaryProfile: browser.profile, checks: [], samples: {}, errors: [] };
  const check = (name, fn, detail) => { fn(); report.checks.push({ name, passed: true, ...(detail ? { detail } : {}) }); };
  const snap = () => browser.evaluate(snapshotExpression);
  const voiceVolume = (sample, id) => sample.voices.find(v => v.id === id)?.volume ?? 0;
  const waitFor = async (name, predicate, timeout = 12000) => {
    const deadline = Date.now() + timeout;
    while (Date.now() < deadline) { const value = await snap(); if (predicate(value)) return value; await delay(80); }
    throw Error('Timed out: ' + name + '; last=' + JSON.stringify(await snap()));
  };
  const samples = async (label, totalMs, everyMs = 180) => {
    const result = [await snap()];
    for (let elapsed = 0; elapsed < totalMs; elapsed += everyMs) { await delay(Math.min(everyMs, totalMs - elapsed)); result.push(await snap()); }
    report.samples[label] = result; return result;
  };
  try {
    await browser.send('Page.addScriptToEvaluateOnNewDocument', { source: observeAudio });
    await browser.send('Page.navigate', { url });
    for (let i = 0; i < 150; i++) { if (await browser.evaluate('!!window.fleetingLife?.music')) break; await delay(100); }
    assert.equal(await browser.evaluate('!!window.fleetingLife?.music'), true);
    assert.equal(await browser.evaluate('document.getElementById("error")?.textContent || ""'), '');
    report.samples.beforeGesture = [await snap()];
    // A real CDP pointer gesture grants browser user activation through the host canvas handler.
    const canvasBox = await browser.evaluate('(() => { const r = document.querySelector("#game,#GameCanvas").getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; })()');
    await browser.send('Input.dispatchMouseEvent', { type: 'mousePressed', x: canvasBox.x, y: canvasBox.y, button: 'left', clickCount: 1 });
    await browser.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: canvasBox.x, y: canvasBox.y, button: 'left', clickCount: 1 });
    const unlocked = await waitFor('user gesture unlocks context and hall music', s => s.currentId === 'corridor' && s.contexts.some(c => c.state === 'running'));
    report.samples.unlocked = [unlocked];
    check('First real pointer interaction unlocks the BGM AudioContext', () => assert.ok(unlocked.contexts.some(c => c.state === 'running')));

    await browser.evaluate(`(() => {
      const m = window.fleetingLife.music, q = window.__bgmQa;
      const originalLoad = m.backend.load.bind(m.backend);
      m.backend.load = async id => {
        const voice = await originalLoad(id), entry = { id, token: q.voices.length + 1, volume: 0, plays: 0, pauses: 0, resumes: 0, stops: 0 };
        q.voices.push(entry); voice.__bgmQaToken = entry.token;
        for (const [name, count] of [['play','plays'], ['pause','pauses'], ['resume','resumes'], ['stop','stops']]) {
          if (!voice[name]) continue; const original = voice[name].bind(voice);
          voice[name] = (...args) => { entry[count]++; return original(...args); };
        }
        const setVolume = voice.setVolume.bind(voice); voice.setVolume = value => { entry.volume = value; return setVolume(value); };
        return voice;
      };
      // Keep the scene stable while the host frame still updates the real music controller.
      window.game.__qaOriginalUpdate = window.game.update;
      window.game.update = () => {};
      m.stop(); window.game.start(); window.game.beginSegment(1);
    })()`);
    await waitFor('morning loaded', s => s.currentId === 'morning');
    const initial = await samples('morningInitialFade', 1650, 150);
    check('Morning initial fade rises to the master level without restarting', () => {
      assert.ok(voiceVolume(initial[0], 'morning') < .3);
      assert.ok(voiceVolume(initial.at(-1), 'morning') > .71);
      for (let i = 1; i < initial.length; i++) assert.ok(voiceVolume(initial[i], 'morning') + 1e-6 >= voiceVolume(initial[i - 1], 'morning'));
      assert.equal(initial[0].starts, initial.at(-1).starts);
    });

    await browser.evaluate('window.game.beginSegment(2)');
    await waitFor('rain loaded', s => s.currentId === 'rain');
    const rain = await samples('morningToRain', 2250, 150);
    check('Morning to rain uses a real overlapping 2 second crossfade', () => {
      assert.ok(rain.some(s => voiceVolume(s, 'morning') > .1 && voiceVolume(s, 'rain') > .1));
      assert.ok(voiceVolume(rain.at(-1), 'rain') > .71);
      assert.ok(!rain.at(-1).voices.some(v => v.id === 'morning'));
      for (let i = 1; i < rain.length; i++) {
        assert.ok(voiceVolume(rain[i], 'rain') + 1e-6 >= voiceVolume(rain[i - 1], 'rain'));
        assert.ok(voiceVolume(rain[i], 'morning') <= voiceVolume(rain[i - 1], 'morning') + 1e-6);
      }
    });

    await browser.evaluate('window.game.toHall()');
    await waitFor('corridor loaded', s => s.currentId === 'corridor');
    const corridor = await samples('rainToCorridor', 2750, 150);
    check('Rain to corridor uses a longer 2.5 second fade', () => {
      assert.ok(corridor[0].voices.every(v => v.duration === 2500));
      assert.ok(corridor.some(s => voiceVolume(s, 'rain') > .1 && voiceVolume(s, 'corridor') > .1));
      assert.equal(corridor.at(-1).voices.length, 1);
      assert.ok(Math.abs(voiceVolume(corridor.at(-1), 'corridor') - .54) < .005);
    });

    const beforeMute = await snap();
    await browser.evaluate('window.game.settings.muted = true'); await delay(90);
    const muted = await snap(); report.samples.muted = [muted];
    check('Mute immediately zeros all voice and native gain values', () => {
      assert.ok(muted.voices.every(v => v.volume === 0));
      assert.equal(muted.latestGains.at(-1).gain, 0);
    });
    await browser.evaluate('window.game.settings.muted = false'); await delay(180);
    const unmuted = await snap(); report.samples.unmuted = [unmuted];
    check('Unmute keeps the same voice and buffer source alive', () => { assert.equal(unmuted.starts, beforeMute.starts); assert.equal(unmuted.voices[0].token, beforeMute.voices[0].token); assert.ok(voiceVolume(unmuted, 'corridor') > .53); });

    await browser.evaluate('window.game.paused = true');
    const pause = await samples('pauseDuck', 360, 60);
    check('Pause smoothly lowers the current cue instead of restarting', () => {
      assert.ok(voiceVolume(pause[1], 'corridor') < voiceVolume(pause[0], 'corridor'));
      assert.ok(Math.abs(voiceVolume(pause.at(-1), 'corridor') - .54 * .18) < .004);
      assert.equal(pause[0].starts, pause.at(-1).starts);
    });
    await browser.evaluate('window.game.paused = false');
    const resume = await samples('pauseRelease', 480, 80);
    check('Resume restores volume over 400 ms without restarting', () => { assert.ok(voiceVolume(resume[1], 'corridor') > voiceVolume(resume[0], 'corridor')); assert.ok(voiceVolume(resume.at(-1), 'corridor') > .53); assert.equal(resume[0].starts, resume.at(-1).starts); });

    const beforeHidden = await snap();
    await browser.evaluate('window.dispatchEvent(new Event("blur"))'); await delay(200);
    const hidden = await snap(); report.samples.hidden = [hidden];
    check('Host blur handler suspends music and silences voices', () => { assert.equal(hidden.suspended, true); assert.ok(hidden.voices.every(v => v.volume === 0)); assert.ok(hidden.contexts.some(c => c.state === 'suspended')); });
    await browser.evaluate('window.dispatchEvent(new Event("focus")); window.game.paused = false'); await delay(550);
    const shown = await snap(); report.samples.shown = [shown];
    check('Host focus handler restores the same voice from its saved offset', () => { assert.equal(shown.suspended, false); assert.equal(shown.voices[0].token, beforeHidden.voices[0].token); assert.equal(shown.starts, beforeHidden.starts + 1); assert.ok(shown.latestGains.at(-1).offset > 1); assert.ok(voiceVolume(shown, 'corridor') > .53); }, 'Blur/focus events are dispatched through the real host event handlers in the owned headless browser.');

    const beforeRapid = await snap();
    await browser.evaluate(`(() => { const g = window.game, m = window.fleetingLife.music; g.beginSegment(1); m.update(g, performance.now()); g.beginSegment(2); m.update(g, performance.now()); g.toHall(); m.update(g, performance.now()); })()`);
    const rapid = await samples('rapidMorningRainCorridor', 2800, 200);
    check('Rapid A-B-C changes leave only C audible and discard stale loads', () => { assert.equal(rapid.at(-1).currentId, 'corridor'); assert.equal(rapid.at(-1).targetId, 'corridor'); assert.equal(rapid.at(-1).voices.length, 1); assert.equal(rapid.at(-1).starts, beforeRapid.starts); });

    const beforeSame = await snap();
    for (let i = 0; i < 3; i++) { await browser.evaluate('window.game.toHall()'); await delay(180); }
    const afterSame = await snap(); report.samples.sameTrack = [beforeSame, afterSame];
    check('Repeated same-scene updates neither reload nor restart the BGM', () => { assert.equal(afterSame.starts, beforeSame.starts); assert.equal(afterSame.loads, beforeSame.loads); assert.equal(afterSame.voices[0].token, beforeSame.voices[0].token); });

    await browser.evaluate('window.game.endingMediaActive = true');
    const fadeOut = await samples('yieldToCinematicAudio', 2200, 150);
    check('Active cinematic audio receives a complete BGM fade out', () => { assert.ok(voiceVolume(fadeOut[2], 'corridor') < voiceVolume(fadeOut[0], 'corridor')); assert.equal(fadeOut.at(-1).voices.length, 0); assert.equal(fadeOut.at(-1).currentId, null); });
    await browser.evaluate('window.game.endingMediaActive = false');
    await waitFor('hall restored after cinematic audio', s => s.currentId === 'corridor'); await delay(1600);

    // Decode every installed scene asset in the actual browser, without playing it or retaining its buffer.
    report.assetDecodes = await browser.evaluate(`(async () => { const context = new AudioContext(), out = []; try { for (const id of FleetingLife.SCENE_MUSIC_IDS) { const response = await fetch('../assets/resources/audio/bgm/' + id + '.ogg'); if (!response.ok) throw Error(id + ' HTTP ' + response.status); const buffer = await context.decodeAudioData(await response.arrayBuffer()); out.push({ id, duration: buffer.duration, sampleRate: buffer.sampleRate, channels: buffer.numberOfChannels }); } return out; } finally { await context.close(); } })()`);
    check('All 24 real scene OGGs are served and decode as 58.5 second stereo audio', () => { assert.equal(report.assetDecodes.length, 24); for (const item of report.assetDecodes) { assert.ok(Math.abs(item.duration - 58.5) < .1, item.id + ' duration=' + item.duration); assert.equal(item.channels, 2); } });
    report.audio = await browser.evaluate(`(() => { const q = window.__bgmQa; return { fetches: q.fetches, decoded: q.decoded, starts: q.starts.map(({ source, gain, ...s }) => ({ ...s, gain: gain?.gain.value })), stops: q.stops, voices: q.voices }; })()`);
    check('BGM sources loop decoded OGGs rather than memory sound effect WAVs', () => { assert.ok(report.audio.starts.length >= 4); assert.ok(report.audio.starts.every(s => s.loop && SCENE_MUSIC_IDS.includes(s.id))); assert.ok(report.audio.fetches.every(f => /\/audio\/bgm\/[^/]+\.ogg$/.test(f.url) && f.status === 200)); assert.ok(['morning','rain','corridor'].every(id => report.audio.decoded.some(d => d.id === id))); });
    report.pageErrors = browser.errors; report.consoleErrors = browser.consoleErrors; report.networkErrors = browser.networkErrors;
    report.bgmResponses = browser.resourceResponses.filter(r => /\/audio\/bgm\//.test(r.url));
    check('No page exceptions, console errors, or BGM missing assets', () => { assert.deepEqual(browser.errors, []); assert.deepEqual(browser.consoleErrors, []); assert.deepEqual(browser.networkErrors, []); assert.ok(report.bgmResponses.every(r => r.status === 200)); });
    const screenshot = await browser.send('Page.captureScreenshot', { format: 'png' });
    fs.writeFileSync(path.join(output, 'hall-after-audio-qa.png'), Buffer.from(screenshot.data, 'base64'));
    report.passed = true;
  } catch (error) {
    report.passed = false; report.errors.push(error.stack || String(error));
    try { report.lastSnapshot = await snap(); report.audioAtFailure = await browser.evaluate('({decoded:window.__bgmQa.decoded,fetches:window.__bgmQa.fetches,voices:window.__bgmQa.voices})'); } catch {}
    report.pageErrors = browser.errors; report.consoleErrors = browser.consoleErrors; report.networkErrors = browser.networkErrors;
    throw error;
  } finally {
    fs.writeFileSync(path.join(output, 'runtime-report.json'), JSON.stringify(report, null, 2));
    await browser.close();
    console.log(JSON.stringify({ passed: report.passed, checks: report.checks, report: path.join(output, 'runtime-report.json'), errors: report.errors }, null, 2));
  }
}
if (require.main === module) main().catch(error => { console.error(error); process.exitCode = 1; });
