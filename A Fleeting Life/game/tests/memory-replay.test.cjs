'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { Game } = require('../build/Game.js');
const { SEGMENTS, POEMS, POEM_LOOK_BACK } = require('../build/Content.js');
const { CHOICE_SCENES, microResponse } = require('../build/Narrative.js');

const DT = 1 / 60;
const painter = { rect(){}, line(){}, circle(){}, text(){}, poly(){}, image(){ return false; } };

function fresh(profile, hooks = {}) {
  let saved = profile ? JSON.stringify(profile) : null;
  const writes = [];
  const game = new Game({ load: () => saved, save: value => { writes.push(value); saved = value; } }, hooks);
  game.saved = () => saved;
  game.writes = () => writes;
  return game;
}

function unlocked(ids = SEGMENTS.map(segment => segment.id), extra = {}) {
  return {
    progress: {
      runs: 4,
      segments: Object.fromEntries(ids.map(id => [String(id), { clear: true }])),
    },
    ...extra,
  };
}

function clickButton(game, label) {
  game.render(painter);
  const button = game.buttons.find(entry => entry.label === label);
  assert.ok(button, `Missing UI button ${label}`);
  const x = button.x + button.w / 2, y = button.y + button.h / 2;
  game.pointerDown(x, y);
  game.pointerUp(x, y);
  return button;
}

function visitAnchorButton(game) {
  game.render(painter);
  const label = game.memoryReplay.segment === 4 ? '走过门前' :
    game.memoryReplay.segment === 5 ? '坐到长椅边' :
      '触碰' + SEGMENTS[game.memoryReplay.segment - 1].memoryAnchor.object;
  clickButton(game, label);
}

function openSegmentCard(game, n) {
  clickButton(game, '记忆册');
  const label = `记忆:segment:${n}`;
  for (let page = 0; page < 4; page++) {
    game.render(painter);
    if (game.buttons.some(button => button.label === label)) {
      clickButton(game, label);
      return;
    }
    clickButton(game, '下一页');
  }
  assert.fail(`Missing segment ${n} card`);
}

function assertOriginalCard(game, n) {
  assert.equal(game.screen, 'hall');
  assert.equal(game.memoryReplay, null);
  assert.equal(game.panel, 'memoryBook');
  assert.equal(game.panelPage, -n);
  game.render(painter);
  assert.ok(game.buttons.some(button => button.label === '快速重跑本段'));
}

function visibleText(game) {
  const parts = [];
  game.render({ ...painter, text(value) { parts.push(String(value)); } });
  return parts.join('').replace(/\s+/g, '');
}

function assertVisibleText(text, expected, message) {
  for (const line of expected.split('\n')) {
    assert.ok(text.includes(line.replace(/\s+/g, '')), message || `Missing visible text: ${line}`);
  }
}

function expectedResponse(n, id) {
  const outcome = CHOICE_SCENES[n].outcomes.find(entry => entry.trigger.id === id);
  assert.ok(outcome, `Missing authored response for segment ${n}, ${id}`);
  return outcome.response;
}

function advance(game, seconds) {
  for (let frame = 0; frame < Math.ceil(seconds / DT); frame++) game.update(DT);
}

function finishReplay(game, n, maxSeconds = 20) {
  const stages = new Set();
  let poemText = '';
  const alreadyElapsed = game.memoryReplay.totalElapsed;
  let elapsed = 0;
  for (let frame = 0; frame < Math.ceil(maxSeconds / DT) && game.memoryReplay; frame++) {
    stages.add(game.memoryReplay.stage);
    if (game.memoryReplay.stage === 'poem' && !poemText) poemText = visibleText(game);
    game.update(DT);
    elapsed += DT;
  }
  elapsed += alreadyElapsed;
  assert.ok(elapsed < maxSeconds, `segment ${n} memory replay reached ${maxSeconds} seconds`);
  assertOriginalCard(game, n);
  return { elapsed, stages, poemText };
}

function beginChoice(game, n) {
  assert.equal(game.startMemoryReplay(n), true);
  assert.equal(game.screen, 'memory');
  assert.equal(game.memoryReplay.segment, n);
  assert.equal(game.memoryReplay.stage, 'object');
  assert.equal(game.touchMemoryObject(), true);
  assert.equal(game.memoryReplay.stage, 'touchResponse');
  assert.equal(game.chooseMemoryReplay(game.memoryVisibleChoiceIds()[0] || 'forward'), false);
  advance(game, 1.5);
  assert.equal(game.memoryReplay.stage, 'touchResponse', 'object feedback needs time to be read');
  advance(game, n === 5 ? .55 : .5);
  assert.equal(game.memoryReplay.stage, 'choice');
}

