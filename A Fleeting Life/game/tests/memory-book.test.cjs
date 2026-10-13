'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { Game } = require('../build/Game.js');
const { GameModel } = require('../build/Model.js');
const { SEGMENTS, ENDINGS, POEMS, POEM_LOOK_BACK } = require('../build/Content.js');
const { memoryBookCards, memoryBookPageCount, memoryReviewForSegment, MEMORY_BOOK_PAGE_SIZE } = require('../build/MemoryBook.js');

const painter = { rect(){}, line(){}, circle(){}, text(){}, poly(){}, image(){ return false; } };
function fresh(profile, hooks = {}) {
  let saved = profile ? JSON.stringify(profile) : null;
  const game = new Game({ load: () => saved, save: value => { saved = value; } }, hooks);
  game.saved = () => saved;
  return game;
}
function card(cards, id) {
  const found = cards.find(entry => entry.id === id);
  assert.ok(found, `Missing memory card ${id}`);
  return found;
}
function clickButton(game, label) {
  game.render(painter);
  const button = game.buttons.find(entry => entry.label === label);
  assert.ok(button, `Missing UI button ${label}`);
  game.pointerDown(button.x + button.w / 2, button.y + button.h / 2);
  game.pointerUp(button.x + button.w / 2, button.y + button.h / 2);
  return button;
}

test('old saves rebuild the same read-only book, with three anonymous secret pages', () => {
  const game = fresh({ progress: { runs: 2 } });
  const before = JSON.stringify(game.profile);
  const cards = memoryBookCards(game.profile);
  assert.equal(cards.length, 16);
  assert.equal(MEMORY_BOOK_PAGE_SIZE, 4);
  assert.equal(memoryBookPageCount(cards), 4);
  assert.equal(cards.filter(entry => entry.kind === 'segment').length, 7);
  assert.equal(cards.filter(entry => entry.kind === 'branch').length, 2);
  assert.equal(cards.filter(entry => entry.kind === 'ending').length, 4);
  const secrets = cards.filter(entry => entry.kind === 'secret');
  assert.equal(secrets.length, 3);
  assert.ok(secrets.every(entry => !entry.unlocked && !entry.sound && !entry.question && !entry.echoes.length));
  assert.ok(secrets.every(entry => entry.icon === 'lamp' && entry.object === '尚未看清的物件'));
  for (const id of ['runaway', 'wall', 'secondGrade']) {
    const locked = card(cards, 'secret:' + id);
    assert.notEqual(locked.title, ENDINGS[id].name);
    assert.equal(locked.status[0], '尚未发现');
  }
  assert.equal(JSON.stringify(game.profile), before, 'opening the book must not write to progress');
  const restored = fresh(JSON.parse(before));
  assert.deepEqual(memoryBookCards(restored.profile), cards, 'cold load must derive the same pages');
});

test('completed segments show cumulative achievements without claiming a single perfect run', () => {
  const profile = { progress: { segments: {
    '1': { clear: true, full: true, noHit: true, noItem: false },
    alley: { clear: true, full: false, noHit: false, noItem: false },
  } } };
  const cards = memoryBookCards(profile);
  const first = card(cards, 'segment:1');
  assert.equal(first.unlocked, true);
  assert.deepEqual(first.status, ['曾走过', '红帽未记录', '曾收齐碎片', '曾无伤', '下次可无伤且不用道具']);
  assert.equal(first.object, SEGMENTS[0].memoryAnchor.object);
  assert.equal(first.sound, SEGMENTS[0].memoryAnchor.sound);
  assert.equal(card(cards, 'branch:alley').unlocked, true);
  assert.equal(card(cards, 'branch:playground').unlocked, false);
  assert.equal(card(cards, 'segment:2').unlocked, false);
  assert.deepEqual(first.echoes, [], 'a clear alone does not invent a remembered choice');
  assert.deepEqual(card(memoryBookCards({ progress: { segments: { '1': { clear: true } } } }),
    'segment:1').status, ['曾走过', '红帽未记录', '下次可收齐碎片']);
});

