'use strict';
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const { openBrowser, delay } = require('./browser-check.cjs');

const root = path.resolve(__dirname, '..');
const args = process.argv.slice(2);
let url = 'http://127.0.0.1:4318/preview/';
let output = path.join(root, 'build', 'qa', 'ui-polish-v2');
for (let i = 0; i < args.length; i++) {
  if (args[i] === '--out') {
    assert.ok(args[i + 1] && !args[i + 1].startsWith('--'), '--out requires a directory');
    output = path.resolve(root, args[++i]);
  } else if (args[i].startsWith('--out=')) {
    assert.ok(args[i].slice(6), '--out requires a directory');
    output = path.resolve(root, args[i].slice(6));
  } else {
    assert.ok(!args[i].startsWith('--'), 'Unknown option: ' + args[i]);
    url = args[i];
  }
}
const hash = file => crypto.createHash('sha256').update(fs.readFileSync(path.join(root, file))).digest('hex');

// Visual fixtures use the same Model event/segment-memory methods exercised by
// memory-book.test.cjs. No cumulative memory or ending flags are assigned here.
const seedMemories = `
  const fixtures=[['hat','umbrella'],['bag','seat2'],['ownHomework','faceExam'],
    ['speak','pianoClose'],['bench','apologize'],['milk','forward'],['wish','']];
  g.model.beginRun();
  const accepted=[];
  fixtures.forEach(([anchor,choice],i)=>{
    const id=String(i+1);g.model.enterSegment(id);
    g.model.event(anchor);g.model.collectFragment('ui-qa-fragment-'+id,1);
    g.model.finishSegment(1);if(choice)g.model.event(choice);
    const recorded=g.model.recordSegmentMemory(id);
    const poem=i<6?g.model.markSegmentPoem(i):false;
    accepted.push({segment:id,anchor,choice,recorded,poem});
  });
  g.model.finishEnding('desk');
  for(const id of ['morning','backrow','outside']){
    g.model.beginRun();g.model.finishEnding(id);
  }
  g.model.beginRun();g.model.finishEnding('secondGrade');
  window.uiQaFixture=accepted;g.toHall();g.returnAnimation=0;
`;

