const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const host = readFileSync(path.join(__dirname, '../preview/host.js'), 'utf8');
const start = host.indexOf(' class PreviewMoments {');
const end = host.indexOf('\n const moments=', start);
assert.ok(start >= 0 && end > start, 'preview replay class is available');
const replayClass = new vm.Script(host.slice(start, end) + '\nPreviewMoments');

function fixture() {
  const clock = { now: 0 };
  const video = {
    style: {}, currentTime: 0, duration: 3.1, readyState: 2, videoWidth: 480,
    ended: false, error: null, paused: true, playCalls: 0,
    play() { this.paused = false; this.playCalls++; return Promise.resolve(); },
    pause() { this.paused = true; },
    load() { this.currentTime = 0; this.ended = false; this.error = null; },
    removeAttribute(name) { if (name === 'src') this.src = ''; },
  };
  const shell = { appendChild() {} };
  const canvasContext = { draws: 0, drawImage() { this.draws++; } };
  const document = {
    createElement(name) {
      if (name === 'video') return video;
      return { style: {}, append() {}, getContext: () => canvasContext };
    },
    getElementById: () => shell,
  };
  let urlCount = 0;
  const context = {
    document, localStorage: { getItem: () => null },
    performance: { now: () => clock.now },
    URL: { createObjectURL: () => `blob:moment-${++urlCount}` },
    Image: class { complete = true; naturalWidth = 480; },
    Blob, console: { warn() {} },
  };
  const PreviewMoments = replayClass.runInNewContext(context);
  const game = { paused: false };
  const moments = new PreviewMoments({}, () => game);
  const candidate = (id, time) => ({ id, format: 'webm', priority: 1, durationMs: 3000, time });
  const select = (count = 3) => {
    moments.videos = Array.from({ length: count }, (_, index) => candidate(`preview-${index}`, index));
    moments.refresh();
    moments.db = {};
    moments.blob = async () => new Blob(['valid video data']);
  };
  const flush = () => new Promise(resolve => setImmediate(resolve));
  return { clock, video, game, moments, select, flush, canvasContext };
}

test('no candidate or missing media reports failure once', async () => {
  const empty = fixture(), emptyResults = [];
  empty.moments.replay(true, result => emptyResults.push(result));
  await empty.flush();
  empty.moments.replay(false);
  assert.deepEqual(emptyResults, [false]);

  const missing = fixture(), missingResults = [];
  missing.select(1);
  missing.moments.blob = async () => null;
  missing.moments.replay(true, result => missingResults.push(result));
  await missing.flush();
  assert.deepEqual(missingResults, [false]);
});

test('pure legacy frames still display but never consume the first video surprise', async () => {
  const { moments, clock, flush, canvasContext } = fixture();
  const results = [];
  moments.legacy = Array.from({ length: 3 }, (_, index) => ({
    id: `old-${index}`, format: 'legacy-frames', priority: 3, time: index,
    durationMs: 250, frames: ['data:image/jpeg;base64,old'],
  }));
  moments.refresh();
  moments.replay(true, result => results.push(result));
  await flush();
  for (const time of [260, 270, 530, 540, 800]) { clock.now = time; moments.drawReplay(time); }
  assert.ok(canvasContext.draws >= 3, 'all old frames remain viewable');
  assert.deepEqual(results, [false]);
});

test('three new videos keep old frames intact and replay in event time order', async () => {
  const { moments, clock, video, flush, canvasContext } = fixture();
  const results = [];
  const old = (id, time) => ({ id, format: 'legacy-frames', priority: 1, time,
    durationMs: 250, frames: ['data:image/jpeg;base64,old'] });
  moments.legacy = [old('a', 0), old('b', 1), old('c', 2)];
  const originalFrames = moments.legacy.map(value => value.frames);
  const indexes = [], deleted = [];
  moments.put = async () => {}; moments.remove = async id => { deleted.push(id); };
  moments.writeIndex = rows => { indexes.push(rows); };
  for (const [id, time, kind, priority] of [
    ['late', 12, 'hidden', 3], ['early', 10, 'death', 2], ['middle', 11, 'highlight', 1],
  ]) {
    await moments.commit({ id, kind, priority, wallTime: time },
      { blob: new Blob(['valid video data']), durationMs: 3000, mime: 'video/webm' });
  }
  assert.deepEqual(moments.legacy.map(value => value.frames), originalFrames);
  assert.equal(moments.memories.length, 6, 'three old frame records remain available beside three videos');
  assert.deepEqual(deleted, [], 'new video recording never deletes old frame data');
  assert.equal(indexes.at(-1).length, 3);
  moments.db = {}; moments.blob = async () => new Blob(['valid video data']);
  moments.replay(true, result => results.push(result));
  await flush();
  assert.deepEqual([...moments.timeline.map(part => part.m.id)], ['early', 'middle', 'late']);
  for (const time of [3100, 6201, 9302]) {
    clock.now = time; video.currentTime = 3.1; video.ended = true; moments.drawReplay(time);
    if (moments.active) { clock.now = time + 1; video.currentTime = 0; moments.drawReplay(clock.now); }
  }
  assert.equal(canvasContext.draws, 0, 'legacy frames do not interrupt the chronological video montage');
  assert.deepEqual(results, [true]);
});