test('object status distinguishes a recorded touch, a recorded miss and an old save after cold load', () => {
  const profile = { progress: { runs: 3, segments: {
    '1': { clear: true }, '2': { clear: true }, '3': { clear: true },
  }, segmentMemories: {
    '1': { runId: 3, anchorEvent: 'hat', choiceEvent: 'umbrella', poemSeen: true },
    '2': { runId: 3, anchorEvent: '', choiceEvent: 'seat1', poemSeen: true },
  } } };
  const game = fresh(profile);
  const statuses = n => card(memoryBookCards(game.profile), 'segment:' + n).status;
  assert.ok(statuses(1).includes('曾碰过红帽'));
  assert.ok(statuses(2).includes('下次可碰湿书包'));
  assert.ok(statuses(3).includes('作业本未记录'));
  assert.ok(!statuses(3).some(line => line.startsWith('下次可碰')),
    'a clear flag alone cannot prove the object was missed');
  const cold = fresh(JSON.parse(game.saved()));
  for (const n of [1, 2, 3]) {
    assert.deepEqual(card(memoryBookCards(cold.profile), 'segment:' + n).status, statuses(n),
      'cold load must preserve the same object evidence');
  }
});

test('corridor anchor evidence describes a choice at the door in new and older saves', () => {
  const witnessedStatus = '曾在走廊门前做过选择';
  for (const voice of ['speak', 'silent']) {
    const model = new GameModel();
    model.beginRun(); model.enterSegment('4'); model.event(voice); model.finishSegment(0);
    model.event('pianoPractice');
    assert.equal(model.recordSegmentMemory('4'), true);
    assert.equal(model.profile.progress.segmentAnchorEvidence['4'], voice);
    const remembered = card(memoryBookCards(model.profile), 'segment:4');
    assert.equal(remembered.object, '走廊门缝');
    assert.equal(remembered.status[1], witnessedStatus);
    assert.deepEqual(remembered.echoes.map(echo => echo.event), [voice, 'pianoPractice']);
    const review = memoryReviewForSegment(model.profile, '4');
    assert.equal(review.anchorEvent, voice);
    assert.ok(review.anchorResponse);
  }

  const clearOnly = new GameModel(JSON.stringify({ progress: { segments: { '4': { clear: true } } } }));
  assert.equal(card(memoryBookCards(clearOnly.profile), 'segment:4').status[1], '走廊门前的选择未记录');
  assert.equal(card(memoryBookCards(clearOnly.profile,
    { finishedSegments: ['4'], events: ['silent'] }), 'segment:4').status[1], witnessedStatus);
  const missed = new GameModel(JSON.stringify({ progress: { segments: { '4': { clear: true } },
    segmentMemories: { '4': { runId: 2, anchorEvent: '', choiceEvent: 'pianoClose', poemSeen: false } } } }));
  assert.equal(card(memoryBookCards(missed.profile), 'segment:4').status[1], '下次可在走廊门前做选择');

  const olderRecords = [
    { label: 'stored event', event: 'speak', profile: { progress: { segments: { '4': { clear: true } },
      segmentAnchorEvidence: { '4': 'speak' } } } },
    { label: 'segment memory', event: 'silent', profile: { progress: { segments: { '4': { clear: true } },
      segmentMemories: { '4': { runId: 1, anchorEvent: 'silent', choiceEvent: 'pianoClose', poemSeen: false } } } } },
    { label: 'ending snapshot', event: 'speak', profile: { progress: { segments: { '4': { clear: true } } },
      endingSnapshots: { morning: { stats: { personality: 50, relationship: 50, will: 50, appearance: 50 },
        items: [], events: ['speak', 'pianoPractice', 'segment:4:noHit'], wet: 0 } } } },
  ];
  for (const { label, event, profile } of olderRecords) {
    const restored = new GameModel(JSON.stringify({ version: 1, ...profile }));
    assert.equal(restored.profile.progress.segmentAnchorEvidence['4'], event, label);
    assert.equal(card(memoryBookCards(restored.profile), 'segment:4').status[1], witnessedStatus, label);
  }
  assert.equal(card(memoryBookCards({ progress: { segments: { '4': { clear: true } } },
    endingSnapshots: { morning: { events: ['speak', 'segment:4:noHit'] } } }),
  'segment:4').status[1], witnessedStatus);
});