function swipeLeft(game) {
  game.render(painter);
  const starts = [180, 130, 160, 200, 90, 220, 65]
    .flatMap(y => [420, 380, 340, 300, 260].map(x => [x, y]));
  const point = starts.find(([x, y]) => !game.buttons.some(button =>
    x >= button.x && x <= button.x + button.w && y >= button.y && y <= button.y + button.h));
  assert.ok(point, 'memory scene needs a free area for the left swipe');
  game.pointerDown(point[0], point[1]);
  game.pointerMove(point[0] - 80, point[1]);
  game.pointerUp(point[0] - 80, point[1]);
}

test('a blocked replay swipe is visible on the card without covering choices', () => {
  const game = fresh(unlocked([1]));
  beginChoice(game, 1);
  swipeLeft(game);
  assert.equal(game.memoryReplay.stage, 'choice');
  assert.equal(game.memoryReplay.selected, '');
  assert.equal(game.inputRipples.at(-1)?.kind, 'blocked');
  advance(game, .25);

  const draws = [];
  game.render({
    ...painter,
    rect(x, y, w, h, color) { draws.push({ kind: 'rect', x, y, w, h, color }); },
    circle(x, y, r, color) { draws.push({ kind: 'circle', x, y, r, color }); },
  });
  const paperIndex = draws.findIndex(draw => draw.kind === 'rect' &&
    draw.x === 26 && draw.y === 53 && draw.w === 428 && draw.h === 177);
  const rippleIndex = draws.findIndex(draw => draw.kind === 'circle' &&
    draw.color === 'rgba(184,91,76,0.25)');
  assert.ok(paperIndex >= 0 && rippleIndex > paperIndex, 'the blocked ripple must paint over the memory card');
  const ripple = draws[rippleIndex];
  assert.ok(ripple.r > 10, 'the ripple should remain visible after expanding');
  assert.ok(ripple.x - ripple.r >= 26 && ripple.x + ripple.r <= 454);
  assert.ok(ripple.y - ripple.r >= 53 && ripple.y + ripple.r <= 230);
  assert.ok(draws.some(draw => draw.kind === 'circle' && draw.color === '#b76f5b' &&
    draw.x === ripple.x && draw.y === ripple.y), 'the blocked ripple needs its visible center');

  const choiceButtons = game.buttons.filter(button => button.y >= 140);
  assert.ok(choiceButtons.length > 0);
  for (const button of choiceButtons) {
    const dx = Math.max(button.x - ripple.x, 0, ripple.x - button.x - button.w);
    const dy = Math.max(button.y - ripple.y, 0, ripple.y - button.y - button.h);
    assert.ok(Math.hypot(dx, dy) > ripple.r, `the ripple overlaps choice ${button.label}`);
  }
});

test('only cleared numeric segments expose the quick replay card action', () => {
  const game = fresh(unlocked([1]));
  for (const id of [0, 2, 8, -1]) assert.equal(game.startMemoryReplay(id), false, `segment ${id} is locked or invalid`);
  assert.equal(game.memoryReplay, null);
  assert.equal(game.screen, 'hall');
  openSegmentCard(game, 1);
  game.render(painter);
  assert.ok(game.buttons.some(button => button.label === '快速重跑本段'));
  clickButton(game, '快速重跑本段');
  assert.equal(game.screen, 'memory');
  assert.equal(game.memoryReplay.segment, 1);
  game.returnFromMemoryReplay();
  assertOriginalCard(game, 1);
  clickButton(game, '回目录');
  clickButton(game, '记忆:segment:2');
  game.render(painter);
  assert.ok(!game.buttons.some(button => button.label === '快速重跑本段'));
  assert.equal(game.writes().length, 0);
});

