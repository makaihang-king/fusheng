#!/usr/bin/env node
'use strict';

// Seeded-state native finale smoke only. This does not prove that four endings
// were reached with real inputs. Never run while an Android soak is active.
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const crypto = require('node:crypto');
const { spawnSync } = require('node:child_process');
const { DatabaseSync } = require('node:sqlite');
const { inspectVideos, assertNativeMp4 } = require('./native-video-inspect.cjs');

const PACKAGE = 'com.fleetinglife.s1';
const PROFILE_KEY = 'fleeting-life-s1';
const MOMENTS_KEY = 'fleeting-life-native-moments-v2';
const LEGACY_MOMENTS_KEY = 'fleeting-life-native-moments';
const QA_MARKER_KEY = 'codex-android-finale-smoke-session';
const PROJECT = path.resolve(__dirname, '..');
const QA_ROOT = path.join(PROJECT, 'build', 'qa');
const VIDEO_DIR = 'files/fleeting-life-moments-v2';
const REMOTE = ['databases/jsb.sqlite', 'databases/jsb.sqlite-wal', 'databases/jsb.sqlite-shm'];
const BACKUP = ['original-jsb.sqlite', 'original-jsb.sqlite-wal', 'original-jsb.sqlite-shm'];
const sha256 = bytes => crypto.createHash('sha256').update(bytes).digest('hex');

function assert(condition, message) { if (!condition) throw new Error(message); }
function samePath(a, b) { return path.resolve(a).toLowerCase() === path.resolve(b).toLowerCase(); }
function validateOut(out, qaRoot, mustExist) {
  fs.mkdirSync(qaRoot, { recursive: true });
  const root = fs.realpathSync(qaRoot);
  const resolved = path.resolve(out);
  assert(/^android-finale-smoke-[a-zA-Z0-9_-]+$/.test(path.basename(resolved)),
    'Output directory name must start with android-finale-smoke-');
  assert(samePath(fs.realpathSync(path.dirname(resolved)), root), 'Output must be a direct child of build/qa');
  if (mustExist) {
    assert(fs.existsSync(resolved), 'Backup directory does not exist');
    assert(samePath(fs.realpathSync(resolved), resolved), 'Backup directory must not be a symlink');
  } else assert(!fs.existsSync(resolved), 'Output directory already exists');
  return resolved;
}

function sqliteHeader(bytes) {
  assert(bytes && bytes.subarray(0, 16).equals(Buffer.from('SQLite format 3\0')), 'Invalid jsb.sqlite header');
}
function checkedRun(exe, args, input) {
  const result = spawnSync(exe, args, {
    input, encoding: null, windowsHide: true, maxBuffer: 128 * 1024 * 1024,
  });
  if (result.error || result.status !== 0) {
    const detail = result.error?.message || result.stderr?.toString('utf8').trim() || `exit ${result.status}`;
    throw new Error(`ADB command failed: ${args.slice(2).join(' ')}: ${detail}`);
  }
  return result.stdout;
}

class AdbTransport {
  constructor(adb, serial) { this.adb = adb; this.serial = serial; }
  invoke(args, input) { return checkedRun(this.adb, ['-s', this.serial, ...args], input); }
  shell(command, input) { return this.invoke(['shell', '-T', command], input); }
  forceStop() { this.shell(`am force-stop ${PACKAGE}`); }
  exists(relative) {
    const result = this.shell(`run-as ${PACKAGE} sh -c 'if test -f ${relative}; then printf yes; else printf no; fi'`).toString('utf8').trim();
    assert(result === 'yes' || result === 'no', `Unexpected existence result for ${relative}`);
    return result === 'yes';
  }
  read(relative) { return this.invoke(['exec-out', 'run-as', PACKAGE, 'cat', relative]); }
  installFiles(files) {
    // Windows adb.exe can truncate binary shell stdin at a Ctrl-Z byte. Push
    // each file first, then verify its app-private copy before replacing data.
    const nonce = crypto.randomBytes(6).toString('hex');
    const staged = [];
    const localStaged = [];
    const remoteStaged = [];
    const privateStaged = [];
    try {
      for (let i = 0; i < REMOTE.length; i++) {
        const bytes = files[i];
        if (bytes === null) continue;
        const local = path.join(os.tmpdir(), `codex-finale-${nonce}-${i}.bin`);
        const remote = `/data/local/tmp/codex-finale-${nonce}-${i}.bin`;
        const temporary = `databases/.codex-finale-${nonce}-${i}`;
        fs.writeFileSync(local, bytes, { flag: 'wx' });
        localStaged.push(local);
        this.invoke(['push', local, remote]);
        remoteStaged.push(remote);
        this.shell(`run-as ${PACKAGE} cp ${remote} ${temporary}`);
        privateStaged.push(temporary);
        assert(this.exists(temporary), `Staging file missing: ${temporary}`);
        assert(sha256(this.read(temporary)) === sha256(bytes), `Staging hash mismatch: ${temporary}`);
        staged.push({ temporary, target: REMOTE[i] });
      }
      assert(staged.some(file => file.target === REMOTE[0]), 'Main database must be staged');
      const commands = ['set -e'];
      for (const file of staged) commands.push(`chmod 600 ${file.temporary}`, `mv -f ${file.temporary} ${file.target}`);
      for (let i = 0; i < REMOTE.length; i++) if (files[i] === null) commands.push(`rm -f ${REMOTE[i]}`);
      this.shell(`run-as ${PACKAGE} sh -c '${commands.join('; ')}'`);
    } finally {
      for (const temporary of privateStaged) {
        try { this.shell(`run-as ${PACKAGE} rm -f ${temporary}`); } catch { /* keep the original failure */ }
      }
      for (const remote of remoteStaged) {
        try { this.shell(`rm -f ${remote}`); } catch { /* keep the original failure */ }
      }
      for (const local of localStaged) {
        try { fs.unlinkSync(local); } catch { /* keep the original failure */ }
      }
    }
  }
}

