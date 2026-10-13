#!/usr/bin/env node
// Summarize native 30-second FLEETING_PERF windows from an Android logcat file.
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const args = process.argv.slice(2);
function option(name, fallback) {
  const index = args.indexOf(name);
  if (index < 0) return fallback;
  if (!args[index + 1] || args[index + 1].startsWith('--')) throw new Error(`Missing value for ${name}`);
  return args[index + 1];
}
if (args.some((arg, index) => arg.startsWith('--') && !['--in', '--out', '--year'].includes(arg)) ||
    args.some((arg, index) => !arg.startsWith('--') && (index === 0 || !args[index - 1].startsWith('--')))) {
  throw new Error('Usage: node scripts/android-frame-summary.cjs [--in LOGCAT] [--out JSON] [--year YYYY]');
}
const input = path.resolve(option('--in', path.join(root, 'build', 'qa', 'android-logcat.txt')));
const output = path.resolve(option('--out', path.join(root, 'build', 'qa', 'android-frame-summary.json')));
const year = Number(option('--year', new Date().getFullYear().toString()));
if (!Number.isInteger(year) || year < 2000 || year > 2100) throw new Error('--year must be a four-digit year');

function round(value, places = 2) { return Number(value.toFixed(places)); }
function weightedPercentile(rows, key, percentile) {
  const sorted = [...rows].sort((a, b) => a[key] - b[key]);
  const threshold = sorted.reduce((sum, row) => sum + row.samples, 0) * percentile;
  let cumulative = 0;
  for (const row of sorted) {
    cumulative += row.samples;
    if (cumulative >= threshold) return row[key];
  }
  return sorted.at(-1)[key];
}
function summarize(rows) {
  const samples = rows.reduce((sum, row) => sum + row.samples, 0);
  const totalFrameMs = rows.reduce((sum, row) => sum + row.samples * 1000 / row.avgFps, 0);
  const over25Estimate = rows.reduce((sum, row) => sum + row.samples * row.over25Pct / 100, 0);
  return {
    windows: rows.length, samples,
    weightedAvgFps: round(samples * 1000 / totalFrameMs),
    over25Pct: round(over25Estimate * 100 / samples),
    p95DtMs: weightedPercentile(rows, 'p95DtMs', .95),
    maxDtMs: Math.max(...rows.map(row => row.maxDtMs)),
  };
}
function timestamp(line, fallbackYear) {
  const full = line.match(/\b(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2}):(\d{2})(?:\.(\d{1,3}))?/);
  const short = full ? null : line.match(/\b(\d{2})-(\d{2})[ T](\d{2}):(\d{2}):(\d{2})(?:\.(\d{1,3}))?/);
  const parts = full ? full.slice(1) : short ? [String(fallbackYear), ...short.slice(1)] : null;
  if (!parts) return null;
  const [y, month, day, hour, minute, second, ms = '0'] = parts.map(String);
  const date = new Date(Number(y), Number(month) - 1, Number(day), Number(hour), Number(minute), Number(second), Number(ms.padEnd(3, '0')));
  if (date.getFullYear() !== Number(y) || date.getMonth() + 1 !== Number(month) || date.getDate() !== Number(day)) return null;
  return date.toISOString();
}

const lines = fs.readFileSync(input, 'utf8').split(/\r?\n/);
const rows = [];
let malformed = 0;
for (let index = 0; index < lines.length; index++) {
  const line = lines[index];
  if (!/\bFLEETING_PERF\s+screen=/.test(line)) continue;
  const fields = Object.fromEntries([...line.matchAll(/\b(screen|samples|avgFps|over25Pct|p95DtMs|maxDtMs)=([^\s]+)/g)].map(match => [match[1], match[2]]));
  const samples = Number(fields.samples), avgFps = Number(fields.avgFps), over25Pct = Number(fields.over25Pct);
  const p95DtMs = Number(fields.p95DtMs), maxDtMs = Number(fields.maxDtMs);
  if (!fields.screen || !Number.isInteger(samples) || samples <= 0 || !Number.isFinite(avgFps) || avgFps <= 0 ||
      !Number.isFinite(over25Pct) || over25Pct < 0 || over25Pct > 100 ||
      !Number.isFinite(p95DtMs) || p95DtMs <= 0 || !Number.isFinite(maxDtMs) || maxDtMs < p95DtMs) {
    malformed++;
    continue;
  }
  rows.push({ line: index + 1, time: timestamp(line, year), screen: fields.screen,
    samples, avgFps, over25Pct, p95DtMs, maxDtMs });
}
if (!rows.length) throw new Error(`No valid FLEETING_PERF samples in ${input}${malformed ? ` (${malformed} malformed)` : ''}`);
const screens = {};
for (const row of rows) (screens[row.screen] ??= []).push(row);
const report = {
  source: input,
  generatedAt: new Date().toISOString(),
  windowSeconds: 30,
  note: 'FPS and >25ms ratios are reconstructed from rounded per-window values. Overall p95 is a sample-weighted percentile of window p95 values, not an exact pooled frame percentile.',
  malformedLines: malformed,
  total: summarize(rows),
  byScreen: Object.fromEntries(Object.entries(screens).map(([screen, group]) => [screen, summarize(group)])),
  windows: rows,
};
fs.mkdirSync(path.dirname(output), { recursive: true });
fs.writeFileSync(output, JSON.stringify(report, null, 2) + '\n');
console.log(`Saved ${rows.length} windows / ${report.total.samples} frames to ${output}`);
console.log(`Weighted FPS ${report.total.weightedAvgFps}; >25ms ${report.total.over25Pct}%; window p95 ${report.total.p95DtMs}ms; max ${report.total.maxDtMs}ms`);
if (malformed) console.warn(`Skipped ${malformed} malformed FLEETING_PERF line(s)`);
