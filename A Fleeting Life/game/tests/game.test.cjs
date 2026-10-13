'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { Game, makeHellCourse } = require('../build/Game.js');
const { VideoReplayEvidence } = require('../build/ReplayEvidence.js');
const { SEGMENTS, BRANCHES } = require('../build/Content.js');
const { CHOICE_AFTER, FRAGMENT_MEMORIES, sceneOpeningEcho, sceneStory } = require('../build/Narrative.js');
const { CHAIRS, CHAIR_HEIGHT, CHOICE_PROPS, PLAYGROUND_SIDE_DOOR_AT, RUN_SPEED, chairSurface, choicePropBounds, obstacleBounds,
  overlaps, playerBodyBounds, pickupSafetyBand, validateFragmentSpots, worldX } = require('../build/Geometry.js');
const DT = 1 / 60;
const painter = { rect(){}, line(){}, circle(){}, text(){}, poly(){}, image(key){ return key.startsWith('ending.sequence.'); } };
function fresh(profile, hooks = {}) {
  let saved = profile ? JSON.stringify(profile) : null;
  const game = new Game({ load: () => saved, save: value => { saved = value; } }, hooks);
  game.saved = () => saved;
  return game;
}
test('native-like runtime initializes when location exists without URLSearchParams', () => {
  const originalLocation = Object.getOwnPropertyDescriptor(globalThis, 'location');
  const originalSearchParams = Object.getOwnPropertyDescriptor(globalThis, 'URLSearchParams');
  try {
    Object.defineProperty(globalThis, 'location', { configurable: true, value: { search: '?geometryDebug=1' } });
    Object.defineProperty(globalThis, 'URLSearchParams', { configurable: true, value: undefined });
    assert.equal(fresh().geometryDebugAllowed, false);
  } finally {
    if (originalLocation) Object.defineProperty(globalThis, 'location', originalLocation);
    else delete globalThis.location;
    if (originalSearchParams) Object.defineProperty(globalThis, 'URLSearchParams', originalSearchParams);
    else delete globalThis.URLSearchParams;
  }
});
function state(game) {
  return `${game.screen}/${game.phase}/${game.branch || game.segment}/choice${game.choice} t=${game.time.toFixed(2)} pt=${game.phaseTime.toFixed(2)} lives=${game.run.lives} drops=${game.run.drops}`;
}
function until(game, predicate, maximumSeconds = 900, pilot = () => {}) {
  for (let frame = 0; frame < Math.ceil(maximumSeconds / DT); frame++) {
    if (predicate(game)) return;
    if(game.phase==='ending')game.render(painter);
    pilot(game);
    game.update(DT);
  }
  assert.fail(`Simulation deadline exceeded: ${state(game)}`);
}
function advance(game, seconds, pilot = () => {}) {
  for (let frame = 0; frame < Math.ceil(seconds / DT); frame++) {
    if(game.phase==='ending')game.render(painter);
    pilot(game);game.update(DT);
  }
}
function tap(game, x = 210, y = 120) { game.pointerDown(x, y); game.pointerUp(x, y); }
function clickButton(game, label) {
  game.render(painter);
  const button = game.buttons.find(b => b.label === label);
  assert.ok(button, `Missing UI button: ${label}`);
  game.pointerDown(button.x + button.w / 2, button.y + button.h / 2);
  game.pointerUp(button.x + button.w / 2, button.y + button.h / 2);
  return button;
}
function recordSubtitleCalls(game) {
  const calls = [], show = game.subtitles.show.bind(game.subtitles);
  game.subtitles.show = (value, options) => { calls.push(value); show(value, options); };
  return { count: value => calls.filter(call => call === value).length };
}
/** Inputs only: no coordinates/velocity/invincibility edits and no direct choice/event calls. */
function obstaclePilot() {
  const stages = new WeakMap();
  return game => {
    if (game.phase !== 'run') return;
    for (const obstacle of game.obstacles) {
      if (obstacle.done || obstacle.erased) continue;
      const remaining = obstacle.at - game.time;
      if (remaining < -.5 || remaining > .8) continue;
      const stage = stages.get(obstacle) || 0;
      if (obstacle.kind === 'high') {
        if (!stage && remaining <= .40 && remaining > 0) { game.down(); stages.set(obstacle, 1); }
      } else if (obstacle.kind === 'tall') {
        if (!stage && remaining <= .65 && remaining > 0) { game.jump(); stages.set(obstacle, 1); }
        else if (stage === 1 && remaining <= .39 && remaining > 0) { game.jump(); stages.set(obstacle, 2); }
      } else if (!stage && remaining <= .39 && remaining > 0) {
        game.jump(); stages.set(obstacle, 1);
      }
    }
  };
}
function routePilot(plan = {}) {
  const dodge = obstaclePilot(), actions = new Set();
  const visited = { segments: new Set(), choices: new Set(), branches: new Set(), rewards: new Set() };
  function once(key, condition, fn) { if (condition && !actions.has(key)) { actions.add(key); fn(); } }
  const pilot = game => {
    if (game.screen !== 'play') return;
    if (game.phase === 'run') {
      if (game.branch) visited.branches.add(game.branch); else visited.segments.add(game.segment);
      if (game.branch === 'playground' && plan.side === 'return') {
        once('side-jump', game.time >= PLAYGROUND_SIDE_DOOR_AT - .15, () => game.jump());
        once('side-dive', game.time >= PLAYGROUND_SIDE_DOOR_AT + .10, () => game.down());
      }
      if (!game.branch && game.segment === 3 && plan.homework === 'own') {
        once('homework-jump', game.time >= game.duration * .7 - .32, () => game.jump());
      }
      if (!game.branch && game.segment === 4 && plan.speech === 'silent') {
        once('speech-jump', game.time >= game.duration * .5 - .32, () => game.jump());
      }
      dodge(game);
    }
    if (game.phase === 'alleyExit' && plan.alley === 'wall') {
      const ledge = game.interactionTarget();
      once('wall-jump', ledge?.x <= 144, () => game.jump());
      once('wall-double-jump', ledge?.x <= 126, () => game.jump());
    }
    if (game.phase === 'reward') visited.rewards.add(game.reward);
    if (game.phase !== 'choice') return;
    const n = game.choice, t = game.phaseTime;
    visited.choices.add(n);
    if (n === 1 && plan.road === 'alley') once('alley-jump', t >= CHOICE_PROPS.wall.at - .45, () => game.jump());
    if (n === 2 && plan.seat !== 'skip') {
      const center = CHAIRS[Number((plan.seat || 'seat1').slice(-1)) - 1].at;
      once('seat-jump', t >= center - .30, () => game.jump());
      once('seat-dive', t >= center - .08, () => game.down());
    }
    if (n === 3 && plan.exam === 'face') once('exam-jump', t >= CHOICE_PROPS.exam.at - .38, () => game.jump());
    if (n === 4 && plan.piano === 'smash') {
      once('piano-jump', t >= CHOICE_PROPS.piano.at - .5, () => game.jump());
      once('piano-dive', t >= CHOICE_PROPS.piano.at - .28, () => game.down());
    }
    if (n === 5 && plan.door === 'apologize') once('apologize', t >= CHOICE_PROPS.bench.at - .4, () => game.down());
    if (n === 6 && plan.lookBack) once('back', game.canLookBack(), () => game.left());
  };
  pilot.visited = visited;
  return pilot;
}
const routes = {
  morning: { seat: 'seat1', homework: 'own', speech: 'silent', exam: 'face', door: 'apologize' },
  backrow: { seat: 'seat3', homework: 'own', speech: 'silent', exam: 'face', door: 'apologize' },
  outside: { seat: 'seat2', homework: 'own', speech: 'silent', exam: 'face', piano: 'smash' },
  desk: { seat: 'seat1', homework: 'own', exam: 'face', door: 'apologize' },
};
function fullRun(game, plan) {
  const pilot = routePilot(plan);
  game.start();
  until(game, g => g.phase === 'ending', 800, pilot);
  const ending = game.ending;
  assert.equal(game.run.drops, 0, `Input-only route should avoid every obstacle: ${state(game)}`);
  until(game, g => g.screen === 'hall', 110);
  return { ending, visited: pilot.visited };
}

test('all seven authored obstacle sequences are traversable with jump, double jump and slide', () => {
  for (const segment of SEGMENTS) {
    const game = fresh(); game.start(); game.beginSegment(segment.id);
    const pilot = obstaclePilot();
    until(game, g => g.phase !== 'run', segment.duration + (segment.id === 5 ? 3 : 2), pilot);
    assert.equal(game.run.drops, 0, `Segment ${segment.id}: ${state(game)}`);
    // The segment-three grade includes its immediately following exam choice.
    if (segment.id === 3) until(game, g => !!g.profile.progress.segments['3'], 8);
    assert.equal(game.profile.progress.segments[String(segment.id)].noHit, true);
    if (segment.id === 5) assert.equal(game.run.jumps, 0, 'Segment 5 admits a slide-only route');
  }
});

test('four complete input-only routes traverse seven segments and six choices, light four lamps, then reach the wall finale', () => {
  const replay = [], callbacks = [], game = fresh(null, { replay: (active, onResult) => {
    replay.push(active); if (active) callbacks.push(onResult);
  } });
  for (const [expected, plan] of Object.entries(routes)) {
    const result = fullRun(game, plan);
    assert.equal(result.ending, expected, `${expected} route stats ${JSON.stringify(game.run.stats)}`);
    assert.deepEqual([...result.visited.segments].sort(), [1,2,3,4,5,6,7]);
    assert.deepEqual([...result.visited.choices].sort(), [1,2,3,4,5,6]);
    assert.equal(result.visited.rewards.size, 1);
    assert.ok(game.profile.lights.includes(expected));
    for (let n = 1; n <= 7; n++) {
      const memory = game.profile.progress.segmentMemories[String(n)];
      assert.ok(memory, `completed segment ${n} must retain its own review record`);
      assert.equal(memory.runId, game.run.id);
      assert.equal(memory.poemSeen, n < 7, `only segments 1–6 show a poem after the choice`);
      assert.equal(!!memory.choiceEvent, n < 7, 'segment seven has no main choice');
    }
  }
  assert.equal(game.model.allLit(), true);
  clickButton(game, '墙后');
  assert.equal(game.ending, 'secondGrade');
  until(game, g => g.phase === 'finale', 92);
  assert.ok(game.profile.achievements.includes('secondGrade'));
  assert.ok(game.profile.cosmetics.includes('namelessNotebook'));
  assert.ok(replay.includes(true));
  assert.equal(game.profile.finalePlayed, false);
  advance(game, 9.2);
  callbacks[0](true);
  until(game, g => g.screen === 'hall', 38);
  assert.equal(game.profile.finalePlayed, true);
  assert.equal(replay.at(-1), false);
  assert.ok(game.profile.progress.chalk);
  const restored = fresh(JSON.parse(game.saved()));
  assert.equal(restored.model.allLit(), true);
  assert.equal(restored.profile.finalePlayed, true);
  assert.equal(Object.keys(restored.profile.endingSnapshots).length, 4);
  assert.equal(Object.keys(restored.profile.progress.segmentMemories).length, 7);
});

test('failed finale playback keeps the wall surprise retryable without delaying the remaining scene', () => {
  const attempts = []; let stops = 0;
  const game = fresh(null, { replay: (active, onResult) => {
    if (active) attempts.push(onResult); else stops++;
  } });
  game.profile.lights.push('morning', 'backrow', 'outside', 'desk');
  game.startEnding('secondGrade');
  until(game, g => g.phase === 'finale', 92);
  attempts[0](false);
  advance(game, 10.1);
  assert.equal(stops, 1, 'an early failure stops the host once, then the scene continues');
  attempts[0](true);
  assert.equal(game.profile.finalePlayed, false, 'a late success from a stopped attempt is ignored');
  until(game, g => g.screen === 'hall', 28);
  assert.equal(game.profile.finalePlayed, false);
  clickButton(game, '墙后');
  until(game, g => g.phase === 'finale', 92);
  assert.equal(attempts.length, 2, 'the wall starts a fresh replay attempt');
  attempts[0](true);
  assert.equal(game.profile.finalePlayed, false, 'the earlier attempt cannot complete the retry');
  attempts[1](true);
  assert.equal(JSON.parse(game.saved()).finalePlayed, true);
  until(game, g => g.screen === 'hall', 37);
  assert.equal(stops, 4, 'each finale boundary and hall cleanup stop the replay');
});