test('a marked first-ending snapshot proves an older object touch, but absence proves no miss', () => {
  const base = { progress: { runs: 4, segments: { '1': { clear: true } } },
    endingSnapshots: { morning: { stats: { personality: 50, relationship: 50, will: 50, appearance: 50 },
      items: [], events: ['hat', 'umbrella', 'segment:1:noHit'], wet: 0 } } };
  const seen = fresh(base);
  assert.equal(seen.profile.progress.segmentAnchorEvidence['1'], 'hat');
  assert.ok(card(memoryBookCards(seen.profile), 'segment:1').status.includes('曾碰过红帽'));
  assert.deepEqual(card(memoryBookCards(fresh(JSON.parse(seen.saved())).profile), 'segment:1').status,
    card(memoryBookCards(seen.profile), 'segment:1').status);
  const noAnchor = structuredClone(base);
  noAnchor.endingSnapshots.morning.events = ['umbrella', 'segment:1:noHit'];
  assert.ok(card(memoryBookCards(fresh(noAnchor).profile), 'segment:1').status.includes('红帽未记录'));
  const anchorWithoutChoice = structuredClone(base);
  anchorWithoutChoice.endingSnapshots.morning.events = ['hat', 'segment:1:noHit'];
  assert.ok(card(memoryBookCards(fresh(anchorWithoutChoice).profile), 'segment:1').status.includes('曾碰过红帽'),
    'the real anchor event and segment marker prove the touch even without an old choice record');
  const noMarker = structuredClone(base);
  noMarker.endingSnapshots.morning.events = ['hat', 'umbrella'];
  const unproven = fresh(noMarker);
  assert.equal(unproven.profile.progress.segmentAnchorEvidence['1'], undefined);
  assert.ok(card(memoryBookCards(unproven.profile), 'segment:1').status.includes('红帽未记录'));
  const missedLater = structuredClone(base);
  missedLater.progress.segmentMemories = {
    '1': { runId: 4, anchorEvent: '', choiceEvent: 'umbrella', poemSeen: true },
  };
  assert.ok(card(memoryBookCards(fresh(missedLater).profile), 'segment:1').status.includes('曾碰过红帽'),
    'an older proven touch remains cumulative even when the last recorded run missed it');
});

test('an object touched in one run stays recorded after a later miss, without changing the latest review', () => {
  let saved = null;
  const model = new GameModel(undefined, json => { saved = json; });
  model.beginRun(); model.enterSegment('1'); model.event('hat'); model.finishSegment(0);
  model.event('umbrella'); assert.equal(model.recordSegmentMemory('1'), true);
  assert.equal(model.markSegmentPoem(0), true);
  assert.equal(model.profile.progress.segmentAnchorEvidence['1'], 'hat');

  model.beginRun(); model.enterSegment('1'); model.finishSegment(0);
  model.event('umbrella'); assert.equal(model.recordSegmentMemory('1'), true);
  assert.equal(model.profile.progress.segmentMemories['1'].anchorEvent, '');
  const restored = new GameModel(saved);
  assert.ok(card(memoryBookCards(restored.profile), 'segment:1').status.includes('曾碰过红帽'));
  assert.deepEqual(card(memoryBookCards(restored.profile), 'segment:1').echoes.map(echo => echo.event),
    ['umbrella'], 'the card must not cite an object absent from the latest completed run');
  const review = memoryReviewForSegment(restored.profile, '1');
  assert.equal(review.anchorEvent, '');
  assert.equal(review.choice.event, 'umbrella');
  assert.equal(review.poem, '', 'the first run poem cannot be attributed to the latest run');

  const legacy = new GameModel(JSON.stringify({ progress: { segments: { '1': { clear: true } },
    segmentMemories: { '1': { runId: 1, anchorEvent: 'hat', choiceEvent: 'umbrella', poemSeen: true } } } }));
  assert.equal(legacy.profile.progress.segmentAnchorEvidence['1'], 'hat');
  const invalid = new GameModel(JSON.stringify({ progress: { segments: { '1': { clear: true } },
    segmentMemories: { '1': { runId: 1, anchorEvent: 'wish', choiceEvent: 'umbrella', poemSeen: true } },
    segmentAnchorEvidence: { '1': 'wish' } } }));
  assert.equal(invalid.profile.progress.segmentAnchorEvidence['1'], undefined);
  assert.ok(card(memoryBookCards(invalid.profile), 'segment:1').status.includes('红帽未记录'));
});

