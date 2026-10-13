const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { GameModel, ACHIEVEMENTS, ITEM_PRICES } = require(path.join(__dirname, '../build/Model.js'));
function game(profile) {
  const m = new GameModel(profile ? JSON.stringify(profile) : undefined);
  m.beginRun(); m.enterSegment('s1'); return m;
}
function actions(m, events) { events.forEach(e => m.event(e)); return m; }
function hit(m) { m.run.invincible=0; return m.damage(); }
function exhaust(m) { let result; for (let i=0;i<3;i++) result=hit(m); return result; }
const vectors = [
 ['A2',['skipClass','sideReturn','silent','pianoPractice','slamDoor'],[90,58,50,61],'outside'],
 ['B',['umbrella','seat1','faceExam','ownHomework','silent','pianoPractice','apologize'],[38,46,66,50],'morning'],
 ['C',['umbrella','seat3','faceExam','ownHomework','silent','eraser','pianoPractice','apologize'],[38,93,66,50],'backrow'],
 ['D',['umbrella','seat2','faceExam','ownHomework','silent','pianoSmash','slamDoor'],[100,62,45,59],'outside'],
 ['E',['umbrella','seat1','faceExam','ownHomework','speak','pianoSmash','apologize'],[78,38,57,54],'desk'],
 ['F',['umbrella','seat1','faceExam','ownHomework','speak','pianoPractice','apologize'],[53,38,78,50],'desk'],
 ['G',['umbrella','pen','skipClass','graffiti','sideReturn','silent','pianoPractice','apologize'],[52,58,50,58],'desk'],
 ['H',['umbrella','seat2','faceExam','ownHomework','silent','eraser','bench','pianoPractice','apologize'],[38,71,66,50],'desk']
];
for (const [name, events, stats, ending] of vectors) test('设计回归 '+name, () => {
  const m=actions(game(),events); assert.deepEqual(Object.values(m.run.stats),stats); assert.equal(m.determineEnding(),ending);
});
test('零输入局终止于操场成就结局，不亮正常灯', () => {
 const m=game(); m.event('skipClass'); m.enterEnding('runaway'); m.finishEnding('runaway');
 assert.deepEqual(m.profile.lights,[]); assert.ok(m.profile.achievements.includes('runaway'));
});
test('判定优先级与半开区间边界', () => {
 const m=game();
 for (const [s,e] of [
  [[85,100,50,50],'outside'],[[84,75,50,50],'backrow'],[[40,30,69,69],'morning'],
  [[40,29,50,50],'desk'],[[40,70,50,50],'desk'],[[41,50,50,50],'desk'],
  [[40,50,70,50],'desk'],[[40,50,50,70],'desk']
 ]) { m.run.stats={personality:s[0],relationship:s[1],will:s[2],appearance:s[3]}; assert.equal(m.determineEnding(),e); }
});
test('逃课永久锁关系65，剧情分支互斥且不重复推杆', () => {
 const m=actions(game(),['skipClass','silent','eraser','bench']);
 m.run.stats.relationship=64; m.event('bag'); assert.equal(m.run.stats.relationship,61);
 assert.equal(m.event('seat3'),false); assert.equal(m.event('skipClass'),false);
});
test('无笔不能改分或涂鸦，不惩罚数值', () => {
 const m=game(); assert.equal(m.event('cheat'),true); assert.ok(m.run.events.includes('noPen'));
 assert.equal(m.run.stats.will,50); assert.equal(m.event('graffiti'),false);
});
test('普通掉命不停段，0.8秒无敌，段间不回满', () => {
 const m=game(); assert.equal(m.damage(),'hit'); assert.equal(m.run.lives,2);
 assert.equal(m.damage(),'ignored'); m.enterSegment('s2'); assert.equal(m.run.lives,2);
});
test('加命满血存2个，受伤自动消耗也算实际掉命', () => {
 const m=game(); m.collectLife();m.collectLife();m.collectLife(); assert.equal(m.run.lifeStock,2);
 assert.equal(m.damage(),'hit'); assert.equal(m.run.lives,3); assert.equal(m.run.lifeStock,1);
 assert.equal(m.finishSegment(10).noHit,false);
});
test('自动道具回溯优先，按段首生命恢复且不退还消耗', () => {
 const m=game({inventory:{rewind:2,feather:2}});
 hit(m); m.enterSegment('s2'); m.event('speak');m.collectFragment('s2:a',3);
 assert.equal(hit(m),'hit'); assert.equal(hit(m),'rewind');
 assert.equal(m.run.lives,2); assert.equal(m.run.stats.personality,50);
 assert.equal(m.profile.inventory.rewind,1); assert.equal(m.profile.inventory.feather,2);
 assert.deepEqual(m.run.usedItems,['rewind']); assert.equal(m.run.hellUsed,false);
 assert.equal(m.run.segmentHits,2); assert.equal(m.collectFragment('s2:a',3),false);
 assert.equal(hit(m),'hit'); assert.equal(hit(m),'feather'); assert.equal(m.run.lives,3);
 assert.equal(m.profile.inventory.feather,1); assert.equal(exhaust(m),'hell');
 assert.equal(m.profile.inventory.rewind,1);
});
test('失败地狱回本段保底1命，剧情回滚但成就/碎片/跳跃历史保留', () => {
 const m=game();m.event('pianoClose');m.run.jumps=4;m.collectFragment('a',3);
 assert.equal(exhaust(m),'hell');m.hellResult(false);
 assert.equal(m.run.lives,1);assert.equal(m.run.stats.personality,50);
 assert.equal(m.run.events.includes('pianoClose'),false);assert.ok(m.profile.achievements.includes('sharpEyes'));
 assert.equal(m.profile.fragments,3);assert.equal(m.run.jumps,4);assert.equal(m.run.segmentHits,3);
 assert.equal(hit(m),'restart');assert.equal(m.run.lives,1);assert.equal(m.profile.progress.retries,2);
});
test('地狱通过恢复3命3秒无敌+15碎片+8外貌且只结算一次', () => {
 const m=game();exhaust(m);m.hellResult(true);
 assert.equal(m.run.lives,3);assert.equal(m.run.invincible,3);assert.equal(m.profile.fragments,15);
 assert.equal(m.run.stats.appearance,61);m.hellResult(true);assert.equal(m.profile.fragments,15);
});
test('护盾与光免掉命不影响无伤；手动道具各每局一次，跨段失效', () => {
 const m=game({inventory:{shield:2,magnet:2}});
 assert.equal(m.useItem('shield'),true);assert.equal(m.useItem('shield'),false);
 assert.equal(m.damage(),'ignored');assert.equal(m.run.segmentHits,0);assert.equal(m.run.lives,3);
 assert.equal(m.finishSegment(0).noItem,false);m.enterSegment('s2');assert.equal(m.run.shield,false);
 m.run.invincible=0;m.event('heavenReward');assert.equal(m.damage(),'ignored');assert.equal(m.run.light,false);
 assert.equal(m.useItem('magnet'),true);m.enterSegment('s3');assert.equal(m.run.magnet,false);
});
test('结局态不扣命、不消耗补命或自动道具', () => {
 const m=game({inventory:{rewind:1,feather:1}});m.run.lives=1;m.run.lifeStock=2;
 m.enterEnding('desk');assert.equal(hit(m),'ignored');
 assert.equal(m.run.lives,1);assert.equal(m.run.lifeStock,2);assert.equal(m.profile.inventory.rewind,1);
 assert.equal(m.event('slamDoor'),false);
});
test('段碎片去重、全收集奖励只结算一次，三项评分独立', () => {
 const m=game();m.collectFragment('s1:a',9);assert.equal(m.collectFragment('s1:a',9),false);
 assert.equal(m.finishSegment(10).full,false);assert.ok(m.profile.achievements.includes('collector'));
 m.enterSegment('s2');m.collectFragment('s2:a',10);hit(m);
 assert.deepEqual(m.finishSegment(10),{clear:true,full:true,noHit:false,noItem:false});
 assert.equal(m.profile.fragments,27);m.finishSegment(10);assert.equal(m.profile.fragments,27);
});
test('作弊无伤须同段，两次段评分不能冒领', () => {
 const m=game();m.event('pen');m.event('cheat');hit(m);m.finishSegment(0);m.enterSegment('s2');m.finishSegment(0);
 assert.equal(m.profile.achievements.includes('perfectScore'),false);
 const n=actions(game(),['pen','cheat']);n.finishSegment(0);assert.ok(n.profile.achievements.includes('perfectScore'));
});
test('前三次同类奖励后第四次强制另一个，早退局不计入', () => {
 const m=game();
 for(let i=0;i<3;i++){if(i)m.beginRun();assert.equal(m.chooseReward(0),'dream');assert.equal(m.chooseReward(1),'dream');}
 m.beginRun();m.finishEnding('wall');assert.equal(m.profile.rewardHistory.count,3);
 m.beginRun();assert.equal(m.chooseReward(0),'heaven');assert.equal(m.profile.rewardHistory.count,1);
});
test('糖等到第7段才激活，糖纸按对象ID去重即时保存', () => {
 const m=game();m.chooseReward(0);m.collectWrapper('cloud1',3);m.collectWrapper('cloud1',3);
 assert.equal(m.profile.wrappers,3);assert.equal(m.damage(),'ignored');
 m.event('dreamReward');assert.equal(m.run.candy,true);assert.equal(m.run.invincible,0);
 m.enterSegment('s7');assert.equal(m.run.candy,false);assert.equal(m.run.invincible,3);assert.equal(m.run.candyActive,true);
});
test('回溯第7段恢复段首梦糖的三秒保护', () => {
 const m=game({inventory:{rewind:1}});m.event('dreamReward');m.enterSegment('s7');
 assert.equal(m.run.candyActive,true);assert.equal(m.run.invincible,3);
 m.run.lives=1;assert.equal(hit(m),'rewind');
 assert.equal(m.run.lives,3);assert.equal(m.run.candyActive,true);assert.equal(m.run.invincible,3);
 assert.equal(m.run.candy,false);assert.equal(m.profile.inventory.rewind,0);
});
test('三把凳子要三个不同局，反复回滚不能刷', () => {
 const m=game();m.event('seat1');exhaust(m);m.hellResult(false);m.event('seat2');
 assert.deepEqual(m.profile.progress.seats,['seat1']);
 m.beginRun();m.event('seat2');m.beginRun();m.event('seat3');assert.ok(m.profile.achievements.includes('threeSeats'));
});
test('带伞完三段且重评不重复计数；粉笔不算随身物', () => {
 const m=game();m.event('umbrella');
 for (const segment of ['s1','s2','s3']) {m.enterSegment(segment);m.finishSegment(0);m.finishSegment(0);}
 assert.equal(m.run.umbrellaSegments,3);assert.ok(m.profile.achievements.includes('umbrellaKeeper'));
 m.beginRun();m.profile.progress.chalk=true;m.event('chalk');m.finishEnding('wall');
 assert.ok(m.profile.achievements.includes('emptyPockets'));
});
test('曾拾物即使回滚也不能冒领无伞无笔', () => {
 const m=game();m.event('pen');exhaust(m);m.hellResult(false);m.finishEnding('wall');
 assert.equal(m.profile.achievements.includes('emptyPockets'),false);
});
test('四灯唯一解锁彩蛋；结局首次快照不可被后续局覆盖', () => {
 const m=game();assert.equal(m.enterEnding('secondGrade'),false);assert.equal(m.event('back'),false);
 for(const e of ['morning','backrow','outside','desk']) {m.beginRun();m.event('speak');m.finishEnding(e);}
 assert.equal(m.allLit(),true);assert.ok(m.profile.achievements.includes('lampKeeper'));
 m.beginRun();m.event('silent');m.finishEnding('desk');
 assert.deepEqual(m.profile.endingSnapshots.desk.events,['speak']);
 m.beginRun();m.event('back');assert.ok(m.profile.achievements.includes('lookBack'));
 m.finishEnding('secondGrade');assert.ok(m.profile.cosmetics.includes('namelessNotebook'));assert.equal(m.profile.progress.chalk,true);
});
test('完整16项成就目录和挑战事件映射', () => {
 assert.equal(ACHIEVEMENTS.length,16);assert.equal(new Set(ACHIEVEMENTS.map(a=>a.id)).size,16);
 const m=game();['dreamNoGround','tableEdge','heavenChain12'].forEach(e=>m.event(e));
 for(const id of ['floated','bigDesk','heldUp'])assert.ok(m.profile.achievements.includes(id));
});
test('商店只在回廊，库存下一局可用，不售彩蛋皮肤', () => {
 const m=new GameModel(JSON.stringify({fragments:300,wrappers:100}));
 assert.equal(m.buy('rewind'),true);assert.equal(m.profile.fragments,180);
 assert.equal(m.buy('namelessNotebook'),false);assert.equal(m.buy('raincoat'),true);
 assert.equal(m.equip('raincoat'),true);m.beginRun();assert.equal(m.buy('shield'),false);
 assert.equal(m.equip('whiteShirt'),false);assert.equal(ITEM_PRICES.eraser,35);
});
test('坏存档可恢复，负余额/异常库存不能制造货币', () => {
 const m=new GameModel('{ broken');assert.equal(m.profile.fragments,0);
 const n=new GameModel(JSON.stringify({fragments:-30,wrappers:'999',inventory:{rewind:-8,feather:1e30},progress:{runs:-100},lights:['wall','desk','desk'],cosmetics:['fake']}));
 assert.equal(n.profile.fragments,0);assert.equal(n.profile.wrappers,0);assert.equal(n.profile.inventory.rewind,0);
 assert.equal(n.profile.inventory.feather,9999);assert.deepEqual(n.profile.lights,['desk']);assert.equal(n.buy('shield'),false);
 assert.deepEqual(n.profile.cosmetics,['whiteShirt']);
});
test('序列化只持久化跨局数据，存储异常不打断游戏', () => {
 let saved;const m=new GameModel(undefined,json=>{saved=json;});m.beginRun();m.enterSegment('s1');m.event('slamDoor');m.collectFragment('one',3);
 const n=new GameModel(saved);assert.equal(n.profile.fragments,3);assert.equal(n.run.stats.personality,50);assert.deepEqual(n.run.events,[]);
 const o=new GameModel(undefined,()=>{throw new Error('quota');});assert.doesNotThrow(()=>o.beginRun());assert.equal(o.lastSaveError,true);
});


