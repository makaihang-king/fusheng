'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { DatabaseSync } = require('node:sqlite');
const { checkRecovery } = require('./native-moment-recovery-check.cjs');

const videoDir = 'files/fleeting-life-moments-v2';
const indexedVideo = `${videoDir}/native-123-abcdef.mp4`;
const legacyPng = 'files/fleeting-life-moments/old-frame-A1.png';
const probeName = () => 'native-456-deadbeef.mp4';

function fixture(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'fleeting-recovery-test-'));
  t.after(() => {
    assert.equal(path.dirname(fs.realpathSync(root)), fs.realpathSync(os.tmpdir()));
    assert.match(path.basename(root), /^fleeting-recovery-test-[A-Za-z0-9]+$/);
    fs.rmSync(root, { recursive: true, force: true });
  });
  const dbPath = path.join(root, 'jsb.sqlite');
  const db = new DatabaseSync(dbPath);
  db.exec('CREATE TABLE data(key TEXT PRIMARY KEY, value TEXT)');
  db.prepare('INSERT INTO data(key,value) VALUES(?,?)').run('fleeting-life-native-moments-v2',
    JSON.stringify({ version: 2, candidates: [{ id: 'native-123-abcdef', format: 'mp4',
      path: `/data/user/0/com.fleetinglife.s1/${indexedVideo}` }] }));
  db.prepare('INSERT INTO data(key,value) VALUES(?,?)').run('fleeting-life-native-moments',
    JSON.stringify([{ frames: [`/data/user/0/com.fleetinglife.s1/${legacyPng}`] }]));
  db.close();
  return { root, out: path.join(root, 'report'), database: fs.readFileSync(dbPath) };
}

class FakeTransport {
  constructor(database) {
    this.serial = 'offline-device';
    this.files = new Map([
      ['databases/jsb.sqlite', database],
      [indexedVideo, Buffer.from('original indexed MP4')],
      [legacyPng, Buffer.from('original legacy PNG')],
    ]);
    this.stops = 0;
    this.writes = [];
    this.deletes = [];
    this.launches = 0;
    this.removeProbeOnLaunch = true;
  }
  forceStop() { this.stops++; }
  exists(relative) { return this.files.has(relative); }
  read(relative) {
    assert(this.files.has(relative), `Missing remote file: ${relative}`);
    return Buffer.from(this.files.get(relative));
  }
  invoke(args) {
    assert.deepEqual(args, ['exec-out', 'run-as', 'com.fleetinglife.s1', 'ls', '-1A', videoDir]);
    return Buffer.from([...this.files.keys()].filter(name => name.startsWith(videoDir + '/'))
      .map(name => path.posix.basename(name)).join('\n') + '\n');
  }
  shell(command, input) {
    const write = command.match(/^run-as com\.fleetinglife\.s1 sh -c 'cat > (files\/fleeting-life-moments-v2\/native-\d+-[a-z0-9]+\.mp4)'$/);
    if (write) {
      this.writes.push(write[1]);
      this.files.set(write[1], Buffer.from(input));
      return Buffer.alloc(0);
    }
    const remove = command.match(/^run-as com\.fleetinglife\.s1 rm -f (files\/fleeting-life-moments-v2\/native-\d+-[a-z0-9]+\.mp4)$/);
    if (remove) {
      this.deletes.push(remove[1]);
      this.files.delete(remove[1]);
      return Buffer.alloc(0);
    }
    assert.equal(command, 'am start -n com.fleetinglife.s1/com.cocos.game.AppActivity');
    this.launches++;
    if (this.removeProbeOnLaunch) for (const name of this.writes) this.files.delete(name);
    return Buffer.alloc(0);
  }
}

test('recovery rejects a pre-existing unindexed MP4 before creating or deleting a probe', async t => {
  const f = fixture(t);
  const transport = new FakeTransport(f.database);
  const oldFile = `${videoDir}/${probeName()}`;
  const original = Buffer.from('old user recording');
  transport.files.set(oldFile, original);
  await assert.rejects(checkRecovery(transport, f.out, { probeName }), /pre-existing unindexed v2 files/);
  assert.deepEqual(transport.read(oldFile), original);
  assert.deepEqual(transport.writes, []);
  assert.deepEqual(transport.deletes, []);
  assert.equal(transport.launches, 0);
  assert.match(JSON.parse(fs.readFileSync(path.join(f.out, 'report.json'), 'utf8')).error, /pre-existing unindexed/);
});

test('recovery removes only its own probe while preserving indexed MP4 and legacy PNG', async t => {
  const f = fixture(t);
  const transport = new FakeTransport(f.database);
  const beforeVideo = transport.read(indexedVideo);
  const beforeLegacy = transport.read(legacyPng);
  const report = await checkRecovery(transport, f.out, { probeName, wait: async () => {} });
  assert.equal(report.orphanRemoved, true);
  assert.equal(report.videoIndexUnchanged, true);
  assert.equal(report.legacyIndexUnchanged, true);
  assert.deepEqual(transport.writes, [`${videoDir}/${probeName()}`]);
  assert.deepEqual(transport.deletes, []);
  assert.deepEqual(transport.read(indexedVideo), beforeVideo);
  assert.deepEqual(transport.read(legacyPng), beforeLegacy);
});

test('existing output stops recovery before any device action', async t => {
  const f = fixture(t);
  const transport = new FakeTransport(f.database);
  fs.mkdirSync(f.out);
  await assert.rejects(checkRecovery(transport, f.out, { probeName }), /output already exists/);
  assert.equal(transport.stops, 0);
  assert.deepEqual(transport.writes, []);
});