test('a card cites only an event in its completed run or a real first-ending snapshot', () => {
  const profile = {
    progress: { segments: { '1': { clear: true } } },
    endingSnapshots: { morning: { events: ['hat', 'umbrella', 'segment:1:noHit'] } },
  };
  const saved = card(memoryBookCards(profile), 'segment:1');
  assert.deepEqual(saved.echoes.map(echo => [echo.event, echo.origin]),
    [['hat', '结局快照'], ['umbrella', '结局快照']]);
  const current = card(memoryBookCards(profile, { finishedSegments: ['1'], events: ['hat', 'alley'] }), 'segment:1');
  assert.deepEqual(current.echoes.map(echo => [echo.event, echo.origin]),
    [['hat', '本次走过'], ['alley', '本次走过']]);
  const missed = card(memoryBookCards(profile, { finishedSegments: ['1'], events: [] }), 'segment:1');
  assert.deepEqual(missed.echoes, [], 'do not substitute an older success for a missed current choice');
  const unfinished = card(memoryBookCards({ progress: { segments: {} } },
    { finishedSegments: [], events: ['hat'] }), 'segment:1');
  assert.equal(unfinished.unlocked, false);
  assert.deepEqual(unfinished.echoes, []);
});

test('a saved segment choice appears on its card even before any ending snapshot', () => {
  const profile = { progress: { segments: { '1': { clear: true }, '7': { clear: true } }, segmentMemories: {
    '1': { runId: 2, anchorEvent: 'hat', choiceEvent: 'umbrella', poemSeen: true },
    '7': { runId: 2, anchorEvent: 'wish', choiceEvent: '', poemSeen: false },
  } } };
  const before = JSON.stringify(profile);
  assert.deepEqual(card(memoryBookCards(profile), 'segment:1').echoes.map(echo => [echo.event, echo.origin]),
    [['hat', '那次走过'], ['umbrella', '那次走过']]);
  assert.deepEqual(card(memoryBookCards(profile), 'segment:7').echoes.map(echo => echo.event), ['wish']);
  assert.equal(JSON.stringify(profile), before, 'opening a card must not change the saved memory');
  profile.progress.segmentMemories['1'].poemSeen = 'unknown';
  assert.deepEqual(card(memoryBookCards(profile), 'segment:1').echoes, [],
    'an invalid record must not invent an old choice');
  assert.ok(card(memoryBookCards(profile), 'segment:1').status.includes('红帽未记录'),
    'an invalid record cannot prove either a touch or a missed object');
});

test('memory review shows only a cleared segment and its recorded object, choice and seen poem', () => {
  const locked = { progress: { segments: {} } };
  assert.equal(memoryReviewForSegment(locked, '1'), null);
  assert.equal(memoryReviewForSegment(locked, '8'), null);
  const clearOnly = { progress: { segments: { '1': { clear: true } } } };
  const old = memoryReviewForSegment(clearOnly, '1');
  assert.equal(old.object, SEGMENTS[0].memoryAnchor.object);
  assert.equal(old.choice, null);
  assert.equal(old.poem, '');
  assert.equal(old.anchorEvent, '');
  const snapshot = { progress: { segments: { '1': { clear: true } } },
    endingSnapshots: { morning: { events: ['hat', 'umbrella', 'segment:1:noHit'] } } };
  const witnessed = memoryReviewForSegment(snapshot, '1');
  assert.equal(witnessed.anchorEvent, 'hat');
  assert.equal(witnessed.choice.event, 'umbrella');
  assert.equal(witnessed.poem, '', 'a first-ending snapshot does not prove which poem was shown');
  const missingMarker = { ...snapshot, endingSnapshots: { morning: { events: ['hat', 'umbrella'] } } };
  assert.equal(memoryReviewForSegment(missingMarker, '1').choice, null);
  const saved = { progress: { segments: { '1': { clear: true } }, segmentMemories: {
    '1': { runId: 3, anchorEvent: 'hat', choiceEvent: 'umbrella', poemSeen: true },
  } } };
  assert.equal(memoryReviewForSegment(saved, '1').poem, POEMS[0]);
  assert.equal(memoryReviewForSegment(saved, '1').choice.action, '沿大路踩到伞');
});

test('branch skips and final segment cannot create a missing poem or hidden choice', () => {
  const profile = { progress: { segments: {
    '1': { clear: true }, '2': { clear: true }, '6': { clear: true }, '7': { clear: true },
  }, segmentMemories: {
    '1': { runId: 1, anchorEvent: '', choiceEvent: 'alley', poemSeen: false },
    '2': { runId: 1, anchorEvent: 'bag', choiceEvent: 'skipClass', poemSeen: false },
    '6': { runId: 2, anchorEvent: 'milk', choiceEvent: 'back', poemSeen: true },
    '7': { runId: 2, anchorEvent: 'wish', choiceEvent: '', poemSeen: false },
  } } };
  assert.equal(memoryReviewForSegment(profile, '1').poem, '');
  assert.equal(memoryReviewForSegment(profile, '2').poem, '');
  assert.equal(memoryReviewForSegment(profile, '6').poem, POEM_LOOK_BACK);
  assert.equal(memoryReviewForSegment(profile, '7').choice, null);
  assert.equal(memoryReviewForSegment(profile, '7').poem, '');
  profile.progress.segmentMemories['2'].poemSeen = true;
  assert.equal(memoryReviewForSegment(profile, '2').poem, '', 'an impossible saved skip-class poem must be ignored');
  profile.progress.segmentMemories['6'].choiceEvent = 'pianoClose';
  assert.equal(memoryReviewForSegment(profile, '6').choice, null, 'a choice from another segment must not leak');
});