test('personal replay and closing text stay within fifteen seconds and a silent host times out safely', () => {
  const callbacks = [], slow = fresh(null, { replay: (active, onResult) => { if (active) callbacks.push(onResult); } });
  slow.profile.lights.push('morning', 'backrow', 'outside', 'desk');
  slow.startEnding('secondGrade');
  until(slow, g => g.phase === 'finale', 92);
  advance(slow, 9.3);
  assert.ok(slow.finaleTime < 10, 'the prose waits while the third recording finishes');
  assert.equal(slow.profile.finalePlayed, false);
  callbacks[0](true);
  until(slow,g=>g.finaleTime>=10,1);
  assert.ok(slow.finaleTime >= 10 && slow.finaleTime < 10.1);
  assert.equal(slow.profile.finalePlayed, true);
  // The closing text is followed by the authored 8.6-second corridor transition.
  until(slow, g => g.screen === 'hall', 18);
  assert.equal(slow.corridorTransitionTime,0,'the corridor transition is complete before the hall is interactive again');

  let stops = 0; const silent = fresh(null, { replay: active => { if (!active) stops++; } });
  silent.profile.lights.push('morning', 'backrow', 'outside', 'desk');
  silent.startEnding('secondGrade');
  until(silent, g => g.phase === 'finale', 92);
  advance(silent, 10.1);
  assert.equal(stops, 1);
  assert.ok(silent.finaleTime >= 10);
  assert.equal(silent.profile.finalePlayed, false);
  // The silent finale still runs its five-second closing text, then the
  // authored 8.6-second corridor transition before the hall is interactive.
  until(silent, g => g.screen === 'hall', 18);
  assert.equal(silent.profile.finalePlayed, false);
});

test('native video completion proof requires playing from the beginning and real time advance', () => {
  const errorDialog = new VideoReplayEvidence(3);
  errorDialog.onPlaying(0); errorDialog.observe(0, 0); errorDialog.observe(2.8, 10);
  assert.equal(errorDialog.completed, false);
  const oldPosition = new VideoReplayEvidence(3);
  oldPosition.onPlaying(0); oldPosition.observe(0, 0); oldPosition.observe(2.8, 3000);
  assert.equal(oldPosition.completed, false, 'one old-position jump is not a continuous video');
  const stalePosition = new VideoReplayEvidence(3);
  stalePosition.onPlaying(0); stalePosition.observe(2.8, 0);
  assert.equal(stalePosition.completed, false);
  const clip = new VideoReplayEvidence(3);
  clip.onPlaying(0);
  for (let frame = 0; frame <= 31; frame++) {
    const t = frame / 10;
    clip.observe(Math.max(0, t + (frame % 2 ? -.02 : 0)), frame * 100 + (frame > 12 ? 10000 : 0));
    if (frame === 12) { clip.pause(1200); clip.resume(11200); }
  }
  assert.equal(clip.completed, true);
  clip.observe(0, 13200);
  assert.equal(clip.completed, true, 'a completed player may reset its reported time');
  const lateFirstSample = new VideoReplayEvidence(3);
  lateFirstSample.onPlaying(0);
  for (let frame = 0; frame <= 21; frame++) lateFirstSample.observe(.85 + frame / 10, 850 + frame * 100);
  assert.equal(lateFirstSample.completed, true);
  const normalMp4 = new VideoReplayEvidence(3.1);
  normalMp4.onPlaying(0);
  for (let frame = 0; frame <= 12; frame++) normalMp4.observe(frame / 10, frame * 100);
  normalMp4.pause(1200); normalMp4.resume(11200);
  for (let frame = 13; frame <= 30; frame++) normalMp4.observe(frame / 10, 10000 + frame * 100);
  assert.equal(normalMp4.completed, true, 'the final frame timestamp may precede MP4 duration by one frame');
  normalMp4.observe(0, 13050);
  assert.equal(normalMp4.completed, true, 'natural completion may reset currentTime');
  const failedNearEnd = new VideoReplayEvidence(3.1);
  failedNearEnd.onPlaying(0);
  for (let frame = 0; frame <= 27; frame++) failedNearEnd.observe(frame / 10, frame * 100);
  assert.equal(failedNearEnd.completed, false, '2.7 seconds cannot complete a 3.1-second MP4');
  failedNearEnd.observe(0, 2750);
  assert.equal(failedNearEnd.completed, false, 'an error completion resetting currentTime stays invalid');
  const skippedPause = new VideoReplayEvidence(3);
  skippedPause.onPlaying(0); skippedPause.observe(0, 0); skippedPause.pause(1000); skippedPause.resume(11000);
  skippedPause.observe(2.8, 11010);
  assert.equal(skippedPause.completed, false, 'background time cannot explain a media jump');

  const nativeReset = new VideoReplayEvidence(3.05, true);
  nativeReset.onPlaying(0);
  nativeReset.observe(0, 0);
  nativeReset.observe(.9, 1000);
  nativeReset.observe(1.8, 2000);
  nativeReset.observe(2.78, 2850);
  assert.equal(nativeReset.completed, false, 'the native clip has not yet shown its end');
  nativeReset.observe(.001, 3070);
  assert.equal(nativeReset.completed, true, 'Cocos resets to the first frame after native playback ends');

  const earlyNativeReset = new VideoReplayEvidence(3.1, true);
  earlyNativeReset.onPlaying(0);
  for (let frame = 0; frame <= 27; frame++) earlyNativeReset.observe(frame / 10, frame * 100);
  earlyNativeReset.observe(.001, 2800);
  assert.equal(earlyNativeReset.completed, false, 'a short clip or decoder error cannot use native reset to claim completion');
});

test('the outside ending plays a complete fourteen-second cinematic without live collision or motion input', () => {
  const game = fresh();
  const pilot = routePilot(routes.outside);
  game.start();
  until(game, g => g.phase === 'ending', 800, pilot);
  assert.equal(game.ending, 'outside');
  assert.deepEqual([...pilot.visited.segments].sort(), [1,2,3,4,5,6,7]);
  assert.equal(game.duration, 14);
  assert.deepEqual(game.obstacles, []);
  assert.equal(game.profile.lights.includes('outside'), false);
  assert.equal(game.profile.progress.endings.outside || 0, 0);

  game.render(painter);
  assert.equal(game.endingMediaStatus,'failed','headless painter selects the complete same-story fallback');
  assert.equal(game.buttons.some(button => button.label === '看完这一幕'), false,
    'The first cinematic cannot be finished by tapping a card');

  const lives=game.run.lives,drops=game.run.drops,retries=game.profile.progress.retries,jumps=game.run.jumps;
  const beganAt = game.clock;
  game.jump();game.down();advance(game,.1);
  assert.equal(game.y,0);assert.equal(game.slide,0);assert.equal(game.run.jumps,jumps);
  until(game, g => g.phaseTime >= 13.7, 14);
  assert.equal(game.screen, 'play');
  assert.equal(game.profile.lights.includes('outside'), false);
  until(game, g => g.screen === 'hall', 12);
  assert.ok(Math.abs(game.clock - beganAt - (14 + game.corridorTransitionDuration)) < .15,
    'The complete film, card and corridor transition play before settling');
  assert.ok(game.profile.lights.includes('outside'));
  assert.equal(game.profile.progress.endings.outside, 1);
  assert.equal(game.run.drops, drops);
  assert.equal(game.run.lives,lives);assert.equal(game.profile.progress.retries,retries);
});

test('the alley returns to the rain midpoint without retroactively picking up the pen', () => {
  const game = fresh(), pilot = routePilot({ road: 'alley' }); game.start();
  until(game, g => g.phase === 'run' && !g.branch && g.segment === 2, 100, pilot);
  assert.equal(game.startAt, 22.5);
  advance(game, .1);
  assert.equal(game.run.items.includes('pen'), false, 'Pen at 13.5 seconds is behind the return point');
  assert.ok(game.run.events.includes('alleyReturn'));
  assert.equal(game.profile.progress.segmentMemories['1'].choiceEvent, 'alley');
  assert.equal(game.profile.progress.segmentMemories['1'].poemSeen, true,
    'returning from the alley really enters poem zero');
  assert.equal(game.run.items.includes('umbrella'), false);
  assert.ok(game.run.wet > 0);
  until(game, g => g.phase === 'choice' && g.choice === 2, 30, pilot);
  assert.equal(game.run.drops, 0);
});

test('the alley wall and the playground outward route reach separate achievement endings', () => {
  for (const [expected, plan] of [ ['wall', { road: 'alley', alley: 'wall' }], ['runaway', { seat: 'skip' }] ]) {
    const game = fresh(), pilot = routePilot(plan); game.start();
    until(game, g => g.phase === 'ending', 200, pilot);
    assert.equal(game.ending, expected);
    assert.equal(game.run.drops, 0);
    until(game, g => g.screen === 'hall', 28);
    assert.ok(game.profile.achievements.includes(expected));
    assert.equal(game.profile.lights.length, 0, 'Achievement endings do not light normal-ending lamps');
    assert.equal(pilot.visited.rewards.size, 0, 'Early exits do not enter a reward scene');
    if (expected === 'wall') {
      assert.equal(game.profile.progress.segmentMemories['1'].choiceEvent, 'alley');
      assert.equal(game.profile.progress.segmentMemories['1'].poemSeen, false);
    } else {
      assert.equal(game.profile.progress.segmentMemories['2'].choiceEvent, 'skipClass');
      assert.equal(game.profile.progress.segmentMemories['2'].poemSeen, false);
    }
  }
});

test('the playground side door returns to segment four and skips the exam', () => {
  const game = fresh(), pilot = routePilot({ seat: 'skip', side: 'return' }); game.start();
  until(game, g => g.phase === 'run' && !g.branch && g.segment === 4, 160, pilot);
  assert.ok(game.run.events.includes('skipClass'));
  assert.ok(game.run.events.includes('sideReturn'));
  assert.equal(game.run.events.some(e => ['cheat', 'faceExam', 'noPen'].includes(e)), false);
  assert.equal(pilot.visited.segments.has(3), false);
  assert.equal(game.run.stats.relationship <= 65, true);
  assert.equal(game.run.drops, 0);
  assert.equal(game.profile.progress.segmentMemories['2'].choiceEvent, 'skipClass');
  assert.equal(game.profile.progress.segmentMemories['2'].poemSeen, false,
    'the side return shows poem two, not segment two’s poem one');
  assert.equal(game.profile.progress.segmentMemories['3'], undefined);
});

for (const reward of ['dream', 'heaven']) test(`${reward} accepts zero input through its entire reward scene without losing life`, () => {
  const game = fresh(); game.start(); game.beginSegment(6);
  // Force the documented history guarantee, not a replacement reward implementation.
  game.profile.rewardHistory = { last: reward === 'dream' ? 'heaven' : 'dream', count: 3 };
  const pilot = obstaclePilot();
  until(game, g => g.phase === 'reward', 47, pilot);
  assert.equal(game.reward, reward);
  const rewardStartedAt = game.clock;
  const lives = game.run.lives, drops = game.run.drops;
  until(game, g => g.phase === 'choice' && g.choice === 6, 62);
  assert.ok(Math.abs(game.clock - rewardStartedAt - 60) < .1, `${reward} must play its complete sixty seconds`);
  assert.equal(game.run.lives, lives);
  assert.equal(game.run.drops, drops);
  assert.equal(game.run.inHell, false);
  assert.ok(game.run.events.includes(reward + 'Reward'));
});

