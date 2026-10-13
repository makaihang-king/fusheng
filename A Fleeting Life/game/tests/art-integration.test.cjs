'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { ART_MANIFEST, CHARACTER_ANIMATIONS, CHARACTER_SKINS, CHARACTER_VARIANTS,
  CHARACTER_WET_LEVELS, MICRO_ANCHOR_ART, UI_ICON_IDS, SCENE_SCROLL_CHUNK_COUNTS,
  SCENE_SCROLL_TILE_STRIDE, SCENE_SCROLL_TILE_WIDTH } = require('../build/Content.js');
const { Game } = require('../build/Game.js');
const { CHAIRS, CHOICE_PROPS, obstacleBounds, playerBodyBounds } = require('../build/Geometry.js');

const sceneNames = ['corridor', 'dawn', 'rain', 'noon', 'gray', 'dusk', 'night',
  'graduate', 'alley', 'playground', 'dream', 'heaven', 'hell'];

function fresh(segment = 1) {
  const game = new Game({ load: () => null, save() {} });
  game.start();
  game.beginSegment(segment);
  return game;
}

function draw(game, available = new Set()) {
  const calls = [];
  const painter = {
    rect(x, y, w, h, color) { calls.push({ type: 'rect', x, y, w, h, color }); },
    line(x1, y1, x2, y2, color) { calls.push({ type: 'line', x1, y1, x2, y2, color }); },
    circle(x, y, r, color) { calls.push({ type: 'circle', x, y, r, color }); },
    poly(points, color) { calls.push({ type: 'poly', points, color }); },
    text(value, x, y, size, color) { calls.push({ type: 'text', value, x, y, size, color }); },
    image(key, x, y, w, h, opacity = 1) { calls.push({ type: 'image', key, x, y, w, h, opacity }); return available.has(key); },
  };
  game.render(painter);
  return calls;
}

// Prime the real 100ms entry, then advance 16px to the loop's frame00.
function readyRun(game){
  draw(game);const travel=.1+16/72;game.time+=travel;game.sceneTime+=travel;
}

function characterKeys(calls) {
  return calls.filter(call => call.type === 'image' && /^character\.(?:pixel\.)?(idle|runStart|run|jump|doubleJump|dive|slide|slideRecovery|land|hurt|sit)\./.test(call.key));
}

test('manifest maps the canonical pixel animation frames and retains compatible legacy fallbacks', () => {
  const art = new Map(ART_MANIFEST.map(entry => [entry.key, entry]));
  assert.equal(art.size, ART_MANIFEST.length, 'art keys must be unique');
  for (const scene of sceneNames) {
    assert.equal(art.get(`scene.${scene}`)?.path, '');
    assert.equal(art.get(`scene.pixel.${scene}`)?.path,
      scene === 'corridor' ? 'art/pixel/scene/corridor-detail-v3.png' : `art/pixel/scene/${scene}.png`);
  }
  const counts = { idle: 8, runStart: 6, run: 16, jump: 16, doubleJump: 16, dive: 6,
    slide: 20, slideRecovery: 8, land: 6, hurt: 8, sit: 8,
    climb: 16, break: 10, sleep: 8, celebrate: 16 };
  const legacyCounts = { idle: 4, run: 10, jump: 6, doubleJump: 6, dive: 4,
    slide: 6, land: 4, hurt: 4, sit: 4 };
  assert.deepEqual(Object.fromEntries(Object.entries(CHARACTER_ANIMATIONS)
    .map(([pose, spec]) => [pose, spec.frames])), counts);
  for (const [pose, count] of Object.entries(counts))
    for (let frame = 0; frame < count; frame++) {
      const name = String(frame).padStart(2, '0');
      assert.equal(art.get(`character.pixel.${pose}.${name}`)?.path,
        `art/pixel/character/hd/${pose}/${name}.png`);
    }
  for (const [pose, count] of Object.entries(legacyCounts))
    for (let frame = 0; frame < count; frame++) {
      const name = String(frame).padStart(2, '0');
      assert.equal(art.get(`character.${pose}.${name}`)?.path,
        `art/character/${pose}/${name}.png`);
    }
});

