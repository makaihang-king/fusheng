#!/usr/bin/env node
'use strict';

// Decode private Android recordings in an owned Edge session after copying
// them out with adb run-as. Metadata or an MP4 file header alone is not proof
// that MediaCodec produced a playable clip.
const fs = require('node:fs');
const http = require('node:http');
const path = require('node:path');
const { openBrowser } = require('./browser-check.cjs');

function assert(condition, message) { if (!condition) throw new Error(message); }

function serveFiles(files) {
  const names = new Map();
  for (const item of files) {
    assert(item && typeof item.name === 'string' && /^[A-Za-z0-9._-]+\.(?:mp4|webm)$/.test(item.name), 'Invalid video filename');
    assert(typeof item.file === 'string' && fs.statSync(item.file).isFile(), `Video file is missing: ${item.name}`);
    assert(!names.has(item.name), `Repeated video filename: ${item.name}`);
    names.set(item.name, item.file);
  }
  const server = http.createServer((req, res) => {
    const pathname = new URL(req.url, 'http://localhost').pathname;
    if (pathname === '/') {
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' });
      res.end('<!doctype html><html><body></body></html>');
      return;
    }
    if (pathname === '/favicon.ico') { res.writeHead(204); res.end(); return; }
    const match = pathname.match(/^\/clip\/([A-Za-z0-9._-]+\.(?:mp4|webm))$/);
    const file = match && names.get(match[1]);
    if (!file || !['GET', 'HEAD'].includes(req.method)) { res.writeHead(404); res.end(); return; }
    let size;
    try { size = fs.statSync(file).size; }
    catch { res.writeHead(404); res.end(); return; }
    if (size === 0) {
      if (req.headers.range) res.writeHead(416, { 'Content-Range': 'bytes */0' });
      else res.writeHead(200, { 'Content-Type': path.extname(file) === '.mp4' ? 'video/mp4' : 'video/webm', 'Content-Length': 0 });
      res.end();
      return;
    }
    let start = 0, end = size - 1, status = 200;
    const range = req.headers.range;
    if (range) {
      const parts = /^bytes=(\d*)-(\d*)$/.exec(range);
      if (!parts || (!parts[1] && !parts[2])) { res.writeHead(416, { 'Content-Range': `bytes */${size}` }); res.end(); return; }
      if (parts[1]) { start = Number(parts[1]); end = parts[2] ? Number(parts[2]) : size - 1; }
      else { const suffix = Number(parts[2]); start = Math.max(0, size - suffix); }
      if (!Number.isSafeInteger(start) || !Number.isSafeInteger(end) || start > end || start >= size) {
        res.writeHead(416, { 'Content-Range': `bytes */${size}` }); res.end(); return;
      }
      end = Math.min(end, size - 1);
      status = 206;
    }
    const headers = {
      'Accept-Ranges': 'bytes', 'Cache-Control': 'no-store',
      'Content-Type': path.extname(file) === '.mp4' ? 'video/mp4' : 'video/webm',
      'Content-Length': Math.max(0, end - start + 1),
    };
    if (status === 206) headers['Content-Range'] = `bytes ${start}-${end}/${size}`;
    res.writeHead(status, headers);
    if (req.method === 'HEAD') { res.end(); return; }
    const stream = fs.createReadStream(file, { start, end });
    stream.on('error', error => res.destroy(error));
    stream.pipe(res);
  });
  return server;
}

async function listen(server) {
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  return `http://127.0.0.1:${server.address().port}`;
}