function hellPilot() {
  const used = new Set();
  return game => {
    if (game.phase !== 'hell') return;
    game.hellObstacles.forEach((obstacle, index) => {
      const lead=obstacle.kind==='high'?.40:.39;
      if (used.has(index) || game.phaseTime < obstacle.at - lead) return;
      used.add(index);
      if (obstacle.kind === 'high') game.down(); else game.jump();
    });
  };
}
test('hell reshuffles a safe three-act course from a logged reproducible seed', () => {
  const variants = new Set();
  for (let seed = 0; seed < 64; seed++) {
    const course = makeHellCourse(seed);
    assert.equal(course.length, 9);
    assert.ok(course[0].at >= 4.5);
    assert.ok(course.at(-1).at < 27);
    for (let i = 1; i < course.length; i++) assert.ok(course[i].at - course[i-1].at >= 2.4);
    for (const [start,end] of [[0,2],[2,6],[6,9]]) {
      assert.deepEqual([...new Set(course.slice(start,end).map(o => o.kind))].sort(), ['high','low']);
    }
    variants.add(JSON.stringify(course.map(o => [o.at,o.kind])));
  }
  assert.ok(variants.size > 50, 'Different seeds should change timing and posture requirements');

  const logged = [];
  const game = fresh(null, { random: () => .123, hellCourse: json => logged.push(JSON.parse(json)) });
  game.start(); game.beginSegment(1); game.run.lives = 1; game.damage();
  assert.equal(game.phase, 'hell');
  assert.equal(logged.length, 1);
  assert.equal(logged[0].seed, Math.floor(.123 * 0x100000000));
  assert.deepEqual(logged[0].obstacles, game.hellObstacles.map(o => ({ at:o.at, kind:o.kind })));
  assert.deepEqual(game.hellObstacles, makeHellCourse(logged[0].seed));
});
test('a natural collision enters hell, a successful input sequence resumes pending story interactions', () => {
  const game = fresh(); game.start(); game.beginSegment(2); game.run.lives = 1;
  until(game, g => g.phase === 'hell', 7);
  const interruptedAt = game.time;
  until(game, g => g.phase === 'run', 40, hellPilot());
  assert.ok(Math.abs(game.time - interruptedAt) < .05);
  assert.equal(game.run.lives, 3);
  assert.ok(game.run.events.includes('hellClear'));
  assert.equal(game.used.has('pen'), false, 'Pending story pickup must survive the detour');
  assert.equal(game.used.has('life'), false, 'Pending life pickup must survive the detour');
  until(game, g => g.time >= 28, 30, obstaclePilot());
  assert.ok(game.run.items.includes('pen'));
  assert.equal(game.run.lifeStock, 1);
});

test('failing hell restarts the current segment with one life and does not return to the hall', () => {
  const game = fresh(); game.start(); game.beginSegment(2); game.run.lives = 1;
  until(game, g => g.phase === 'hell', 7);
  until(game, g => g.phase === 'run', 8);
  assert.equal(game.screen, 'play'); assert.equal(game.segment, 2);
  assert.ok(game.time < .1); assert.equal(game.run.lives, 1);
  assert.equal(game.run.hellUsed, true);
  assert.ok(game.run.events.includes('hellFall'));
  until(game, g => g.phase === 'choice' && g.choice === 2, 47, obstaclePilot());
  assert.equal(game.screen, 'play');
});

test('a segment restart does not process story events from the pre-restart frame', () => {
  const game = fresh(); game.start(); game.beginSegment(2);
  game.run.lives = 1; game.run.hellUsed = true;
  until(game, g => g.time >= 16, 17, obstaclePilot());
  assert.ok(game.run.items.includes('pen'));
  until(game, g => g.profile.progress.retries > 0, 3);
  assert.ok(game.time < .1);
  assert.equal(game.run.items.includes('pen'), false);
  assert.equal(game.used.has('pen'), false);
});

test('repeated deaths give brief early hints, then fall quiet and reset on a new segment', () => {
  const game = fresh(); game.start(); game.event('speak'); game.beginSegment(5);
  game.run.lives = 1; game.run.hellUsed = true;
  const lines = [], durations = [];
  for (let attempt = 1; attempt <= 9; attempt++) {
    until(game, g => g.retryCount === attempt, 4);
    assert.equal(game.phase, 'run');
    assert.ok(game.time < .1, 'a retry immediately returns control to the run');
    assert.ok(game.run.events.includes('speak'), 'a retry keeps earlier story choices');
    lines.push(game.lastRetryFeedback);
    durations.push(game.retryFeedbackTime);
    assert.deepEqual(['heading', 'story', 'tutorial'].map(lane => game.subtitles.views(lane).length),
      [0, 0, 0], 'retries do not replay the scene heading, guide or old story line');
    const labels = [];
    game.render({ ...painter, text: (value, x, y) => labels.push({ value, x, y }) });
    if (game.lastRetryFeedback) {
      assert.equal(game.notice, game.lastRetryFeedback);
      assert.ok(game.noticeTime > 0);
      assert.ok(labels.some(label => label.value === game.lastRetryFeedback && label.y === 228));
    } else {
      assert.equal(game.notice, '', 'a quiet retry clears the prior hint');
      assert.equal(game.noticeTime, 0);
      assert.equal(game.retryFeedbackTime, 0);
    }
  }
  assert.match(lines[0], /横梁.*下滑/);
  assert.match(lines[1], /横梁.*下滑/);
  assert.deepEqual(lines.map((line, index) => line ? index + 1 : 0).filter(Boolean), [1, 2, 5]);
  assert.ok(Array.from(lines[0]).length > Array.from(lines[1]).length);
  assert.ok(Array.from(lines[1]).length > Array.from(lines[4]).length);
  assert.ok(durations[0] > durations[1] && durations[1] > durations[4]);
  game.jump();
  assert.ok(game.vy > 0, 'jump input works on the first frame after a quiet retry');

  game.beginSegment(6);
  assert.equal(game.retryCount, 0);
  assert.equal(game.lastRetryFeedback, '');
  game.run.lives = 1; game.run.invincible = 0; game.run.hellUsed = true;
  until(game, g => g.retryCount === 1, 4);
  assert.match(game.lastRetryFeedback, /低物件.*跳起/,
    'the new segment starts again with a hint for its actual obstacle');
});

test('touching or holding an inventory button consumes the touch without jumping', () => {
  const game = fresh({ inventory: { shield: 1, magnet: 1, eraser: 1 } });
  game.start(); game.beginSegment(1); game.render(painter);
  const b = game.buttons.find(b => b.label.startsWith('盾 ')); assert.ok(b);
  assert.deepEqual([b.x,b.y,b.w,b.h],[346,241,37,21],'item touch target keeps its established lower-right position');
  const pause=game.buttons.find(button=>button.label==='Ⅱ');
  assert.deepEqual([pause.x,pause.y,pause.w,pause.h],[445,40,23,18],'pause remains easy to reach at its established top-right position');
  const x = b.x + 5, y = b.y + 5;
  game.pointerDown(x, y); advance(game, .8); game.pointerUp(x, y);
  assert.equal(game.run.shield, true); assert.equal(game.profile.inventory.shield, 0);
  assert.equal(game.run.jumps, 0); assert.equal(game.y, 0);
  game.render(painter); clickButton(game, 'Ⅱ');
  const time = game.time; advance(game, 2); assert.equal(game.time, time);
});

test('dead-zone movement and a locked left swipe cannot become a jump or hidden choice', () => {
  const game = fresh(); game.start(); game.beginSegment(1);
  game.pointerDown(200, 120); game.pointerMove(207, 122); game.pointerUp(207, 122);
  assert.equal(game.run.jumps, 0);
  game.beginChoice(6);
  game.pointerDown(220, 120); game.pointerMove(170, 120); game.pointerUp(170, 120);
  assert.equal(game.phase, 'choice'); assert.equal(game.run.events.includes('back'), false);
  assert.equal(game.run.jumps, 0);
  until(game, g => g.phase === 'poem', game.duration + .5);
  assert.equal(game.run.events.includes('back'), false);
});

test('piano hold selects the hidden lid action and release does not trigger a jump', () => {
  const game = fresh(); game.start(); game.beginSegment(4); game.beginChoice(4);
  until(game, g => g.canTouchPiano(), CHOICE_PROPS.piano.at);
  game.pointerDown(210, 120); advance(game, .7); game.pointerUp(210, 120);
  assert.ok(game.run.events.includes('pianoClose'));
  assert.equal(game.run.events.includes('pianoSmash'), false);
  assert.equal(game.run.jumps, 0);
  assert.ok(game.profile.achievements.includes('sharpEyes'));
  until(game, g => g.phase === 'run' && g.segment === 5, 9);
});

test('four lamps enable the reverse input, which continues to graduation after the reverse scene', () => {
  const game = fresh({ lights: ['morning','backrow','outside','desk'] });
  game.start(); game.beginSegment(6); game.beginChoice(6);
  const before = { ...game.run.stats };
  until(game, g => g.canLookBack(), CHOICE_PROPS.oldSelf.at);
  game.pointerDown(230, 120); game.pointerMove(180, 120); game.pointerUp(180, 120);
  assert.equal(game.phase, 'reverse');
  assert.ok(game.run.events.includes('back'));
  assert.deepEqual(game.run.stats, before);
  until(game, g => g.phase === 'run' && g.segment === 7, 20);
  assert.ok(game.profile.achievements.includes('lookBack'));
});

test('all later chapter buttons remain disabled and cannot start a different chapter', () => {
  const game = fresh(); game.panel = 'chapters'; game.render(painter);
  const later = game.buttons.filter(b => b.label === '尚待书写');
  assert.equal(later.length, 4); assert.ok(later.every(b => b.disabled));
  for (const b of later) { game.pointerDown(b.x + 2, b.y + 2); game.pointerUp(b.x + 2, b.y + 2); }
  assert.equal(game.screen, 'hall'); assert.equal(game.run.active, false);
  clickButton(game, '推门出发'); assert.equal(game.phase, 'intro');
});
test('a touch pressed before a choice window cannot release into a different choice', () => {
  const game = fresh(); game.start(); game.beginSegment(1);
  until(game, g => g.time >= 39.9, 41, obstaclePilot());
  game.pointerDown(210, 120); advance(game, .2); game.pointerUp(210, 120);
  assert.equal(game.phase, 'choice'); assert.equal(game.choice, 1);
  assert.equal(game.run.events.includes('alley'), false);
  tap(game); assert.equal(game.phase, 'choice', 'A jump before the wall is reached does not choose the alley');
  until(game, g => g.run.events.includes('umbrella'), game.duration + .5);
  assert.equal(game.run.events.includes('alley'), false);
});

test('the alley requires a jump at the moving wall, while an early jump reaches the road umbrella', () => {
  const early = fresh(); early.start(); early.beginSegment(1); early.beginChoice(1);
  early.jump(); advance(early, CHOICE_PROPS.wall.at + .1);
  assert.equal(early.phase, 'choice');
  assert.equal(early.run.events.includes('alley'), false);
  until(early, g => g.run.events.includes('umbrella'), 2);
  assert.equal(early.branch, '');

  const timed = fresh(); timed.start(); timed.beginSegment(1); timed.beginChoice(1);
  advance(timed, CHOICE_PROPS.wall.at - .45); timed.jump();
  until(timed, g => g.branch === 'alley', 1);
  assert.ok(timed.run.events.includes('alley'));
  assert.equal(timed.run.events.includes('umbrella'), false);
});

test('a double jump that clears the wall overhead does not choose the alley without landing on its top', () => {
  const game = fresh(); game.start(); game.beginSegment(1); game.beginChoice(1);
  advance(game, CHOICE_PROPS.wall.at - .5); game.jump();
  advance(game, .25); game.jump();
  until(game, g => g.phaseTime >= CHOICE_PROPS.wall.at + .2 || g.phase !== 'choice', 1);
  assert.equal(game.phase, 'choice', 'passing over the wall in midair does not touch its top');
  assert.equal(game.run.events.includes('alley'), false);
  until(game, g => g.run.events.includes('umbrella'), 2);
  assert.equal(game.branch, '');
  assert.equal(game.run.events.includes('alley'), false);
});

test('choice art encloses the moving contact bounds and travels with them', () => {
  for (const [choice, kind, key] of [
    [1, 'wall', 'scene.choice.01'],
    [3, 'exam', 'props.choice.examPaper'],
    [5, 'bench', 'props.choice.bench'],
    [5, 'door', 'scene.choice.05'],
  ]) {
    const game = fresh(); game.start(); game.beginSegment(1); game.beginChoice(choice);
    const frames = [];
    for (const time of [CHOICE_PROPS[kind].at - 1, CHOICE_PROPS[kind].at - .5]) {
      game.phaseTime = time;
      const drawn = [];
      game.render({ ...painter, image: (asset, x, y, w, h) => {
        drawn.push({ asset, x, y, w, h }); return true;
      }});
      const art = drawn.find(call => call.asset === key &&
        (!key.startsWith('scene.choice.') || call.w === 1280)), solid = choicePropBounds(kind, time);
      assert.ok(art, `${kind} art must be present while the contact is visible`);
      assert.ok(art.x <= solid.x && art.x + art.w >= solid.x + solid.w &&
        art.y <= solid.y && art.y + art.h >= solid.y + solid.h,
      `${kind} art must enclose its contact bounds`);
      frames.push({ art, solid });
    }
    assert.ok(Math.abs(frames[1].art.x - frames[0].art.x + RUN_SPEED * .5) < 1e-9,
      `${kind} art and contact bounds must travel together`);
    assert.ok(Math.abs(frames[1].solid.x - frames[0].solid.x + RUN_SPEED * .5) < 1e-9);
  }
});

