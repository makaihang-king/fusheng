'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {Game}=require('../build/Game.js');
const {GameModel}=require('../build/Model.js');
const painter={rect(){},line(){},circle(){},poly(){},image(){return false;},text(){},
  video(){return {visible:true,seconds:1,status:'playing'};}};
function storage(profile){
  let data=profile?JSON.stringify(profile):null,fail=false;
  return {load:()=>data,save(value){if(fail)throw Error('quota exceeded');data=value;},
    fail(value){fail=value;},read:()=>JSON.parse(data)};
}
function click(game,label){
  game.render(painter);const button=game.buttons.find(button=>button.label===label);assert.ok(button,label);
  game.pointerDown(button.x+button.w/2,button.y+button.h/2);game.pointerUp(button.x+button.w/2,button.y+button.h/2);
}

test('暂停展示真正可重开的段首存档，并保留支线返回起点',()=>{
  const disk=storage(),first=new Game(disk);first.start();first.event('umbrella');first.beginSegment(2,22.5);
  first.time=31;first.y=52;first.paused=true;
  const texts=[];first.render({...painter,text(value){texts.push(value);}});
  assert.ok(texts.some(value=>value.includes('已保存至：雨里的伞 · 返回处')));
  assert.ok(texts.includes('重开从此段返回处继续。'));
  assert.ok(first.buttons.some(button=>button.label==='保存存档点'&&!button.disabled));
  first.toHall();
  const second=new Game(disk);assert.equal(second.continueCheckpoint(),true);
  assert.equal(second.screen,'play');assert.equal(second.phase,'run');assert.equal(second.segment,2);
  assert.equal(second.time,22.5);assert.equal(second.startAt,22.5);assert.equal(second.y,0);
  assert.ok(second.run.items.includes('umbrella'));assert.equal(second.profile.progress.runs,1);
  assert.deepEqual(second.run.lines.items,['umbrella']);
});

test('暂停、退出、刷新后，道具不归还，碎片和生命拾取不重复发放',()=>{
  const disk=storage({inventory:{shield:2}}),first=new Game(disk);first.start();first.beginSegment(2);
  assert.equal(first.model.useItem('shield'),true);assert.equal(first.model.collectFragment('2:f0',3),true);
  first.model.collectLife('2:life');first.run.segmentHits=2;first.run.jumps=4;first.run.hellUsed=true;
  first.paused=true;first.toHall();
  const second=new Game(disk);assert.equal(second.continueCheckpoint(),true);
  assert.equal(second.profile.inventory.shield,1);assert.deepEqual(second.run.usedItems,['shield']);
  assert.equal(second.run.shield,false);assert.equal(second.model.useItem('shield'),false);
  const fragments=second.profile.fragments;assert.equal(second.model.collectFragment('2:f0',3),false);
  assert.equal(second.profile.fragments,fragments);const stock=second.run.lifeStock;
  second.model.collectLife('2:life');assert.equal(second.run.lifeStock,stock);
  assert.equal(second.run.segmentHits,2);assert.equal(second.run.jumps,4);assert.equal(second.run.hellUsed,true);
});

test('已结算的段成绩与奖励不因从存档点重跑而重复领取',()=>{
  const disk=storage(),first=new Game(disk);first.start();first.beginSegment(6);
  first.model.collectFragment('6:f0',32);first.model.finishSegment(32);first.startReward();
  first.model.collectWrapper('reward0',3);first.paused=true;first.toHall();
  const second=new Game(disk);assert.equal(second.continueCheckpoint(),true);
  const fragments=second.profile.fragments,wrappers=second.profile.wrappers;
  assert.deepEqual(second.model.finishSegment(32),{clear:true,full:true,noHit:true,noItem:true});
  assert.equal(second.profile.fragments,fragments);assert.equal(second.run.umbrellaSegments,0);
  assert.ok(second.run.events.includes('segment:6:noHit'));
  const rewardHistory=JSON.stringify(second.profile.rewardHistory);second.startReward();
  assert.equal(JSON.stringify(second.profile.rewardHistory),rewardHistory);
  assert.equal(second.model.collectWrapper('reward0',3),false);assert.equal(second.profile.wrappers,wrappers);
});

test('写入失败不会显示已保存，重试成功后新开窗口才恢复该存档',()=>{
  const disk=storage(),first=new Game(disk);first.start();disk.fail(true);first.beginSegment(3);first.paused=true;
  assert.equal(first.model.lastSaveError,true);assert.equal(first.checkpointState.saved,false);
  const texts=[];first.render({...painter,text(value){texts.push(value);}});
  assert.ok(texts.includes('保存未成功，请保持窗口开启。'));assert.ok(!texts.some(value=>value.startsWith('已保存至：')));
  assert.equal(new Game(disk).continueCheckpoint(),false,'失败的写入没有生成可恢复进度');
  assert.equal(first.saveCheckpoint(),false);disk.fail(false);click(first,'保存存档点');
  assert.equal(first.model.lastSaveError,false);assert.equal(first.checkpointState.saved,true);
  const feedback=[];first.render({...painter,text(value){feedback.push(value);}});
  assert.ok(feedback.includes('存档点已保存，可放心休息。'),'点击后的反馈可在暂停页看见');
  const reopened=new Game(disk);assert.equal(reopened.continueCheckpoint(),true);assert.equal(reopened.segment,3);
});

