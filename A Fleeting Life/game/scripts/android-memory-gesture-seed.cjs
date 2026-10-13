#!/usr/bin/env node
'use strict';

// Adds only two completed-segment flags to a pristine, four-light finale QA
// seed. Run after android-finale-smoke.cjs --prepare and before launching the
// app. Restore with that script's --restore and the same output directory.
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const { DatabaseSync } = require('node:sqlite');
const { AdbTransport, validateOut } = require('./android-finale-smoke.cjs');

const QA_ROOT = path.resolve(__dirname, '..', 'build', 'qa');
const PACKAGE = 'com.fleetinglife.s1';
const PROFILE_KEY = 'fleeting-life-s1';
const MARKER_KEY = 'codex-android-finale-smoke-session';
const VIDEO_DIR = 'files/fleeting-life-moments-v2';
const LIGHTS = ['morning', 'backrow', 'outside', 'desk'];
const sha256 = bytes => crypto.createHash('sha256').update(bytes).digest('hex');

function localBytes(file) {
  assert(fs.lstatSync(file).isFile(), `Expected a regular file: ${file}`);
  return fs.readFileSync(file);
}
function isRecord(value) { return value !== null && typeof value === 'object' && !Array.isArray(value); }
function quoteSql(value) { return `'${value.replaceAll("'", "''")}'`; }
function readRows(file) {
  const db = new DatabaseSync(file, { readOnly: true });
  try {
    assert.equal(db.prepare('PRAGMA integrity_check').get().integrity_check, 'ok', `SQLite integrity check failed: ${file}`);
    return new Map(db.prepare('SELECT key,value FROM data ORDER BY key').all().map(row => [row.key, row.value]));
  } finally { db.close(); }
}
function assertOriginalBackups(out, manifest) {
  const names = ['original-jsb.sqlite', 'original-jsb.sqlite-wal', 'original-jsb.sqlite-shm'];
  assert(Array.isArray(manifest.original) && manifest.original.length === names.length,
    'The finale smoke has no complete original database manifest');
  assert.equal(manifest.original[0]?.exists, true, 'Original main SQLite backup is missing');
  for (let i = 0; i < names.length; i++) {
    const item = manifest.original[i];
    assert(isRecord(item) && typeof item.exists === 'boolean', `Invalid original backup record ${i}`);
    if (!item.exists) continue;
    assert.equal(item.name, names[i], `Unexpected original backup name ${i}`);
    const bytes = localBytes(path.join(out, item.name));
    assert.equal(bytes.length, item.bytes, `Original backup byte count changed: ${item.name}`);
    assert.equal(sha256(bytes), item.sha256, `Original backup hash changed: ${item.name}`);
  }
}
function checkedVideos(out, manifest) {
  const videos = manifest.nativeMomentVideos;
  assert(Array.isArray(videos) && videos.length >= 1 && videos.length <= 3,
    'The finale smoke must have backed up one to three native MP4 files');
  assert(Array.isArray(manifest.preexistingVideoEntries), 'The finale smoke has no MP4 directory listing');
  const names = videos.map(item => {
    assert(isRecord(item) && /^native-\d+-[a-z0-9]+\.mp4$/.test(item.name) &&
      Number.isSafeInteger(item.bytes) && item.bytes > 1000 && /^[0-9a-f]{64}$/.test(item.sha256),
    'Invalid native MP4 backup record');
    const bytes = localBytes(path.join(out, 'moment-videos', item.name));
    assert.equal(bytes.length, item.bytes, `Native MP4 backup byte count changed: ${item.name}`);
    assert.equal(sha256(bytes), item.sha256, `Native MP4 backup hash changed: ${item.name}`);
    return item.name;
  });
  assert.equal(new Set(names).size, names.length, 'Duplicate native MP4 backup name');
  assert.deepEqual([...manifest.preexistingVideoEntries].sort(), [...names].sort(),
    'The finale backup includes unexpected or missing MP4 files');
  return videos;
}
function assertOnlyProfileChanged(before, after, expectedProfile) {
  assert.equal(after.size, before.size, 'SQLite row count changed');
  for (const [key, value] of before) {
    assert(after.has(key), `SQLite row disappeared: ${key}`);
    if (key !== PROFILE_KEY) assert.equal(after.get(key), value, `Non-profile SQLite row changed: ${key}`);
  }
  assert.deepEqual(JSON.parse(after.get(PROFILE_KEY)), expectedProfile,
    'The seeded profile changed beyond the two completed-segment flags');
}
function patchSeededDatabase(out, manifest) {
  const seededFile = path.join(out, 'seeded-jsb.sqlite');
  const originalSeedBytes = localBytes(seededFile);
  assert.equal(sha256(originalSeedBytes), manifest.seededDbSha256,
    'The original finale seed hash does not match its manifest');
  const before = readRows(seededFile);
  assert.equal(before.get(MARKER_KEY), manifest.qaMarker, 'The finale seed marker does not match its manifest');
  const profile = JSON.parse(before.get(PROFILE_KEY));
  assert(isRecord(profile) && isRecord(profile.progress) && isRecord(profile.progress.segments),
    'The finale seed profile has an unexpected progress shape');
  assert.deepEqual(profile.lights, LIGHTS, 'The finale seed is not the expected four-light profile');
  assert.equal(profile.finalePlayed, false, 'The finale seed has already been played');
  for (const segment of ['4', '6']) {
    assert(!Object.hasOwn(profile.progress.segments, segment),
      `The finale seed already contains segment ${segment} progress`);
  }
  const expectedProfile = JSON.parse(JSON.stringify(profile));
  expectedProfile.progress.segments['4'] = { clear: true };
  expectedProfile.progress.segments['6'] = { clear: true };

  const workingFile = path.join(out, 'gesture-seed-working-jsb.sqlite');
  const patchedFile = path.join(out, 'gesture-seeded-jsb.sqlite');
  fs.copyFileSync(seededFile, workingFile, fs.constants.COPYFILE_EXCL);
  const db = new DatabaseSync(workingFile);
  try {
    db.exec('PRAGMA journal_mode=DELETE');
    assert.equal(db.prepare('PRAGMA journal_mode').get().journal_mode, 'delete',
      'Could not switch the QA working database to a single-file journal');
    const result = db.prepare('UPDATE data SET value = ? WHERE key = ?').run(JSON.stringify(expectedProfile), PROFILE_KEY);
    assert.equal(result.changes, 1, 'The QA profile row was not updated exactly once');
    db.exec(`VACUUM INTO ${quoteSql(patchedFile)}`);
  } finally { db.close(); }
  assert(!fs.existsSync(patchedFile + '-wal') && !fs.existsSync(patchedFile + '-shm'),
    'The QA seed has unexpected SQLite sidecars');
  const after = readRows(patchedFile);
  assertOnlyProfileChanged(before, after, expectedProfile);
  assert.equal(after.get(MARKER_KEY), manifest.qaMarker, 'The QA seed marker changed');
  return { bytes: localBytes(patchedFile), originalSeedSha256: manifest.seededDbSha256,
    seededSha256: sha256(localBytes(patchedFile)), beforeRows: before.size };
}
function deviceDatabase(transport, expectedSha256) {
  assert(transport.exists('databases/jsb.sqlite'), 'Device main SQLite file is missing');
  for (const suffix of ['-wal', '-shm'])
    assert(!transport.exists(`databases/jsb.sqlite${suffix}`), `Device SQLite ${suffix} appeared`);
  const bytes = transport.read('databases/jsb.sqlite');
  assert.equal(sha256(bytes), expectedSha256, 'Device SQLite hash differs from the expected QA seed');
  return { bytes: bytes.length, sha256: expectedSha256 };
}
function deviceVideos(transport, videos) {
  const listed = transport.invoke(['exec-out', 'run-as', PACKAGE, 'ls', '-1A', VIDEO_DIR])
    .toString('utf8').split(/\r?\n/).map(value => value.trim()).filter(Boolean).sort();
  assert.deepEqual(listed, videos.map(item => item.name).sort(), 'Device MP4 directory changed');
  return videos.map(item => {
    const relative = `${VIDEO_DIR}/${item.name}`;
    assert(transport.exists(relative), `Device MP4 disappeared: ${relative}`);
    const bytes = transport.read(relative);
    assert.equal(bytes.length, item.bytes, `Device MP4 byte count changed: ${relative}`);
    assert.equal(sha256(bytes), item.sha256, `Device MP4 hash changed: ${relative}`);
    return { name: item.name, bytes: item.bytes, sha256: item.sha256 };
  });
}
function writeReport(file, report, exclusive = false) {
  fs.writeFileSync(file, JSON.stringify(report, null, 2) + '\n', { flag: exclusive ? 'wx' : 'w' });
}