test('mixed old frames and new video rank together, play chronologically, and require the video', async () => {
  const { moments, clock, video, flush, canvasContext } = fixture();
  const results = [];
  moments.legacy = [
    { id: 'old-hidden', format: 'legacy-frames', kind: 'hidden', priority: 3, time: 10,
      durationMs: 250, frames: ['data:image/jpeg;base64,old'] },
    { id: 'old-death', format: 'legacy-frames', kind: 'death', priority: 2, time: 20,
      durationMs: 250, frames: ['data:image/jpeg;base64,old'] },
    { id: 'old-highlight', format: 'legacy-frames', kind: 'highlight', priority: 1, time: 30,
      durationMs: 250, frames: ['data:image/jpeg;base64,old'] },
  ];
  moments.videos = [{ id: 'new-highlight', format: 'webm', kind: 'highlight', priority: 1,
    time: 40, durationMs: 3000 }];
  moments.refresh(); moments.db = {};
  moments.blob = async () => new Blob(['valid video data']);
  moments.replay(true, result => results.push(result));
  await flush();
  assert.deepEqual([...moments.timeline.map(part => part.m.id)],
    ['old-hidden', 'old-death', 'new-highlight']);
  clock.now = 260; moments.drawReplay(clock.now);
  clock.now = 261; moments.drawReplay(clock.now);
  clock.now = 522; moments.drawReplay(clock.now);
  clock.now = 523; moments.drawReplay(clock.now);
  assert.ok(canvasContext.draws >= 2, 'ranked old memories remain visible after a new recording');
  clock.now = 3623; video.currentTime = 3.1; video.ended = true;
  moments.drawReplay(clock.now);
  assert.deepEqual(results, [true]);

  const fallback = fixture();
  fallback.moments.legacy = moments.legacy.map((item, index) => ({
    ...item, id: `high-old-${index}`, priority: 3,
  }));
  fallback.moments.videos = moments.videos;
  assert.ok(fallback.moments.selectReplayMoments().some(item => item.format === 'webm'),
    'one real video is selected even when all three old frames rank higher');
});

test('four-second startup and three 3.1-second videos complete after each ended event', async () => {
  const { moments, video, clock, select, flush } = fixture();
  const results = [];
  select();
  let releaseReady;
  moments.ready = new Promise(resolve => { releaseReady = resolve; });
  moments.replay(true, result => results.push(result));
  clock.now = 4000;
  releaseReady();
  await flush();
  assert.equal(video.playCalls, 1);
  for (const [time, expected] of [[7100, 1], [10201, 2], [13302, -1]]) {
    clock.now = time - 100; video.currentTime = 3; video.ended = false;
    moments.drawReplay(clock.now);
    assert.equal(moments.segmentIndex, expected < 0 ? 2 : expected - 1,
      'media time alone must not cut the clip early');
    clock.now = time; video.currentTime = 3.1; video.ended = true; moments.drawReplay(time);
    assert.equal(moments.segmentIndex, expected);
    if (expected >= 0) {
      clock.now = time + 1; video.currentTime = 0; moments.drawReplay(clock.now);
    }
  }
  assert.equal(video.playCalls, 3);
  assert.deepEqual(results, [true]);
  moments.replay(false);
  assert.deepEqual(results, [true]);
});