test('ending memories use only their first snapshot, while secret hints unfold after discovery', () => {
  const profile = {
    lights: ['morning', 'backrow', 'outside', 'desk'],
    progress: { endings: { morning: 2 } },
    endingSnapshots: { morning: { events: ['speak', 'segment:4:noHit'] } },
  };
  const cards = memoryBookCards(profile);
  const morning = card(cards, 'ending:morning');
  assert.equal(morning.unlocked, true);
  assert.ok(morning.echoes.length > 0);
  assert.ok(morning.echoes.every(echo => profile.endingSnapshots.morning.events.includes(echo.event)));
  assert.deepEqual(card(cards, 'ending:outside').echoes, [], 'a lit lamp without a snapshot has no invented echo');
  const third = card(cards, 'secret:secondGrade');
  assert.equal(third.unlocked, false);
  assert.notEqual(third.title, ENDINGS.secondGrade.name);
  assert.equal(third.status[0], '有一道新路');
  assert.match(third.line, /四盏灯/);
  profile.progress.endings.runaway = 1;
  profile.progress.endings.wall = 1;
  profile.progress.endings.secondGrade = 1;
  const discovered = memoryBookCards(profile);
  assert.equal(card(discovered, 'secret:runaway').title, ENDINGS.runaway.name);
  assert.equal(card(discovered, 'secret:wall').title, ENDINGS.wall.name);
  assert.equal(card(discovered, 'secret:secondGrade').title, ENDINGS.secondGrade.name);
});

for (const route of [
  { segment: '1', branch: 'alley', choice: 'alley', ending: 'wall' },
  { segment: '2', branch: 'playground', choice: 'skipClass', ending: 'runaway' },
]) {
  test(`${route.branch} to ${route.ending} keeps witnessed choice echoes after a cold restart`, () => {
    let saved = '';
    const model = new GameModel(undefined, json => { saved = json; });
    model.beginRun();
    model.enterSegment(route.segment);
    model.finishSegment(0);
    assert.equal(model.event(route.choice), true);
    assert.equal(model.recordSegmentMemory(route.segment), true);
    assert.equal(model.profile.progress.cardEventEvidence['branch:' + route.branch], undefined,
      'entering a branch does not yet prove it was completed');

    model.enterSegment(route.branch);
    model.finishSegment(0);
    assert.equal(model.profile.progress.cardEventEvidence['branch:' + route.branch], route.choice);
    assert.equal(model.profile.progress.cardEventEvidence['secret:' + route.ending], undefined,
      'a completed branch alone does not prove its hidden ending');
    assert.equal(model.finishEnding(route.ending), true);

    const recent = { events: model.run.events, finishedSegments: model.run.finishedSegments, ending: model.run.ending };
    for (const id of ['branch:' + route.branch, 'secret:' + route.ending]) {
      const current = card(memoryBookCards(model.profile, recent), id);
      assert.equal(current.unlocked, true);
      assert.deepEqual(current.echoes.map(echo => [echo.event, echo.origin]),
        [[route.choice, '本次走过']]);
    }

    const cold = new GameModel(saved);
    assert.deepEqual(cold.profile.progress.cardEventEvidence, {
      ['branch:' + route.branch]: route.choice,
      ['secret:' + route.ending]: route.choice,
    });
    for (const id of ['branch:' + route.branch, 'secret:' + route.ending]) {
      const restored = card(memoryBookCards(cold.profile), id);
      assert.equal(restored.unlocked, true);
      assert.deepEqual(restored.echoes.map(echo => [echo.event, echo.origin]),
        [[route.choice, '那次走过']]);
    }
    assert.deepEqual(card(memoryBookCards(cold.profile,
      { finishedSegments: [route.branch], events: [] }), 'branch:' + route.branch).echoes, [],
    'a current completed branch with no witnessed event cannot borrow an old echo');
    assert.deepEqual(card(memoryBookCards(cold.profile,
      { ending: route.ending, events: [] }), 'secret:' + route.ending).echoes, [],
    'a current hidden ending with no witnessed event cannot borrow an old echo');
  });
}