test('every choice prop and stool enters from beyond the right edge before it can be touched', () => {
  for (const kind of Object.keys(CHOICE_PROPS)) {
    const start = choicePropBounds(kind, 0);
    assert.ok(start.x >= 480, `${kind} must begin outside the playfield`);
    const entering = choicePropBounds(kind, (start.x - 479) / RUN_SPEED);
    assert.ok(entering.x < 480 && entering.x > 478, `${kind} approaches from the right edge`);
    assert.ok(choicePropBounds(kind, CHOICE_PROPS[kind].at).x < 120, `${kind} reaches the runner later`);
  }
  assert.ok(CHAIRS.every((_, i) => chairSurface(i, 0).rect.x >= 480));
  assert.ok(CHAIRS.every(chair => chair.at < 10.6), 'all three seats remain reachable before the bell');
});

test('piano actions and the reverse choice wait until their objects approach the runner', () => {
  const piano = fresh(); piano.start(); piano.beginSegment(4); piano.beginChoice(4);
  assert.equal(piano.canTouchPiano(), false);
  assert.equal(piano.longPress(), false);
  piano.landDive();
  assert.equal(piano.run.events.includes('pianoClose'), false);
  assert.equal(piano.run.events.includes('pianoSmash'), false);
  until(piano, g => g.canTouchPiano(), CHOICE_PROPS.piano.at);
  assert.equal(piano.longPress(), true);
  assert.ok(piano.run.events.includes('pianoClose'));

  const former = fresh({ lights: ['morning','backrow','outside','desk'] });
  former.start(); former.beginSegment(6); former.beginChoice(6);
  former.left();
  assert.equal(former.phase, 'choice');
  assert.equal(former.run.events.includes('back'), false);
  until(former, g => g.canLookBack(), CHOICE_PROPS.oldSelf.at);
  former.left();
  assert.equal(former.phase, 'reverse');
  assert.ok(former.run.events.includes('back'));
});

test('a dive after the third stool window cannot select a stool retroactively', () => {
  const game = fresh(); game.start(); game.beginSegment(2); game.beginChoice(2);
  advance(game, game.duration + .4); game.jump(); advance(game, .2); game.down(); advance(game, .2);
  assert.equal(game.run.events.some(e => /^seat[123]$/.test(e)), false);
  until(game, g => g.branch === 'playground', 3);
  assert.ok(game.run.events.includes('skipClass'));
});

test('all seven micro interactions can be accepted on the ground or passed over in the air', () => {
  for (const segment of SEGMENTS) for (const skip of [false, true]) {
    const game = fresh(); game.start(); game.beginSegment(segment.id);
    const dodge = obstaclePilot(); let jumped = false;
    until(game, g => g.time >= segment.micro.at + .1,
      segment.micro.at + (segment.id === 5 ? 4 : 2), g => {
      if (skip && !jumped && g.time >= segment.micro.at - .32) { jumped = true; g.jump(); }
      dodge(g);
    });
    assert.equal(game.run.events.includes(segment.micro.event), !skip, `${segment.micro.event}: skip=${skip}`);
    assert.equal(game.run.drops, 0);
  }
});

test('the fifth scene pauses beside the child for two seconds before recording the bench choice', () => {
  const game = fresh(); game.start(); game.beginSegment(5, 24.2);
  game.obstacles = []; game.pickups = [];
  until(game, g => g.benchSitRemaining > 0, 1);
  const seatTime = game.time, relationship = game.run.stats.relationship;
  assert.equal(game.run.events.includes('bench'), false, 'contact alone is not sitting together');
  assert.equal(game.y, CHAIR_HEIGHT);
  assert.equal(game.playerPose(), 'run');
  const drawn = [];
  game.render({ ...painter, text: value => drawn.push(String(value)) });
  assert.ok(drawn.includes('坐一会儿'), 'the stillness has a visible cue');
  game.jump(); game.down();
  assert.equal(game.y, CHAIR_HEIGHT, 'movement input cannot shorten the quiet beat');
  advance(game, 1.9);
  assert.equal(game.time, seatTime, 'the runner stays beside the child');
  assert.equal(game.run.events.includes('bench'), false);
  assert.equal(game.run.stats.relationship, relationship);
  game.back();
  const pausedRemaining = game.benchSitRemaining;
  advance(game, .5);
  assert.equal(game.benchSitRemaining, pausedRemaining, 'pause preserves the remaining sit time');
  game.back();
  assert.equal(game.screen, 'hall');
  assert.equal(game.run.events.includes('bench'), false, 'leaving early does not invent a memory');

  const completed = fresh(); completed.start(); completed.beginSegment(5, 24.2);
  completed.obstacles = []; completed.pickups = [];
  until(completed, g => g.benchSitRemaining > 0, 1);
  const before = completed.run.stats.relationship;
  advance(completed, 2.05);
  assert.ok(completed.run.events.includes('bench'));
  assert.equal(completed.run.stats.relationship, before + 4);
  assert.equal(completed.benchSitRemaining, 0);
  assert.ok(completed.used.has('micro'));
});

test('all seven micro markers respond to slides and landing dives but are skipped while airborne', () => {
  for (const segment of SEGMENTS) for (const mode of ['slide', 'dive', 'skip']) {
    const sounds = [];
    const game = fresh(null, { sound: name => sounds.push(name) });
    game.start(); game.beginSegment(segment.id, segment.micro.at - .8);
    game.obstacles = []; game.pickups = [];
    let jumped = false, pressedDown = false, contact = null, sitStart = null;
    const bench = segment.micro.event === 'bench';
    for (let frame = 0; frame < (bench ? 240 : 120) && game.time <= segment.micro.at + .5; frame++) {
      if (mode === 'slide' && !pressedDown && game.time >= segment.micro.at - .4) {
        pressedDown = true; game.down();
      }
      if (mode !== 'slide' && !jumped && game.time >= segment.micro.at - (mode === 'dive' ? .45 : .32)) {
        jumped = true; game.jump();
      }
      if (mode === 'dive' && !pressedDown && game.time >= segment.micro.at - .08) {
        pressedDown = true; game.down();
      }
      const beforeY = game.y, hadEvent = game.run.events.includes(segment.micro.event);
      game.update(DT);
      if (bench && sitStart === null && game.benchSitRemaining > 0)
        sitStart = { beforeY, y: game.y, time: game.time };
      if (!hadEvent && game.run.events.includes(segment.micro.event)) {
        contact = { beforeY, y: game.y, pose: game.playerPose(), time: game.time };
      }
    }
    assert.ok(game.time > segment.micro.at + .5);
    const accepted = game.run.events.includes(segment.micro.event);
    assert.equal(accepted, mode !== 'skip', `${segment.micro.event}: ${mode}`);
    assert.ok(game.used.has('micro'), `${segment.micro.event}: the marker was fully passed`);
    if (bench && mode !== 'skip') {
      assert.ok(sitStart, 'the bench starts a seated beat on contact');
      assert.equal(sitStart.y, CHAIR_HEIGHT);
      assert.equal(contact.time, sitStart.time, 'the runner does not advance while sitting');
      assert.equal(contact.y, 0, 'the runner stands when the response is awarded');
    }
    if (mode === 'slide') {
      assert.ok(sounds.includes('slide'));
      if (!bench) assert.equal(contact.pose, 'slide', `${segment.micro.event}: feet touch while sliding`);
    }
    if (mode === 'dive') {
      assert.ok(sounds.includes('dive'));
      assert.ok((bench ? sitStart.beforeY : contact.beforeY) > 1 && (bench || contact.y === 0),
        `${segment.micro.event}: the contact occurs on the dive landing frame`);
    }
    if (mode === 'skip') assert.equal(contact, null);
    assert.equal(game.run.drops, 0);
  }
});

test('the pen, paper plane and eraser follow their actual pickup heights and pass positions', () => {
  for (const item of [{id:'pen', segment:2, at:13.5, airborne:false}, {id:'plane', segment:3, at:18, airborne:true}, {id:'eraser', segment:4, at:32.5, airborne:false}]) {
    for (const collect of [true, false]) {
      const game = fresh(); game.start(); game.beginSegment(item.segment);
      const dodge = obstaclePilot(); let jumped = false;
      until(game, g => g.time >= item.at + .15, item.at + 2, g => {
        const shouldJump = collect === item.airborne;
        if (shouldJump && !jumped && g.time >= item.at - .32) { jumped = true; g.jump(); }
        dodge(g);
      });
      assert.equal(game.run.items.includes(item.id), collect, `${item.id}: collect=${collect}`);
      assert.equal(game.run.drops, 0);
    }
  }
});

test('exam defaults to no-pen, accepts a collected pen, and supports a timed jump over the paper', () => {
  for (const expected of ['noPen','cheat','faceExam']) {
    const game = fresh(); game.start(); game.beginSegment(expected === 'cheat' ? 2 : 1);
    if (expected === 'cheat') until(game, g => g.time >= 14, 16, obstaclePilot());
    game.beginChoice(3);
    if (expected === 'faceExam') { advance(game, CHOICE_PROPS.exam.at - .38); game.jump(); }
    until(game, g => g.phase === 'poem', game.duration + .5);
    assert.ok(game.run.events.includes(expected), `${expected}: ${game.run.events.join(',')}`);
    assert.equal(['noPen','cheat','faceExam'].filter(e => game.run.events.includes(e)).length, 1);
  }
});

test('jumping before the paper arrives does not count as clearing the exam', () => {
  const game = fresh(); game.start(); game.beginSegment(1); game.beginChoice(3);
  game.jump();
  until(game, g => g.phase === 'poem', game.duration + .5);
  assert.ok(game.run.events.includes('noPen'));
  assert.equal(game.run.events.includes('faceExam'), false);
});

test('apology requires sliding under the bench as it passes, not sliding anywhere in the window', () => {
  const early = fresh(); early.start(); early.beginSegment(5); early.beginChoice(5);
  early.down(); advance(early, .85);
  assert.equal(early.phase, 'choice');
  assert.equal(early.run.events.includes('apologize'), false);
  until(early, g => g.phase === 'poem', early.duration + .5);
  assert.ok(early.run.events.includes('slamDoor'));

  const timed = fresh(); timed.start(); timed.beginSegment(5); timed.beginChoice(5);
  advance(timed, CHOICE_PROPS.bench.at - .4); timed.down();
  until(timed, g => g.phase === 'poem', 1);
  assert.ok(timed.run.events.includes('apologize'));
  assert.equal(timed.run.events.includes('slamDoor'), false);
});

test('the fifth choice waits until the entering slide fits beneath the bench seat', () => {
  const game = fresh(); game.start(); game.beginSegment(5); game.beginChoice(5);
  until(game, g => g.phaseTime >= CHOICE_PROPS.bench.at - .4, 6);
  game.down(); game.update(DT);
  const bench = choicePropBounds('bench', game.phaseTime);
  assert.ok(game.playerBounds().y < bench.y + 5, 'the animated body still intersects the seat');
  assert.equal(game.phase, 'choice');
  assert.equal(game.run.events.includes('apologize'), false);
  until(game, g => g.phase === 'poem', .5);
  assert.ok(game.run.events.includes('apologize'));
});

test('twelve consecutive heaven lights are achievable with timed jump inputs', () => {
  const game = fresh(); game.start(); game.beginSegment(6);
  game.profile.rewardHistory = { last: 'dream', count: 3 };
  until(game, g => g.phase === 'reward', 47, obstaclePilot());
  const jumped = new Set();
  until(game, g => g.phase === 'choice', 62, g => {
    if (g.phase !== 'reward') return;
    for (let i = 2; i < 18; i += 3) {
      if (!jumped.has(i) && g.phaseTime >= 3 + i * 3 - .22) { jumped.add(i); g.jump(); }
    }
  });
  assert.ok(game.profile.achievements.includes('heldUp'));
  assert.ok(game.rewardHits >= 14 && game.rewardHits <= 20);
  assert.equal(game.run.drops, 0);
});