test('long background tiles use one fixed 2D ground line and move opposite player travel', () => {
  assert.deepEqual(SCENE_SCROLL_CHUNK_COUNTS, {
    dawn: 4, rain: 4, noon: 4, gray: 5, dusk: 5, night: 4, graduate: 5,
    alley: 4, playground: 4, dream: 7, heaven: 5, hell: 5,
  });
  assert.equal(SCENE_SCROLL_TILE_WIDTH, 1024);
  assert.equal(SCENE_SCROLL_TILE_STRIDE, 960);
  const art = new Map(ART_MANIFEST.map(entry => [entry.key, entry]));
  for (const [scene, count] of Object.entries(SCENE_SCROLL_CHUNK_COUNTS))
    for (let frame = 0; frame < count; frame++) {
      const name = String(frame).padStart(2, '0');
      assert.equal(art.get(`scene.scroll.${scene}.${name}`)?.path,
        `art/pixel/scene/scroll/${scene}/${name}.png`);
    }

  const game = fresh(1);
  game.theme = 'dawn';
  game.time = 0;
  let calls = draw(game, new Set(['scene.scroll.dawn.00', 'scene.scroll.dawn.01']));
  let tiles = calls.filter(call => call.type === 'image' && call.key.startsWith('scene.scroll.dawn.'));
  assert.deepEqual(tiles.map(tile => [tile.key, tile.x, tile.y, tile.w, tile.h]), [
    ['scene.scroll.dawn.00', 0, 0, 1024, 270],
    ['scene.scroll.dawn.01', 960, 0, 1024, 270],
  ]);
  game.time = 18;
  calls = draw(game, new Set(['scene.scroll.dawn.01', 'scene.scroll.dawn.02']));
  tiles = calls.filter(call => call.type === 'image' && call.key.startsWith('scene.scroll.dawn.'));
  assert.deepEqual(tiles.map(tile => [tile.key, tile.x]), [
    ['scene.scroll.dawn.01', -336], ['scene.scroll.dawn.02', 624],
  ]);
});

test('seven Qwen choice plates have one world scale and stable resource keys', () => {
  const art = new Map(ART_MANIFEST.map(entry => [entry.key, entry]));
  for (const id of ['01', '02', '03', '04', '05', '06', 'alley']) {
    const resource=`art/pixel/scene/choice/${id}.png`;
    assert.equal(art.get(`scene.choice.${id}`)?.path,resource);
    const png=fs.readFileSync(path.join(__dirname,'../assets/resources',resource));
    assert.equal(png.subarray(0,8).toString('hex'),'89504e470d0a1a0a');
    assert.deepEqual([png.readUInt32BE(16),png.readUInt32BE(20)],[2560,540],id);
  }
  assert.equal(art.get('scene.pixel.corridor.legacy')?.path, 'art/pixel/scene/corridor.png');
  assert.equal(art.get('ui.logo.legacy')?.path, 'art/ui/logo.png');
});

test('extended actor manifest resolves every fixed-rig frame, skin, wet layer, and stat variant', () => {
  const entries = ART_MANIFEST.filter(entry => entry.path?.startsWith('art/'));
  const resourceRoot = path.join(__dirname, '../assets/resources');
  const listed = entries.map(entry => entry.path).sort();
  const actual = [];
  const walk = dir => {
    for (const item of fs.readdirSync(dir, { withFileTypes: true })) {
      const file = path.join(dir, item.name);
      if (item.isDirectory()) walk(file);
      else if (item.isFile() && file.toLowerCase().endsWith('.png'))
        actual.push(path.relative(resourceRoot, file).replace(/\\/g, '/'));
    }
  };
  walk(path.join(resourceRoot, 'art'));
  const listedSet=new Set(listed),actualSet=new Set(actual);
  const missing=listed.filter(file=>!actualSet.has(file)),unregistered=actual.filter(file=>!listedSet.has(file));
  assert.equal(missing.length,0,`missing registered PNGs (${missing.length}): ${missing.slice(0,5).join(', ')}`);
  assert.equal(unregistered.length,0,`unregistered runtime PNGs (${unregistered.length}): ${unregistered.slice(0,5).join(', ')}`);
  assert.equal(listed.length,actual.length,'every runtime PNG must be registered exactly once');
  assert.equal(entries.filter(entry => entry.path.startsWith('art/pixel/character/hd/')).length, 1455);
  assert.equal(entries.filter(entry => entry.path.startsWith('art/pixel/scene/')).length, 77);
  assert.equal(entries.filter(entry => entry.path.startsWith('art/character/hd/')).length, 48);
  assert.equal(entries.filter(entry => entry.key.startsWith('character.pixel.atlas.')).length, 15);
  assert.equal(entries.filter(entry => entry.path.startsWith('art/ui/hd/')).length, 7);
  assert.equal(new Set(entries.map(entry => entry.path)).size, entries.length);
  for (const entry of entries)
    assert.ok(fs.existsSync(path.join(__dirname, '../assets/resources', entry.path)), entry.path);
  assert.deepEqual([...CHARACTER_SKINS], ['waistJacket', 'raincoat', 'namelessNotebook']);
  assert.deepEqual([...CHARACTER_WET_LEVELS], [0, 15, 40, 70, 100]);
  assert.deepEqual(CHARACTER_VARIANTS.relationship, { low: 'cheerful', high: 'closed' });
  assert.deepEqual(CHARACTER_VARIANTS.appearance, { low: 'neat', high: 'messy' });
});