test('a branch return updates its saved echo without replacing a first normal-ending snapshot', () => {
  let saved = '';
  const model = new GameModel(undefined, json => { saved = json; });
  model.beginRun(); model.enterSegment('1'); model.finishSegment(0);
  model.event('alley'); model.recordSegmentMemory('1'); model.enterSegment('alley'); model.finishSegment(0);
  assert.equal(model.profile.progress.cardEventEvidence['branch:alley'], 'alley');
  assert.equal(model.event('alleyReturn'), true);
  assert.equal(model.profile.progress.cardEventEvidence['branch:alley'], 'alleyReturn');
  model.finishEnding('morning');
  const firstSnapshot = [...model.profile.endingSnapshots.morning.events];
  assert.deepEqual(card(memoryBookCards(new GameModel(saved).profile), 'branch:alley').echoes
    .map(echo => [echo.event, echo.origin]), [['alleyReturn', '那次走过']]);

  model.beginRun(); model.enterSegment('1'); model.finishSegment(0);
  model.event('alley'); model.recordSegmentMemory('1'); model.enterSegment('alley'); model.finishSegment(0);
  model.finishEnding('wall');
  assert.deepEqual(model.profile.endingSnapshots.morning.events, firstSnapshot,
    'a later hidden route must not replace the first normal-ending snapshot');
  assert.deepEqual(card(memoryBookCards(new GameModel(saved).profile), 'branch:alley').echoes
    .map(echo => [echo.event, echo.origin]), [['alley', '那次走过']]);
});

test('older hidden-ending saves without event evidence unlock cards but claim no hidden choice', () => {
  const old = new GameModel(JSON.stringify({ progress: {
    segments: { '1': { clear: true }, alley: { clear: true }, '2': { clear: true }, playground: { clear: true } },
    segmentMemories: {
      '1': { runId: 1, anchorEvent: '', choiceEvent: 'alley', poemSeen: false },
      '2': { runId: 2, anchorEvent: '', choiceEvent: 'skipClass', poemSeen: false },
    },
    endings: { wall: 1, runaway: 1 },
  } }));
  assert.deepEqual(old.profile.progress.cardEventEvidence, {});
  for (const id of ['branch:alley', 'branch:playground', 'secret:wall', 'secret:runaway']) {
    const remembered = card(memoryBookCards(old.profile), id);
    assert.equal(remembered.unlocked, true);
    assert.deepEqual(remembered.echoes, [], 'old unlock counts and segment memories do not prove a branch echo');
  }

  const withSnapshot = new GameModel(JSON.stringify({ progress: {
    segments: { alley: { clear: true } }, endings: { wall: 1 },
  }, endingSnapshots: { morning: {
    stats: { personality: 50, relationship: 50, will: 50, appearance: 50 },
    items: [], events: ['alley', 'alleyReturn', 'segment:alley:noHit'], wet: 0,
  } } }));
  assert.deepEqual(card(memoryBookCards(withSnapshot.profile), 'branch:alley').echoes
    .map(echo => [echo.event, echo.origin]), [['alleyReturn', '结局快照']]);
  assert.deepEqual(card(memoryBookCards(withSnapshot.profile), 'secret:wall').echoes, [],
    'a first normal-ending snapshot is not evidence for a separate hidden ending');
});

