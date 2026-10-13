'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { Game } = require('../build/Game.js');

function dreamTileX(game) {
  let found;
  game.render({
    rect() {}, line() {}, circle() {}, poly() {}, text() {},
    image(key, x) {
      if (key === 'scene.scroll.dream.02') { found = x; return true; }
      return false;
    },
  });
  assert.notEqual(found, undefined, 'the live dream scenery tile is visible');
  return found;
}

test('a late dream sprint accelerates the visible world from its actual start, without a jump', () => {
  const game = new Game({ load: () => null, save() {} });
  game.start();
  game.beginSegment(1);
  game.phase = 'reward';
  game.reward = 'dream';
  game.theme = 'dream';
  game.phaseTime = 31.25;
  game.sceneTime = 31.25;
  game.y = 65;
  game.vy = 0;
  game.used = new Set(['act2', 'onTable']);

  const beforeClock = game.rewardClock();
  const beforeTile = dreamTileX(game);
  game.down();
  assert.equal(game.used.has('sprint'), true);
  assert.equal(game.rewardClock(), beforeClock, 'starting sprint cannot instantly advance pickups');
  assert.equal(dreamTileX(game), beforeTile, 'starting sprint cannot shift the background');

  for (let i = 0; i < 24; i++) game.update(1 / 60);
  assert.ok(Math.abs(game.rewardClock() - beforeClock - .6) < 1e-8,
    '0.4 seconds of sprint advances the world by 0.6 seconds');
  assert.ok(Math.abs(dreamTileX(game) - beforeTile + .6 * 72) < 1e-8,
    'the drawn background uses the same continuous accelerated clock');
});