test('seven memory anchors and hall/HUD icons use supplied art without changing interaction paths', () => {
  assert.equal(Object.keys(MICRO_ANCHOR_ART).length, 7);
  assert.equal(UI_ICON_IDS.length, 19);
  const names = ['redhat', 'wetbag', 'homework', 'officecrack', 'bench', 'milk', 'wishtag'];
  for (let segment = 1; segment <= 7; segment++) {
    const game = fresh(segment);
    game.phaseTime = 1;
    const key = `props.micro.${names[segment - 1]}.normal`;
    assert.ok(draw(game, new Set([key])).some(call => call.type === 'image' && call.key === key), key);
    if (segment === 1) {
      game.phaseTime = .3;
      const faded = draw(game, new Set([key])).find(call => call.key === key);
      assert.equal(faded?.opacity, .5, 'anchor art follows the card fade');
    }
  }
  const game = fresh();
  const hudKeys = draw(game, new Set(['ui.icon.heart.active', 'ui.icon.fragment.normal',
    'ui.icon.pause.normal'])).filter(call => call.type === 'image').map(call => call.key);
  for (const key of ['ui.icon.heart.active', 'ui.icon.fragment.normal', 'ui.icon.pause.normal'])
    assert.ok(hudKeys.includes(key), key);
  game.toHall();
  const hallKeys = draw(game, new Set(['ui.logo', 'ui.icon.lamp_morning.normal',
    'ui.icon.achievement.normal'])).filter(call => call.type === 'image').map(call => call.key);
  for (const key of ['ui.logo', 'ui.icon.lamp_morning.normal', 'ui.icon.achievement.normal'])
    assert.ok(hallKeys.includes(key), key);
});

test('new prop and interface art is drawn only in its matching gameplay surfaces', () => {
  const game = fresh(5);
  game.phase = 'choice'; game.choice = 2; game.phaseTime = CHAIRS[0].at;
  const chairCalls = draw(game, new Set(['props.story.chair1.active']));
  assert.ok(chairCalls.some(call => call.key === 'props.story.chair1.active'));

  game.choice = 4; game.phaseTime = CHOICE_PROPS.piano.at; game.hold = .3;
  assert.ok(draw(game, new Set(['props.choice.piano']))
    .some(call => call.key === 'props.choice.piano'));
  game.choice = 5; game.phaseTime = CHOICE_PROPS.door.at - 2;
  assert.ok(draw(game, new Set(['props.choice.door']))
    .some(call => call.key === 'props.choice.door'));

  game.phase = 'run'; game.choice = 0; game.hold = 0;
  game.pickups = [{ id: 'art-test', at: 5, height: 18, value: 1 }];
  assert.ok(draw(game, new Set(['props.symbols.fragment.normal']))
    .some(call => call.key === 'props.symbols.fragment.normal'));

  game.toHall(); game.panel = 'achievements'; game.profile.achievements = ['noHit'];
  const achievements = draw(game, new Set(['props.achievements.full_exam.active', 'ui.icon.check.active']));
  for (const key of ['props.achievements.full_exam.active', 'ui.icon.check.active'])
    assert.ok(achievements.some(call => call.key === key), key);

  game.panel = 'settings';
  const settings = draw(game, new Set(['ui.icon.sound.active', 'ui.icon.motion.normal']));
  for (const key of ['ui.icon.sound.active', 'ui.icon.motion.normal'])
    assert.ok(settings.some(call => call.key === key), key);

  game.panel = 'memoryBook';
  assert.ok(draw(game, new Set(['ui.card.memory'])).some(call => call.key === 'ui.card.memory'));
});