test('every scene, ending, panel and pause overlay renders with finite coordinates', () => {
  let calls = 0;
  const numeric = args => { for (const n of args) assert.ok(Number.isFinite(n), `Non-finite drawing coordinate: ${n}`); calls++; };
  const strictPainter = {
    rect(x,y,w,h,color){ numeric([x,y,w,h]); assert.equal(typeof color,'string'); },
    line(x1,y1,x2,y2,color,width=1){ numeric([x1,y1,x2,y2,width]); assert.equal(typeof color,'string'); },
    circle(x,y,r,color){ numeric([x,y,r]); assert.equal(typeof color,'string'); },
    text(value,x,y,size,color){ numeric([x,y,size]); assert.equal(typeof value,'string'); assert.equal(typeof color,'string'); },
    poly(points,color){ points.forEach(numeric); assert.equal(typeof color,'string'); },
    image(key,x,y,w,h){ numeric([x,y,w,h]); assert.equal(typeof key,'string'); return false; }
  };
  const game = fresh({ lights:['morning','backrow','outside','desk'], inventory:{shield:1,magnet:1,eraser:1}, fragments:999, wrappers:999 });
  game.render(strictPainter);
  for (const panel of ['achievements','shop','wardrobe','chapters','settings']) {
    game.panel = panel;
    for (let page = 0; page < (panel === 'achievements' ? 4 : panel === 'wardrobe' ? 3 : 1); page++) {
      game.panelPage = page; game.render(strictPainter);
    }
  }
  game.panel = ''; game.start(); game.render(strictPainter);
  for (let n = 1; n <= 7; n++) { game.beginSegment(n); game.time = game.duration * .5; game.render(strictPainter); }
  for (const branch of ['alley','playground']) { game.beginBranch(branch); game.time = 24; game.render(strictPainter); }
  for (let n = 1; n <= 6; n++) { game.beginChoice(n); game.phaseTime = .8; game.render(strictPainter); }
  for (const phase of ['poem','piano','alleyExit','hell','reverse']) { game.phase = phase; game.phaseTime = 1; game.render(strictPainter); }
  for (const reward of ['dream','heaven']) for (const t of [15,32,57]) {
    game.phase = 'reward'; game.reward = reward; game.theme = reward; game.phaseTime = t; game.render(strictPainter);
  }
  for (const ending of ['morning','backrow','outside','desk','secondGrade','runaway','wall']) {
    game.phase = 'ending'; game.ending = ending; game.phaseTime = 60; game.duration = 70; game.render(strictPainter);
  }
  for (const t of [0,10.5,15,23,29]) { game.phase = 'finale'; game.phaseTime = t; game.render(strictPainter); }
  game.paused = true; game.render(strictPainter);
  assert.ok(calls > 1000);
});

test('ending story text stays inside its card while running subtitles remain visible', () => {
  const game = fresh(); game.start();
  const texts = [];
  const capture = () => {
    texts.length = 0;
    game.render({ ...painter, text: (value,x,y,size,color,align) => texts.push({value,x,y,size,color,align}) });
  };
  for (const id of ['morning','backrow','outside','desk','runaway','wall','secondGrade']) {
    game.startEnding(id);game.setEndingMediaProgress(12,'ended');game.phaseTime=12.1;capture();
    assert.equal(texts.filter(t => t.y >= 50 && t.y <= 75).length, 0, `${id} must not repeat story text above the card`);
    assert.ok(texts.some(t => t.y >= 110 && t.y < 170), `${id} keeps its story text in the card`);
  }
  game.beginSegment(1); game.say('跑段字幕', 4); capture();
  assert.ok(texts.some(t => t.value === '跑段字幕' && t.y === 55), 'run subtitles still use the HUD region');
});

test('scene heading, story and tutorial fade independently, pause together, and simplify on replay', () => {
  const game = fresh(); game.start(); game.beginSegment(1);
  assert.equal(game.subtitles.views('heading')[0].text,game.title);
  assert.equal(game.subtitles.views('story')[0].text,
    SEGMENTS[0].memoryAnchor.line+'\n'+sceneStory(1).objective);
  assert.match(game.subtitles.views('tutorial')[0].text,/二段跳/);
  const labels=[];
  game.render({ ...painter,text:(value,x,y)=>labels.push({value,y}) });
  assert.ok(labels.some(label=>label.value===game.title&&label.y===10),'The opening title is in its own top lane');
  assert.ok(labels.some(label=>label.y>=238&&/轻点/.test(label.value)),'The tutorial stays below the play surface');
  advance(game,.65);
  const visible=['heading','story','tutorial'].map(lane=>game.subtitles.views(lane));
  assert.ok(visible.every(lane=>lane[0].alpha>0));
  game.paused=true; advance(game,2);
  assert.deepEqual(['heading','story','tutorial'].map(lane=>game.subtitles.views(lane)),visible);
  game.paused=false; advance(game,5);
  assert.ok(game.used.has('story:s1-gate'),'A timed scene beat appears during the run');

  const replay=fresh({progress:{introSeen:true}}); replay.start(); replay.beginSegment(1);
  assert.match(replay.subtitles.views('tutorial')[0].text,/轻点跳跃/);
  assert.doesNotMatch(replay.subtitles.views('tutorial')[0].text,/二段跳/);
});

test('seven segment openings show the anchor sentence beside its object within the first second', () => {
  for (const segment of SEGMENTS) {
    const game = fresh(); game.start();
    game.beginSegment(segment.id, segment.id === 2 ? 22.5 : 0);
    const opening = segment.memoryAnchor.line+'\n'+sceneStory(segment.id).objective;
    const cue = game.subtitles.views('story');
    assert.equal(cue.length, 1, `segment ${segment.id}: one opening story cue`);
    assert.equal(cue[0].text, opening);
    const lines = opening.split('\n');
    assert.equal(lines.length, 2);
    assert.ok(lines.every(line => Array.from(line).length <= 25),
      `segment ${segment.id}: both opening lines fit the existing subtitle width`);
    advance(game, .6);
    assert.ok(game.subtitles.views('story')[0].alpha > 0,
      `segment ${segment.id}: the opening cue has faded in`);
    const visible = [];
    game.render({ ...painter, image(){ return true; },
      text: (value, x, y) => visible.push({ value, x, y }) });
    assert.ok(visible.some(entry => entry.value === lines[0] && entry.x === 240 && entry.y === 55),
      `segment ${segment.id}: anchor sentence is drawn in the story lane`);
    assert.ok(visible.some(entry => entry.value === lines[1] && entry.x === 240 && entry.y === 70),
      `segment ${segment.id}: the objective remains visible on the same cue`);
    assert.ok(visible.some(entry => entry.value === segment.memoryAnchor.object),
      `segment ${segment.id}: its object is visible alongside the sentence`);
  }
});

test('the paper plane and bench scene lines are visible before their objects pass', () => {
  for (const [segment, id] of [[3, 's3-plane'], [5, 's5-child']]) {
    const game = fresh(); game.start(); game.beginSegment(segment);
    game.obstacles = []; game.pickups = [];
    const beat = sceneStory(segment).beats.find(value => value.id === id);
    let firstVisible = null, contactTime = null;
    while (game.time < game.level.micro.at + .1) {
      game.update(DT);
      const cue = game.subtitles.views('story').at(-1);
      if (cue?.text === beat.text && cue.alpha > .01 && firstVisible === null) firstVisible = game.time;
      if (game.run.events.includes(game.level.micro.event) && contactTime === null) contactTime = game.time;
    }
    assert.ok(firstVisible !== null && firstVisible >= beat.at && firstVisible < beat.at + .15,
      `${id}: the line starts when its scene object appears, at ${firstVisible}`);
    assert.ok(contactTime !== null && firstVisible < contactTime,
      `${id}: the line must be readable before the nearby micro interaction at ${contactTime}`);
  }
});

test('comparison and side-door lines stay on screen long enough to read', () => {
  const family = fresh(); family.start(); family.beginSegment(5);
  family.obstacles = []; family.pickups = [];
  advance(family, 15.8);
  const response = sceneStory(5).actions.find(action => action.trigger.id === 'compared').response;
  assert.equal(family.subtitles.views('story').at(-1)?.text, response);
  advance(family, 6.4);
  const child = sceneStory(5).beats.find(beat => beat.id === 's5-child').text;
  const childView = family.subtitles.views('story').at(-1);
  assert.equal(childView?.text, child);
  assert.ok(childView.alpha > .5, 'the child line remains readable before the bench');

  const field = fresh(); field.start(); field.beginBranch('playground');
  field.obstacles = []; field.pickups = [];
  advance(field, 24.3);
  const door = sceneStory('playground').beats.find(beat => beat.id === 'field-door').text;
  const doorView = field.subtitles.views('story').at(-1);
  assert.equal(doorView?.text, door);
  assert.ok(doorView.alpha > .5, 'the side-door line is no longer replaced during its fade-in');
});

test('scene opening echoes use current-run events, keep the objective visible, and do not replay on retry', () => {
  for (const [segment, event] of [[2, 'hat'], [3, 'bag'], [4, 'faceExam'],
    [5, 'speak'], [6, 'bench'], [7, 'milk']]) {
    const sounds = [];
    const game = fresh(null, { sound: name => sounds.push(name) });
    game.start(); game.event(event); game.beginSegment(segment);
    const echo = sceneOpeningEcho(segment, game.run.events);
    assert.equal(game.memoryCue, echo.text);
    assert.equal(game.subtitles.views('story').at(-1).text,
      SEGMENTS[segment - 1].memoryAnchor.line+'\n'+sceneStory(segment).objective);
    advance(game, .5);
    const labels = [];
    game.render({ ...painter, text: (value, x, y) => labels.push({ value, x, y }) });
    assert.ok(labels.some(label => label.value === echo.text && label.x === 398 && label.y === 98),
      `segment ${segment}: its remembered detail is visible within the first second`);
    const anchorSound = SEGMENTS[segment - 1].memoryAnchor.sound;
    assert.equal(sounds.filter(name => name === anchorSound).length, 1);
    game.restart();
    assert.equal(game.memoryCue, '', `segment ${segment}: retry does not repeat the opening echo`);
    assert.equal(game.subtitles.views('story').length, 0,
      `segment ${segment}: retry does not repeat the opening story cue`);
    assert.equal(sounds.filter(name => name === anchorSound).length, 1);
    game.beginSegment(segment);
    assert.equal(game.memoryCue, '', `segment ${segment}: one echo per segment in a run`);
    assert.equal(sounds.filter(name => name === anchorSound).length, 2,
      'entering the segment again may replay its sound');
  }
  const game = fresh(); game.start(); game.event('hat'); game.start(); game.beginSegment(2);
  assert.equal(game.memoryCue, '', 'a previous run cannot select a new run’s opening echo');
});

test('death retries quiet heard scene lines but still resolve events and reveal unreached lines', () => {
  const game = fresh(); game.start(); game.event('speak'); game.beginSegment(5);
  game.obstacles = []; game.pickups = []; game.run.hellUsed = true;
  const heard = recordSubtitleCalls(game);
  const beat = id => sceneStory(5).beats.find(value => value.id === id).text;
  const comparedResponse = sceneStory(5).actions.find(value => value.trigger.id === 'compared').response;
  const early = [beat('s5-legs'), beat('s5-spoke-echo'), comparedResponse];
  const later = [beat('s5-child'), '「他又是第一。」'];
  const retry = () => {
    game.run.lives = 1; game.run.invincible = 0; game.damage();
    assert.equal(game.phase, 'run'); assert.ok(game.time < .1);
    game.obstacles = []; game.pickups = [];
  };

  advance(game, 18.1);
  for (const line of early) assert.equal(heard.count(line), 1, `first visit: ${line}`);
  for (const line of later) assert.equal(heard.count(line), 0, `still unreached: ${line}`);
  assert.ok(game.run.events.includes('compared'));

  retry();
  assert.equal(game.run.events.includes('compared'), false, 'death restores the segment event snapshot');
  advance(game, 18.1);
  for (const line of early) assert.equal(heard.count(line), 1, `retry stays quiet: ${line}`);
  assert.ok(game.run.events.includes('compared'), 'the comparison is still registered after retry');
  assert.ok(game.used.has('story:s5-spoke-echo'), 'scene timing still runs after retry');

   advance(game, 20.2);
   for (const line of later) assert.equal(heard.count(line), 1, `first arrival after retry: ${line}`);
   retry();
   advance(game, 38.3);
  for (const line of [...early, ...later]) assert.equal(heard.count(line), 1, `later retry stays quiet: ${line}`);
  assert.ok(game.run.events.includes('compared'));
  assert.ok(game.used.has('story:s5-child'), 'previously heard scene timing still resolves');

  advance(game, 8.1);
  assert.equal(heard.count(beat('s5-door')), 1, 'a line never reached before either death still appears');
  game.start(); game.beginSegment(5); game.obstacles = []; game.pickups = [];
  advance(game, 3.1);
  assert.equal(heard.count(beat('s5-legs')), 2, 'a new run may tell the story again');
});

