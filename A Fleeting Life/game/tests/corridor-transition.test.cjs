const test = require('node:test');
const assert = require('node:assert/strict');
const { Game } = require('../build/Game.js');
const { selectSceneMusic } = require('../build/SceneMusic.js');
const { corridorCellOccupied, corridorPoseBottom } = require('../build/CorridorPixels.js');

const dt = 1 / 60;

function fresh() {
  return new Game({ load: () => null, save() {} });
}

function recordingPainter() {
  const calls = [];
  return {
    calls,
    rect() {}, line() {}, circle() {}, text() {}, poly() {},
    image(key, x, y, w, h, opacity = 1) {
      calls.push({ kind: 'image', key, x, y, w, h, opacity });
      return true;
    },
    imageRegion(key, sx, sy, sw, sh, x, y, w, h, opacity = 1) {
      calls.push({ kind: 'imageRegion', key, sx, sy, sw, sh, x, y, w, h, opacity });
      return true;
    },
  };
}

function render(game) {
  const painter = recordingPainter();
  game.render(painter);
  return painter.calls;
}

function advanceTo(game, time) {
  for (let i = 0; game.phase === 'corridorTransition' && game.corridorTransitionTime + dt / 2 < time && i < 14 / dt; i++) {
    game.update(dt);
  }
  assert.equal(game.phase, 'corridorTransition', `transition ended before ${time}s`);
}

function firstTickAtOrAfter(game, time) {
  let tick = game.corridorTransitionTime;
  while (tick + 1e-12 < time) tick += dt;
  return tick;
}

function advanceUntilHall(game) {
  for (let i = 0; i < 14 / dt && game.screen !== 'hall'; i++) game.update(dt);
  assert.equal(game.screen, 'hall', `transition did not finish: ${game.phase}/${game.phaseTime}`);
}

function clickButton(game, label) {
  const button = game.buttons.find(candidate => candidate.label === label);
  assert.ok(button, `${label} button is visible`);
  const x = button.x + button.w / 2, y = button.y + button.h / 2;
  game.pointerDown(x, y);
  game.pointerUp(x, y);
}

function near(a, b) { return Math.abs(a - b) < 1e-6; }

function regionsFor(calls, fragment) {
  const source = [fragment.sourceX / 48, fragment.sourceY / 48, fragment.size / 48, fragment.height / 48];
  return calls.filter(call => call.kind === 'imageRegion' && call.key?.startsWith('character.') &&
    [call.sx, call.sy, call.sw, call.sh].every((value, index) => near(value, source[index])));
}

function visibleFragments(game) {
  return game.corridorFragments.filter(fragment => fragment.hasPixels && fragment.height > 0 && fragment.alpha > 0);
}

function assertEveryTileUsesItsSource(game, calls) {
  const visible = visibleFragments(game);
  const actorRegions = calls.filter(call => call.kind === 'imageRegion' && call.key?.startsWith('character.'));
  assert.equal(actorRegions.length, visible.length, 'each visible body or ground tile has exactly one crop');
  for (const fragment of visible) {
    const matches = regionsFor(calls, fragment);
    assert.equal(matches.length, 1, `one ${fragment.sourceX},${fragment.sourceY} tile`);
    const crop = matches[0];
    assert.ok(crop.key.endsWith(`.${fragment.sourcePose}.${String(fragment.sourceFrame).padStart(2, '0')}`),
      'each tile uses the moving pose or its captured detachment pose');
    assert.ok(near(crop.x, fragment.x) && near(crop.y, fragment.y),
      'the crop is drawn at its current body or falling position');
    assert.ok(near(crop.h, fragment.height), 'the crop height matches the visible source pixels');
    assert.ok(near(crop.opacity, fragment.detached ? fragment.alpha : 1),
      'attached pixels stay opaque while detached pixels use the fragment fade');
  }
  return actorRegions;
}

