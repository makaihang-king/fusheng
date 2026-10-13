'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { Game } = require('../build/Game.js');

const painter = { rect(){}, line(){}, circle(){}, text(){}, poly(){}, image(key){ return key.startsWith('ending.sequence.'); } };
function fresh() {
  let saved = null;
  return new Game({ load: () => saved, save: value => { saved = value; } });
}

test('a first normal ending lights its door only after the scene plays; a replay may exit early', () => {
  const game = fresh();
  game.start();
  game.startEnding('morning');
  game.render(painter);
  assert.equal(game.buttons.some(button => button.label === '看完这一幕'), false);
  game.finishEnding();
  assert.equal(game.phase, 'ending');
  assert.deepEqual(game.profile.lights, []);
  for (let frame = 0; frame < 13 * 60; frame++) {game.render(painter);game.update(1 / 60);}
  assert.equal(game.phase, 'ending');
  assert.deepEqual(game.profile.lights, []);
  for (let frame = 0; frame < 12 * 60 && game.screen !== 'hall'; frame++) {game.render(painter);game.update(1 / 60);}
  assert.equal(game.screen, 'hall');
  assert.deepEqual(game.profile.lights, ['morning']);
  game.startEnding('morning', true);
  game.render(painter);
  assert.equal(game.buttons.some(button => button.label === '回到回廊'), true);
  game.finishEnding();
  assert.equal(game.phase, 'corridorTransition');
  for (let frame = 0; frame < 12 * 60 && game.screen !== 'hall'; frame++) game.update(1 / 60);
  assert.equal(game.screen, 'hall');
  assert.deepEqual(game.profile.lights, ['morning']);
});
