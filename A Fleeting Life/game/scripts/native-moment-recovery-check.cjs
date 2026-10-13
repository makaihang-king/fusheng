#!/usr/bin/env node
'use strict';

// Device regression: an app restart removes an orphan MP4 without touching
// indexed recordings or still-present legacy PNG files. Run only after a real
// native MP4 has been captured; this deliberately stops and restarts the app.
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const crypto = require('node:crypto');
const { DatabaseSync } = require('node:sqlite');
const { AdbTransport } = require('./android-finale-smoke.cjs');

const PACKAGE = 'com.fleetinglife.s1';
const VIDEO_KEY = 'fleeting-life-native-moments-v2';
const LEGACY_KEY = 'fleeting-life-native-moments';
const VIDEO_DIR = 'files/fleeting-life-moments-v2';
const QA_ROOT = path.resolve(__dirname, '..', 'build', 'qa');
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
const sha256 = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
function assert(value, message) { if (!value) throw new Error(message); }

function parseCli(args) {
  const values = new Map();
  for (let i = 0; i < args.length; i++) {
    const key = args[i];
    assert(['--serial', '--adb', '--out'].includes(key) && !values.has(key), `Invalid option: ${key}`);
    assert(i + 1 < args.length && !args[i + 1].startsWith('--'), `Missing value for ${key}`);
    values.set(key, args[++i]);
  }
  assert(/^[A-Za-z0-9._:-]+$/.test(values.get('--serial') || ''), '--serial DEVICE is required');
  assert(values.has('--adb') && fs.statSync(values.get('--adb')).isFile(), '--adb ADB.EXE is required');
  const out = path.resolve(values.get('--out') || path.join(QA_ROOT, `native-moment-recovery-${Date.now()}`));
  return { serial: values.get('--serial'), adb: path.resolve(values.get('--adb')), out };
}

function readIndex(transport, temporary, label) {
  const main = path.join(temporary, `${label}.sqlite`);
  fs.writeFileSync(main, transport.read('databases/jsb.sqlite'), { flag: 'wx' });
  for (const suffix of ['-wal', '-shm']) {
    const remote = `databases/jsb.sqlite${suffix}`;
    if (transport.exists(remote)) fs.writeFileSync(main + suffix, transport.read(remote), { flag: 'wx' });
  }
  const db = new DatabaseSync(main, { readOnly: true });
  try {
    const get = key => db.prepare('SELECT value FROM data WHERE key = ?').get(key)?.value || null;
    return { videoRaw: get(VIDEO_KEY), legacyRaw: get(LEGACY_KEY) };
  } finally { db.close(); }
}

function candidatePaths(raw) {
  const index = JSON.parse(raw || 'null');
  assert(index?.version === 2 && Array.isArray(index.candidates) && index.candidates.length >= 1 && index.candidates.length <= 3,
    'Capture a v2 native MP4 before the recovery check');
  const paths = index.candidates.map(item => {
    const match = typeof item.path === 'string' && item.path.match(/^\/data\/(?:user\/0|data)\/com\.fleetinglife\.s1\/(files\/fleeting-life-moments-v2\/native-\d+-[a-z0-9]+\.mp4)$/);
    assert(match && item.format === 'mp4' && item.path.endsWith(`/${item.id}.mp4`), 'Invalid indexed native MP4 path');
    return match[1];
  });
  assert(new Set(paths).size === paths.length, 'Duplicate indexed native MP4 path');
  return paths;
}

function existingLegacyPaths(transport, raw) {
  const index = raw ? JSON.parse(raw) : [];
  assert(Array.isArray(index), 'Legacy PNG index is invalid');
  return [...new Set(index.flatMap(item => Array.isArray(item.frames) ? item.frames : []).map(value => {
    const match = typeof value === 'string' && value.match(/^\/data\/(?:user\/0|data)\/com\.fleetinglife\.s1\/(files\/fleeting-life-moments\/[A-Za-z0-9-]+\.png)$/);
    assert(match, 'Invalid legacy PNG path');
    return match[1];
  }))].filter(relative => transport.exists(relative));
}

function videoEntries(transport) {
  return transport.invoke(['exec-out', 'run-as', PACKAGE, 'ls', '-1A', VIDEO_DIR]).toString('utf8')
    .split(/\r?\n/).map(name => name.trim()).filter(Boolean);
}