test('all seven anchor actions sound once and show readable feedback before the next beat', () => {
  for (const segment of SEGMENTS) {
    const sounds = [];
    const game = fresh(unlocked([segment.id]), { sound: name => sounds.push(name) });
    assert.equal(game.startMemoryReplay(segment.id), true, `segment ${segment.id} should enter`);
    assert.equal(game.screen, 'memory');
    assert.equal(game.memoryReplay.segment, segment.id);
    assert.equal(game.memoryReplay.stage, 'object');
    assert.equal(game.memoryReplay.selected, '');
    assert.equal(typeof game.memoryReplay.elapsed, 'number');
    assert.equal(typeof game.memoryReplay.hasPen, 'boolean');
    assertVisibleText(visibleText(game), segment.memoryAnchor.object);
    if (segment.id === 4) {
      assertVisibleText(visibleText(game), '走过门前，让这一页继续。');
      assert.ok(!visibleText(game).includes('触碰眼前的物件'));
    }
    if (segment.id === 5) assertVisibleText(visibleText(game), '在另一个孩子旁坐一会儿');
    const before = sounds.filter(name => name === segment.memoryAnchor.sound).length;
    visitAnchorButton(game);
    assert.equal(sounds.filter(name => name === segment.memoryAnchor.sound).length, before + 1,
      `segment ${segment.id} must sound when its anchor action occurs`);
    assert.equal(game.memoryReplay.stage, 'touchResponse');
    const expected = microResponse(segment.memoryAnchor.id) || ({
      homework: '指尖压住作业本的折角，纸页在手下轻轻作响。',
      door: '走过办公室门前，门缝里的光落在脚边。',
    })[segment.memoryAnchor.id];
    assert.ok(expected, `segment ${segment.id} needs an authored anchor response`);
    assertVisibleText(visibleText(game), expected);
    assert.deepEqual(game.memoryVisibleChoiceIds(), [], 'choices must wait for the object response');
    advance(game, 1.5);
    assert.equal(game.memoryReplay.stage, 'touchResponse');
    advance(game, segment.id === 5 ? .55 : .5);
    assert.equal(game.memoryReplay.stage, segment.id === 7 ? 'response' : 'choice');
    assert.equal(game.touchMemoryObject(), false, 'the same anchor action cannot be repeated');
    assert.equal(sounds.filter(name => name === segment.memoryAnchor.sound).length, before + 1);
    assert.equal(game.run.active, false);
    game.returnFromMemoryReplay();
    assertOriginalCard(game, segment.id);
  }
});

test('the bench short memory stays beside the child for two seconds without writing a choice', () => {
  const game = fresh(unlocked([5]));
  assert.equal(game.startMemoryReplay(5), true);
  assert.equal(game.touchMemoryObject(), true);
  advance(game, 1.9);
  assert.equal(game.memoryReplay.stage, 'touchResponse');
  assert.deepEqual(game.memoryVisibleChoiceIds(), []);
  assert.equal(game.run.events.includes('bench'), false);
  assert.equal(game.writes().length, 0);
  advance(game, .15);
  assert.equal(game.memoryReplay.stage, 'choice');
  assert.ok(game.memoryReplay.totalElapsed >= 2);
  assert.equal(game.writes().length, 0);
});

test('visible main choices give their own response and the right poem, then finish in 10–20 seconds', () => {
  const routes = [
    [1, 'umbrella'],
    [2, 'seat1'], [2, 'seat2'], [2, 'seat3'],
    [3, 'faceExam'], [3, 'noPen'],
    [4, 'pianoPractice'], [4, 'pianoSmash'],
    [5, 'apologize'], [5, 'slamDoor'],
    [6, 'forward'],
  ];
  for (const [n, id] of routes) {
    const game = fresh(unlocked([n]));
    beginChoice(game, n);
    assert.equal(game.chooseMemoryReplay('invalid-choice'), false);
    assert.equal(game.chooseMemoryReplay(id), true, `${n}/${id} should be selectable`);
    assert.equal(game.memoryReplay.selected, id);
    assert.equal(game.memoryReplay.stage, 'response');
    assertVisibleText(visibleText(game), expectedResponse(n, id), `${n}/${id} showed the wrong response`);
    const result = finishReplay(game, n);
    assert.ok(result.stages.has('poem'), `${n}/${id} never reached the poem page`);
    assertVisibleText(result.poemText, POEMS[n - 1], `${n}/${id} showed the wrong poem`);
    assert.ok(result.elapsed >= 9.9 && result.elapsed < 20,
      `${n}/${id} took ${result.elapsed.toFixed(2)} seconds`);
    assert.equal(game.ending, '', 'a memory must not start an ending');
    assert.equal(game.writes().length, 0);
  }
});

test('the alley and skipped class remain short branch responses without a poem or ending', () => {
  for (const [n, id] of [[1, 'alley'], [2, 'skipClass']]) {
    const game = fresh(unlocked([n]));
    beginChoice(game, n);
    assert.equal(game.chooseMemoryReplay(id), true);
    assert.equal(game.memoryReplay.selected, id);
    assertVisibleText(visibleText(game), expectedResponse(n, id));
    const result = finishReplay(game, n);
    assert.ok(!result.stages.has('poem'), `${id} invented a missing poem`);
    assert.ok(result.elapsed >= 9.9 && result.elapsed < 20,
      `${id} took ${result.elapsed.toFixed(2)} seconds`);
    assert.equal(game.ending, '');
    assert.deepEqual(game.profile.lights, []);
    assert.deepEqual(game.profile.progress.endings, {});
  }
});