test('设置与开场已看标记持久化，不会在下一次写档时丢失', () => {
 let saved;
 const m=new GameModel(undefined,json=>{saved=json;});
 m.profile.settings={muted:true,reducedMotion:true};m.profile.progress.introSeen=true;m.save();
 const n=new GameModel(saved,json=>{saved=json;});n.beginRun();n.event('speak');
 const r=new GameModel(saved);
 assert.deepEqual(r.profile.settings,{muted:true,reducedMotion:true});assert.equal(r.profile.progress.introSeen,true);
 const bad=new GameModel(JSON.stringify({settings:{muted:'true',reducedMotion:1},progress:{introSeen:'true'}}));
 assert.deepEqual(bad.profile.settings,{muted:false,reducedMotion:false});assert.equal(bad.profile.progress.introSeen,false);
});
test('八根鱼刺从事件派生，同一事件可有多个叙事归属，不能反写事件', () => {
 const m=actions(game(),['pen','cheat','seat1','speak','pianoPractice','compared','dreamReward']);
 assert.equal(Object.keys(m.run.lines).length,8);
 assert.deepEqual(m.run.lines.academic,['cheat']);assert.deepEqual(m.run.lines.items,['pen']);
 assert.deepEqual(m.run.lines.social,['seat1','speak']);assert.deepEqual(m.run.lines.self,['speak','pianoPractice']);
 assert.deepEqual(m.run.lines.risk,['speak','pianoPractice']);assert.deepEqual(m.run.lines.family,['compared']);
 assert.deepEqual(m.run.lines.dream,['dreamReward']);
 m.run.lines.academic.push('copyHomework');assert.equal(m.run.events.includes('copyHomework'),false);
});
test('鱼刺跟随段首回档，伤害历史仍反映在最终段评分生命线', () => {
 const m=game();m.event('pen');m.event('cheat');assert.deepEqual(m.run.lines.academic,['cheat']);
 exhaust(m);m.hellResult(false);assert.deepEqual(m.run.lines.academic,[]);assert.deepEqual(m.run.lines.life,['hellFall']);
 m.finishSegment(0);assert.ok(m.run.lines.life.includes('segment:s1:hurt'));
});
test('首次结局快照和读档的鱼刺一致，JSON不保存冗余鱼刺', () => {
 let saved;const m=new GameModel(undefined,json=>{saved=json;});m.beginRun();actions(m,['pen','cheat','silent']);
 m.finishEnding('desk');const snap=m.profile.endingSnapshots.desk;
 assert.deepEqual(snap.lines.academic,['cheat']);assert.deepEqual(snap.lines.social,['silent']);
 assert.equal(Object.hasOwn(JSON.parse(saved).endingSnapshots.desk,'lines'),false);
 const n=new GameModel(saved);assert.deepEqual(n.profile.endingSnapshots.desk.lines,snap.lines);
 assert.deepEqual(n.run.lines.academic,[]);
});
test('皮肤挂件头像框同时装备，旧equipped兼容皮肤', () => {
 const m=new GameModel(JSON.stringify({wrappers:200}));
 for(const id of ['raincoat','charm-plane','frame-dusk']) {assert.equal(m.buy(id),true);assert.equal(m.equip(id),true);}
 assert.deepEqual(m.profile.equippedSlots,{skin:'raincoat',charm:'charm-plane',frame:'frame-dusk'});
 assert.equal(m.profile.equipped,'raincoat');
 const n=new GameModel(JSON.stringify(m.profile));assert.deepEqual(n.profile.equippedSlots,m.profile.equippedSlots);
 assert.equal(n.profile.equipped,'raincoat');
});
test('旧单槽存档按外观类别迁移，坏槽位不能装备未购买或错类外观', () => {
 const old=new GameModel(JSON.stringify({cosmetics:['charm-plane'],equipped:'charm-plane'}));
 assert.deepEqual(old.profile.equippedSlots,{skin:'whiteShirt',charm:'charm-plane',frame:''});assert.equal(old.profile.equipped,'whiteShirt');
 const bad=new GameModel(JSON.stringify({cosmetics:['raincoat'],equipped:'raincoat',equippedSlots:{skin:'frame-night',charm:'raincoat',frame:'frame-noon'}}));
 assert.deepEqual(bad.profile.equippedSlots,{skin:'raincoat',charm:'',frame:''});
});
test('彩蛋重复done幂等，不用空白或被放弃的一局冒领无伞无笔', () => {
 const m=game({lights:['morning','backrow','outside','desk']});
 m.run.active=false;m.enterEnding('secondGrade');assert.equal(m.finishEnding('secondGrade'),true);
 assert.equal(m.finishEnding('secondGrade'),false);assert.equal(m.profile.progress.endings.secondGrade,1);
 assert.equal(m.profile.achievements.includes('emptyPockets'),false);
 const n=game({lights:['morning','backrow','outside','desk']});n.enterEnding('secondGrade');n.finishEnding('secondGrade');
 assert.equal(n.profile.achievements.includes('emptyPockets'),false);
});
test('主动回廊退出一局不结算结局，停止角色互动并允许购物', () => {
 const m=game({fragments:100});m.run.active=false;
 assert.equal(m.event('speak'),false);assert.equal(m.collectFragment('quit',3),false);assert.equal(m.damage(),'ignored');
 assert.equal(m.finishEnding('desk'),false);assert.equal(m.buy('shield'),true);
 assert.deepEqual(m.profile.lights,[]);assert.deepEqual(m.profile.progress.endings,{});
});

