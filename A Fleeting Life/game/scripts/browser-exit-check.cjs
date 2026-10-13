const assert = require('node:assert/strict');
const { openBrowser, delay } = require('./browser-check.cjs');

const url = process.argv[2] || 'http://127.0.0.1:4318/preview/';

(async () => {
  const browser = await openBrowser({ width: 960, height: 540 });
  const { send, evaluate, errors, networkErrors } = browser;
  try {
    await send('Page.navigate', { url });
    async function ready() {
      for (let i = 0; i < 100; i++) {
        if (await evaluate('!!window.fleetingLife?.game && document.fonts.status === "loaded" && window.fleetingLife.game.buttons.some(button => button.label === "退出")')) {
          await delay(100);
          return;
        }
        await delay(100);
      }
      throw Error('Game did not become ready');
    }
    await ready();

    const game = expression => evaluate(`(()=>{const g=window.fleetingLife.game;return (${expression});})()`);
    async function tap(x, y) {
      await send('Input.dispatchMouseEvent', { type: 'mousePressed', x, y, button: 'left', buttons: 1, clickCount: 1 });
      await delay(35);
      await send('Input.dispatchMouseEvent', { type: 'mouseReleased', x, y, button: 'left', buttons: 0, clickCount: 1 });
      await delay(100);
    }
    async function click(label) {
      const button = await game(`g.buttons.find(value => value.label === ${JSON.stringify(label)})`);
      assert.ok(button && !button.disabled, `Button is available: ${label}`);
      const core = await evaluate('window.fleetingLife.getLayout().core');
      await tap(core.left + (button.x + button.w / 2) * core.width / 480,
        core.top + (button.y + button.h / 2) * core.height / 270);
    }
    async function key(key) {
      await send('Input.dispatchKeyEvent', { type: 'keyDown', key, code: key });
      await delay(35);
      await send('Input.dispatchKeyEvent', { type: 'keyUp', key, code: key });
      await delay(100);
    }
    async function assertExit() {
      const state = await evaluate(`(()=>{
        const layer=document.getElementById('game-exit-screen');
        const rect=layer?.getBoundingClientRect();
        return {title:layer?.querySelector('h1')?.textContent,button:layer?.querySelector('button')?.textContent,
          covers:!!rect&&rect.width>=innerWidth&&rect.height>=innerHeight,
          visible:!!layer&&getComputedStyle(layer).display!=='none'&&!!document.elementFromPoint(10,10)?.closest('#game-exit-screen'),
          fullscreen:!!document.fullscreenElement,clock:window.fleetingLife.game.clock};
      })()`);
      assert.equal(state.title, '本次游戏已退出');
      assert.equal(state.button, '重新进入');
      assert.equal(state.covers, true);
      assert.equal(state.visible, true);
      assert.equal(state.fullscreen, false);
      await delay(200);
      await evaluate('window.dispatchEvent(new Event("focus"))');
      await delay(120);
      assert.equal(await game('g.clock'), state.clock, 'Game does not resume behind exit screen');
      return state;
    }

    assert.equal(await game('g.screen'), 'hall');
    await click('退出');
    assert.equal(await game('g.exitConfirm && g.paused'), true, 'Hall exit first opens confirmation');
    assert.equal(await evaluate('!!document.getElementById("game-exit-screen")'), false);
    await key('Escape');
    assert.equal(await game('g.screen === "hall" && !g.paused && !g.exitConfirm'), true,
      'Back dismisses the hall exit confirmation');
    await click('退出');
    await click('留在回廊');
    assert.equal(await game('g.screen === "hall" && !g.paused && !g.exitConfirm'), true, 'Cancel keeps the hall active');

    const fullscreen = await send('Runtime.evaluate', {
      expression: 'document.documentElement.requestFullscreen().then(()=>true).catch(()=>false)',
      userGesture: true, awaitPromise: true, returnByValue: true,
    }).then(result => result.result.value).catch(() => false);
    await click('退出');
    await click('退出游戏');
    const hallExit = await assertExit();

    const restart = await evaluate(`(()=>{const r=document.querySelector('#game-exit-screen button').getBoundingClientRect();
      return {x:r.left+r.width/2,y:r.top+r.height/2};})()`);
    await tap(restart.x, restart.y);
    await ready();
    assert.equal(await evaluate('!!document.getElementById("game-exit-screen")'), false, 'Restart returns to the game');
    await click('出发');
    assert.equal(await game('g.screen'), 'play');
    await key('Escape');
    assert.equal(await game('g.paused && !g.exitConfirm'), true, 'Pause menu appears');
    await click('退出游戏');
    assert.equal(await game('g.paused && g.exitConfirm'), true, 'Pause exit requires a second confirmation');
    const pausedTime = await game('g.time');
    await key('Escape');
    assert.equal(await game('g.screen === "play" && g.run.active && g.paused && !g.exitConfirm'), true,
      'Back returns to the pause menu without discarding the run');
    assert.equal(await game('g.time'), pausedTime, 'Back keeps the run clock paused');
    await click('退出游戏');
    await click('退出游戏');
    const pauseExit = await assertExit();
    assert.deepEqual(errors, []);
    assert.deepEqual(networkErrors, []);
    console.log(JSON.stringify({ url, fullscreenRequested: fullscreen, hallExit, pauseExit, errors, networkErrors }, null, 2));
  } finally {
    await browser.close();
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