test('segment three offers cheating only after the memory pen is taken', () => {
  const noPen = fresh(unlocked([3]));
  beginChoice(noPen, 3);
  assert.equal(noPen.memoryReplay.hasPen, false);
  assert.equal(noPen.chooseMemoryReplay('cheat'), false);
  assert.equal(noPen.memoryReplay.stage, 'choice');
  assert.equal(noPen.memoryReplay.selected, '');
  assert.equal(noPen.chooseMemoryReplay('noPen'), true);
  assertVisibleText(visibleText(noPen), expectedResponse(3, 'noPen'));
  assertVisibleText(finishReplay(noPen, 3).poemText, POEMS[2]);

  const withPen = fresh(unlocked([3]));
  beginChoice(withPen, 3);
  assert.equal(withPen.toggleMemoryPen(), true);
  assert.equal(withPen.memoryReplay.hasPen, true);
  assert.equal(withPen.chooseMemoryReplay('cheat'), true);
  assert.equal(withPen.memoryReplay.selected, 'cheat');
  assertVisibleText(visibleText(withPen), expectedResponse(3, 'cheat'));
  assertVisibleText(finishReplay(withPen, 3).poemText, POEMS[2]);
  assert.equal(withPen.profile.progress.runs, 4);
  assert.equal(withPen.writes().length, 0);
});

test('segment four keeps closing the piano hidden but accepts a real long press', () => {
  const game = fresh(unlocked([4]));
  beginChoice(game, 4);
  game.render(painter);
  assert.ok(!game.buttons.some(button => /合盖/.test(button.label)), 'closing the piano must not be a visible choice button');
  assert.equal(game.chooseMemoryReplay('pianoClose'), false, 'the hidden action cannot be chosen through the choice API');
  game.pointerDown(371, 123);
  for (let frame = 0; frame < Math.ceil(.72 / DT); frame++) game.update(DT);
  game.pointerUp(371, 123);
  assert.equal(game.memoryReplay.selected, 'pianoClose');
  assert.equal(game.memoryReplay.stage, 'response');
  assertVisibleText(visibleText(game), expectedResponse(4, 'pianoClose'));
  assertVisibleText(finishReplay(game, 4).poemText, POEMS[3]);
  assert.ok(!game.profile.achievements.includes('sharpEyes'), 'the memory cannot unlock the hidden achievement');
  assert.equal(game.writes().length, 0);
});

test('touches and swipes begun during object feedback cannot become a later hidden choice', () => {
  const piano = fresh(unlocked([4]));
  assert.equal(piano.startMemoryReplay(4), true);
  assert.equal(piano.touchMemoryObject(), true);
  piano.render(painter);
  piano.pointerDown(371, 123);
  advance(piano, 2.5);
  piano.pointerUp(371, 123);
  assert.equal(piano.memoryReplay.stage, 'choice');
  assert.equal(piano.memoryReplay.selected, '');

  const returnPath = fresh(unlocked([6], { lights: ['morning', 'backrow', 'outside', 'desk'] }));
  assert.equal(returnPath.startMemoryReplay(6), true);
  assert.equal(returnPath.touchMemoryObject(), true);
  swipeLeft(returnPath);
  advance(returnPath, 2);
  assert.equal(returnPath.memoryReplay.stage, 'choice');
  assert.equal(returnPath.memoryReplay.selected, '');
});

test('segment six permits the hidden left-swipe return only after all four lights are lit', () => {
  const threeLights = fresh(unlocked([6], { lights: ['morning', 'backrow', 'outside'] }));
  beginChoice(threeLights, 6);
  assert.equal(threeLights.chooseMemoryReplay('back'), false);
  swipeLeft(threeLights);
  assert.equal(threeLights.memoryReplay.stage, 'choice');
  assert.equal(threeLights.memoryReplay.selected, '');
  assert.equal(threeLights.chooseMemoryReplay('forward'), true);
  assertVisibleText(finishReplay(threeLights, 6).poemText, POEMS[5]);

  const fourLights = fresh(unlocked([6], { lights: ['morning', 'backrow', 'outside', 'desk'] }));
  beginChoice(fourLights, 6);
  fourLights.render(painter);
  assert.ok(!fourLights.buttons.some(button => /回头/.test(button.label)), 'returning must stay hidden from choice buttons');
  assert.equal(fourLights.chooseMemoryReplay('back'), false);
  swipeLeft(fourLights);
  assert.equal(fourLights.memoryReplay.selected, 'back');
  assert.equal(fourLights.memoryReplay.stage, 'response');
  assertVisibleText(visibleText(fourLights), expectedResponse(6, 'back'));
  assertVisibleText(finishReplay(fourLights, 6).poemText, POEM_LOOK_BACK);
  assert.ok(!fourLights.profile.achievements.includes('lookBack'));
  assert.deepEqual(fourLights.profile.lights, ['morning', 'backrow', 'outside', 'desk']);
  assert.equal(fourLights.writes().length, 0);
});