async function main() {
  fs.mkdirSync(output, { recursive: true });
  const browser = await openBrowser({ width: 960, height: 540 });
  const { send, evaluate, errors, consoleErrors, networkErrors } = browser;
  const report = {
    url, fixture: 'Real Model events, segment completion, stored memories and poems in an isolated temporary browser profile.',
    sources: {
      renderer: hash('assets/scripts/Renderer.ts'), bundle: hash('build/web/game.js'),
      bookIcon: hash('assets/resources/art/ui/icons/book_normal.png'),
    }, screenshots: [], layouts: [],
  };
  const setup = code => evaluate('(()=>{const g=window.fleetingLife.game;' + code + ';return true;})()');
  const read = expression => evaluate('(()=>{const g=window.fleetingLife.game;return (' + expression + ');})()');
  const clear = 'g.panel="";g.paused=false;g.exitConfirm=false;g.noticeTime=0;g.cancelInput();';
  const shot = async (name, code = '') => {
    if (code) await setup(code);
    await delay(300);
    await evaluate('new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(()=>resolve(true))))');
    const screenshot = await send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false });
    const file = name + '.png';fs.writeFileSync(path.join(output, file), Buffer.from(screenshot.data, 'base64'));
    const state = await read('({screen:g.screen,phase:g.phase,panel:g.panel,panelPage:g.panelPage,paused:g.paused,memoryStage:g.memoryReplay?.stage||null,buttons:g.buttons.map(b=>({label:b.label,disabled:!!b.disabled}))})');
    report.screenshots.push({ name, file, state });
    console.log('CAPTURE ' + name);
  };
  const viewport = async (width, height, mobile) => {
    await send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile });
    await delay(120);
    const layout = await evaluate('(()=>{const r=document.getElementById("game").getBoundingClientRect();return {viewport:{width:innerWidth,height:innerHeight},canvas:{left:r.left,top:r.top,width:r.width,height:r.height},overflow:document.documentElement.scrollWidth>innerWidth||document.documentElement.scrollHeight>innerHeight};})()');
    assert.equal(layout.overflow, false, 'viewport must fit without scroll');
    assert.ok(layout.canvas.left >= -.5 && layout.canvas.top >= -.5);
    assert.ok(layout.canvas.left + layout.canvas.width <= width + .5);
    assert.ok(layout.canvas.top + layout.canvas.height <= height + .5);
    report.layouts.push(layout);
  };
  const advance = seconds => setup('for(let i=0;i<' + Math.ceil(seconds * 60) + ';i++)window.uiQaOriginalUpdate(1/60)');
  try {
    await send('Emulation.setDeviceMetricsOverride', { width: 960, height: 540, deviceScaleFactor: 1, mobile: false });
    await send('Page.navigate', { url });
    for (let i = 0; i < 150; i++) {
      if (await evaluate('!!window.fleetingLife?.game && document.fonts.status==="loaded"')) break;
      await delay(100);
    }
    assert.equal(await evaluate('!!window.fleetingLife?.game'), true, 'preview game ready');
    await viewport(960, 540, false);
    await setup('window.uiQaOriginalUpdate=g.update.bind(g);g.update=()=>{};g.settings.muted=true');
    await delay(300);
    await shot('00-desktop-hall', clear);
    await shot('01-memory-locked-directory', 'g.panel="memoryBook";g.panelPage=0');
    await shot('02-memory-locked-detail', 'g.panelPage=-1');
    await setup(clear + seedMemories);
    report.memoryFixture = await evaluate('window.uiQaFixture');
    assert.ok(report.memoryFixture.every(f => f.recorded && (f.segment === '7' || f.poem)));
    assert.equal(await read('Object.keys(g.profile.progress.segmentMemories).length'), 7);
    assert.equal(await read('g.model.allLit()'), true);
    await shot('03-hall-unlocked', clear);
    await shot('04-achievements', 'g.panel="achievements";g.panelPage=0');
    await shot('05-achievements-page-2', 'g.panelPage=1');
    await shot('06-shop-poor', 'g.panel="shop";g.panelPage=0');
    await setup('g.profile.fragments=500;g.profile.wrappers=240;g.model.save()');
    await shot('07-shop-funded');
    assert.equal(await read('g.model.buy("raincoat")'), true);
    assert.equal(await read('g.model.equip("raincoat")'), true);
    await shot('08-wardrobe', 'g.panel="wardrobe";g.panelPage=0');
    await shot('09-wardrobe-page-2', 'g.panelPage=1');
    await shot('10-wardrobe-page-3', 'g.panelPage=2');
    await shot('11-chapters', 'g.panel="chapters";g.panelPage=0');
    await shot('12-settings-standard', 'g.panel="settings";g.settings.reducedMotion=false');
    await shot('13-settings-reduced', 'g.settings.reducedMotion=true');
    await shot('14-memory-unlocked-directory', 'g.panel="memoryBook";g.panelPage=0');
    await shot('15-memory-unlocked-detail', 'g.panelPage=-1');
    await shot('16-memory-directory-page-4', 'g.panelPage=3');
    await shot('17-memory-review-object', 'g.panel="memoryReview";g.panelPage=0');
    await shot('18-memory-review-choice', 'g.panelPage=1');
    await shot('19-memory-review-poem', 'g.panelPage=2');
    await shot('20-memory-review-corridor', 'g.panelPage=11');
    await setup(clear + 'g.toHall();g.returnAnimation=0;');
    assert.equal(await read('g.startMemoryReplay(1)'), true);
    await shot('21-short-memory-object');
    assert.equal(await read('g.touchMemoryObject()'), true);
    await shot('22-short-memory-touch');await advance(2);
    await shot('23-short-memory-choice');
    assert.equal(await read('g.chooseMemoryReplay("umbrella")'), true);
    await shot('24-short-memory-response');await advance(3.2);
    await shot('25-short-memory-poem');
    await setup('g.returnFromMemoryReplay()');
    assert.equal(await read('g.startMemoryReplay(2)'), true);
    await setup('g.touchMemoryObject()');await advance(2);
    await shot('26-short-memory-four-choices');
    await setup('g.returnFromMemoryReplay();' + clear + 'g.start();g.beginSegment(2);g.obstacles=[];g.time=9;g.clearStoryDisplay();');
    await shot('27-run-hud');
    await shot('28-paused', 'g.paused=true');
    await shot('29-exit-confirm', 'g.exitConfirm=true');
    await setup(clear + 'g.startEnding("desk",true);g.setEndingMediaProgress(12,"ended");');
    await shot('30-ending-paper-card');
    await setup(clear + 'g.toHall();g.returnAnimation=0;');
    await viewport(852, 393, true);
    await shot('31-mobile-hall');
    await shot('32-mobile-wardrobe', 'g.panel="wardrobe";g.panelPage=0');
    await shot('33-mobile-memory-directory', 'g.panel="memoryBook";g.panelPage=0');
    await shot('34-mobile-memory-detail', 'g.panelPage=-1');
    await shot('35-mobile-settings', 'g.panel="settings";g.panelPage=0');
    await shot('36-mobile-wardrobe-page-2', 'g.panel="wardrobe";g.panelPage=1');
    await shot('37-mobile-wardrobe-page-3', 'g.panelPage=2');
    await shot('38-mobile-achievements', 'g.panel="achievements";g.panelPage=0');
    await shot('39-mobile-shop', 'g.panel="shop";g.panelPage=0');
    await shot('40-mobile-chapters', 'g.panel="chapters";g.panelPage=0');
    await viewport(960, 540, false);
    await shot('41-achievements-page-3', 'g.panel="achievements";g.panelPage=2');
    await shot('42-achievements-page-4', 'g.panelPage=3');
    await shot('43-hall-large-counts', clear + 'g.profile.fragments=999999999;g.profile.wrappers=999999999;');
    await viewport(852, 393, true);
    await shot('44-mobile-hall-large-counts');
    await shot('45-mobile-shop-large-counts', 'g.panel="shop";g.panelPage=0');
    await viewport(960, 540, false);
    await shot('46-hall-counts-500', clear + 'g.profile.fragments=500;g.profile.wrappers=500;');
    await shot('47-hall-counts-9999', 'g.profile.fragments=9999;g.profile.wrappers=9999;');
    await shot('48-hall-counts-99999', 'g.profile.fragments=99999;g.profile.wrappers=99999;');
    await shot('49-hall-counts-99999999', 'g.profile.fragments=99999999;g.profile.wrappers=99999999;');
    await viewport(852, 393, true);
    await shot('50-mobile-hall-counts-500', 'g.profile.fragments=500;g.profile.wrappers=500;');
    await shot('51-mobile-hall-counts-9999', 'g.profile.fragments=9999;g.profile.wrappers=9999;');
    await shot('52-mobile-hall-counts-99999', 'g.profile.fragments=99999;g.profile.wrappers=99999;');
    await shot('53-mobile-hall-counts-99999999', 'g.profile.fragments=99999999;g.profile.wrappers=99999999;');
    report.browserErrors = { errors, consoleErrors, networkErrors };
    report.endingCard = report.screenshots.find(s => s.name === '30-ending-paper-card').state;
    assert.equal(report.endingCard.phase, 'ending');
    assert.deepEqual(errors, []);assert.deepEqual(consoleErrors, []);assert.deepEqual(networkErrors, []);
    report.pass = true;
  } catch (error) {
    report.pass = false;report.failure = error.stack || String(error);
    report.browserErrors = { errors, consoleErrors, networkErrors };
    throw error;
  } finally {
    fs.writeFileSync(path.join(output, 'report.json'), JSON.stringify(report, null, 2));
    await browser.close();
  }
  console.log('PASS UI polish visual QA: ' + report.screenshots.length + ' screenshots; 0 browser/network/console errors.');
}

main().catch(error => { console.error(error);process.exitCode = 1; });
