'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { DatabaseSync } = require('node:sqlite');
const { prepare, restore, seedProfile } = require('./android-finale-smoke.cjs');
const videoIndex = JSON.stringify({ version: 2, candidates: [{ id: 'native-123-abcdef', format: 'mp4', kind: 'death',
  priority: 2, time: 123, durationMs: 3000,
  path: '/data/user/0/com.fleetinglife.s1/files/fleeting-life-moments-v2/native-123-abcdef.mp4' }], retiredLegacy: [] });
const legacyIndex = '[{"kind":"death","frames":["/data/user/0/com.fleetinglife.s1/files/fleeting-life-moments/123-0.png"]}]';
const remoteDb = ['databases/jsb.sqlite', 'databases/jsb.sqlite-wal', 'databases/jsb.sqlite-shm'];
const inspect = async files => files.map(file => ({ name: file.name, size: file.bytes, width: 480, height: 270,
  duration: 3, seekTime: 1, readyState: 4, rgba: [20, 30, 40, 255] }));

function fixture() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'fleeting-finale-offline-'));
  const qa = path.join(root, 'build', 'qa');
  fs.mkdirSync(qa, { recursive: true });
  const dbPath = path.join(root, 'fixture.sqlite');
  const db = new DatabaseSync(dbPath);
  db.exec('PRAGMA journal_mode=WAL');
  db.exec('CREATE TABLE data(key TEXT PRIMARY KEY,value TEXT)');
  db.prepare('INSERT INTO data(key,value) VALUES(?,?)').run('fleeting-life-s1', '{"fragments":17}');
  db.prepare('INSERT INTO data(key,value) VALUES(?,?)').run('fleeting-life-native-moments-v2', videoIndex);
  db.prepare('INSERT INTO data(key,value) VALUES(?,?)').run('fleeting-life-native-moments', legacyIndex);
  db.prepare('INSERT INTO data(key,value) VALUES(?,?)').run('unrelated-key', 'unchanged');
  const files = [dbPath, dbPath + '-wal', dbPath + '-shm'].map(file => fs.existsSync(file) ? fs.readFileSync(file) : null);
  db.close();
  return { root, qa, files, out: path.join(qa, 'android-finale-smoke-offline') };
}
function removeFixture(root) {
  const resolved = fs.realpathSync(root);
  assert.equal(path.dirname(resolved), fs.realpathSync(os.tmpdir()));
  assert.match(path.basename(resolved), /^fleeting-finale-offline-[A-Za-z0-9]+$/);
  fs.rmSync(resolved, { recursive: true, force: true });
}
class FakeTransport {
  constructor(files, failInstall = false) {
    this.serial = 'offline-device';
    this.files = files.map(value => value === null ? null : Buffer.from(value));
    this.stops = 0;
    this.failInstall = failInstall;
    this.failPartialInstall = false;
    this.momentExists = true;
    this.extraVideoEntries = [];
    this.mp4 = Buffer.alloc(1200, 77);
  }
  forceStop() { this.stops++; }
  exists(relative) {
    if (relative === 'files/fleeting-life-moments-v2/native-123-abcdef.mp4') return this.momentExists;
    const index = remoteDb.indexOf(relative);
    assert.notEqual(index, -1, `Unexpected remote path: ${relative}`);
    return this.files[index] !== null;
  }
  read(relative) {
    if (relative === 'files/fleeting-life-moments-v2/native-123-abcdef.mp4') return Buffer.from(this.mp4);
    return Buffer.from(this.files[remoteDb.indexOf(relative)]);
  }
  invoke(args) {
    assert.deepEqual(args, ['exec-out', 'run-as', 'com.fleetinglife.s1', 'ls', '-1A', 'files/fleeting-life-moments-v2']);
    return Buffer.from([...(this.momentExists ? ['native-123-abcdef.mp4'] : []), ...this.extraVideoEntries].join('\n') + '\n');
  }
  installFiles(files) {
    if (this.failInstall) throw new Error('simulated transfer failure');
    if (this.failPartialInstall) {
      this.files[0] = Buffer.from(files[0]);
      throw new Error('simulated failure after replacing main database');
    }
    this.files = files.map(value => value === null ? null : Buffer.from(value));
  }
}
function updateDeviceRow(f, transport, key, value) {
  const file = path.join(f.root, 'edited-device.sqlite');
  fs.writeFileSync(file, transport.files[0], { flag: 'w' });
  const db = new DatabaseSync(file);
  try { db.prepare('UPDATE data SET value = ? WHERE key = ?').run(value, key); }
  finally { db.close(); }
  transport.files[0] = fs.readFileSync(file);
}