test('段记忆只采本局已结算段的真实事件，诗页到场后才入档', () => {
 let saved, saves=0;
 const m=new GameModel(undefined,json=>{saved=json;saves++;});
 assert.equal(m.profile.version,2);
 m.beginRun();m.enterSegment('1');m.event('hat');
 assert.equal(m.recordSegmentMemory('1'),false,'unfinished segment');
 m.finishSegment(0);
 assert.equal(m.recordSegmentMemory('1'),false,'no main choice yet');
 m.event('umbrella');
 assert.equal(m.recordSegmentMemory('2'),false,'wrong segment');
 assert.equal(m.recordSegmentMemory('1'),true);
 assert.deepEqual(m.profile.progress.segmentMemories['1'],
   {runId:1,anchorEvent:'hat',choiceEvent:'umbrella',poemSeen:false});
 const recordedSaves=saves;
 assert.equal(m.recordSegmentMemory('1'),false,'duplicate cannot clear a seen poem later');
 assert.equal(saves,recordedSaves);
 assert.equal(m.markSegmentPoem(0),true);
 assert.equal(m.markSegmentPoem(0),false);
 assert.equal(m.profile.progress.segmentMemories['1'].poemSeen,true);
 assert.equal(m.recordSegmentMemory('1'),false);
 assert.equal(m.profile.progress.segmentMemories['1'].poemSeen,true);
 assert.deepEqual(new GameModel(saved).profile.progress.segmentMemories['1'],m.profile.progress.segmentMemories['1']);
});

