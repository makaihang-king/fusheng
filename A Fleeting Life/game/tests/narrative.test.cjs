const test = require('node:test');
const assert = require('node:assert/strict');
const { SEGMENTS, BRANCHES, ENDINGS, POEMS, POEM_LOOK_BACK } = require('../build/Content.js');
const { GameModel } = require('../build/Model.js');
const {
  SCENE_STORIES, MICRO_STORIES, CHOICE_SCENES, CHOICE_STORIES, CHOICE_GUIDES, CHOICE_AFTER,
  FRAGMENT_MEMORIES, sceneStory, sceneOpeningEcho, storyBeatsBetween, choicePreview, choiceGuide,
  fragmentMemoryCues, endingEchoRecords, endingEchoes,
} = require('../build/Narrative.js');

const SCENES = [...SEGMENTS.map(segment => String(segment.id)), ...Object.keys(BRANCHES)];
const CHOICES = [1, 2, 3, 4, 5, 6];
const LOCATIONS = new Set([...SCENES, ...CHOICES.map(id => 'choice' + id), 'ending']);

test('nine scene cards give a visible goal, three timed story points, and action feedback', () => {
  assert.deepEqual(Object.keys(SCENE_STORIES).sort(), SCENES.sort());
  for (const key of SCENES) {
    const scene = sceneStory(key);
    const duration = BRANCHES[key]?.duration ?? SEGMENTS[Number(key) - 1].duration;
    assert.ok(scene.objective && scene.focus, key + ' needs a goal and a person or object');
    assert.ok(scene.actions.length >= 1, key + ' needs a concrete action');
    assert.ok(scene.beats.filter(beat => !beat.when).length >= 3, key + ' needs three visible points');
    const ids = new Set();
    for (const beat of scene.beats) {
      assert.ok(beat.at > 0 && beat.at < duration, key + '/' + beat.id + ' must be inside the run');
      assert.ok(beat.text.split('\n').length <= 2, key + '/' + beat.id + ' exceeds two subtitle lines');
      assert.ok(!ids.has(beat.id), key + '/' + beat.id + ' repeats');
      ids.add(beat.id);
    }
    for (const action of scene.actions) {
      assert.ok(action.object && action.action && action.response && action.future.text, key + ' has an incomplete chain');
      assert.ok(LOCATIONS.has(action.future.at), key + ' has an unknown echo destination');
      if (action.trigger.kind === 'ending') assert.ok(ENDINGS[action.trigger.id]);
    }
  }
});

test('seven memory anchors link to a real later action and have a distinct original sound cue', () => {
  const sounds = new Set();
  for (const segment of SEGMENTS) {
    const anchor = segment.memoryAnchor;
    assert.ok(anchor.object && anchor.line && anchor.question, `Segment ${segment.id} needs a readable memory cue`);
    assert.ok(anchor.line.length <= 25, `Segment ${segment.id} cue should fit one subtitle line`);
    assert.match(anchor.sound, /^memory[A-Z]/);
    assert.ok(!sounds.has(anchor.sound), `Segment ${segment.id} sound must be identifiable`);
    sounds.add(anchor.sound);
    const actions = SCENE_STORIES[String(segment.id)].actions.map(action => action.trigger.id);
    assert.ok(anchor.events.some(event => actions.includes(event)), `Segment ${segment.id} anchor needs a real player action`);
  }
  assert.equal(sounds.size, 7);
  const corridorActions = SCENE_STORIES['4'].actions.filter(action =>
    SEGMENTS[3].memoryAnchor.events.includes(action.trigger.id));
  assert.deepEqual(corridorActions.map(action => action.trigger.id), ['speak', 'silent']);
  assert.ok(corridorActions.every(action => action.object.includes('话泡')),
    'the corridor anchor records a voice decision near the door, not a touch of the door');
  assert.match(corridorActions[0].action, /说/);
  assert.match(corridorActions[1].action, /经过/);
});

test('scene opening echoes refer only to this run and respond to the latest relevant choice', () => {
  assert.equal(sceneOpeningEcho('4', ['ownHomework', 'faceExam']).event, 'faceExam');
  assert.equal(sceneOpeningEcho('4', ['copyHomework']).event, 'copyHomework');
  assert.equal(sceneOpeningEcho('2', ['alleyReturn']).event, 'alleyReturn');
  assert.equal(sceneOpeningEcho('5', ['seat1']), undefined);
  assert.equal(sceneOpeningEcho('7', []), undefined);
});

test('all seven micro events and authored event hooks match the S1 model', () => {
  for (const segment of SEGMENTS) {
    const micro = MICRO_STORIES[segment.micro.event];
    assert.equal(micro.trigger.id, segment.micro.event);
    assert.ok(SCENE_STORIES[String(segment.id)].actions.includes(micro));
  }
  const actions = [
    ...Object.values(SCENE_STORIES).flatMap(scene => scene.actions),
    ...Object.values(CHOICE_SCENES).flatMap(choice => choice.outcomes),
  ];
  for (const action of actions) {
    if (action.trigger.kind !== 'event') continue;
    const id = action.trigger.id;
    const model = new GameModel(JSON.stringify({ lights: ['morning', 'backrow', 'outside', 'desk'] }));
    model.beginRun();
    if (id === 'cheat' || id === 'graffiti') assert.equal(model.event('pen'), true);
    assert.equal(model.event(id), true, id + ' must use an accepted Model event ID');
  }
});