async function inspectVideos(files) {
  assert(Array.isArray(files) && files.length > 0, 'At least one video is required');
  const server = serveFiles(files);
  let browser;
  try {
    const origin = await listen(server);
    browser = await openBrowser({ width: 960, height: 540 });
    await browser.send('Page.navigate', { url: origin + '/' });
    const found = [];
    for (const item of files) {
      const url = `${origin}/clip/${item.name}`;
      const info = await browser.evaluate(`(async()=>{
        const video=document.createElement('video');video.muted=true;video.playsInline=true;video.preload='auto';
        document.body.append(video);
        const wait=(event)=>new Promise((resolve,reject)=>{
          const timeout=setTimeout(()=>{done();reject(Error(event+' timeout'))},12000);
          const done=()=>{clearTimeout(timeout);video.removeEventListener(event,onEvent);video.removeEventListener('error',onError)};
          const onEvent=()=>{done();resolve()};
          const onError=()=>{done();reject(Error('video decode error '+(video.error?.code||'?')+': '+(video.error?.message||'')))};
          video.addEventListener(event,onEvent,{once:true});video.addEventListener('error',onError,{once:true});
        });
        try{
          const metadata=wait('loadedmetadata');video.src=${JSON.stringify(url)};video.load();await metadata;
          const duration=video.duration,width=video.videoWidth,height=video.videoHeight;
          if(!Number.isFinite(duration)||duration<=1)throw Error('invalid video duration: '+duration);
          const seeked=wait('seeked');video.currentTime=1;await seeked;
          if(video.readyState<2)await new Promise((resolve,reject)=>{
            const timeout=setTimeout(()=>{done();reject(Error('decoded frame timeout'))},12000);
            const poll=setInterval(()=>{if(video.readyState>=2){done();resolve()}},50);
            const onError=()=>{done();reject(Error('video decode error '+(video.error?.code||'?')+': '+(video.error?.message||'')))};
            const done=()=>{clearTimeout(timeout);clearInterval(poll);video.removeEventListener('error',onError)};
            video.addEventListener('error',onError,{once:true});
            if(video.readyState>=2){done();resolve()}
          });
          const canvas=document.createElement('canvas');canvas.width=width;canvas.height=height;
          const context=canvas.getContext('2d',{willReadFrequently:true});context.drawImage(video,0,0,width,height);
          const rgba=Array.from(context.getImageData(Math.floor(width/2),Math.floor(height/2),1,1).data);
          return {width,height,duration,seekTime:video.currentTime,readyState:video.readyState,rgba,
            canPlay:video.canPlayType('video/mp4; codecs="avc1.42E01E"')};
        }finally{video.pause();video.removeAttribute('src');video.load();video.remove()}
      })()`);
      found.push({ name: item.name, size: fs.statSync(item.file).size, ...info });
    }
    assert(browser.errors.length === 0, `Edge runtime errors: ${JSON.stringify(browser.errors)}`);
    assert(browser.consoleErrors.length === 0, `Edge console errors: ${JSON.stringify(browser.consoleErrors)}`);
    assert(browser.networkErrors.length === 0, `Edge network errors: ${JSON.stringify(browser.networkErrors)}`);
    return found;
  } finally {
    try { if (browser) await browser.close(); }
    finally { if (server.listening) await new Promise(resolve => server.close(resolve)); }
  }
}

function assertNativeMp4(media, indexedDurationMs) {
  assert(media && media.name?.endsWith('.mp4'), 'Native moment is not an MP4 file');
  assert(media.size > 1000, `Native MP4 is empty: ${media.name}`);
  assert(media.width === 480 && media.height === 270, `Native MP4 is not 480x270: ${media.name}`);
  assert(media.duration >= 2.3 && media.duration <= 3.3, `Native MP4 duration is outside the three-second capture: ${media.name} (${media.duration}s)`);
  assert(Number.isFinite(indexedDurationMs) && indexedDurationMs >= 2300 && indexedDurationMs <= 3300,
    `Native moment index duration is invalid: ${media.name} (${indexedDurationMs}ms)`);
  assert(Math.abs(media.duration * 1000 - indexedDurationMs) <= 500,
    `Native moment index duration differs from the decoded MP4: ${media.name}`);
  assert(media.seekTime >= 0.8 && media.seekTime <= 1.2 && media.readyState >= 2 && media.rgba?.[3] === 255,
    `Native MP4 did not decode a frame at one second: ${media.name}`);
}

module.exports = { inspectVideos, assertNativeMp4 };