function deviceSnapshot(transport) {
  const files = REMOTE.map(relative => transport.exists(relative) ? transport.read(relative) : null);
  sqliteHeader(files[0]);
  return files;
}
function videoEntries(transport) {
  return transport.invoke(['exec-out', 'run-as', PACKAGE, 'ls', '-1A', VIDEO_DIR]).toString('utf8')
    .split(/\r?\n/).map(name => name.trim()).filter(Boolean);
}
function writeManifest(out, manifest) {
  const temporary = path.join(out, 'manifest.new.json');
  fs.writeFileSync(temporary, JSON.stringify(manifest, null, 2) + '\n', { flag: 'w' });
  fs.renameSync(temporary, path.join(out, 'manifest.json'));
}
function backupFiles(out, files) {
  return files.map((bytes, i) => {
    if (bytes === null) return { exists: false };
    const name = BACKUP[i];
    fs.writeFileSync(path.join(out, name), bytes, { flag: 'wx' });
    assert(sha256(fs.readFileSync(path.join(out, name))) === sha256(bytes), `Local backup hash mismatch: ${name}`);
    return { exists: true, name, bytes: bytes.length, sha256: sha256(bytes) };
  });
}
function readBackups(out, records) {
  assert(Array.isArray(records) && records.length === 3, 'Invalid backup manifest');
  const files = records.map((record, i) => {
    if (record.exists === false) return null;
    assert(record.exists === true && record.name === BACKUP[i] && /^[0-9a-f]{64}$/.test(record.sha256), 'Invalid backup manifest entry');
    const bytes = fs.readFileSync(path.join(out, BACKUP[i]));
    assert(bytes.length === record.bytes && sha256(bytes) === record.sha256, `Backup hash mismatch: ${BACKUP[i]}`);
    return bytes;
  });
  sqliteHeader(files[0]);
  return files;
}
function sameSnapshot(actual, expected) {
  return actual.every((bytes, i) => bytes === null ? expected[i] === null :
    expected[i] !== null && bytes.length === expected[i].length && sha256(bytes) === sha256(expected[i]));
}
function rows(db) { return new Map(db.prepare('SELECT key, value FROM data ORDER BY key').all().map(row => [row.key, row.value])); }
function snapshotRows(files) {
  const tempRoot = fs.realpathSync(os.tmpdir());
  const temporary = fs.mkdtempSync(path.join(tempRoot, 'fleeting-finale-read-'));
  try {
    const main = path.join(temporary, 'jsb.sqlite');
    for (let i = 0; i < files.length; i++) if (files[i] !== null)
      fs.writeFileSync(main + (i === 0 ? '' : i === 1 ? '-wal' : '-shm'), files[i], { flag: 'wx' });
    const db = new DatabaseSync(main, { readOnly: true });
    try { return rows(db); }
    finally { db.close(); }
  } finally {
    assert(samePath(path.dirname(temporary), tempRoot) && /^fleeting-finale-read-[A-Za-z0-9]+$/.test(path.basename(temporary)),
      'Unexpected finale temporary directory');
    fs.rmSync(temporary, { recursive: true, force: true });
  }
}
function sameRows(a, b) {
  return a.size === b.size && [...a].every(([key, value]) => b.get(key) === value);
}
function quoteSql(text) { return `'${text.replaceAll("'", "''")}'`; }
function seedProfile() {
  let GameModel, NORMAL_ENDINGS, Game;
  try {
    ({ GameModel, NORMAL_ENDINGS } = require(path.join(PROJECT, 'build', 'Model.js')));
    ({ Game } = require(path.join(PROJECT, 'build', 'Game.js')));
  } catch (error) { throw new Error(`Compile first with node scripts/build.cjs: ${error.message}`); }
  const model = new GameModel();
  const outcomeStats = {
    morning: { personality: 35, relationship: 50, will: 50, appearance: 50 },
    backrow: { personality: 55, relationship: 80, will: 50, appearance: 50 },
    outside: { personality: 90, relationship: 50, will: 50, appearance: 50 },
    desk: { personality: 60, relationship: 50, will: 50, appearance: 50 },
  };
  for (const id of NORMAL_ENDINGS) {
    model.beginRun();
    model.run.stats = outcomeStats[id];
    assert(model.determineEnding() === id, `Seeded stats do not select ${id}`);
    assert(model.finishEnding(model.determineEnding()), `Model did not finish ${id}`);
  }
  assert(model.allLit() && model.profile.finalePlayed === false, 'Four-light model state was not generated');
  const json = JSON.stringify(model.profile);
  const game = new Game({ load: () => json, save: () => {} });
  game.startEnding('secondGrade');
  // The finale is entered only after the second-grade ending has played to
  // completion; the model rejects an early finishEnding() call.
  game.phaseTime = game.duration;
  game.finishEnding();
  assert(game.phase === 'finale', 'Seeded profile did not reach the finale');
  return json;
}
function createPatchedDb(out, original, marker) {
  assert(/^[0-9a-f]{32}$/.test(marker), 'Invalid finale QA marker');
  const working = path.join(out, 'working-jsb.sqlite');
  for (let i = 0; i < original.length; i++) if (original[i] !== null)
    fs.writeFileSync(working + (i === 0 ? '' : i === 1 ? '-wal' : '-shm'), original[i], { flag: 'wx' });
  const db = new DatabaseSync(working);
  const patchedPath = path.join(out, 'seeded-jsb.sqlite');
  let before, seeded, momentFiles;
  try {
    before = rows(db);
    assert(!before.has(QA_MARKER_KEY), 'Device save already contains a finale QA marker');
    let index;
    try { index = JSON.parse(before.get(MOMENTS_KEY) || 'null'); } catch { throw new Error('Native MP4 index is invalid JSON'); }
    assert(index?.version === 2 && Array.isArray(index.candidates) && index.candidates.length >= 1 && index.candidates.length <= 3,
      'Capture a native MP4 moment in the final APK before seeding');
    momentFiles = index.candidates.map(moment => {
      const match = typeof moment.path === 'string' && moment.path.match(/^\/data\/(?:user\/0|data)\/com\.fleetinglife\.s1\/files\/fleeting-life-moments-v2\/(native-\d+-[a-z0-9]+\.mp4)$/);
      assert(match && moment.format === 'mp4' && `${moment.id}.mp4` === match[1] &&
        Number.isFinite(moment.durationMs) && moment.durationMs >= 2300 && moment.durationMs <= 3300,
        'Native MP4 index contains an invalid candidate');
      return { name: match[1], relative: `files/fleeting-life-moments-v2/${match[1]}`,
        durationMs: moment.durationMs };
    });
    assert(new Set(momentFiles.map(item => item.name)).size === momentFiles.length, 'Native MP4 index contains duplicate candidates');
    seeded = seedProfile();
    db.prepare('REPLACE INTO data(key,value) VALUES(?,?)').run(PROFILE_KEY, seeded);
    db.prepare('INSERT INTO data(key,value) VALUES(?,?)').run(QA_MARKER_KEY, marker);
    db.exec(`VACUUM INTO ${quoteSql(patchedPath)}`);
  } finally { db.close(); }
  const patched = new DatabaseSync(patchedPath, { readOnly: true });
  try {
    assert(patched.prepare('PRAGMA integrity_check').get().integrity_check === 'ok', 'Patched database failed integrity check');
    const after = rows(patched);
    assert(after.get(PROFILE_KEY) === seeded, 'Seeded profile was not written');
    assert(after.get(QA_MARKER_KEY) === marker, 'Finale QA marker was not written');
    assert(after.get(MOMENTS_KEY) === before.get(MOMENTS_KEY), 'Native MP4 index changed');
    assert(after.get(LEGACY_MOMENTS_KEY) === before.get(LEGACY_MOMENTS_KEY), 'Legacy PNG index changed');
    for (const [key, value] of before) if (key !== PROFILE_KEY) assert(after.get(key) === value, `Unrelated key changed: ${key}`);
    assert(after.size === before.size + 1 + (before.has(PROFILE_KEY) ? 0 : 1), 'Unexpected row count in patched database');
    return { bytes: fs.readFileSync(patchedPath), originalProfileSha256: before.has(PROFILE_KEY) ? sha256(Buffer.from(before.get(PROFILE_KEY))) : null,
      nativeVideoIndexSha256: sha256(Buffer.from(before.get(MOMENTS_KEY))),
      legacyMomentsIndexSha256: before.has(LEGACY_MOMENTS_KEY) ? sha256(Buffer.from(before.get(LEGACY_MOMENTS_KEY))) : null,
      momentFiles };
  } finally { patched.close(); }
}