test('corridor return clears stale UI state, blocks movement, pauses by touch and ends with no hall actor', () => {
  const game = fresh();
  game.start();
  game.ending = 'morning';
  game.notice = '旧提示'; game.noticeTime = 2;
  game.inputRipples.push({ x: 200, y: 120, time: .35, duration: .35, kind: 'deadZone' });
  game.panel = 'shop'; game.exitConfirm = true;
  game.toHall(true);

  assert.equal(game.screen, 'play');
  assert.equal(game.phase, 'corridorTransition');
  assert.equal(game.corridorTransitionDuration, 8.6);
  assert.equal(game.corridorWalkDuration, 6.6);
  assert.equal(game.corridorTransitionTime, 0);
  assert.equal(game.corridorFragments.length, 54);
  assert.equal(game.notice, '');
  assert.equal(game.noticeTime, 0);
  assert.equal(game.inputRipples.length, 0);
  assert.equal(game.panel, '');
  assert.equal(game.exitConfirm, false);
  assert.equal(selectSceneMusic(game), 'corridor');

  const originalY = game.y;
  game.jump(); game.down(); game.left(); game.keyDown(' ');
  game.pointerDown(240, 120); game.pointerUp(240, 120);
  assert.equal(game.y, originalY);
  assert.equal(game.pointer, null);

  render(game);
  clickButton(game, '暂停');
  assert.equal(game.paused, true);
  render(game);
  assert.ok(game.buttons.some(button => button.label === '继续回到回廊'));
  const pausedTime = game.corridorTransitionTime;
  const pausedFragments = game.corridorFragments.map(({ x, y, detached, landed, alpha }) => ({ x, y, detached, landed, alpha }));
  game.update(1);
  assert.equal(game.corridorTransitionTime, pausedTime);
  assert.deepEqual(game.corridorFragments.map(({ x, y, detached, landed, alpha }) => ({ x, y, detached, landed, alpha })), pausedFragments);
  clickButton(game, '继续回到回廊');
  assert.equal(game.paused, false);

  advanceUntilHall(game);
  assert.equal(game.phase, 'run');
  assert.equal(game.corridorTransitionTime, 0);
  assert.equal(game.corridorFragments.length, 0);
  assert.equal(game.buttons.length, 0);
  const hall = render(game);
  assert.equal(hall.filter(call => call.key?.startsWith('character.')).length, 0,
    'the player controls the view after the model falls away; hall must not draw another Xiaoman');
  assert.equal(game.debugGeometry, false);
});

test('each ending exits its own door toward the right and stops within the corridor', () => {
  const doors = {
    morning: 110, backrow: 184, outside: 258, desk: 332, secondGrade: 414,
    wall: 40, runaway: 40, missing: 40,
  };
  for (const [ending, origin] of Object.entries(doors)) {
    const game = fresh();
    game.start(); game.ending = ending; game.toHall(true);
    const destination = origin + Math.min(80, 450 - origin);
    assert.equal(game.corridorDoorX, origin, ending);
    assert.equal(game.corridorActorX(0), origin, ending);
    assert.ok(game.corridorActorX(1.1) > origin, `${ending} walks right out of its door`);
    assert.ok(game.corridorActorX(1.1) < destination, ending);
    assert.ok(game.corridorActorX(2.2) < destination, `${ending} is still walking while shedding begins`);
    assert.ok(game.corridorActorX(4) < destination, `${ending} keeps walking during shedding`);
    assert.ok(near(game.corridorActorX(game.corridorWalkDuration), destination), `${ending} reaches the end of its walk`);
    assert.ok(near(game.corridorActorX(8), destination), `${ending} remains at the final walk position`);
  }
});

