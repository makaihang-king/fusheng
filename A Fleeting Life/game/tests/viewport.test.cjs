'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { coreViewport, pointInCore } = require('../build/Viewport.js');

function physicalPoint(frame, logicalX, logicalY) {
  const layout = coreViewport(frame);
  return {
    x: layout.coreLeft + logicalX * layout.scale,
    y: frame.height - layout.coreTop - logicalY * layout.scale,
  };
}

test('ultrawide Android screen maps the visible exit and pause controls to their hit boxes', () => {
  const frame = { width: 2400, height: 1080 };
  const layout = coreViewport(frame);
  assert.equal(layout.logicalWidth, 600);
  assert.equal(layout.logicalHeight, 270);
  assert.equal(layout.scale, 4);
  assert.equal(layout.coreLeft, 240);
  assert.equal(layout.coreTop, 0);
  assert.deepEqual(pointInCore({ x: 2058, y: 1006 }, frame), [454.5, 18.5]);
  assert.deepEqual(pointInCore({ x: 2064, y: 884 }, frame), [456, 49]);
  assert.deepEqual(pointInCore({ x: 1200, y: 540 }, frame), [240, 135]);
  assert.ok(pointInCore({ x: 80, y: 540 }, frame)[0] < 0);
  assert.ok(pointInCore({ x: 2320, y: 540 }, frame)[0] > 480);
});

test('standard and narrow frames keep the same authored 480×270 interaction area', () => {
  for (const frame of [{ width: 1920, height: 1080 }, { width: 1080, height: 2400 }]) {
    const layout = coreViewport(frame);
    assert.ok(Math.abs(layout.logicalWidth * layout.scale - frame.width) < 1e-9);
    assert.ok(Math.abs(layout.logicalHeight * layout.scale - frame.height) < 1e-9);
    for (const point of [[0, 0], [240, 135], [454.5, 18.5], [480, 270]]) {
      const mapped = pointInCore(physicalPoint(frame, point[0], point[1]), frame);
      assert.ok(Math.abs(mapped[0] - point[0]) < 1e-9);
      assert.ok(Math.abs(mapped[1] - point[1]) < 1e-9);
    }
  }
  const narrow = coreViewport({ width: 1080, height: 2400 });
  assert.equal(narrow.logicalWidth, 480);
  assert.ok(narrow.logicalHeight > 270);
  assert.ok(narrow.coreTop > 0);
});