async function prepare(transport, out, qaRoot = QA_ROOT, inspect = inspectVideos) {
  out = validateOut(out, qaRoot, false);
  transport.forceStop();
  const original = deviceSnapshot(transport);
  fs.mkdirSync(out);
  const marker = crypto.randomBytes(16).toString('hex');
  const manifest = {
    schema: 2, mode: 'seeded-state-native-finale-smoke', package: PACKAGE, serial: transport.serial,
    createdAt: new Date().toISOString(), status: 'backed-up',
    qaMarker: marker,
    warning: 'Injected four-light state verifies finale playback only; it is not evidence of physical route completion.',
    original: backupFiles(out, original),
  };
  writeManifest(out, manifest);
  const patch = createPatchedDb(out, original, marker);
  const listed = videoEntries(transport);
  const indexed = new Set(patch.momentFiles.map(item => item.name));
  const unexpected = listed.filter(name => !indexed.has(name));
  assert(unexpected.length === 0, `Finale launch would delete pre-existing unindexed v2 files: ${unexpected.join(', ')}`);
  manifest.preexistingVideoEntries = listed;
  const videoDir = path.join(out, 'moment-videos');
  fs.mkdirSync(videoDir);
  const copiedVideos = patch.momentFiles.map(item => {
    assert(transport.exists(item.relative), `Indexed native MP4 is missing: ${item.relative}`);
    const bytes = transport.read(item.relative);
    const file = path.join(videoDir, item.name);
    fs.writeFileSync(file, bytes, { flag: 'wx' });
    return { name: item.name, file, bytes: bytes.length, sha256: sha256(bytes), indexedDurationMs: item.durationMs };
  });
  // A browser must decode a one-second frame; checking ftyp alone is insufficient.
  const media = await inspect(copiedVideos);
  assert(Array.isArray(media) && media.length === copiedVideos.length, 'Not every native MP4 was decoded');
  for (let i = 0; i < media.length; i++) {
    assert(media[i].name === copiedVideos[i].name, 'Native MP4 inspector returned the wrong video');
    assertNativeMp4(media[i], copiedVideos[i].indexedDurationMs);
  }
  manifest.seededDbSha256 = sha256(patch.bytes);
  manifest.originalProfileSha256 = patch.originalProfileSha256;
  manifest.nativeVideoIndexSha256 = patch.nativeVideoIndexSha256;
  manifest.legacyMomentsIndexSha256 = patch.legacyMomentsIndexSha256;
  manifest.nativeMomentVideos = copiedVideos.map((item, i) => ({ name: item.name, bytes: item.bytes,
    sha256: item.sha256, indexedDurationMs: item.indexedDurationMs, media: media[i] }));
  manifest.status = 'ready-to-seed';
  writeManifest(out, manifest);
  transport.installFiles([patch.bytes, null, null]);
  assert(sameSnapshot(deviceSnapshot(transport), [patch.bytes, null, null]), 'Seeded database readback failed; restore from backup');
  manifest.status = 'seeded';
  manifest.seededAt = new Date().toISOString();
  writeManifest(out, manifest);
  return manifest;
}
function restore(transport, out, qaRoot = QA_ROOT) {
  out = validateOut(out, qaRoot, true);
  const manifest = JSON.parse(fs.readFileSync(path.join(out, 'manifest.json'), 'utf8'));
  assert([1, 2].includes(manifest.schema) && manifest.mode === 'seeded-state-native-finale-smoke' && manifest.package === PACKAGE,
    'This is not an Android finale smoke backup');
  assert(manifest.serial === transport.serial, 'Device serial does not match backup');
  assert(['backed-up', 'ready-to-seed', 'seeded'].includes(manifest.status),
    `Finale backup is not awaiting restoration: ${manifest.status}`);
  if (manifest.schema === 2) assert(/^[0-9a-f]{32}$/.test(manifest.qaMarker), 'Invalid finale QA marker');
  const original = readBackups(out, manifest.original);
  transport.forceStop();
  const current = deviceSnapshot(transport);
  const alreadyOriginal = sameSnapshot(current, original);
  const partialInstall = manifest.schema === 2 && manifest.status === 'ready-to-seed' &&
    manifest.seededDbSha256 === sha256(current[0]) && [1, 2].every(i =>
      current[i] === null || (original[i] !== null && sha256(current[i]) === sha256(original[i])));
  if (manifest.schema === 2 && !alreadyOriginal && !partialInstall) {
    const currentRows = snapshotRows(current);
    const originalRows = snapshotRows(original);
    if (!(currentRows.get(QA_MARKER_KEY) === undefined && sameRows(currentRows, originalRows))) {
      assert(currentRows.get(QA_MARKER_KEY) === manifest.qaMarker,
        'Device save does not contain this finale QA marker; refusing to overwrite it');
      for (const [key, value] of originalRows) if (key !== PROFILE_KEY)
        assert(currentRows.get(key) === value, `Device save changed outside the finale profile: ${key}`);
      for (const key of currentRows.keys()) if (key !== QA_MARKER_KEY)
        assert(originalRows.has(key) || key === PROFILE_KEY, `Device save gained an unrelated key: ${key}`);
    }
  }
  if (Array.isArray(manifest.nativeMomentVideos)) {
    for (const item of manifest.nativeMomentVideos) {
      assert(item && /^native-\d+-[a-z0-9]+\.mp4$/.test(item.name) && /^[0-9a-f]{64}$/.test(item.sha256),
        'Invalid native MP4 backup manifest');
      const relative = `files/fleeting-life-moments-v2/${item.name}`;
      assert(transport.exists(relative) && sha256(transport.read(relative)) === item.sha256,
        `Native MP4 changed during finale smoke: ${relative}`);
    }
  }
  if (!alreadyOriginal) {
    transport.installFiles(original);
    assert(sameSnapshot(deviceSnapshot(transport), original), 'Restored database hash mismatch; backup remains available');
  }
  manifest.status = 'restored';
  manifest.restoredAt = new Date().toISOString();
  writeManifest(out, manifest);
  return manifest;
}

