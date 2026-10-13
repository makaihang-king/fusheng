#!/usr/bin/env node
'use strict';

// Read-only evidence for a stopped debuggable Android build. Copying the DB,
// WAL, SHM and private MP4 files needs run-as; no root or shared storage.
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const crypto = require('node:crypto');
const { spawnSync } = require('node:child_process');
const { DatabaseSync } = require('node:sqlite');
const { inspectVideos, assertNativeMp4 } = require('./native-video-inspect.cjs');

const pkg = 'com.fleetinglife.s1';
const videoKey = 'fleeting-life-native-moments-v2';
const legacyKey = 'fleeting-life-native-moments';
const videoDir = 'files/fleeting-life-moments-v2';
const legacyDir = 'files/fleeting-life-moments';
function parseCli(args) {
  const values = new Map();
  for (let i = 0; i < args.length; i++) {
    const key = args[i];
    if (!['--adb', '--serial', '--out'].includes(key) || values.has(key) ||
        i + 1 >= args.length || !args[i + 1] || args[i + 1].startsWith('--'))
      throw new Error(`Invalid or repeated evidence option: ${key}`);
    values.set(key, args[++i]);
  }
  const serial = values.get('--serial');
  if (!serial || !/^[A-Za-z0-9._:-]+$/.test(serial))
    throw new Error('Usage: node scripts/native-moments-evidence.cjs --serial DEVICE [--adb ADB.EXE] [--out DIRECTORY]');
  return { serial, adb: values.get('--adb') || 'adb',
    out: path.resolve(values.get('--out') || path.join(__dirname, '..', 'build', 'qa', `native-moments-${Date.now()}`)) };
}
const { adb, serial, out } = parseCli(process.argv.slice(2));

function runAdb(argv, optional = false) {
  const result = spawnSync(adb, ['-s', serial, ...argv], {
    encoding: null, maxBuffer: 128 * 1024 * 1024, windowsHide: true,
  });
  if (result.error) throw result.error;
  if (result.status !== 0) {
    if (optional) return null;
    throw new Error(`adb ${argv.join(' ')} failed: ${result.stderr.toString('utf8').trim()}`);
  }
  return result.stdout;
}
function readRemote(relative, optional = false) { return runAdb(['exec-out', 'run-as', pkg, 'cat', relative], optional); }
function listRemote(relative, optional = false) {
  const bytes = runAdb(['shell', 'run-as', pkg, 'ls', '-1', relative], optional);
  return bytes === null ? [] : bytes.toString('utf8').split(/\r?\n/).map(s => s.trim()).filter(Boolean);
}
function sha256(bytes) { return crypto.createHash('sha256').update(bytes).digest('hex'); }
function pngInfo(bytes) {
  if (bytes.length < 24 || !bytes.subarray(0, 8).equals(Buffer.from('89504e470d0a1a0a', 'hex')) ||
      bytes.toString('ascii', 12, 16) !== 'IHDR') throw new Error('Invalid legacy PNG header');
  return { width: bytes.readUInt32BE(16), height: bytes.readUInt32BE(20) };
}
function videoName(item) {
  if (!item || typeof item.id !== 'string' || !/^native-\d+-[a-z0-9]+$/.test(item.id) || item.format !== 'mp4')
    throw new Error('Invalid v2 MP4 candidate');
  const match = typeof item.path === 'string' && item.path.match(/^\/data\/(?:user\/0|data)\/com\.fleetinglife\.s1\/files\/fleeting-life-moments-v2\/(native-\d+-[a-z0-9]+\.mp4)$/);
  if (!match || match[1] !== `${item.id}.mp4`) throw new Error('Unexpected path in v2 MP4 index');
  return match[1];
}
function legacyName(value) {
  const match = typeof value === 'string' && value.match(/^\/data\/(?:user\/0|data)\/com\.fleetinglife\.s1\/files\/fleeting-life-moments\/([A-Za-z0-9-]+\.png)$/);
  if (!match) throw new Error('Unexpected path in legacy PNG index');
  return match[1];
}

