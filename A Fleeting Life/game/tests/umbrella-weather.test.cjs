'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { Game } = require('../build/Game.js');

function game() {
  const current = new Game({ load: () => null, save() {} });
  current.start();
  return current;
}

function hasCarriedUmbrella(current) {
  let visible = false;
  current.render({
    rect() {}, line() {}, circle() {}, text() {},
    poly(_points, color) { if (color === '#c29e63') visible = true; },
    image() { return false; },
  });
  return visible;
}

test('the collected umbrella is carried only while the rainy scene is visible', () => {
  const current = game();
  current.beginSegment(2);
  assert.equal(hasCarriedUmbrella(current), false, 'rain alone does not give the player an umbrella');

  current.run.items.push('umbrella');
  assert.equal(hasCarriedUmbrella(current), true, 'the carried umbrella appears in the rain');

  current.run.wet = 70;
  current.beginSegment(3);
  assert.ok(current.run.items.includes('umbrella'), 'the collected item persists after the rain');
  assert.equal(hasCarriedUmbrella(current), false, 'a wet player does not keep an open umbrella in the dry scene');

  current.beginSegment(2);
  assert.equal(hasCarriedUmbrella(current), true, 'returning to rain reopens the carried umbrella');
});

test('the carried umbrella stays closed through dry choice, hall and corridor transition', () => {
  const current = game();
  current.beginSegment(2);
  current.run.items.push('umbrella');
  current.beginChoice(2);
  assert.equal(hasCarriedUmbrella(current), false, 'the indoor choice is dry');

  current.toHall(true);
  assert.equal(hasCarriedUmbrella(current), false, 'corridor transition does not draw the umbrella');
  current.toHall(false);
  assert.equal(hasCarriedUmbrella(current), false, 'hall preview does not draw the umbrella');
});