test('choice copy gives state-aware stakes and keeps the two hidden inputs hidden', () => {
  assert.equal(CHOICE_STORIES.length, 7);
  assert.equal(CHOICE_GUIDES.length, 7);
  for (const id of CHOICES) {
    const choice = CHOICE_SCENES[id];
    assert.ok(choice.focus && choice.person && choice.stakes && choice.preview && choice.guide);
    assert.ok(choice.outcomes.length >= 2);
    for (const outcome of choice.outcomes) {
      assert.equal(CHOICE_AFTER[outcome.trigger.id], outcome.response);
      assert.ok(LOCATIONS.has(outcome.future.at));
    }
  }
  assert.match(choicePreview(3, { items: [] }), /没有笔/);
  assert.match(choiceGuide(3, { items: [] }), /只会摸口袋/);
  assert.match(choicePreview(3, { items: ['pen'] }), /口袋里的笔还在/);
  assert.match(choicePreview(6, { allLit: true }), /旧书包/);
  assert.doesNotMatch(choicePreview(6, { allLit: false }), /旧书包/);
  assert.doesNotMatch(choiceGuide(4), /长按|合盖/);
  assert.doesNotMatch(choiceGuide(6), /向左|回头|往回/);
  assert.doesNotMatch(choicePreview(6, { allLit: true }), /向左|←/);
});

test('an alley return receives only echoes from events that really occurred', () => {
  const model = new GameModel();
  model.beginRun();
  model.enterSegment('1');
  assert.equal(model.event('hat'), true);
  assert.equal(model.event('alley'), true);
  model.enterSegment('alley');
  assert.equal(model.event('alleyReturn'), true);
  model.enterSegment('2');
  const resumed = storyBeatsBetween('2', 22.5, 39, model.run.events).map(beat => beat.id);
  assert.ok(resumed.includes('s2-hat-echo'));
  assert.ok(resumed.includes('s2-alley-echo'));
  assert.ok(!resumed.includes('s2-umbrella'));
  assert.ok(!resumed.includes('s2-pen'), 'a route starting at the midpoint must not replay the skipped pencil setup');
  const dry = storyBeatsBetween('2', 20, 39, ['umbrella']).map(beat => beat.id);
  assert.ok(dry.includes('s2-umbrella'));
  assert.ok(!dry.includes('s2-hat-echo'));
  assert.ok(!dry.includes('s2-alley-echo'));
});

test('fragment memories appear at three value thresholds, not on each pickup', () => {
  assert.deepEqual(Object.keys(FRAGMENT_MEMORIES).sort(), SCENES.sort());
  for (const key of SCENES) {
    const total = BRANCHES[key]?.fragments ?? SEGMENTS[Number(key) - 1].fragments;
    assert.deepEqual(FRAGMENT_MEMORIES[key].map(memory => memory.group), [1, 2, 3]);
    assert.deepEqual(fragmentMemoryCues(key, 0, total).map(memory => memory.group), [1, 2, 3]);
    assert.deepEqual(fragmentMemoryCues(key, 0, 1), []);
    for (let group = 1; group <= 3; group++) {
      const threshold = Math.ceil(total * group / 3);
      const cues = fragmentMemoryCues(key, threshold - 1, threshold);
      assert.deepEqual(cues.map(memory => memory.group), [group], key + ' threshold ' + group);
      assert.equal(cues[0].display, 'corner');
    }
  }
  assert.deepEqual(fragmentMemoryCues('2', 6, 9).map(memory => memory.group), [1], 'a 3-value pickup crosses one group threshold');
  assert.deepEqual(fragmentMemoryCues('2', 9, 9), [], 'a repeated pickup does not fire feedback');
});

test('ending echoes prefer deliberate choices and never invent a record', () => {
  const fullRun = ['hat', 'umbrella', 'seat1', 'faceExam', 'compared', 'milk', 'wish'];
  const echoes = endingEchoRecords(fullRun);
  assert.equal(echoes.length, 2);
  assert.deepEqual(echoes.map(echo => echo.event), ['seat1', 'faceExam']);
  assert.ok(echoes.every(echo => fullRun.includes(echo.event)));
  assert.deepEqual(endingEchoes(fullRun), echoes.map(echo => echo.text));
  const alternate = ['hat', 'umbrella', 'seat3', 'cheat', 'compared', 'milk', 'wish'];
  const changed = endingEchoRecords(alternate);
  assert.deepEqual(changed.map(echo => echo.event), ['seat3', 'cheat']);
  assert.ok(changed.every(echo => alternate.includes(echo.event)));

  const wallRun = ['alley', 'segment:1:noHit', 'segment:alley:hurt'];
  const branchEchoes = endingEchoRecords(wallRun);
  assert.equal(branchEchoes.length, 2, 'a short branch can use its actual segment evaluation as a second memory');
  assert.ok(branchEchoes.every(echo => wallRun.includes(echo.event)));
  assert.deepEqual(endingEchoes([]), [], 'empty history must not invent a generic memory');
});

test('six S1 corridor poems and the sixth look-back variant retain their approved lines', () => {
  assert.equal(POEMS.length, 6);
  assert.equal(POEMS[0], '有人把伞留在门口。\n雨里的事，只有雨知道。');
  assert.equal(POEMS[5], '带上他走吧。\n他就是你。');
  assert.equal(POEM_LOOK_BACK, '你把他留在了那里。\n他记得你回头看过。');
});