test('birdcage symbol uses its detailed proportional asset while retaining its title clearance', () => {
  const normal = ART_MANIFEST.find(entry => entry.key === 'props.symbols.birdcageDetail.normal');
  const active = ART_MANIFEST.find(entry => entry.key === 'props.symbols.birdcageDetail.active');
  assert.equal(normal?.path, 'art/props/symbols/birdcage-detail-v6-normal.png');
  assert.equal(active?.path, 'art/props/symbols/birdcage-detail-v6-active.png');

  const game = fresh(1);
  game.time = game.duration * .82;
  const calls = draw(game, new Set([active.key]));
  const cage = calls.find(call => call.type === 'image' && call.key === active.key);
  assert.deepEqual([cage?.x, cage?.y, cage?.w, cage?.h], [80, 143, 32, 40]);
  assert.ok(calls.some(call => call.type === 'text' && call.value === '鸟笼' && call.y === 137));
});

test('intro uses a hinged doorway instead of a symmetric center wipe', () => {
  const game = new Game({ load: () => null, save() {} });
  game.start();
  const leafAt = time => {
    game.phaseTime = time;
    const calls = draw(game);
    const leaf = calls.find(call => call.type === 'poly' && call.color === '#6d8070');
    assert.ok(leaf, 'the same perspective leaf remains present');
    return { calls, points: leaf.points, width: leaf.points[1][0]-leaf.points[0][0] };
  };
  const closed = leafAt(.2), opening = leafAt(.9), open = leafAt(1.4);
  assert.ok(closed.width > 420, 'entry begins behind a closed door');
  assert.ok(closed.width > opening.width && opening.width > open.width,
    'the leaf narrows as it swings open, revealing the world from one side');
  assert.deepEqual(closed.points[0], open.points[0], 'the hinge stays fixed while the leaf opens');
  assert.equal(opening.calls.some(call => call.type === 'rect' && call.x === 0 && call.w === 240), false);
  assert.equal(closed.calls.some(call => call.type === 'text' && /生命|碎片|小满第一天/.test(call.value)), false,
    'the closed door is not covered by the game HUD or story');
  assert.ok(game.buttons.some(button => button.label === 'Ⅱ'), 'pause remains available during the entrance');
  const beforePush = leafAt(1.42), afterPush = leafAt(1.44);
  assert.ok(Math.abs(afterPush.points[1][0]-beforePush.points[1][0]) <= 2,
    'opening and walking through use a continuous door position');
  game.phaseTime = 1.8;
  const pushThrough = draw(game);
  assert.ok(pushThrough.some(call => call.type === 'rect' && call.color === '#334941' && call.x < 0),
    'the near door frame passes beyond the edge as the camera walks through');
  game.phaseTime = 2.9;
  assert.equal(draw(game).some(call => call.type === 'poly' && call.color === '#6d8070'), false,
    'the doorway clears before the runner starts');
  game.settings.reducedMotion = true;
  const reducedA = draw(game);
  game.phaseTime = .2;
  const reducedB = draw(game);
  assert.deepEqual(reducedA, reducedB, 'reduced motion keeps a stable open doorway');
});