test('model-generated four-light profile enters the native finale trigger', () => {
  const profile = JSON.parse(seedProfile());
  assert.deepEqual(profile.lights, ['morning', 'backrow', 'outside', 'desk']);
  assert.equal(profile.finalePlayed, false);
  assert.deepEqual(Object.keys(profile.endingSnapshots), profile.lights);
});

test('seed preserves v2 MP4 and legacy PNG indices; restore reproduces DB, WAL and SHM byte for byte', async t => {
  const f = fixture();
  t.after(() => removeFixture(f.root));
  const transport = new FakeTransport(f.files);
  const seeded = await prepare(transport, f.out, f.qa, inspect);
  assert.equal(seeded.status, 'seeded');
  assert.equal(seeded.nativeMomentVideos.length, 1);
  assert.equal(seeded.nativeMomentVideos[0].media.seekTime, 1);
  assert.equal(transport.stops, 1);
  assert.equal(transport.files[1], null);
  assert.equal(transport.files[2], null);
  const dbPath = path.join(f.root, 'verify.sqlite');
  fs.writeFileSync(dbPath, transport.files[0]);
  const db = new DatabaseSync(dbPath, { readOnly: true });
  const rows = new Map(db.prepare('SELECT key,value FROM data').all().map(row => [row.key, row.value]));
  db.close();
  assert.deepEqual(JSON.parse(rows.get('fleeting-life-s1')).lights, ['morning', 'backrow', 'outside', 'desk']);
  assert.equal(rows.get('fleeting-life-native-moments-v2'), videoIndex);
  assert.equal(rows.get('fleeting-life-native-moments'), legacyIndex);
  assert.equal(rows.get('unrelated-key'), 'unchanged');
  assert.match(rows.get('codex-android-finale-smoke-session'), /^[0-9a-f]{32}$/);
  const played = JSON.parse(rows.get('fleeting-life-s1'));
  played.finalePlayed = true;
  updateDeviceRow(f, transport, 'fleeting-life-s1', JSON.stringify(played));
  const restored = restore(transport, f.out, f.qa);
  assert.equal(restored.status, 'restored');
  assert.equal(transport.stops, 2);
  for (let i = 0; i < 3; i++) assert.deepEqual(transport.files[i], f.files[i]);
  assert.throws(() => restore(transport, f.out, f.qa), /not awaiting restoration/);
});

test('failed seeding leaves a verified local backup available for restore', async t => {
  const f = fixture();
  t.after(() => removeFixture(f.root));
  const transport = new FakeTransport(f.files, true);
  await assert.rejects(prepare(transport, f.out, f.qa, inspect), /simulated transfer failure/);
  const manifest = JSON.parse(fs.readFileSync(path.join(f.out, 'manifest.json'), 'utf8'));
  assert.equal(manifest.status, 'ready-to-seed');
  assert.ok(fs.existsSync(path.join(f.out, 'original-jsb.sqlite')));
  transport.failInstall = false;
  assert.equal(restore(transport, f.out, f.qa).status, 'restored');
  for (let i = 0; i < 3; i++) assert.deepEqual(transport.files[i], f.files[i]);
});