function parseCli(args) {
  const values = new Map();
  for (let i = 0; i < args.length; i++) {
    const key = args[i];
    assert(['--prepare', '--restore', '--serial', '--adb', '--out'].includes(key), `Unknown option: ${key}`);
    assert(!values.has(key), `Repeated option: ${key}`);
    if (key === '--prepare' || key === '--restore') values.set(key, true);
    else { assert(i + 1 < args.length && !args[i + 1].startsWith('--'), `Missing value for ${key}`); values.set(key, args[++i]); }
  }
  assert(values.has('--prepare') !== values.has('--restore'), 'Specify exactly one of --prepare or --restore');
  for (const key of ['--serial', '--adb', '--out']) assert(values.has(key), `${key} is required`);
  const serial = values.get('--serial');
  assert(/^[A-Za-z0-9._:-]+$/.test(serial), 'Invalid device serial');
  const adb = path.resolve(values.get('--adb'));
  assert(fs.statSync(adb).isFile(), 'ADB must be a file');
  return { action: values.has('--prepare') ? 'prepare' : 'restore', serial, adb, out: values.get('--out') };
}
if (require.main === module) (async () => {
  try {
    const options = parseCli(process.argv.slice(2));
    const transport = new AdbTransport(options.adb, options.serial);
    const result = options.action === 'prepare' ? await prepare(transport, options.out) : restore(transport, options.out);
    process.stdout.write(`${result.mode}: ${result.status}\nBackup: ${path.resolve(options.out)}\n`);
    if (options.action === 'prepare') process.stdout.write('Launch the final APK manually, tap the cracked wall, then tap 看完这一幕. This seeded-state smoke does not count as a physical route pass. Restore with --restore and the same --serial, --adb, --out.\n');
  } catch (error) {
    process.stderr.write(`${error.stack || error}\nNo backup was deleted. If --prepare created an output directory, run --restore with the same options before further play.\n`);
    process.exitCode = 1;
  }
})();
module.exports = { AdbTransport, prepare, restore, seedProfile, createPatchedDb, validateOut };