test('detached 4px pieces keep walking frames, capture their fall frame and land at the shared floor', () => {
  const game = fresh();
  game.start();
  game.profile.equippedSlots.skin = 'raincoat';
  game.run.stats = { personality: 50, relationship: 90, will: 50, appearance: 50 };
  game.ending = 'desk';
  game.toHall(true);

  assert.equal(game.corridorFragments.length, 54);
  for (const fragment of game.corridorFragments) {
    assert.equal(fragment.size, 4);
    assert.equal(fragment.detached, false);
    assert.equal(fragment.groundY, 216);
    assert.ok(Number.isInteger(fragment.sourceX) && fragment.sourceX >= 0 && fragment.sourceX % 4 === 0 && fragment.sourceX + 4 <= 48);
    assert.ok(Number.isInteger(fragment.sourceY) && fragment.sourceY >= 0 && fragment.sourceY % 4 === 0 && fragment.sourceY + 4 <= 48);
    assert.ok(fragment.height >= 0 && fragment.height <= 4);
  }

  advanceTo(game, 2.4);
  const subject = game.corridorFragments.find(fragment => {
    if (fragment.detached || fragment.delay <= 2.5 || fragment.delay >= 5.8) return false;
    const capture = game.corridorActorFrame(firstTickAtOrAfter(game, fragment.delay));
    return corridorPoseBottom(capture.pose, capture.frame) > fragment.sourceY &&
      corridorCellOccupied(capture.pose, capture.frame, fragment.sourceX, fragment.sourceY, fragment.size);
  });
  assert.ok(subject, 'pieces detach progressively after the walk');
  assert.ok(game.corridorActorX() < game.corridorActorX(game.corridorWalkDuration),
    'the actor is still moving when attached pieces are shedding');
  const attachedCalls = render(game);
  assertEveryTileUsesItsSource(game, attachedCalls);
  const attached = regionsFor(attachedCalls, subject);
  assert.equal(attached.length, 1, 'one source tile is part of the visible body before detachment');
  assert.equal(attached[0].opacity, 1, 'the body keeps its original opacity');
  assert.equal(attached[0].h, subject.height, 'attached crops use the current frame height');

  const walkingFrames = new Set();
  for (let i = 0; i < 48 && game.phase === 'corridorTransition'; i++) {
    game.update(dt);
    for (const fragment of game.corridorFragments) {
      if (!fragment.detached && fragment.hasPixels) walkingFrames.add(`${fragment.sourcePose}.${fragment.sourceFrame}`);
    }
  }
  assert.ok(walkingFrames.size > 1, 'attached fragments follow a changing walk frame while the actor moves');

  advanceTo(game, subject.delay + .4);
  assert.equal(subject.detached, true);
  assert.equal(subject.hasPixels, true, 'the selected detached fragment has visible pixels in its captured frame');
  const captured = {
    sourcePose: subject.sourcePose,
    sourceFrame: subject.sourceFrame,
    sourceKey: subject.sourceKey,
    height: subject.height,
  };
  const detachedSnapshots = new Map();
  detachedSnapshots.set(subject, captured);
  const fallingCalls = render(game);
  assertEveryTileUsesItsSource(game, fallingCalls);
  const falling = regionsFor(fallingCalls, subject);
  assert.equal(falling.length, 1, 'the body tile is removed when its matching ground piece appears');
  assert.ok(near(falling[0].x, subject.x) && near(falling[0].y, subject.y),
    'the same source tile is now drawn at the falling fragment position');
  assert.ok(!near(falling[0].x, attached[0].x) || !near(falling[0].y, attached[0].y),
    'the fragment actually leaves its original body position');
  assert.equal(subject.sourcePose, captured.sourcePose, 'the detached pose is captured once');
  assert.equal(subject.sourceFrame, captured.sourceFrame, 'the detached frame is captured once');
  assert.equal(subject.sourceKey, captured.sourceKey, 'the detached source key is captured once');
  assert.equal(subject.height, captured.height, 'the detached crop height is captured once');
  assert.equal(falling[0].h, subject.height, 'the detached crop uses the captured visible height');
  assert.ok(!fallingCalls.some(call => call.kind === 'image' && call.key?.startsWith('character.') &&
    call.w === 48 && call.h === 48 && call.opacity > 0),
    'a full character image would fill the detached hole');

  let sawTransparentDetachment = false;
  for (let i = 0; game.phase === 'corridorTransition' && i < 14 / dt; i++) {
    game.update(dt);
    for (const fragment of game.corridorFragments) {
      assert.equal(fragment.groundY, 216);
      assert.ok(fragment.y + fragment.height <= 216 + 1e-6, 'a visible falling tile must not sink below the floor');
      if (fragment.detached && fragment.hasPixels) {
        let snapshot = detachedSnapshots.get(fragment);
        if (!snapshot) {
          snapshot = {
            sourcePose: fragment.sourcePose,
            sourceFrame: fragment.sourceFrame,
            sourceKey: fragment.sourceKey,
            height: fragment.height,
          };
          detachedSnapshots.set(fragment, snapshot);
        }
        assert.equal(fragment.sourcePose, snapshot.sourcePose, 'a detached piece keeps its source pose');
        assert.equal(fragment.sourceFrame, snapshot.sourceFrame, 'a detached piece keeps its source frame');
        assert.equal(fragment.sourceKey, snapshot.sourceKey, 'a detached piece keeps its source key');
        assert.equal(fragment.height, snapshot.height, 'a detached piece keeps its captured height');
      }
      if (fragment.detached && !fragment.hasPixels) {
        sawTransparentDetachment = true;
        assert.equal(fragment.alpha, 0, 'an empty detached cell is invisible');
        assert.equal(fragment.landed, false, 'an empty detached cell does not create a ground shadow');
      }
    }
  }
  assert.equal(sawTransparentDetachment, true, 'transparent source cells never create visible fragments or ground shadows');
  assert.equal(game.screen, 'hall');
});

test('reduced motion uses eighteen 8px source tiles and backgrounding keeps the transition paused', () => {
  const game = fresh();
  game.settings.reducedMotion = true;
  game.start(); game.toHall(true);
  assert.equal(game.corridorFragments.length, 18);
  for (const fragment of game.corridorFragments) {
    assert.equal(fragment.size, 8);
    assert.equal(fragment.groundY, 216);
    assert.ok(fragment.sourceX >= 0 && fragment.sourceX % 8 === 0 && fragment.sourceX + 8 <= 48);
    assert.ok(fragment.sourceY >= 0 && fragment.sourceY % 8 === 0 && fragment.sourceY + 8 <= 48);
    assert.ok(fragment.height >= 0 && fragment.height <= 8);
  }
  advanceTo(game, 2.5);
  assertEveryTileUsesItsSource(game, render(game));
  game.appHide();
  assert.equal(game.paused, true);
  const pausedTime = game.corridorTransitionTime;
  game.update(1); game.appShow(); game.update(1);
  assert.equal(game.corridorTransitionTime, pausedTime);
  render(game);
  clickButton(game, '继续回到回廊');
  advanceTo(game, 8.5);
  advanceUntilHall(game);
});

test('a held Escape only pauses once until keyUp permits a second press', () => {
  const game = fresh();
  game.start(); game.toHall(true);
  game.keyDown('Escape');
  assert.equal(game.paused, true);
  game.keyDown('Escape');
  assert.equal(game.paused, true, 'OS key repeat must not resume the cinematic');
  game.keyUp('Escape');
  game.keyDown('Escape');
  assert.equal(game.paused, false);
});