test('失败的新段存档不会覆盖磁盘里较早的可恢复存档',()=>{
  const disk=storage(),first=new Game(disk);first.start();first.beginSegment(1);disk.fail(true);first.beginSegment(2);
  assert.equal(first.checkpointState.saved,false);
  const reopened=new Game(disk);assert.equal(reopened.continueCheckpoint(),true);assert.equal(reopened.segment,1);
});

test('从暂停退出时先确认写入成功，失败会保留窗口而不是丢失本局',()=>{
  const disk=storage();let exits=0;const game=new Game(disk,{exit(){exits++;}});
  game.start();game.beginSegment(2);game.paused=true;game.exitConfirm=true;disk.fail(true);click(game,'退出游戏');
  assert.equal(exits,0);assert.equal(game.paused,true);assert.equal(game.model.lastSaveError,true);
  disk.fail(false);click(game,'退出游戏');assert.equal(exits,1);assert.equal(game.model.lastSaveError,false);
});

test('选择、诗页、余烬、奖励演出恢复段首，不保存不能重建的中途动画',()=>{
  for(const phase of ['choice','poem','hell','reward','reverse']){
    const disk=storage(),first=new Game(disk);first.start();first.beginSegment(4);first.time=24;
    first.phase=phase;first.phaseTime=5;first.run.inHell=phase==='hell';first.run.rewardScene=phase==='reward';
    first.paused=true;first.toHall();const second=new Game(disk);
    assert.equal(second.continueCheckpoint(),true,phase);assert.equal(second.phase,'run',phase);
    assert.equal(second.time,0,phase);assert.equal(second.run.inHell,false,phase);assert.equal(second.run.rewardScene,false,phase);
  }
});

test('开场尚无段首存档，首次结局不能被暂停存档提前解锁',()=>{
  const disk=storage(),first=new Game(disk);first.start();first.paused=true;first.render(painter);
  assert.equal(first.checkpointState.available,false);assert.equal(first.buttons.find(button=>button.label==='保存存档点').disabled,true);
  assert.equal(new Game(disk).continueCheckpoint(),false);
  first.paused=false;first.beginSegment(7);first.startEnding('morning');first.paused=true;first.render(painter);
  assert.deepEqual(first.buttons.map(button=>button.label),['继续观看']);assert.deepEqual(first.profile.lights,[]);
  const second=new Game(disk);assert.equal(second.continueCheckpoint(),true);assert.equal(second.segment,7);
  assert.deepEqual(second.profile.lights,[]);assert.equal(second.run.ending,'');
});

test('完成本局清除继续存档，旧版和损坏存档仍可正常进入回廊',()=>{
  const disk=storage(),first=new Game(disk);first.start();first.beginSegment(7);first.model.finishEnding('desk');
  assert.equal(disk.read().checkpoint,null);assert.equal(new Game(disk).continueCheckpoint(),false);
  for(const malformed of [null,{version:1,segment:'unknown'},
    {version:1,segment:'1',startAt:0,baseEvents:[],run:{id:999,active:true,segment:'1',ending:'',stats:{},events:[],items:[]}}]){
    const old=new Game(storage({progress:{runs:1},checkpoint:malformed}));
    assert.equal(old.screen,'hall');assert.equal(old.continueCheckpoint(),false);
  }
  assert.doesNotThrow(()=>new GameModel('{broken json'));
});

test('回廊退出菜单提供继续存档，可从重开窗口直接操作恢复',()=>{
  const disk=storage(),first=new Game(disk);first.start();first.beginBranch('alley');first.paused=true;
  const second=new Game(disk);second.paused=true;second.exitConfirm=true;click(second,'继续存档');
  assert.equal(second.screen,'play');assert.equal(second.phase,'run');assert.equal(second.branch,'alley');assert.equal(second.segment,1);
  assert.equal(second.paused,false);assert.equal(second.exitConfirm,false);
});

test('继续存档不能覆盖仍在进行的局，支线重开保留入场抉择与去重状态',()=>{
  const disk=storage(),first=new Game(disk);first.start();first.beginSegment(1);first.event('alley');first.beginBranch('alley');
  first.event('alleyReturn');first.model.collectFragment('alley:f0',2);first.time=20;first.paused=true;
  const before=JSON.stringify(first.run);assert.equal(first.continueCheckpoint(),false);assert.equal(JSON.stringify(first.run),before);
  first.toHall();const second=new Game(disk);assert.equal(second.continueCheckpoint(),true);
  assert.equal(second.branch,'alley');assert.equal(second.time,0);assert.ok(second.run.events.includes('alley'));
  assert.ok(!second.run.events.includes('alleyReturn'),'段首之后的返程剧情要重新经过');
  assert.equal(second.run.wet,40);assert.equal(second.model.collectFragment('alley:f0',2),false);
  assert.equal(second.profile.progress.runs,1);
});