test('equipped skin and strongest stat variant combine for run and idle while other poses keep the skin', () => {
  const game = fresh(); readyRun(game);
  game.profile.equippedSlots.skin = 'raincoat';
  game.run.stats = { personality: 80, relationship: 90, will: 50, appearance: 50 };
  game.run.wet = 70;
  const runVariant = 'character.skin.raincoat.variant.closed.run.00';
  const runWet = 'character.wet.70.run.00';
  const runCalls = draw(game, new Set([runVariant, runWet]));
  assert.ok(runCalls.some(call => call.type === 'image' && call.key === runVariant));
  assert.ok(runCalls.some(call => call.type === 'image' && call.key === runWet));
  assert.ok(runCalls.findIndex(call => call.key === runVariant) < runCalls.findIndex(call => call.key === runWet));

  game.phase = 'poem';
  const idleVariant = 'character.skin.raincoat.variant.closed.idle.00';
  assert.ok(draw(game, new Set([idleVariant])).some(call => call.key === idleVariant));

  game.phase = 'run'; game.y = 36; game.jumps = 1;
  const jumpSkin = 'character.skin.raincoat.jump.00';
  const jumpCalls = draw(game, new Set([jumpSkin]));
  assert.ok(jumpCalls.some(call => call.key === jumpSkin));
  assert.ok(!jumpCalls.some(call => call.key?.includes('.variant.')));
});

test('missing combined state art falls back to equipped skin, then the base frame', () => {
  const game = fresh(); readyRun(game);
  game.profile.equippedSlots.skin = 'waistJacket';
  game.run.stats.personality = 85;
  const skin = 'character.skin.waistJacket.run.00';
  const base = 'character.run.00';
  const withSkin = draw(game, new Set([skin]));
  assert.ok(withSkin.some(call => call.key === 'character.skin.waistJacket.variant.rebel.run.00'));
  assert.ok(withSkin.some(call => call.key === skin));
  assert.ok(!withSkin.some(call => call.key === base));
  assert.ok(draw(game, new Set([base])).some(call => call.key === base));
});

test('missing PNGs keep procedural scenery and actor; present frames use the 44px foot line', () => {
  const game = fresh(); readyRun(game);
  const fallback = draw(game);
  assert.ok(fallback.some(call => call.type === 'image' && call.key === 'scene.dawn'));
  assert.ok(fallback.some(call => call.type === 'image' && call.key === 'character.run.00'));
  assert.ok(fallback.some(call => call.type === 'rect' && call.color === '#eee6cf'),
    'the procedural shirt should remain when actor art is unavailable');

  game.phase = 'poem';
  const actor = draw(game, new Set(['character.pixel.idle.00']));
  const frame = characterKeys(actor)[0];
  assert.deepEqual([frame.key, frame.x, frame.y, frame.w, frame.h],
    ['character.pixel.idle.00', 72, 172, 48, 48]);
});

test('pixel scene and actor art take priority over the Qwen fallback', () => {
  const game = fresh(); readyRun(game);
  const calls = draw(game, new Set(['scene.scroll.dawn.00', 'character.pixel.run.00']));
  const scene = calls.find(call => call.type === 'image' && call.key.startsWith('scene.'));
  const actor = calls.find(call => call.type === 'image' && call.key === 'character.pixel.run.00');
  assert.equal(scene?.key, 'scene.scroll.dawn.00');
  assert.equal(actor?.key, 'character.pixel.run.00');
});

test('canonical slide uses a true low pose at the same 48px scale as standing', () => {
  const game = fresh();game.slide=.6;
  const key='character.pixel.slide.05';
  const frame=draw(game,new Set([key])).find(call=>call.key===key);
  assert.deepEqual([frame.x,frame.y,frame.w,frame.h],[72,172,48,48]);
  const beam=obstacleBounds('high',96);
  const pixelTop=26.5; // Deterministic rig low-pose top in 48px canvas.
  assert.ok(frame.y+pixelTop>beam.y+beam.h);
});