test('restore recovers a partial install with the original WAL and SHM still present', async t => {
  const f = fixture();
  t.after(() => removeFixture(f.root));
  const transport = new FakeTransport(f.files);
  transport.failPartialInstall = true;
  await assert.rejects(prepare(transport, f.out, f.qa, inspect), /failure after replacing main database/);
  assert.equal(JSON.parse(fs.readFileSync(path.join(f.out, 'manifest.json'), 'utf8')).status, 'ready-to-seed');
  assert.notDeepEqual(transport.files[0], f.files[0]);
  transport.failPartialInstall = false;
  assert.equal(restore(transport, f.out, f.qa).status, 'restored');
  for (let i = 0; i < 3; i++) assert.deepEqual(transport.files[i], f.files[i]);
});

test('missing indexed MP4 stops before the device database changes', async t => {
  const f = fixture();
  t.after(() => removeFixture(f.root));
  const transport = new FakeTransport(f.files);
  transport.momentExists = false;
  await assert.rejects(prepare(transport, f.out, f.qa, inspect), /Indexed native MP4 is missing/);
  assert.equal(JSON.parse(fs.readFileSync(path.join(f.out, 'manifest.json'), 'utf8')).status, 'backed-up');
  for (let i = 0; i < 3; i++) assert.deepEqual(transport.files[i], f.files[i]);
});

test('pre-existing unindexed v2 file stops seeding before the device database changes', async t => {
  const f = fixture();
  t.after(() => removeFixture(f.root));
  const transport = new FakeTransport(f.files);
  transport.extraVideoEntries.push('native-999-old.mp4.part');
  await assert.rejects(prepare(transport, f.out, f.qa, inspect), /pre-existing unindexed v2 files/);
  assert.equal(JSON.parse(fs.readFileSync(path.join(f.out, 'manifest.json'), 'utf8')).status, 'backed-up');
  for (let i = 0; i < 3; i++) assert.deepEqual(transport.files[i], f.files[i]);
});

test('MP4 decode failure stops before the device database changes', async t => {
  const f = fixture();
  t.after(() => removeFixture(f.root));
  const transport = new FakeTransport(f.files);
  await assert.rejects(prepare(transport, f.out, f.qa, async () => { throw new Error('video decode error'); }),
    /video decode error/);
  assert.equal(JSON.parse(fs.readFileSync(path.join(f.out, 'manifest.json'), 'utf8')).status, 'backed-up');
  for (let i = 0; i < 3; i++) assert.deepEqual(transport.files[i], f.files[i]);
});

test('restore refuses an unrelated save even when a valid backup exists', async t => {
  const f = fixture();
  t.after(() => removeFixture(f.root));
  const transport = new FakeTransport(f.files);
  await prepare(transport, f.out, f.qa, inspect);
  updateDeviceRow(f, transport, 'unrelated-key', 'new user progress');
  const current = Buffer.from(transport.files[0]);
  assert.throws(() => restore(transport, f.out, f.qa), /changed outside the finale profile/);
  assert.deepEqual(transport.files[0], current);
  assert.equal(JSON.parse(fs.readFileSync(path.join(f.out, 'manifest.json'), 'utf8')).status, 'seeded');
});

test('restore detects a modified MP4 before replacing the device database', async t => {
  const f = fixture();
  t.after(() => removeFixture(f.root));
  const transport = new FakeTransport(f.files);
  await prepare(transport, f.out, f.qa, inspect);
  const seeded = Buffer.from(transport.files[0]);
  const originalVideo = Buffer.from(transport.mp4);
  transport.mp4[0] ^= 1;
  assert.throws(() => restore(transport, f.out, f.qa), /Native MP4 changed during finale smoke/);
  assert.deepEqual(transport.files[0], seeded);
  transport.mp4 = originalVideo;
  assert.equal(restore(transport, f.out, f.qa).status, 'restored');
  for (let i = 0; i < 3; i++) assert.deepEqual(transport.files[i], f.files[i]);
});