test('重跑覆盖同段上一次选择；巷子返回才记录第一诗页', () => {
 const m=new GameModel();m.beginRun();m.enterSegment('1');m.event('hat');m.finishSegment(0);
 m.event('umbrella');assert.equal(m.recordSegmentMemory('1'),true);assert.equal(m.markSegmentPoem(0),true);
 m.beginRun();m.enterSegment('1');m.finishSegment(0);m.event('alley');
 assert.equal(m.recordSegmentMemory('1'),true);
 assert.deepEqual(m.profile.progress.segmentMemories['1'],
   {runId:2,anchorEvent:'',choiceEvent:'alley',poemSeen:false});
 assert.equal(m.markSegmentPoem(0),false,'the alley choice itself does not show poem zero');
 m.enterSegment('alley');assert.equal(m.markSegmentPoem(0),false);
 m.event('alleyReturn');assert.equal(m.markSegmentPoem(0),true);
 assert.equal(m.profile.progress.segmentMemories['1'].poemSeen,true);
});

test('逃课侧门不会补第二诗页，也不能冒领第三段诗页', () => {
 const m=new GameModel();m.beginRun();m.enterSegment('2');m.event('bag');m.finishSegment(0);
 m.event('skipClass');assert.equal(m.recordSegmentMemory('2'),true);
 assert.equal(m.markSegmentPoem(1),false);
 m.enterSegment('playground');m.event('sideReturn');
 assert.equal(m.markSegmentPoem(1),false);assert.equal(m.markSegmentPoem(2),false);
 assert.equal(m.profile.progress.segmentMemories['2'].poemSeen,false);
 assert.equal(m.profile.progress.segmentMemories['3'],undefined);
});