test('暂停返回、继续与刷新多轮后已付出的道具、生命和奖励始终一致',()=>{
  const disk=storage({inventory:{shield:2,magnet:2}});let game=new Game(disk);
  game.start();game.event('umbrella');game.beginSegment(6);game.model.useItem('shield');game.model.useItem('magnet');
  game.model.collectFragment('6:f0',32);game.model.collectLife('6:life');game.model.finishSegment(32);game.startReward();game.model.collectWrapper('reward0',3);
  game.paused=true;game.toHall();const stable={fragments:game.profile.fragments,wrappers:game.profile.wrappers,
    inventory:{...game.profile.inventory},rewardHistory:{...game.profile.rewardHistory},lifeStock:game.profile.checkpoint.run.lifeStock};
  for(let i=0;i<4;i++){
    game=new Game(disk);assert.equal(game.continueCheckpoint(),true);assert.equal(game.profile.progress.runs,1);
    assert.equal(game.model.useItem('shield'),false);assert.equal(game.model.useItem('magnet'),false);
    assert.equal(game.model.collectFragment('6:f0',32),false);game.model.collectLife('6:life');game.model.finishSegment(32);
    game.startReward();assert.equal(game.model.collectWrapper('reward0',3),false);game.paused=true;game.toHall();
    assert.deepEqual({fragments:game.profile.fragments,wrappers:game.profile.wrappers,inventory:{...game.profile.inventory},
      rewardHistory:{...game.profile.rewardHistory},lifeStock:game.profile.checkpoint.run.lifeStock},stable);
  }
});

test('恢复数组独立于存档，鱼刺 getter 随真实事件变化且不写入冗余鱼刺',()=>{
  const disk=storage(),first=new Game(disk);first.start();first.event('umbrella');first.beginSegment(2);first.paused=true;first.toHall();
  const second=new Game(disk);second.continueCheckpoint();
  assert.equal(Object.hasOwn(disk.read().checkpoint.run,'lines'),false);
  assert.equal(typeof Object.getOwnPropertyDescriptor(second.run,'lines').get,'function');
  assert.notEqual(second.run.items,second.profile.checkpoint.run.items);assert.notEqual(second.run.events,second.profile.checkpoint.run.events);
  assert.notEqual(second.run.collected,second.profile.checkpoint.run.collected);
  second.event('pen');assert.deepEqual(second.run.lines.items,['umbrella','pen']);
  assert.deepEqual(second.profile.checkpoint.run.items,['umbrella']);assert.deepEqual(second.profile.checkpoint.run.events,['umbrella']);
  second.toHall();const third=new Game(disk);third.continueCheckpoint();assert.deepEqual(third.run.lines.items,['umbrella']);
});

test('回廊结局重看和记忆册回放都不会覆盖或抹掉待继续的本局',()=>{
  const disk=storage(),game=new Game(disk);game.start();game.beginSegment(1);game.event('hat');game.model.finishSegment(0);game.afterChoice(1,'umbrella');game.beginSegment(2);
  game.profile.lights.push('morning');game.profile.endingSnapshots.morning={stats:{...game.run.stats},items:[],events:[],wet:0};
  game.paused=true;game.toHall();const checkpoint=JSON.stringify(game.profile.checkpoint),saved=JSON.stringify(disk.read().checkpoint);
  game.startEnding('morning',true);game.paused=true;game.toHall();
  assert.equal(JSON.stringify(game.profile.checkpoint),checkpoint);assert.equal(JSON.stringify(disk.read().checkpoint),saved);
  assert.equal(game.startMemoryReplay(1),true);game.touchMemoryObject();game.returnFromMemoryReplay();
  assert.equal(JSON.stringify(game.profile.checkpoint),checkpoint);assert.equal(JSON.stringify(disk.read().checkpoint),saved);
  assert.equal(game.continueCheckpoint(),true);assert.equal(game.segment,2);assert.ok(game.run.items.includes('umbrella'));
});

test('从回廊观看首次四灯彩蛋后仍保留未完成本局的存档点',()=>{
  const disk=storage(),game=new Game(disk);game.start();game.event('umbrella');game.beginSegment(2);
  game.profile.lights.push('morning','backrow','outside','desk');game.paused=true;game.toHall();
  const checkpoint=JSON.stringify(game.profile.checkpoint);game.startEnding('secondGrade');
  game.setEndingMediaProgress(12,'ended');game.phaseTime=game.duration;game.finishEnding();
  assert.equal(game.profile.progress.endings.secondGrade,1);assert.equal(game.phase,'finale');
  assert.equal(JSON.stringify(game.profile.checkpoint),checkpoint);assert.equal(JSON.stringify(disk.read().checkpoint),checkpoint);
  const reopened=new Game(disk);assert.equal(reopened.continueCheckpoint(),true);assert.equal(reopened.segment,2);
  assert.ok(reopened.run.items.includes('umbrella'));assert.equal(reopened.run.ending,'');
});