test('playground landmark narration stays quiet after a death retry', () => {
  const game = fresh(); game.start(); game.beginBranch('playground');
  game.obstacles = []; game.pickups = []; game.run.hellUsed = true;
  const heard = recordSubtitleCalls(game);
  const line = sceneStory('playground').beats.find(beat => beat.id === 'field-door').text;
  advance(game, 24.1);
  assert.equal(heard.count(line), 1);
  game.run.lives = 1; game.run.invincible = 0; game.damage();
  assert.equal(game.phase, 'run'); assert.ok(game.time < .1);
  game.obstacles = []; game.pickups = [];
  advance(game, 24.1);
  assert.equal(heard.count(line), 1);
});

test('an actual route shows conditional story echoes and state-aware choice feedback', () => {
  const game=fresh();game.start();game.beginSegment(1);game.event('hat');
  game.beginSegment(2,22.5);game.obstacles=[];game.pickups=[];
  advance(game,2.2);
  assert.ok(game.used.has('story:s2-hat-echo'));
  assert.equal(game.used.has('story:s2-umbrella'),false);
  assert.equal(game.used.has('story:s2-pen'),false);
  game.beginSegment(3);game.beginChoice(3);
  assert.match(game.subtitles.views('story')[0].text,/没有笔/);
  assert.match(game.subtitles.views('tutorial')[0].text,/只会摸口袋/);
  game.afterChoice(3,'noPen');
  assert.equal(game.phase,'poem');
  assert.equal(game.subtitles.views('story').at(-1).text,CHOICE_AFTER.noPen);

  const branch=fresh();branch.start();branch.beginSegment(1);branch.beginChoice(1);branch.afterChoice(1,'alley');
  assert.equal(branch.branch,'alley');
  assert.equal(branch.subtitles.views('story')[0].text,CHOICE_AFTER.alley);
  assert.ok(branch.subtitles.lanes.story.queue.some(cue=>cue.text===sceneStory('alley').objective));
  assert.ok(branch.subtitles.views('tutorial').length);
});

test('fragment group feedback stays in the corner and ending card uses two recorded events', () => {
  const game=fresh();game.start();game.beginSegment(1);game.obstacles=[];
  game.pickups=[{id:'1:f-memory-1',at:.25,height:19,value:6}];
  until(game,g=>g.run.segmentFragments>=6,1);
  assert.equal(game.memoryCue,FRAGMENT_MEMORIES['1'][0].text);
  const corner=[];game.render({ ...painter,text:(value,x,y)=>corner.push({value,x,y}) });
  assert.ok(corner.some(call=>call.value===game.memoryCue&&call.x===398&&call.y===98));
  game.pickups.push({id:'1:f-memory-2',at:.8,height:19,value:6});
  until(game,g=>g.run.segmentFragments>=12,1);
  assert.ok(game.memoryQueue.includes(FRAGMENT_MEMORIES['1'][1].text));

  for (const id of ['morning','outside']) {
    const ending=fresh();ending.start();ending.event('hat');ending.event('umbrella');ending.event('seat1');
    ending.startEnding(id);
    assert.deepEqual(ending.endingEchoes.map(echo=>echo.event),['umbrella','seat1']);
    ending.setEndingMediaProgress(null,'failed');
    ending.phaseTime=12.5;
    const texts=[];ending.render({ ...painter,text:value=>texts.push(value) });
    assert.ok(ending.endingEchoes.every(echo=>texts.includes(echo.text)),
      `${id} must show the two events actually recorded in this run`);
  }
});

test('background memory objects appear only after their real earlier event', () => {
  const capture=game=>{const rects=[];game.render({ ...painter,rect:(...args)=>rects.push(args) });return rects;};
  const hatX=worldX(23.625,24);
  const plain=fresh();plain.start();plain.beginSegment(2);plain.time=24;
  assert.equal(capture(plain).some(rect=>rect[0]===hatX-5&&rect[1]===104&&rect[4]==='#bb6855'),false);
  const remembered=fresh();remembered.start();remembered.beginSegment(1);remembered.event('hat');
  remembered.beginSegment(2);remembered.time=24;
  assert.ok(capture(remembered).some(rect=>rect[0]===hatX-5&&rect[1]===104&&rect[4]==='#bb6855'));
});

test('a hit shifts only the play world and reduced motion restores its position', () => {
  const game = fresh(); game.start(); game.beginSegment(1);
  game.time = 10; game.clock = .03; game.subtitle = '路还在'; game.subtitleTime = 1;
  const capture = () => {
    const calls = [];
    game.render({
      ...painter,
      rect: (...args) => calls.push(['rect',...args]),
      image: (...args) => { calls.push(['image',...args]); return false; },
      text: (...args) => calls.push(['text',...args])
    });
    return calls;
  };
  const find = (calls,kind,label) => calls.find(call => call[0] === kind && call[1] === label);
  const still = capture();
  game.shake = .25;
  const moved = capture();
  assert.deepEqual(capture(),moved,'The same game time must produce the same displacement');
  const scene = calls => calls.findLast(call => call[0] === 'image' && call[1] === 'scene.pixel.dawn');
  const beforeScene = scene(still), afterScene = scene(moved);
  assert.ok(beforeScene && afterScene);
  assert.ok(Math.abs(afterScene[2]-beforeScene[2]) <= 2);
  assert.ok(Math.abs(afterScene[3]-beforeScene[3]) <= 1.5);
  assert.notDeepEqual(afterScene,beforeScene,'The world must visibly move on a hit');
  for (const label of [game.title,'路还在','轻点 · 跳过书包']) {
    assert.deepEqual(find(moved,'text',label),find(still,'text',label),`${label} must stay fixed on the HUD`);
  }
  assert.ok(moved.some(call => call[0] === 'text' && call[1] === '轻点 · 跳过书包'),
    'The running tutorial remains visible without a backing panel');
  assert.equal(moved.some(call => call[0] === 'rect' && call[1] === 38 && call[2] === 241 && call[3] === 249 && call[4] === 22), false,
    'The simplified tutorial does not add a large backing below the play surface');
  game.settings.reducedMotion = true;
  const reduced = capture();
  game.shake = 0;
  assert.deepEqual(capture(),reduced,'Reduced motion must ignore the hit shake completely');
});

test('hall shop and wardrobe show feedback and insufficient balance', () => {
  const game = fresh();
  const textCalls = () => {
    const texts = [];
    game.render({ ...painter, text: value => texts.push(value) });
    return texts;
  };
  game.panel = 'shop';
  assert.ok(textCalls().includes('碎片不足'));
  game.profile.fragments = 999;
  clickButton(game,'120 碎片');
  assert.ok(textCalls().includes('收好。下一局，带着它出发。'));
  game.panel = 'wardrobe'; game.panelPage = 0;
  assert.ok(textCalls().includes('糖纸不足'));
  game.profile.wrappers = 999;
  textCalls();
  const buy = game.buttons.find(button => button.label.endsWith('糖纸') && !button.disabled);
  assert.ok(buy);
  game.pointerDown(buy.x+buy.w/2,buy.y+buy.h/2);
  game.pointerUp(buy.x+buy.w/2,buy.y+buy.h/2);
  assert.ok(textCalls().includes('已收进衣柜。'));
  const wear = game.buttons.find(button => button.label === '换上');
  assert.ok(wear);
  game.pointerDown(wear.x+wear.w/2,wear.y+wear.h/2);
  game.pointerUp(wear.x+wear.w/2,wear.y+wear.h/2);
  assert.ok(textCalls().includes('这一次，穿着它走。'));
});
test('falling out of dream act one does not award the skipped airborne candy points', () => {
  const game = fresh(); game.start(); game.beginSegment(6);
  game.profile.rewardHistory = { last: 'heaven', count: 3 };
  until(game, g => g.phase === 'reward', 47, obstaclePilot());
  let wrappersBeforeTransition = game.profile.wrappers;
  let elapsed = 0;
  while (game.phaseTime < 30 && elapsed < 31) {
    wrappersBeforeTransition = game.profile.wrappers;
    game.update(DT); elapsed += DT;
  }
  assert.equal(game.rewardGround, true, 'Zero input should naturally reach the act-one floor');
  assert.ok(Math.abs(elapsed - 30) < .1, 'Touching the floor must not skip the rest of act one');
  assert.equal(game.profile.wrappers, wrappersBeforeTransition, 'The floor cannot batch-award skipped airborne points');
  for (let i = 0; i < 9; i++) assert.ok(game.used.has('reward' + i), `Act-one point ${i} is finished or skipped`);
  assert.equal(game.run.drops, 0);
  until(game, g => g.phase === 'choice' && g.choice === 6, 32);
  assert.ok(game.run.events.includes('dreamReward'));
});
function reachDreamActTwo() {
  const game = fresh(); game.start(); game.beginSegment(6);
  game.profile.rewardHistory = { last: 'heaven', count: 3 };
  until(game, g => g.phase === 'reward', 47, obstaclePilot());
  until(game, g => g.used.has('act2'), 32);
  return game;
}
test('dream act two awards the desk achievement only after a real platform landing and down leaves it at sprint speed', () => {
  const game = reachDreamActTwo();
  assert.equal(game.profile.achievements.includes('bigDesk'), false, 'Entering act two in midair is not touching the desk');
  assert.ok(game.y > 65);
  until(game, g => g.used.has('onTable'), 2);
  assert.equal(game.y, 65); assert.equal(game.vy, 0);
  assert.ok(game.profile.achievements.includes('bigDesk'));
  assert.ok(game.used.has('tableLanded'));
  const normalClock = game.rewardClock(); advance(game, .25);
  assert.ok(Math.abs(game.rewardClock() - normalClock - .25) < .03);
  assert.equal(game.y, 65, 'Standing on the table does not fall through its surface');
  const lives = game.run.lives;
  game.down();
  assert.equal(game.used.has('onTable'), false); assert.ok(game.used.has('sprint'));
  const sprintClock = game.rewardClock(); advance(game, .5);
  assert.ok(Math.abs(game.rewardClock() - sprintClock - .75) < .03, 'Sprint advances the scenery and cloud targets at 1.5 times normal speed');
  assert.ok(game.y < 65); assert.equal(game.run.lives, lives);
  until(game, g => g.phase === 'choice' && g.choice === 6, 32);
  assert.ok(game.run.events.includes('dreamReward'));
});

test('running beyond the actual dream table edge also starts the harmless sprint', () => {
  const game = reachDreamActTwo();
  until(game, g => g.used.has('onTable'), 2);
  const landedAt = game.phaseTime;
  until(game, g => g.used.has('sprint'), 4);
  assert.ok(game.phaseTime > landedAt + .5);
  assert.equal(game.used.has('onTable'), false);
  assert.ok(game.used.has('tableLanded'));
  assert.equal(game.run.drops, 0);
});
test('starting a fresh life after an ending replay stops using the old character snapshot', () => {
  const game = fresh({ lights:['morning'], endingSnapshots:{morning:{stats:{personality:10,relationship:80,will:90,appearance:90},items:['umbrella'],events:['umbrella','seat3'],wet:70}} });
  clickButton(game, '明天的早自习');
  assert.equal(game.replayEnding, true);
  assert.ok(game.endingSnapshot.items.includes('umbrella'));
  until(game, g => g.screen === 'hall', 42);
  clickButton(game, '出发');
  assert.equal(game.replayEnding, false, 'A new playable life must render its own changing state');
  assert.equal(game.endingSnapshot, null);
  assert.deepEqual(game.run.items, []);
  assert.deepEqual(game.run.stats, {personality:50,relationship:50,will:50,appearance:50});
});
test('the umbrella obtained on the road gives a small real running-speed increase', () => {
  const game = fresh(), pilot = routePilot(); game.start();
  until(game, g => g.phase === 'run' && g.segment === 2, 65, pilot);
  assert.ok(game.run.items.includes('umbrella'));
  const at = game.time; advance(game, 1);
  assert.ok(Math.abs(game.time - at - 1.04) < .025);
  const normal = fresh(); normal.start(); normal.beginSegment(2);
  advance(normal, 1); assert.ok(Math.abs(normal.time - 1) < .025);
});

test('picking up the paper plane grants a two-second glide with reduced descent', () => {
  const game = fresh(); game.start(); game.beginSegment(3);
  until(game, g => g.time >= 17.68, 19, obstaclePilot());
  game.jump(); until(game, g => g.run.items.includes('plane'), 1);
  assert.ok(game.glide > 1.9);
  advance(game, 1);
  assert.ok(game.glide > .9 && game.glide < 1.1);
  assert.ok(game.y > 0); assert.ok(game.vy >= -28.01);
  advance(game, 1.1);
  assert.equal(game.glide, 0);
  assert.equal(game.run.drops, 0);
});

