'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { drawDreamScenery, drawDreamTableHomework, dreamHomeworkMemory } =
  require('../build/DreamScenery.js');

function recorder() {
  const calls = [];
  const painter = {
    rect(x, y, w, h, color) { calls.push({ kind: 'rect', bounds: [x, y, x + w, y + h], color }); },
    line(x1, y1, x2, y2, color) {
      calls.push({ kind: 'line', bounds: [Math.min(x1, x2), Math.min(y1, y2), Math.max(x1, x2), Math.max(y1, y2)], color });
    },
    poly(points, color) {
      calls.push({ kind: 'poly', bounds: [Math.min(...points.map(p => p[0])), Math.min(...points.map(p => p[1])),
        Math.max(...points.map(p => p[0])), Math.max(...points.map(p => p[1]))], color });
    },
    circle(x, y, r, color) { calls.push({ kind: 'circle', bounds: [x - r, y - r, x + r, y + r], color }); },
    text() { throw new Error('Dream scenery must not create gameplay text'); },
    image() { throw new Error('Dream scenery must not request external art'); }
  };
  return { painter, calls };
}

function scene(phaseTime, reducedMotion, homework = 'none', clock = 3) {
  const capture = recorder();
  drawDreamScenery(capture.painter, { phaseTime, reducedMotion, homework, clock });
  return capture.calls;
}

const geometry = calls => calls.map(({ kind, bounds }) => ({ kind, bounds }));

test('dream imagery leaves the HUD, player path and ground readable throughout both acts', () => {
  for (const time of [0, 27.8, 29.99, 30.01, 32.2, 59.9]) {
    for (const reducedMotion of [false, true]) {
      const calls = scene(time, reducedMotion, 'own');
      assert.ok(calls.length > 15, `composition missing at ${time}`);
      for (const { bounds } of calls) {
        assert.ok(bounds.every(Number.isFinite));
        assert.ok(bounds[0] >= 268 && bounds[2] <= 480, `scenery enters player column at ${time}: ${bounds}`);
        assert.ok(bounds[1] >= 35 && bounds[3] <= 171, `scenery enters HUD or ground at ${time}: ${bounds}`);
      }
    }
  }
});

test('reduced motion freezes decoration and the 30-second change has no positional jump', () => {
  assert.deepEqual(scene(12, true, 'own', 0), scene(12, true, 'own', 100));
  for (const reducedMotion of [false, true]) {
    const before = scene(29.99, reducedMotion, 'none');
    const after = scene(30.01, reducedMotion, 'none');
    assert.equal(before.length, after.length);
    for (let i = 0; i < before.length; i++) {
      for (let j = 0; j < 4; j++) {
        assert.ok(Math.abs(before[i].bounds[j] - after[i].bounds[j]) < 1,
          `object ${i} jumped at the act boundary`);
      }
      const firstAlpha = Number(before[i].color.match(/,([\d.]+)\)$/)[1]);
      const nextAlpha = Number(after[i].color.match(/,([\d.]+)\)$/)[1]);
      assert.ok(Math.abs(firstAlpha - nextAlpha) < .03,
        `object ${i} flashed at the act boundary`);
    }
  }
});

test('the chalkboard becomes a large divided window across the gradual act change', () => {
  const early = scene(10, false);
  const middle = scene(30, false);
  const late = scene(40, false);
  assert.ok(early.filter(call => call.kind === 'line').length >= 8,
    'the first act should show a chalk timetable');
  assert.ok(late.filter(call => call.kind === 'line').length <= 3,
    'the chalk timetable should give way to window panes');
  const windowPane = call => call.kind === 'rect' &&
    call.bounds[2] - call.bounds[0] > 140 && call.bounds[3] - call.bounds[1] > 65;
  assert.ok(!early.some(windowPane));
  assert.ok(late.some(windowPane), 'the second act should have a legible window opening');
  assert.notDeepEqual(geometry(middle), geometry(early));
  assert.notDeepEqual(geometry(middle), geometry(late));
});

test('the private paper repeats only a choice the player made', () => {
  assert.equal(dreamHomeworkMemory([]), 'none');
  assert.equal(dreamHomeworkMemory(['ownHomework']), 'own');
  assert.equal(dreamHomeworkMemory(['copyHomework']), 'copied');
  assert.equal(dreamHomeworkMemory(['ownHomework', 'copyHomework']), 'copied');
  assert.ok(scene(12, false, 'none').length < scene(12, false, 'own').length);
  const floating = scene(12, false, 'own').slice(scene(12, false, 'none').length);
  assert.ok(floating.every(({ bounds }) => bounds[1] > 143),
    'the paper should hover clear of the board instead of looking pinned to it');

  const table = { x: -50, y: 151, width: 310 };
  const absent = recorder(), own = recorder(), copied = recorder();
  drawDreamTableHomework(absent.painter, table, 'none');
  drawDreamTableHomework(own.painter, table, 'own');
  drawDreamTableHomework(copied.painter, table, 'copied');
  assert.equal(absent.calls.length, 0);
  assert.ok(own.calls.length > 0);
  assert.notDeepEqual(geometry(own.calls), geometry(copied.calls),
    'the two homework choices should leave different letter shapes');
  assert.notDeepEqual(geometry(scene(12, true, 'own')),
    geometry(scene(12, true, 'copied')),
    'the floating sheet should also distinguish handwriting without color');
  for (const { bounds } of own.calls) {
    assert.ok(bounds[0] >= table.x && bounds[2] <= table.x + table.width);
    assert.ok(bounds[1] >= table.y - 11 && bounds[3] <= table.y + 12);
  }
});