function seedMemoryGestures(transport, out, qaRoot = QA_ROOT) {
  out = validateOut(out, qaRoot, true);
  const manifestPath = path.join(out, 'manifest.json');
  const manifestBytes = localBytes(manifestPath);
  const manifest = JSON.parse(manifestBytes.toString('utf8'));
  assert.equal(manifest.schema, 2, 'The finale smoke manifest schema must be 2');
  assert.equal(manifest.mode, 'seeded-state-native-finale-smoke', 'This is not a finale smoke directory');
  assert.equal(manifest.package, PACKAGE, 'The finale smoke package differs');
  assert.equal(manifest.serial, transport.serial, 'The finale smoke device serial differs');
  assert.equal(manifest.status, 'seeded', 'Run successful android-finale-smoke --prepare first');
  assert(/^[0-9a-f]{32}$/.test(manifest.qaMarker), 'The finale smoke marker is invalid');
  assert(/^[0-9a-f]{64}$/.test(manifest.seededDbSha256), 'The original finale seed hash is invalid');
  const reportPath = path.join(out, 'gesture-seed-report.json');
  assert(!fs.existsSync(reportPath), 'This finale smoke directory already has a gesture seed report');
  assertOriginalBackups(out, manifest);
  const videos = checkedVideos(out, manifest);
  const patched = patchSeededDatabase(out, manifest);
  const report = {
    mode: 'finale-seed-plus-memory-gestures', serial: transport.serial, package: PACKAGE,
    createdAt: new Date().toISOString(), status: 'prepared-on-host',
    originalSeedSha256: patched.originalSeedSha256, gestureSeedSha256: patched.seededSha256,
    originalSeedRows: patched.beforeRows, manifestSha256: sha256(manifestBytes),
    changedProfilePaths: ['progress.segments.4.clear', 'progress.segments.6.clear'],
    otherSaveRowsUnchanged: true, restoreCommand: `node scripts/android-finale-smoke.cjs --restore --serial ${transport.serial} --adb <same-adb-path> --out "${out}"`,
  };
  writeReport(reportPath, report, true);
  try {
    transport.forceStop();
    report.deviceBefore = { database: deviceDatabase(transport, manifest.seededDbSha256),
      videos: deviceVideos(transport, videos) };
    assert.equal(sha256(localBytes(manifestPath)), report.manifestSha256, 'The finale smoke manifest changed before install');
    report.status = 'ready-to-install';
    writeReport(reportPath, report);

    transport.installFiles([patched.bytes, null, null]);
    report.deviceAfter = { database: deviceDatabase(transport, patched.seededSha256),
      videos: deviceVideos(transport, videos) };
    assert.deepEqual(report.deviceAfter.videos, report.deviceBefore.videos, 'Native MP4 files changed');
    assert.equal(sha256(localBytes(manifestPath)), report.manifestSha256, 'The original finale seed manifest changed');
    report.status = 'seeded';
    report.seededAt = new Date().toISOString();
    writeReport(reportPath, report);
    return report;
  } catch (error) {
    report.status = 'failed';
    report.error = String(error?.message || error);
    report.restoreHint = 'Use android-finale-smoke.cjs --restore with this same directory before further gameplay.';
    writeReport(reportPath, report);
    throw error;
  }
}
function parseCli(args) {
  const values = new Map();
  for (let i = 0; i < args.length; i++) {
    const key = args[i];
    assert(['--serial', '--adb', '--out'].includes(key) && !values.has(key), `Invalid option: ${key}`);
    assert(i + 1 < args.length && !args[i + 1].startsWith('--'), `Missing value for ${key}`);
    values.set(key, args[++i]);
  }
  for (const key of ['--serial', '--adb', '--out']) assert(values.has(key), `${key} is required`);
  assert(/^[A-Za-z0-9._:-]+$/.test(values.get('--serial')), 'Invalid device serial');
  const adb = path.resolve(values.get('--adb'));
  assert(fs.lstatSync(adb).isFile(), 'ADB must be a regular file');
  return { adb, serial: values.get('--serial'), out: values.get('--out') };
}
if (require.main === module) {
  try {
    const options = parseCli(process.argv.slice(2));
    const result = seedMemoryGestures(new AdbTransport(options.adb, options.serial), options.out);
    console.log(`Memory gesture seed: ${result.status}\nOriginal finale seed: ${result.originalSeedSha256}\nGesture seed: ${result.gestureSeedSha256}`);
    console.log(`Restore with android-finale-smoke.cjs --restore and the same --serial, --adb, --out.`);
  } catch (error) {
    console.error(error.stack || error);
    process.exitCode = 1;
  }
}
module.exports = { seedMemoryGestures, patchSeededDatabase, assertOnlyProfileChanged };