test('the story eraser removes one upcoming obstacle without spending a corridor item', () => {
  const game = fresh(); game.start(); game.beginSegment(4);
  until(game, g => g.time >= 32.4, 34, obstaclePilot());
  const next = game.obstacles.find(o => !o.done && !o.erased && o.at > game.time);
  assert.ok(next); const count = game.obstacles.filter(o => o.erased).length;
  until(game, g => g.run.items.includes('eraser'), 1);
  assert.equal(next.erased, true);
  assert.equal(game.obstacles.filter(o => o.erased).length, count + 1);
  assert.equal(game.profile.inventory.eraser, 0);
  assert.equal(game.run.usedItems.includes('eraser'), false);
});

test('hell has a learnable three-act 28-second course and resumes with the original reward', () => {
  const game = fresh(); game.start(); game.beginSegment(2); game.run.lives = 1;
  until(game, g => g.phase === 'hell', 7);
  assert.equal(game.hellObstacles.length, 9);
  let previous = 0;
  for (const obstacle of game.hellObstacles) {
    assert.ok(obstacle.at - previous >= 2.4 - 1e-8);
    assert.ok(['low','high'].includes(obstacle.kind)); previous = obstacle.at;
  }
  assert.ok(game.hellObstacles[0].at >= 4.5, 'The opening gives several seconds to read the course');
  assert.ok(previous < 28);
  const enteredAt = game.time,fragmentsBefore=game.profile.fragments,appearanceBefore=game.run.stats.appearance;
  const drawn = [];
  game.render({ ...painter, poly: (points) => drawn.push(points) });
  for (const obstacle of game.hellObstacles) {
    const x = 96 + (obstacle.at - game.phaseTime) * 72;
    if (x <= 0 || x >= 500) continue;
    const solid=obstacleBounds(obstacle.kind,x);
    assert.ok(drawn.some(points=>Math.min(...points.map(p=>p[0]))===solid.x&&
      Math.max(...points.map(p=>p[0]))===solid.x+solid.w&&
      Math.min(...points.map(p=>p[1]))===solid.y&&Math.max(...points.map(p=>p[1]))===solid.y+solid.h));
  }
  let latestHellTime = 0,actTwoAt=0,actThreeAt=0;
  const pilot = hellPilot();
  until(game, g => g.phase === 'run', 32, g => {
    if(g.phase === 'hell'){
      latestHellTime = g.phaseTime;
      if(!actTwoAt&&g.used.has('hellActTwo'))actTwoAt=g.phaseTime;
      if(!actThreeAt&&g.used.has('hellActThree'))actThreeAt=g.phaseTime;
    }
    pilot(g);
  });
  assert.ok(latestHellTime >= 27.9 && latestHellTime < 28.1, `Course ended at ${latestHellTime}`);
  assert.ok(actTwoAt >= 8 && actTwoAt < 8.1);
  assert.ok(actThreeAt >= 20 && actThreeAt < 20.1);
  assert.ok(game.run.events.includes('hellClear'), state(game));
  assert.ok(game.used.has('hellActTwo') === false, 'Hell cue keys do not leak into the resumed segment');
  assert.ok(Math.abs(game.time-enteredAt) < .05);
  assert.equal(game.run.lives, 3);
  assert.equal(game.profile.fragments,fragmentsBefore+15);
  assert.equal(game.run.stats.appearance,appearanceBefore+8);
  assert.ok(game.run.invincible >= 2.99);
});
test('achievement-panel body clicks cannot pass through to the departure door', () => {
  const game = fresh();
  clickButton(game, '成就墙'); game.render(painter);
  assert.equal(game.panel, 'achievements');
  // This point is inside the panel body and over the hall departure door underneath.
  game.pointerDown(50, 130); game.pointerUp(50, 130); advance(game, .1);
  assert.equal(game.screen, 'hall'); assert.equal(game.panel, 'achievements');
  assert.equal(game.run.active, false); assert.equal(game.profile.progress.runs, 0);
  clickButton(game, '×'); clickButton(game, '出发');
  assert.equal(game.phase, 'intro', 'The door remains usable after the panel is closed');
});

test('menu buttons confirm only when the same live button receives a release', () => {
  const game = fresh(); game.render(painter);
  const door = game.buttons.find(b => b.label === '出发');
  const x = door.x + door.w / 2, y = door.y + door.h / 2;
  game.pointerDown(x, y);
  assert.equal(game.screen, 'hall'); assert.equal(game.run.active, false);
  game.render(painter); // Rendering recreates button objects while a finger is held.
  game.pointerUp(x, y);
  assert.equal(game.phase, 'intro'); assert.equal(game.profile.progress.runs, 1);
});

test('dragging away from a menu button, cancellation, or changing panels prevents confirmation', () => {
  for (const mode of ['drag', 'cancel', 'context']) {
    const game = fresh(); game.render(painter);
    const door = game.buttons.find(b => b.label === '出发');
    const x = door.x + 5, y = door.y + 5;
    game.pointerDown(x, y);
    if (mode === 'drag') { game.pointerMove(300, 240); game.pointerMove(x, y); }
    if (mode === 'cancel') game.pointerCancel();
    if (mode === 'context') { game.panel = 'settings'; game.render(painter); }
    game.pointerUp(x, y);
    assert.equal(game.run.active, false, mode); assert.equal(game.profile.progress.runs, 0, mode);
  }
});

test('pointer cancellation never becomes a jump, piano hold, or delayed UI confirmation', () => {
  const game = fresh(); game.start(); game.beginSegment(1);
  game.pointerDown(210, 120); game.pointerCancel(); game.pointerUp(210, 120);
  assert.equal(game.run.jumps, 0); assert.equal(game.y, 0);
  game.beginChoice(4); game.pointerDown(210, 120); advance(game, .3);
  game.pointerCancel(); advance(game, .4); game.pointerUp(210, 120);
  assert.equal(game.run.events.includes('pianoClose'), false);
  assert.equal(game.run.jumps, 0); assert.equal(game.held, false); assert.equal(game.hold, 0);
});

test('application hide clears input and pauses, while show requires explicit resume', () => {
  const game = fresh(); game.start(); game.beginSegment(4); game.beginChoice(4);
  game.keyDown('e'); advance(game, .3); game.appHide();
  const at = game.phaseTime;
  assert.equal(game.paused, true); assert.equal(game.pointer, null); assert.equal(game.held, false);
  advance(game, 1); game.appShow(); advance(game, 1);
  assert.equal(game.phaseTime, at); assert.equal(game.paused, true);
  assert.equal(game.run.events.includes('pianoClose'), false);
  game.keyUp('e'); clickButton(game, '继续向前');
  advance(game, .15); assert.equal(game.run.events.includes('pianoClose'), false);
  until(game, g => g.canTouchPiano(), CHOICE_PROPS.piano.at);
  game.keyDown('e'); advance(game, .65); game.keyUp('e');
  assert.ok(game.run.events.includes('pianoClose'), 'The old held key cannot block a fresh hold after resume');
});

test('back closes a panel, then pauses play, then returns to the hall instead of resuming', () => {
  const game = fresh(); game.start(); game.beginSegment(1); game.panel = 'settings';
  game.back(); assert.equal(game.panel, ''); assert.equal(game.paused, false);
  game.keyDown('Escape'); game.keyUp('Escape'); assert.equal(game.paused, true);
  game.keyDown('BrowserBack'); game.keyUp('BrowserBack');
  assert.equal(game.screen, 'hall'); assert.equal(game.run.active, false); assert.equal(game.paused, false);
  game.panel = 'achievements'; game.back(); assert.equal(game.panel, '');
  game.back(); assert.equal(game.screen, 'hall'); assert.equal(game.profile.progress.runs, 1);
});

test('Back cancels the hall exit confirmation and restores the active hall', () => {
  let exits = 0;
  const game = fresh(undefined, { exit: () => { exits++; } });
  clickButton(game, '退出');
  assert.equal(game.screen, 'hall'); assert.equal(game.exitConfirm, true); assert.equal(game.paused, true);

  game.keyDown('BrowserBack'); game.keyUp('BrowserBack');
  assert.equal(game.screen, 'hall'); assert.equal(game.exitConfirm, false); assert.equal(game.paused, false);
  assert.equal(exits, 0);
  clickButton(game, '出发');
  assert.equal(game.screen, 'play'); assert.equal(game.run.active, true);
});

test('Back cancels the run exit confirmation without discarding or resuming the run', () => {
  const game = fresh(); game.start(); game.beginSegment(1); advance(game, .5);
  const run = game.run, time = game.time, phaseTime = game.phaseTime;
  clickButton(game, 'Ⅱ');
  clickButton(game, '退出游戏');
  assert.equal(game.exitConfirm, true); assert.equal(game.paused, true);

  game.back();
  assert.equal(game.screen, 'play'); assert.equal(game.phase, 'run');
  assert.equal(game.exitConfirm, false); assert.equal(game.paused, true);
  assert.equal(game.run, run); assert.equal(game.run.active, true);
  assert.equal(game.time, time); assert.equal(game.phaseTime, phaseTime);
  advance(game, 1);
  assert.equal(game.time, time); assert.equal(game.phaseTime, phaseTime);
  clickButton(game, '继续向前');
  assert.equal(game.paused, false);
  advance(game, DT);
  assert.ok(game.time > time);
});

test('paused key presses and Enter behind a hall panel cannot start gameplay actions', () => {
  const game = fresh(); game.panel = 'settings'; game.keyDown('Enter'); game.keyUp('Enter');
  assert.equal(game.run.active, false);
  game.panel = ''; game.start(); game.beginSegment(1); game.appHide();
  game.keyDown('e'); game.keyDown(' '); game.keyDown('ArrowDown');
  assert.equal(game.held, false); assert.equal(game.run.jumps, 0); assert.equal(game.slide, 0);
});

function twoJumps() {
  const game = fresh(); game.start(); game.beginSegment(1);
  game.jump(); advance(game, .2); game.jump();
  return game;
}

test('a jump pressed within 120ms before landing is executed once on contact', () => {
  const game = twoJumps();
  until(game, g => g.vy < 0 && g.y < 14, 3);
  const jumps = game.run.jumps; game.jump();
  assert.equal(game.run.jumps, jumps); assert.equal(game.jumpBuffer, .12);
  advance(game, .15);
  assert.equal(game.run.jumps, jumps + 1); assert.equal(game.jumps, 1); assert.ok(game.y > 0); assert.equal(game.jumpBuffer, 0);
});

test('an expired or cancelled buffered jump cannot fire on a later landing', () => {
  for (const cancel of [false, true]) {
    const game = twoJumps();
    until(game, g => g.vy < 0 && g.y > 55, 3);
    game.jump(); if (cancel) game.pointerCancel();
    until(game, g => g.y === 0, 3);
    assert.equal(game.run.jumps, 2); assert.equal(game.jumpBuffer, 0);
    advance(game, .1); assert.equal(game.y, 0);
  }
});

test('a down gesture just before the dream table is buffered until real tabletop contact', () => {
  const game = reachDreamActTwo();
  until(game, g => g.y < 78 && !g.used.has('tableLanded'), 1);
  game.down(); assert.equal(game.used.has('sprint'), false); assert.equal(game.downBuffer, .12);
  until(game, g => g.used.has('sprint'), .2);
  assert.ok(game.used.has('tableLanded')); assert.ok(game.profile.achievements.includes('bigDesk'));
  assert.equal(game.used.has('onTable'), false); assert.equal(game.downBuffer, 0);
});

test('leaving a real tabletop keeps the ground jump for 100ms, then leaves only the air jump', () => {
  for (const wait of [.03, .13]) {
    const game = reachDreamActTwo();
    until(game, g => g.used.has('onTable'), 2); until(game, g => g.used.has('sprint'), 4);
    advance(game, wait); assert.ok(game.y > 0);
    game.jump(); assert.equal(game.jumps, wait < .1 ? 1 : 2);
    const count = game.run.jumps; game.jump();
    assert.equal(game.run.jumps, wait < .1 ? count + 1 : count);
  }
});

function alleyExit() {
  const game = fresh(); game.start(); game.beginBranch('alley');
  until(game, g => g.phase === 'alleyExit', 37, obstaclePilot());
  return game;
}