test('play failure, media error, and twenty-second stall report failure', async () => {
  const denied = fixture(), deniedResults = [];
  denied.select(1);
  denied.video.play = () => Promise.reject(Error('denied'));
  denied.moments.replay(true, result => deniedResults.push(result));
  await denied.flush();
  assert.deepEqual(deniedResults, [false]);

  const broken = fixture(), brokenResults = [];
  broken.select(1);
  broken.moments.replay(true, result => brokenResults.push(result));
  await broken.flush();
  broken.video.error = Error('bad media');
  broken.clock.now = 200;
  broken.moments.drawReplay(200);
  assert.deepEqual(brokenResults, [false]);

  const stalled = fixture(), stalledResults = [];
  stalled.select(1);
  stalled.moments.replay(true, result => stalledResults.push(result));
  await stalled.flush();
  stalled.clock.now = 19999;
  stalled.moments.drawReplay(19999);
  assert.deepEqual(stalledResults, []);
  stalled.clock.now = 20000;
  stalled.moments.drawReplay(20000);
  assert.deepEqual(stalledResults, [false]);
});

test('a truncated 2.1-second clip cannot consume a three-second memory', async () => {
  const { moments, video, clock, select, flush } = fixture();
  const results = [];
  select(1);
  moments.replay(true, result => results.push(result));
  await flush();
  clock.now = 2100; video.currentTime = 2.1; video.ended = true;
  moments.drawReplay(clock.now);
  assert.equal(moments.segmentIndex, 0);
  assert.deepEqual(results, []);
  moments.replay(false);
  assert.deepEqual(results, [false]);
});

test('a video ending at 2.8 seconds cannot complete a three-second memory', async () => {
  const { moments, video, clock, select, flush } = fixture();
  const results = [];
  select(1);
  moments.replay(true, result => results.push(result));
  await flush();
  clock.now = 2800; video.currentTime = 2.8; video.ended = true;
  moments.drawReplay(clock.now);
  assert.equal(moments.segmentIndex, 0);
  assert.deepEqual(results, []);
  moments.replay(false);
  assert.deepEqual(results, [false]);
});

test('the global deadline also covers media preparation', async () => {
  const { moments, video, clock, select, flush } = fixture();
  const results = [];
  select(1);
  let releaseReady;
  moments.ready = new Promise(resolve => { releaseReady = resolve; });
  moments.replay(true, result => results.push(result));
  clock.now = 20000;
  moments.drawReplay(clock.now);
  assert.deepEqual(results, [false]);
  releaseReady();
  await flush();
  assert.equal(video.playCalls, 0);
  assert.deepEqual(results, [false]);
});

test('background time is excluded and pause controls remain visible over the replay', async () => {
  const { moments, video, clock, game, select, flush } = fixture();
  const results = [];
  select();
  moments.replay(true, result => results.push(result));
  await flush();
  game.paused = true; moments.drawReplay(0);
  assert.equal(moments.layer.style.display, 'none', 'the pause panel is not covered by replay media');
  game.paused = false; moments.drawReplay(0);
  assert.equal(moments.layer.style.display, 'block');
  clock.now = 0; moments.pause();
  assert.equal(moments.layer.style.display, 'none');
  clock.now = 12000; video.currentTime = 3.1; video.ended = true; moments.drawReplay(clock.now);
  assert.deepEqual(results, []);
  assert.equal(moments.segmentIndex, 0);
  video.currentTime = 0; video.ended = false;
  moments.resume(); moments.drawReplay(clock.now);
  for (const [time, expected] of [[15100, 1], [18201, 2], [21302, -1]]) {
    clock.now = time; video.currentTime = 3.1; video.ended = true; moments.drawReplay(time);
    assert.equal(moments.segmentIndex, expected);
    if (expected >= 0) {
      clock.now = time + 1; video.currentTime = 0; moments.drawReplay(clock.now);
    }
  }
  assert.deepEqual(results, [true]);
});

test('cancelled load and old play rejection cannot complete a later replay', async () => {
  const { moments, video, select, flush } = fixture();
  const results = [];
  select(1);
  let releaseLoad;
  moments.ready = new Promise(resolve => { releaseLoad = resolve; });
  moments.replay(true, result => results.push(['old', result]));
  moments.replay(false);
  releaseLoad();
  await flush();
  assert.deepEqual(results, [['old', false]]);
  assert.equal(video.playCalls, 0);

  const rejectPlays = [];
  video.play = () => new Promise((_, reject) => { rejectPlays.push(reject); });
  moments.replay(true, result => results.push(['first', result]));
  await flush();
  moments.replay(true, result => results.push(['next', result]));
  await flush();
  rejectPlays[0](Error('late failure'));
  await flush();
  assert.equal(moments.active, true);
  assert.deepEqual(results, [['old', false], ['first', false]]);
  moments.replay(false);
  assert.deepEqual(results, [['old', false], ['first', false], ['next', false]]);
});