test('segment seven has an object and response, but no choice, poem or ending', () => {
  const game = fresh(unlocked([7]));
  assert.equal(game.startMemoryReplay(7), true);
  assert.equal(game.chooseMemoryReplay('forward'), false);
  assert.equal(game.touchMemoryObject(), true);
  assert.equal(game.memoryReplay.stage, 'touchResponse');
  assertVisibleText(visibleText(game), microResponse('wish'));
  advance(game, 2);
  assert.equal(game.memoryReplay.stage, 'response');
  assert.equal(game.chooseMemoryReplay('wish'), false);
  const result = finishReplay(game, 7);
  assert.ok(!result.stages.has('choice'));
  assert.ok(!result.stages.has('poem'));
  assert.ok(result.elapsed >= 9.9 && result.elapsed < 20);
  assert.equal(game.ending, '');
  assert.deepEqual(game.profile.progress.endings, {});
  assert.deepEqual(game.profile.lights, []);
});

test('short replays never write, change save bytes, or mutate run and progression state', () => {
  const profile = unlocked(undefined, {
    fragments: 231,
    wrappers: 12,
    achievements: ['sharpEyes'],
    lights: ['morning', 'backrow', 'outside', 'desk'],
    recordings: [{ id: 'sample-clip', kind: 'highlight', score: 30, frames: [] }],
  });
  profile.progress.runs = 9;
  profile.progress.segmentMemories = {
    '3': { runId: 9, anchorEvent: 'ownHomework', choiceEvent: 'faceExam', poemSeen: true },
  };
  const game = fresh(profile);
  const savedBefore = game.saved();
  const bytesBefore = Buffer.byteLength(savedBefore, 'utf8');
  const profileBefore = JSON.stringify(game.profile);
  const runBefore = JSON.stringify(game.run);
  openSegmentCard(game, 3);
  clickButton(game, '快速重跑本段');
  assert.equal(game.touchMemoryObject(), true);
  advance(game, 2);
  assert.equal(game.toggleMemoryPen(), true);
  assert.equal(game.chooseMemoryReplay('cheat'), true);
  finishReplay(game, 3);
  assert.equal(game.writes().length, 0);
  assert.equal(game.saved(), savedBefore);
  assert.equal(Buffer.byteLength(game.saved(), 'utf8'), bytesBefore);
  assert.equal(JSON.stringify(game.profile), profileBefore);
  assert.equal(JSON.stringify(game.run), runBefore);
  assert.equal(game.profile.progress.runs, 9);
  assert.equal(game.profile.fragments, 231);
  assert.deepEqual(game.profile.achievements, ['sharpEyes']);
  assert.deepEqual(game.profile.lights, ['morning', 'backrow', 'outside', 'desk']);
  assert.deepEqual(game.profile.recordings, [{ id: 'sample-clip', kind: 'highlight', score: 30, frames: [] }]);
});

test('Back, the scene exit button and app backgrounding return to the same card immediately', () => {
  const exits = [
    ['Back', game => game.back()],
    ['Escape', game => { game.keyDown('Escape'); game.keyUp('Escape'); }],
    ['scene exit', game => clickButton(game, '回记忆册')],
    ['background', game => { game.appHide(); game.appShow(); }],
  ];
  for (const [name, leave] of exits) {
    const game = fresh(unlocked([5]));
    openSegmentCard(game, 5);
    clickButton(game, '快速重跑本段');
    assert.equal(game.touchMemoryObject(), true);
    assert.equal(game.memoryReplay.stage, 'touchResponse');
    leave(game);
    assertOriginalCard(game, 5);
    assert.equal(game.paused, false, `${name} left the scene paused`);
    assert.equal(game.run.active, false);
    assert.equal(game.writes().length, 0);
  }
});