async function checkRecovery(transport, out, { probeName = () => `native-${Date.now()}-${crypto.randomBytes(8).toString('hex')}.mp4`, wait = delay } = {}) {
  assert(!fs.existsSync(out), `Recovery output already exists: ${out}`);
  const name = probeName();
  assert(/^native-\d+-[a-z0-9]+\.mp4$/.test(name), 'Invalid recovery probe name');
  const orphan = `${VIDEO_DIR}/${name}`;
  const tempRoot = fs.realpathSync(os.tmpdir());
  const temporary = fs.mkdtempSync(path.join(tempRoot, 'fleeting-recovery-'));
  const report = { package: PACKAGE, serial: transport.serial, checkedAt: new Date().toISOString(), orphan };
  let failed;
  let probeOwned = false;
  try {
    transport.forceStop();
    const before = readIndex(transport, temporary, 'before');
    const indexed = candidatePaths(before.videoRaw);
    const legacy = existingLegacyPaths(transport, before.legacyRaw);
    const listed = videoEntries(transport);
    const expected = new Set(indexed.map(relative => path.posix.basename(relative)));
    const unexpected = listed.filter(entry => !expected.has(entry));
    report.preexistingVideoEntries = listed;
    assert(unexpected.length === 0, `Recovery would delete pre-existing unindexed v2 files: ${unexpected.join(', ')}`);
    const preserved = [...indexed, ...legacy].map(relative => {
      assert(transport.exists(relative), `Indexed media missing before recovery: ${relative}`);
      return { relative, sha256: sha256(transport.read(relative)) };
    });
    assert(!transport.exists(orphan), 'Recovery probe name already exists');
    const probe = Buffer.from('Codex native moment orphan recovery probe\n');
    probeOwned = true;
    transport.shell(`run-as ${PACKAGE} sh -c 'cat > ${orphan}'`, probe);
    assert(sha256(transport.read(orphan)) === sha256(probe), 'Recovery probe write failed');
    transport.shell(`am start -n ${PACKAGE}/com.cocos.game.AppActivity`);
    let removed = false;
    for (let i = 0; i < 40; i++) {
      if (!transport.exists(orphan)) { removed = true; break; }
      await wait(500);
    }
    transport.forceStop();
    const after = readIndex(transport, temporary, 'after');
    report.orphanRemoved = removed;
    report.videoIndexUnchanged = after.videoRaw === before.videoRaw;
    report.legacyIndexUnchanged = after.legacyRaw === before.legacyRaw;
    report.indexedVideos = indexed;
    report.legacyPngFiles = legacy;
    report.preservedMedia = preserved.map(item => ({ ...item,
      unchanged: transport.exists(item.relative) && sha256(transport.read(item.relative)) === item.sha256 }));
    assert(report.orphanRemoved, 'NativeMoments did not remove the orphan MP4 after restart');
    assert(report.videoIndexUnchanged && report.legacyIndexUnchanged, 'A moment index changed during recovery');
    assert(report.preservedMedia.every(item => item.unchanged), 'An indexed MP4 or legacy PNG changed during recovery');
  } catch (error) {
    failed = error;
    report.error = error.message;
  } finally {
    try {
      transport.forceStop();
      if (probeOwned && transport.exists(orphan)) transport.shell(`run-as ${PACKAGE} rm -f ${orphan}`);
    } catch (error) { report.cleanupError = error.message; failed ||= error; }
    fs.mkdirSync(out, { recursive: true });
    fs.writeFileSync(path.join(out, 'report.json'), JSON.stringify(report, null, 2) + '\n', { flag: 'wx' });
    const resolved = fs.realpathSync(temporary);
    assert(path.dirname(resolved) === tempRoot && /^fleeting-recovery-[A-Za-z0-9]+$/.test(path.basename(resolved)),
      'Unexpected recovery temporary directory');
    fs.rmSync(resolved, { recursive: true, force: true });
  }
  if (failed) throw failed;
  return report;
}
async function main() {
  const { serial, adb, out } = parseCli(process.argv.slice(2));
  await checkRecovery(new AdbTransport(adb, serial), out);
  console.log(`Recovery report: ${path.join(out, 'report.json')}`);
}
if (require.main === module) main().catch(error => { console.error(error); process.exitCode = 1; });
module.exports = { checkRecovery, parseCli };