test('invalid or unearned card event evidence is discarded on load and ignored by the view', () => {
  const wrongEvents = { progress: {
    segments: { '1': { clear: true }, alley: { clear: true },
      '2': { clear: true }, playground: { clear: true } },
    endings: { wall: 1, runaway: 1 },
    cardEventEvidence: {
      'branch:alley': 'skipClass', 'branch:playground': 'alley',
      'secret:wall': 'skipClass', 'secret:runaway': 'alley', 'secret:secondGrade': 'back',
    },
  } };
  assert.deepEqual(new GameModel(JSON.stringify(wrongEvents)).profile.progress.cardEventEvidence, {});
  for (const id of ['branch:alley', 'branch:playground', 'secret:wall', 'secret:runaway']) {
    assert.deepEqual(card(memoryBookCards(wrongEvents), id).echoes, [],
      'the read-only view must reject a wrong event even before a save is loaded');
  }

  const missingBoundary = { achievements: ['wall'], progress: {
    segments: { alley: { clear: false } },
    cardEventEvidence: { 'branch:alley': 'alley', 'secret:wall': 'alley' },
  } };
  assert.deepEqual(new GameModel(JSON.stringify(missingBoundary)).profile.progress.cardEventEvidence, {});
  assert.deepEqual(card(memoryBookCards(missingBoundary), 'secret:wall').echoes, [],
    'an achievement without a completed route and ending cannot prove its choice');

  const noChoice = new GameModel();
  noChoice.beginRun(); noChoice.enterSegment('alley'); noChoice.finishSegment(0); noChoice.finishEnding('wall');
  assert.deepEqual(noChoice.profile.progress.cardEventEvidence, {},
    'model completion flags alone must not manufacture an alley choice');
  assert.deepEqual(card(memoryBookCards(noChoice.profile), 'secret:wall').echoes, []);

  const orphan = new GameModel();
  orphan.beginRun(); orphan.event('alley'); orphan.enterSegment('alley'); orphan.finishSegment(0); orphan.finishEnding('wall');
  assert.deepEqual(orphan.profile.progress.cardEventEvidence, {},
    'a branch event without its completed entry segment cannot claim a route');
});

test('hall navigation, detail, sound and paging are usable without starting or saving a run', () => {
  const sounds = [];
  const game = fresh({ progress: { segments: { '1': { clear: true } } } }, { sound: name => sounds.push(name) });
  const before = JSON.stringify(game.profile);
  clickButton(game, '记忆册');
  assert.equal(game.panel, 'memoryBook');
  game.render(painter);
  assert.equal(game.buttons.filter(button => button.label.startsWith('记忆:')).length, 4);
  assert.ok(!game.buttons.some(button => button.label === '出发'), 'the hall door must not receive panel touches');
  game.pointerDown(50, 130);
  game.pointerUp(50, 130);
  assert.equal(game.profile.progress.runs, 0);
  clickButton(game, '回目录');
  clickButton(game, '记忆:segment:1');
  assert.equal(game.panelPage, -1);
  clickButton(game, '再听一声');
  assert.ok(sounds.includes(SEGMENTS[0].memoryAnchor.sound));
  clickButton(game, '回目录');
  for (let page = 1; page < 4; page++) clickButton(game, '下一页');
  assert.equal(game.panelPage, 3);
  clickButton(game, '记忆:secret:secondGrade');
  assert.equal(game.panelPage, -16);
  clickButton(game, '回目录');
  assert.equal(game.panelPage, 3);
  clickButton(game, '×');
  assert.equal(game.panel, '');
  assert.equal(game.screen, 'hall');
  assert.equal(game.profile.progress.runs, 0);
  assert.equal(JSON.stringify(game.profile), before);
  assert.equal(game.saved(), JSON.stringify({ progress: { segments: { '1': { clear: true } } } }));
});

test('touching a memory review advances known beats without starting, scoring or saving a run', () => {
  const sounds = [];
  let writes = 0;
  const profile = { progress: { runs: 3, segments: { '1': { clear: true } }, segmentMemories: {
    '1': { runId: 3, anchorEvent: 'hat', choiceEvent: 'umbrella', poemSeen: true },
  } } };
  let saved = JSON.stringify(profile);
  const game = new Game({ load: () => saved, save: value => { writes++; saved = value; } },
    { sound: name => sounds.push(name) });
  const before = JSON.stringify(game.profile);
  clickButton(game, '记忆册');
  clickButton(game, '记忆:segment:1');
  game.render(painter);
  assert.ok(game.buttons.some(button => button.label === '记忆重看'));
  assert.ok(game.buttons.some(button => button.label === '完整重跑本章'));
  clickButton(game, '记忆重看');
  assert.equal(game.panel, 'memoryReview');
  assert.equal(game.screen, 'hall');
  assert.equal(game.run.active, false);
  assert.equal(game.profile.progress.runs, 3);
  game.render(painter);
  game.pointerDown(200, 120);
  game.pointerUp(200, 120);
  assert.equal(game.panelPage, 0, 'background touches cannot advance a review or start a run');
  clickButton(game, '碰一碰 · 再看那时');
  assert.equal(game.panelPage, 1);
  assert.ok(sounds.includes(SEGMENTS[0].memoryAnchor.sound));
  clickButton(game, '照那时走一步');
  assert.equal(game.panelPage, 2);
  const rendered = [];
  game.render({ ...painter, text(value){ rendered.push(value); } });
  assert.ok(rendered.includes('有人把伞留在门口。'));
  clickButton(game, '回记忆册');
  assert.equal(game.panel, 'memoryBook');
  assert.equal(game.panelPage, -1);
  assert.equal(JSON.stringify(game.profile), before);
  assert.equal(writes, 0);
  assert.equal(saved, JSON.stringify(profile));
  clickButton(game, '完整重跑本章');
  assert.equal(game.screen, 'play');
  assert.equal(game.phase, 'intro');
  assert.equal(game.profile.progress.runs, 4);
});