async function main() {
  if (fs.existsSync(out)) throw new Error(`Evidence output already exists: ${out}`);
  const running = runAdb(['shell', 'pidof', pkg], true);
  if (running?.toString('utf8').trim())
    throw new Error(`Stop ${pkg} before copying its SQLite save and MP4 files`);
  const tempRoot = fs.realpathSync(os.tmpdir());
  let temp;
  try {
    temp = fs.mkdtempSync(path.join(tempRoot, 'fleeting-moments-'));
    const db = readRemote('databases/jsb.sqlite');
    fs.writeFileSync(path.join(temp, 'jsb.sqlite'), db);
    for (const suffix of ['-wal', '-shm']) {
      const bytes = readRemote(`databases/jsb.sqlite${suffix}`, true);
      if (bytes) fs.writeFileSync(path.join(temp, `jsb.sqlite${suffix}`), bytes);
    }
    const sqlite = new DatabaseSync(path.join(temp, 'jsb.sqlite'), { readOnly: true });
    let index, legacy;
    try {
      const videoRow = sqlite.prepare('SELECT value FROM data WHERE key = ?').get(videoKey);
      const legacyRow = sqlite.prepare('SELECT value FROM data WHERE key = ?').get(legacyKey);
      index = videoRow ? JSON.parse(videoRow.value) : null;
      legacy = legacyRow ? JSON.parse(legacyRow.value) : [];
    } finally { sqlite.close(); }
    if (!index || index.version !== 2 || !Array.isArray(index.candidates)) throw new Error('No v2 native MP4 index in device save');
    if (!Array.isArray(legacy)) throw new Error('Legacy PNG index is not an array');
    const candidates = index.candidates;
    const indexedNames = candidates.map(videoName);
    const listedNames = listRemote(videoDir, true);
    const listed = new Set(listedNames);
    const referenced = new Set(indexedNames);
    fs.mkdirSync(out, { recursive: true });
    const videoOut = path.join(out, 'videos');
    fs.mkdirSync(videoOut, { recursive: true });
    const videos = [];
    for (const name of indexedNames) {
      if (!listed.has(name)) continue;
      const bytes = readRemote(`${videoDir}/${name}`);
      const file = path.join(videoOut, name);
      fs.writeFileSync(file, bytes, { flag: 'wx' });
      videos.push({ name, file, bytes: bytes.length, sha256: sha256(bytes) });
    }
    const legacyNames = legacy.flatMap(item => Array.isArray(item.frames) ? item.frames.map(legacyName) : []);
    const legacyListed = new Set(listRemote(legacyDir, true));
    const legacyOut = path.join(out, 'legacy');
    const legacyFrames = [];
    for (const name of new Set(legacyNames)) {
      if (!legacyListed.has(name)) continue;
      const bytes = readRemote(`${legacyDir}/${name}`);
      const file = path.join(legacyOut, name);
      fs.mkdirSync(legacyOut, { recursive: true });
      fs.writeFileSync(file, bytes, { flag: 'wx' });
      legacyFrames.push({ name, bytes: bytes.length, sha256: sha256(bytes), ...pngInfo(bytes) });
    }
    const report = {
      package: pkg, serial, capturedAt: new Date().toISOString(),
      videoIndexVersion: index.version, videoCount: candidates.length,
      candidates: candidates.map((item, i) => ({ id: item.id, kind: item.kind, priority: item.priority,
        time: item.time, indexedDurationMs: item.durationMs, name: indexedNames[i] })),
      videos, missingIndexedVideos: indexedNames.filter(name => !listed.has(name)),
      unindexedVideoEntries: listedNames.filter(name => !referenced.has(name)),
      legacy: { momentCount: legacy.length, indexedFrameCount: legacyNames.length,
        availableFrames: legacyFrames, missingFrames: legacyNames.filter(name => !legacyListed.has(name)) },
    };
    report.indexConsistent = candidates.length >= 1 && candidates.length <= 3 &&
      candidates.every(item => Number.isInteger(item.time) && ['hidden', 'death', 'highlight'].includes(item.kind) &&
        Number.isInteger(item.priority) && item.priority >= 1 && item.priority <= 3 &&
        Number.isFinite(item.durationMs) && item.durationMs >= 2300 && item.durationMs <= 3300) &&
      referenced.size === indexedNames.length && report.missingIndexedVideos.length === 0 &&
      report.unindexedVideoEntries.length === 0;
    report.media = [];
    try {
      if (videos.length > 0) {
        report.media = await inspectVideos(videos);
        for (const media of report.media) {
          const indexOfMedia = indexedNames.indexOf(media.name);
          assertNativeMp4(media, candidates[indexOfMedia].durationMs);
        }
      }
      report.allMp4DecodeAndSeek = report.media.length === candidates.length && candidates.length > 0;
    } catch (error) {
      report.allMp4DecodeAndSeek = false;
      report.decodeError = error.message;
    }
    fs.writeFileSync(path.join(out, 'report.json'), JSON.stringify(report, null, 2) + '\n', { flag: 'wx' });
    console.log(`Saved ${videos.length} native MP4 recordings and report.json to ${out}`);
    if (!report.indexConsistent || !report.allMp4DecodeAndSeek) process.exitCode = 1;
  } finally {
    if (temp) {
      const resolved = fs.realpathSync(temp);
      if (path.dirname(resolved) !== tempRoot || !/^fleeting-moments-[A-Za-z0-9]+$/.test(path.basename(resolved)))
        throw new Error(`Unexpected evidence temporary directory: ${resolved}`);
      fs.rmSync(resolved, { recursive: true, force: true });
    }
  }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
