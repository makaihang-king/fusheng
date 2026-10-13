'use strict';
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const { openBrowser, delay } = require('./browser-check.cjs');

const url = process.argv[2] || 'http://127.0.0.1:4326/preview/';
const output = path.join(__dirname, '../build/qa/bench-two-seconds');

(async () => {
  fs.mkdirSync(output, { recursive: true });
  const browser = await openBrowser({ width: 960, height: 540 });
  try {
    await browser.send('Page.navigate', { url });
    for (let i = 0; i < 60; i++) {
      if (await browser.evaluate('!!window.fleetingLife?.game && document.fonts.status === "loaded"')) break;
      await delay(100);
    }
    assert.ok(await browser.evaluate('!!window.fleetingLife?.game'));
    await browser.evaluate(`(() => {
      const g = window.fleetingLife.game;
      g.update = () => {};
      g.start(); g.beginSegment(5, 24.2);
      g.obstacles = []; g.pickups = [];
      return true;
    })()`);
    const shot = async (name) => {
      await delay(120);
      const result = await browser.send('Page.captureScreenshot', { format: 'png' });
      fs.writeFileSync(path.join(output, name + '.png'), Buffer.from(result.data, 'base64'));
    };
    await shot('before-contact');
    const during = await browser.evaluate(`(() => {
      const g = window.fleetingLife.game;
      for (let i = 0; i < 90 && g.benchSitRemaining <= 0; i++) g.step(1 / 60);
      return { remaining: g.benchSitRemaining, event: g.run.events.includes('bench'), time: g.time };
    })()`);
    assert.ok(during.remaining > 1.9 && !during.event, 'contact should begin the seated beat');
    await shot('sitting');
    const after = await browser.evaluate(`(() => {
      const g = window.fleetingLife.game;
      for (let i = 0; i < 125; i++) g.step(1 / 60);
      return { remaining: g.benchSitRemaining, event: g.run.events.includes('bench'), time: g.time };
    })()`);
    assert.equal(after.remaining, 0);
    assert.equal(after.event, true);
    await shot('after-two-seconds');
    assert.deepEqual(browser.errors, []);
    assert.deepEqual(browser.networkErrors, []);
    console.log(JSON.stringify({ output, during, after, screenshots: 3 }));
  } finally {
    await browser.close();
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