test('playable pose states select separate frame sequences and tolerate a missing later frame', () => {
  const poses = [
    ['run', game => {}],
    ['jump', game => { game.y = 36; game.jumps = 1; }],
    ['doubleJump', game => { game.y = 36; game.jumps = 2; }],
    ['dive', game => { game.y = 36; game.diving = true; }],
    ['slide', game => { game.slide = .8; }],
    ['hurt', game => { game.hurtPulse = .35; }],
    ['sit', game => { game.benchSitRemaining = 2; }],
    ['idle', game => { game.phase = 'poem'; }],
  ];
  for (const [pose, setup] of poses) {
    const game = fresh(); setup(game);if(pose==='run')readyRun(game);
    const available = new Set([`character.pixel.${pose}.00`]);
    const first = characterKeys(draw(game, available));
    assert.equal(first[0]?.key, `character.pixel.${pose}.00`, pose);
    game.sceneTime += 1 / CHARACTER_ANIMATIONS[pose].fps + .001;
    if(pose==='run')game.time+=1/CHARACTER_ANIMATIONS.run.fps+.001;
    if(pose==='slide')game.slide-=1/CHARACTER_ANIMATIONS.slide.fps+.001;
    const next = characterKeys(draw(game, available));
    assert.equal(next[0]?.key, `character.pixel.${pose}.01`, `${pose} should advance to frame 01`);
    assert.equal(next[1]?.key, `character.pixel.${pose}.00`, `${pose} should fall back to frame 00`);
  }
  const game = fresh();
  game.y = 30; game.jumps = 1; draw(game);
  game.sceneTime += .05; game.y = 0; game.jumps = 0;
  assert.equal(characterKeys(draw(game))[0]?.key, 'character.pixel.land.00');
  game.sceneTime += .19;
  assert.equal(characterKeys(draw(game))[0]?.key, 'character.pixel.land.04',
    'landing must show its final keyframe before returning to the run cycle');
});

test('slide release uses eight full-size recovery keys before the run cycle', () => {
  const game=fresh();game.slide=.01;draw(game);
  game.slide=0;game.slideRecovery=.25;game.sceneTime+=.01;
  let frames=characterKeys(draw(game,new Set(['character.pixel.slideRecovery.00'])));
  assert.equal(frames[0].key,'character.pixel.slideRecovery.00');
  assert.deepEqual([frames[0].x,frames[0].y,frames[0].w,frames[0].h],[72,172,48,48]);
  game.slideRecovery=.125;game.sceneTime+=.125;
  frames=characterKeys(draw(game,new Set(['character.pixel.slideRecovery.04'])));
  assert.equal(frames[0].key,'character.pixel.slideRecovery.04');
  game.slideRecovery=0;game.sceneTime+=.126;
  assert.match(characterKeys(draw(game))[0].key,/^character\.pixel\.runStart\./);
});

test('sitting places the hip on the chair surface without shrinking the actor',()=>{
  const game=fresh();game.phase='seat';game.choice=2;game.y=16;
  const frame=draw(game,new Set(['character.pixel.sit.00'])).find(call=>call.key==='character.pixel.sit.00');
  assert.deepEqual([frame.x,frame.y,frame.w,frame.h],[72,172,48,48]);
  assert.equal(frame.y+28,200,'source hip at28 sits on the seat at200');
});

test('damage flash cannot replace an ongoing low slide with standing hurt art',()=>{
  const game=fresh();game.slide=.6;game.hurtPulse=.35;
  const key='character.pixel.slide.05';
  const frame=draw(game,new Set([key])).find(call=>call.key===key);
  assert.ok(frame,'the low pose follows the physical slide even during damage feedback');
});

test('restart clears a prior slide pose without adding a visual-only recovery',()=>{
  const game=fresh();game.slide=.6;game.sceneTime=1;draw(game);
  game.slide=0;game.slideRecovery=0;game.sceneTime=0;
  const calls=draw(game,new Set(['character.pixel.runStart.00']));
  assert.ok(calls.some(call=>call.key==='character.pixel.runStart.00'));
  assert.ok(!calls.some(call=>call.key?.startsWith('character.pixel.slideRecovery.')));
});

test('loaded scene art keeps rain, choice echo and changing dream imagery', () => {
  const rain = fresh(2);
  rain.time = 22; rain.clock = 1; rain.run.events.push('hat');
  const rainCalls = draw(rain, new Set(['scene.rain']));
  assert.ok(rainCalls.some(call => call.type === 'line' && call.color?.startsWith('rgba(225,239,235,')),
    'rain must remain animated over a loaded background');
  assert.ok(rainCalls.some(call => call.type === 'rect' && call.color === '#bb6855'),
    'the red hat echo must remain after an earlier choice');

  const dream = fresh(6);
  dream.theme = 'dream'; dream.phase = 'reward'; dream.reward = 'dream';
  dream.phaseTime = 12; dream.run.events.push('ownHomework');
  const dreamCalls = draw(dream, new Set(['scene.dream']));
  assert.ok(dreamCalls.some(call => call.type === 'rect' &&
    call.color?.startsWith('rgba(42,64,70,')),
  'the changing chalkboard/window scene must remain over loaded art');
});
