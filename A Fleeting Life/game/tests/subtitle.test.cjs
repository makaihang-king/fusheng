const test = require('node:test');
const assert = require('node:assert/strict');
const { SubtitleManager, subtitlePages } = require('../build/Subtitle.js');

test('subtitle cards remain readable, use at most two short lines, and queue later beats', () => {
  const pages = subtitlePages('教室门口的伞还在，书包带却被雨水浸湿。有人停下来，替你把它从水里捞了起来。\n你记得那双沾了泥的鞋。');
  assert.ok(pages.length >= 2);
  for (const page of pages) {
    assert.ok(page.split('\n').length <= 2);
    for (const line of page.split('\n')) assert.ok(Array.from(line).length <= 25);
  }
  const manager = new SubtitleManager();
  manager.show('第一拍', { seconds: 4 });
  manager.show('第一拍', { seconds: 4 });
  manager.show('第二拍', { seconds: 4 });
  manager.update(.55);
  assert.equal(manager.views('story')[0].text, '第一拍');
  assert.equal(manager.views('story')[0].alpha, 1);
  for (let i = 0; i < 220; i++) manager.update(1 / 60);
  assert.equal(manager.views('story')[0].text, '第二拍');
  for (let i = 0; i < 240; i++) manager.update(1 / 60);
  assert.equal(manager.views('story').length, 0, 'a repeated trigger must not replay the same cue');
});

test('story, heading and tutorial occupy independent lanes; urgent copy crossfades', () => {
  const manager = new SubtitleManager();
  manager.show('第 一 段', { lane: 'heading', source: 'segment', priority: 2 });
  manager.show('去校门口', { source: 'narrator' });
  manager.show('轻点跳跃', { lane: 'tutorial', source: 'system' });
  manager.update(.6);
  assert.equal(manager.views('heading')[0].text, '第 一 段');
  assert.equal(manager.views('story')[0].text, '去校门口');
  assert.equal(manager.views('tutorial')[0].text, '轻点跳跃');
  manager.show('脚下有危险', { source: 'system', priority: 3 });
  manager.update(.1);
  const transition = manager.views('story');
  assert.equal(transition.length, 2);
  assert.equal(transition[0].text, '去校门口');
  assert.equal(transition[1].text, '脚下有危险');
  assert.ok(transition[0].alpha > 0 && transition[0].alpha < 1);
  manager.update(.2);
  assert.deepEqual(manager.views('story').map(view => view.text), ['脚下有危险']);
});

test('subtitle time freezes without updates and clears on scene exit', () => {
  const manager = new SubtitleManager();
  manager.show('慢慢读完这一句', { seconds: 4 });
  manager.update(.3);
  const beforePause = manager.views('story')[0].alpha;
  assert.equal(manager.views('story')[0].alpha, beforePause);
  manager.update(.25);
  assert.equal(manager.views('story')[0].alpha, 1);
  manager.clear();
  assert.equal(manager.views('story').length, 0);
});

test('a timed scene line expires while an important response is still speaking', () => {
  const manager = new SubtitleManager();
  manager.show('这一次的选择有了回应', { source: 'choice', priority: 4, seconds: 5 });
  manager.show('成绩单正从头顶飘过', {
    source: 'narrator', priority: 1, seconds: 4.4, maxQueueDelay: 1.2,
  });
  assert.deepEqual(manager.lanes.story.queue.map(cue => cue.text), ['成绩单正从头顶飘过']);
  manager.update(1.21);
  assert.deepEqual(manager.lanes.story.queue, []);
  manager.update(4);
  assert.deepEqual(manager.views('story'), [], 'an expired object cue cannot appear after its object has passed');
});

test('a new scene line replaces an equally important old one without delaying a choice response', () => {
  const manager = new SubtitleManager();
  manager.show('窗边仍是刚才的画面', { priority: 1, seconds: 4.4 });
  manager.update(.7);
  manager.show('一架纸飞机从窗边滑来', {
    priority: 1, seconds: 4.4, maxQueueDelay: 1.2, interruptSamePriority: true,
  });
  assert.equal(manager.views('story').at(-1).text, '一架纸飞机从窗边滑来');
  manager.update(.21);
  assert.deepEqual(manager.views('story').map(view => view.text), ['一架纸飞机从窗边滑来']);
  manager.show('我决定自己写下最后一题', { source: 'choice', priority: 4, seconds: 4 });
  assert.equal(manager.views('story').at(-1).text, '我决定自己写下最后一题');
  manager.update(.21);
  assert.deepEqual(manager.views('story').map(view => view.text), ['我决定自己写下最后一题']);
});