test('an alley jump is not a wall ending until the character actually touches the ledge', () => {
  const game = alleyExit(); advance(game, .25); game.jump();
  assert.equal(game.phase, 'alleyExit'); assert.equal(game.ending, '');
  advance(game, .9); assert.equal(game.phase, 'alleyExit', 'One jump cannot reach the high ledge');
  until(game, g => g.phase === 'poem', game.duration + .5);
  assert.ok(game.run.events.includes('alleyReturn')); assert.equal(game.ending, '');
});

test('a timed double jump physically reaches the moving alley ledge and starts the wall ending', () => {
  const game = alleyExit();
  assert.ok(game.interactionTarget().x >= 480, 'the ledge starts beyond the right edge');
  until(game, g => g.interactionTarget().x <= 144, 6);
  game.jump(); advance(game, .25); game.jump();
  const target = game.interactionTarget();
  assert.equal(target.kind, 'wall'); assert.equal(target.height, 93); assert.equal(target.width, 36);
  assert.equal(game.phase, 'alleyExit');
  until(game, g => g.phase === 'ending', 1.2);
  assert.equal(game.ending, 'wall');
});

test('jumping early inside the former broad side-door time window no longer teleports into school', () => {
  const game = fresh(); game.start(); game.beginBranch('playground');
  until(game, g => g.time >= PLAYGROUND_SIDE_DOOR_AT - 1.22, 28, obstaclePilot());
  const target = game.interactionTarget(); assert.ok(target.x > 108);
  game.jump(); assert.equal(game.phase, 'run'); assert.equal(game.run.events.includes('sideReturn'), false);
  until(game, g => g.time >= PLAYGROUND_SIDE_DOOR_AT + .2, 3);
  assert.equal(game.run.events.includes('sideReturn'), false); assert.equal(game.branch, 'playground');
});

test('the side door accepts a foot crossing its raised threshold beside the real building door', () => {
  const game = fresh(); game.start(); game.beginBranch('playground');
  assert.equal(PLAYGROUND_SIDE_DOOR_AT, 24.5);
  assert.equal(game.interactionTarget().x, 1860, 'tile 01 begins at world x960; source door begins at x1800/2');
  until(game, g => g.time >= PLAYGROUND_SIDE_DOOR_AT - .15, 28, obstaclePilot());
  const target = game.interactionTarget(); assert.ok(target.x <= 108 && target.x + target.width >= 84);
  game.jump(); assert.equal(game.run.events.includes('sideReturn'), false);
  for (let frame = 0; frame < 8; frame++) {
    game.update(DT);
    assert.equal(game.phase, 'run', `frame ${frame + 1} is below the raised threshold`);
    assert.ok(game.y < target.height);
  }
  until(game, g => g.phase === 'poem', .2);
  assert.ok(game.run.events.includes('sideReturn'));
  assert.ok(Math.abs(game.time - PLAYGROUND_SIDE_DOOR_AT) < .1, `contact at ${game.time.toFixed(3)}s`);
});

test('side-door threshold crossings outside the doorway cannot trigger a delayed return', () => {
  for (const jumpAt of [PLAYGROUND_SIDE_DOOR_AT - .9, PLAYGROUND_SIDE_DOOR_AT + 1.1]) {
    const game = fresh(); game.start(); game.beginBranch('playground');
    until(game, g => g.time >= jumpAt, 29, obstaclePilot());
    game.jump(); advance(game, .9);
    assert.equal(game.run.events.includes('sideReturn'), false, `jump at ${jumpAt}s`);
    assert.equal(game.branch, 'playground');
  }
});

test('dead-zone and blocked gestures expose a short ripple without a movement action', () => {
  const game = fresh(); game.start(); game.beginSegment(1);
  game.pointerDown(210,120); game.pointerMove(218,124); game.pointerUp(218,124);
  assert.equal(game.run.jumps, 0); assert.equal(game.slide, 0);
  assert.equal(game.inputRipples.length, 1); assert.equal(game.inputRipples[0].kind, 'deadZone');
  assert.deepEqual([game.inputRipples[0].x,game.inputRipples[0].y], [218,124]);
  advance(game, .4); assert.equal(game.inputRipples.length, 0);
  game.pointerDown(210,120); game.pointerMove(170,120); game.pointerUp(170,120);
  assert.equal(game.inputRipples[0].kind, 'blocked'); assert.equal(game.run.jumps, 0);
});

test('segment scoring exposes a brief state without pausing and app pause preserves its remaining time', () => {
  const game = fresh(); game.start(); game.beginSegment(1);
  until(game, g => g.phase === 'choice', 42, obstaclePilot());
  assert.ok(game.lastScore.clear); assert.ok(game.lastScore.noHit); assert.ok(game.scoreTime > 1.4); assert.equal(game.paused, false);
  game.appHide(); const remaining=game.scoreTime; advance(game, .5); assert.equal(game.scoreTime,remaining);
  game.appShow(); clickButton(game,'继续向前'); advance(game,1.6); assert.equal(game.scoreTime,0);
});

test('all nine routes can collect every ordinary fragment without damage or corridor items', () => {
  const levels = [...SEGMENTS, ...Object.values(BRANCHES)];
  for (const level of levels) {
    const game = fresh(); game.start();
    if (typeof level.id === 'number') game.beginSegment(level.id); else game.beginBranch(level.id);
    const spots = game.pickups.map(({ at, height, value }) => ({ at, height, value }));
    assert.equal(spots.reduce((sum, spot) => sum + spot.value, 0), level.fragments, `${level.id}: value economy`);
    assert.ok(validateFragmentSpots(spots, level.duration, level.obstacles), `${level.id}: safe landing/reaction bands`);
    assert.equal(game.run.magnet, false); assert.equal(game.run.shield, false);
    const pilot = obstaclePilot();
    until(game, g => g.phase !== 'run', level.duration + (level.id === 5 ? 3 : 2), pilot);
    assert.equal(game.run.drops, 0, `${level.id}: no-hit route`);
    for (const pickup of game.pickups) assert.ok(game.run.collected.includes(pickup.id), `${level.id}: missed ${pickup.id} at ${pickup.at.toFixed(2)}`);
    assert.equal(game.run.segmentFragments, level.fragments, `${level.id}: full collection`);
  }
});

test('the old 14.00s and 23.89s fragment traps are outside obstacle and landing bands', () => {
  for (const [id, obstacleTime, oldFragmentTime] of [[4, 14, 14], [2, 24, 23.89]]) {
    const game = fresh(); game.start(); game.beginSegment(id);
    const obstacle = game.level.obstacles.find(o => o.at === obstacleTime);
    const band = pickupSafetyBand(obstacle);
    assert.ok(band.start < oldFragmentTime && oldFragmentTime < band.end);
    assert.ok(game.pickups.every(p => p.at <= band.start || p.at >= band.end), `segment ${id}: fragment still in trap`);
    const solid = obstacleBounds(obstacle.kind, 96);
    assert.ok(game.pickups.every(p => {
      const dx = Math.abs((p.at - obstacle.at) * RUN_SPEED);
      return dx > solid.w / 2 + 6;
    }), `segment ${id}: fragment visible inside obstacle`);
  }
});

test('solid obstacle art and posture hitboxes agree at the actual contact edge', () => {
  const game = fresh(); game.start(); game.beginSegment(1);
  game.debugGeometry = true;
  const low = game.obstacles[0], solid = obstacleBounds(low.kind, worldX(low.at, low.at - 21 / RUN_SPEED));
  assert.equal(solid.y, 197); assert.equal(solid.h, 19);
  assert.equal(playerBodyBounds(0, 'run').x + playerBodyBounds(0, 'run').w < solid.x, true);
  game.time = low.at - 21 / RUN_SPEED; game.stepRun(0, 0);
  assert.equal(game.run.drops, 0, 'a visible gap never hurts');
  game.time = low.at - 18 / RUN_SPEED; game.stepRun(0, 0);
  assert.equal(game.run.drops, 1, 'touching the solid crate hurts once');
  assert.ok(game.geometryEvents.some(event => event.includes(low.label) && event.includes('run')));
  game.stepRun(0, 0); assert.equal(game.run.drops, 1);

  const sliding = fresh(); sliding.start(); sliding.beginSegment(1); sliding.time = 18;
  sliding.down(); sliding.stepRun(0, 0); assert.equal(sliding.run.drops, 0, 'slide is below the hanging bar');
  const jumping = fresh(); jumping.start(); jumping.beginSegment(1); jumping.time = 12; jumping.y = 20;
  jumping.stepRun(0, 0); assert.equal(jumping.run.drops, 0, 'feet pass over the crate');
  const diving = fresh(); diving.start(); diving.beginSegment(1); diving.time = 12; diving.y = 10; diving.diving = true;
  diving.stepRun(0, 0); assert.equal(diving.run.drops, 1, 'a dive through the crate is a real hit');
});

test('chairs stay in fixed world positions from their distant entrance through the final window', () => {
  for (const time of [0, 7.1, 9.1, 10.6]) {
    const chairs = CHAIRS.map((_, index) => chairSurface(index, time));
    for (let i = 1; i < chairs.length; i++) assert.ok(chairs[i].rect.x > chairs[i - 1].rect.x + chairs[i - 1].rect.w);
    chairs.forEach((chair, index) => {
      assert.equal(chair.center, 96 + (CHAIRS[index].at - time) * RUN_SPEED);
      assert.equal(chair.label, ['第一把', '第二把', '第三把'][index]);
      if (time < CHAIRS[index].start) assert.ok(chair.rect.x > 104, 'future chairs stay ahead of the feet');
    });
  }
});

test('each seat requires a real descending foot contact and records the matching saved event', () => {
  for (const [index, center] of CHAIRS.entries()) {
    const game = fresh(); game.start(); game.beginSegment(2); game.beginChoice(2);
    until(game, g => g.phaseTime >= center.at - .30, center.at);
    game.jump();
    until(game, g => g.phaseTime >= center.at - .08, .4);
    game.down();
    until(game, g => g.phase === 'seat', .25);
    assert.equal(game.seat, index + 1); assert.equal(game.y, CHAIR_HEIGHT);
    assert.ok(game.run.events.includes('seat' + (index + 1)));
    assert.deepEqual(JSON.parse(game.saved()).progress.seats, ['seat' + (index + 1)]);
    advance(game, 1.45);
    assert.equal(game.phase, 'poem');
  }
  const missed = fresh(); missed.start(); missed.beginSegment(2); missed.beginChoice(2);
  missed.jump(); advance(missed, .22); missed.down(); advance(missed, .3);
  assert.equal(missed.phase, 'choice', 'a ground impact before the stool arrives does not count');
  assert.equal(missed.run.events.some(e => /^seat[123]$/.test(e)), false);
});

test('hits, shield absorption, feather rescue and reduced motion show protection without square frames', () => {
  function renderState(game) {
    const rectangles = [], labels = [], shapes = [];
    game.render({ ...painter, rect: (...args) => rectangles.push(args), text: value => labels.push(value), poly: (...args) => shapes.push(args) });
    assert.equal(rectangles.some(([, , w, h]) => w === 33 && h === 46), false, 'no 33 × 46 invincibility frame');
    assert.equal(rectangles.some(([, , w, h, color]) => w === 480 && h === 270 && String(color).includes('240,221,193')), false, 'no whole-screen hit flash');
    return { labels, shapes };
  }
  const hit = fresh(); hit.start(); hit.beginSegment(1); hit.obstacles = [];
  hit.damage(); assert.equal(hit.run.drops, 1); assert.equal(hit.run.invincible, .8);
  assert.ok(renderState(hit).labels.some(label => /^护 \d+$/.test(label)), 'the compact HUD keeps the remaining protection time visible');
  hit.damage(); assert.equal(hit.run.drops, 1, 'the 0.8 second protection prevents a second loss');
  advance(hit, .81); hit.damage(); assert.equal(hit.run.drops, 2);
  hit.settings.reducedMotion = true;
  assert.ok(renderState(hit).labels.some(label => /^护 \d+$/.test(label)), 'reduced motion retains the protection countdown');
  const shield = fresh({ inventory: { shield: 1 } }); shield.start(); shield.beginSegment(1); shield.obstacles = [];
  shield.useItem('shield'); assert.equal(shield.run.shield, true); renderState(shield);
  shield.damage(); assert.equal(shield.run.drops, 0); assert.equal(shield.run.shield, false);
  assert.ok(shield.protectionPulse > 0); renderState(shield);
  const feather = fresh({ inventory: { feather: 1 } }); feather.start(); feather.beginSegment(1); feather.obstacles = [];
  feather.run.lives = 1; feather.damage(); assert.equal(feather.run.lives, 3);
  assert.equal(feather.run.invincible, 3); renderState(feather);
});