test('第七段只保存物件；旧存档和异常记忆按段号及事件白名单清洗', () => {
 const m=new GameModel();m.beginRun();m.enterSegment('7');m.event('wish');m.finishSegment(0);
 assert.equal(m.recordSegmentMemory('7'),true);
 assert.deepEqual(m.profile.progress.segmentMemories['7'],
   {runId:1,anchorEvent:'wish',choiceEvent:'',poemSeen:false});
 assert.equal(m.markSegmentPoem(6),false);
 const old=new GameModel(JSON.stringify({version:1,progress:{segments:{'1':{clear:true}}}}));
 assert.equal(old.profile.version,2);assert.deepEqual(old.profile.progress.segmentMemories,{});
 const clear=Object.fromEntries(Array.from({length:7},(_,i)=>[String(i+1),{clear:true}]));
 const fixture={version:2,progress:{segments:clear,segmentMemories:{
   '1':{runId:3,anchorEvent:'hat',choiceEvent:'umbrella',poemSeen:true},
   '2':{runId:3,anchorEvent:'bag',choiceEvent:'skipClass',poemSeen:true},
   '3':{runId:3,anchorEvent:'copyHomework',choiceEvent:'faceExam',poemSeen:false},
   '4':{runId:3,anchorEvent:'wish',choiceEvent:'pianoClose',poemSeen:false},
   '5':{runId:0,anchorEvent:'bench',choiceEvent:'apologize',poemSeen:false},
   '6':{runId:3,anchorEvent:'milk',choiceEvent:'outside',poemSeen:false},
   '7':{runId:3,anchorEvent:'wish',choiceEvent:'',poemSeen:false},
   '8':{runId:3,anchorEvent:'hat',choiceEvent:'umbrella',poemSeen:false}
 }}};
 const restored=new GameModel(JSON.stringify(fixture));
 assert.deepEqual(Object.keys(restored.profile.progress.segmentMemories),['1','3','7']);
 assert.deepEqual(restored.profile.progress.segmentMemories['1'],fixture.progress.segmentMemories['1']);
 assert.deepEqual(restored.profile.progress.segmentMemories['3'],fixture.progress.segmentMemories['3']);
 assert.deepEqual(restored.profile.progress.segmentMemories['7'],fixture.progress.segmentMemories['7']);
});

test('段首以前的事件不能伪装成本段选择，未通关记录也不能恢复', () => {
 const m=new GameModel();m.beginRun();m.event('umbrella');m.enterSegment('1');m.finishSegment(0);
 assert.equal(m.recordSegmentMemory('1'),false);
 const loaded=new GameModel(JSON.stringify({version:2,progress:{
   segmentMemories:{'1':{runId:1,anchorEvent:'hat',choiceEvent:'umbrella',poemSeen:true}}
 }}));
 assert.deepEqual(loaded.profile.progress.segmentMemories,{});
});