test('corridor review invites revisiting the doorway without claiming it was touched', () => {
  const game = fresh({ progress: { segments: { '4': { clear: true } } } });
  clickButton(game, '记忆册');
  clickButton(game, '记忆:segment:4');
  clickButton(game, '记忆重看');
  game.render(painter);
  assert.ok(game.buttons.some(button => button.label === '走过门前 · 再看那时'));
  assert.ok(!game.buttons.some(button => button.label === '碰一碰 · 再看那时'));
  clickButton(game, '走过门前 · 再看那时');
  assert.equal(game.panelPage, 11, 'a clear-only record still skips an unrecorded choice');
});

test('locked and clear-only memories never display an unrecorded choice or poem', () => {
  const game = fresh({ progress: { segments: { '1': { clear: true } } } });
  clickButton(game, '记忆册');
  clickButton(game, '记忆:segment:1');
  clickButton(game, '记忆重看');
  clickButton(game, '碰一碰 · 再看那时');
  assert.equal(game.panelPage, 2, 'clear-only history skips the missing choice beat');
  game.render(painter);
  assert.ok(!game.buttons.some(button => button.label === '照那时走一步'));
  clickButton(game, '回记忆册');
  clickButton(game, '回目录');
  clickButton(game, '记忆:segment:2');
  game.render(painter);
  assert.ok(!game.buttons.some(button => button.label === '记忆重看'));
  assert.ok(!game.buttons.some(button => button.label === '完整重跑本章'));
  game.panel = 'memoryReview'; game.panelPage = 3;
  game.render(painter);
  assert.ok(!game.buttons.some(button => button.label === '碰一碰 · 再看那时'));
  assert.equal(game.profile.progress.runs, 0);
});

test('the memory sound stays readable and disabled when muted', () => {
  const sounds = [];
  const game = fresh({ settings: { muted: true }, progress: { segments: { '1': { clear: true } } } },
    { sound: name => sounds.push(name) });
  clickButton(game, '记忆册');
  clickButton(game, '记忆:segment:1');
  const button = clickButton(game, '声音已关');
  assert.equal(button.disabled, true);
  assert.deepEqual(sounds, []);
});

test('each segment shows its object within 12 seconds even when a scene image fills the canvas', () => {
  const game = fresh();
  game.start();
  const capture = () => {
    const texts = [], panels = [];
    game.render({ ...painter, image(){ return true; },
      text(value, x, y, size, color){ texts.push({ value, x, y, size, color }); },
      rect(x, y, w, h){ panels.push({ x, y, w, h }); } });
    return { texts, panels };
  };
  for (const segment of SEGMENTS) {
    game.beginSegment(segment.id, segment.id === 2 ? 22.5 : 0);
    game.phaseTime = .6;
    const state = JSON.stringify({ run: game.run, time: game.time, obstacles: game.obstacles, pickups: game.pickups });
    let draw = capture();
    assert.ok(draw.panels.some(rect => rect.x === 400 && rect.y === 124 && rect.w === 66 && rect.h === 58));
    assert.ok(draw.texts.some(entry => entry.value === segment.memoryAnchor.object && entry.x === 433 && entry.y === 167));
    assert.equal(JSON.stringify({ run: game.run, time: game.time, obstacles: game.obstacles, pickups: game.pickups }), state,
      'the visual preview must not change collisions or progress');
    game.phaseTime = 10;
    draw = capture();
    assert.ok(draw.texts.some(entry => entry.value === segment.memoryAnchor.object && entry.y === 167));
    game.phaseTime = 12;
    draw = capture();
    assert.ok(!draw.texts.some(entry => entry.value === segment.memoryAnchor.object && entry.y === 167));
  }
  game.beginBranch('alley');
  game.phaseTime = .6;
  assert.ok(!capture().panels.some(rect => rect.x === 400 && rect.y === 124 && rect.w === 66 && rect.h === 58));
});
