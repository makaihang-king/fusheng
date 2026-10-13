'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {Game}=require('../build/Game');
const {COSMETICS}=require('../build/Model');
const normal=['morning','backrow','outside','desk'];
const all=[...normal,'runaway','wall','secondGrade'];
const dt=1/60;
function fresh(serialized,hooks={}){
  let saved=serialized||null;
  const game=new Game({load:()=>saved,save:value=>saved=value},hooks);
  return {game,saved:()=>saved};
}
function click(game,label){
  const b=game.buttons.find(b=>b.label===label);assert.ok(b,label);
  game.pointerDown(b.x+b.w/2,b.y+b.h/2);game.pointerUp(b.x+b.w/2,b.y+b.h/2);
}
const surface={rect(){},line(){},circle(){},text(){},poly(){},image(){return false;}};

// This is a trusted decoded-media contract fixture, not a real MP4 or route playback.
test('all seven valid endings settle only after the full card and save replay without duplicating an award or outfit purchase',()=>{
  for(const id of all){
    const {game:g,saved}=fresh();g.start();
    if(id==='secondGrade')g.profile.lights.push(...normal);
    g.startEnding(id);g.setEndingMediaProgress(11.99,'playing');g.update(dt);g.finishEnding();
    assert.equal(g.profile.progress.endings[id],undefined,id+' cannot settle a nearly complete movie');
    g.setEndingMediaProgress(12,'ended');
    for(let i=0;i<119;i++)g.update(dt);
    assert.equal(g.profile.progress.endings[id],undefined,id+' requires both card seconds');
    g.appHide();for(let i=0;i<20;i++)g.update(.1);g.appShow();
    assert.equal(g.paused,true);assert.equal(g.profile.progress.endings[id],undefined);
    g.paused=false;g.update(dt/2);assert.equal(g.profile.progress.endings[id],undefined);g.update(dt/2);
    assert.equal(g.profile.progress.endings[id],1,id+' settles once at the final card tick');
    if(normal.includes(id))assert.deepEqual(g.profile.lights,[id]);
    else if(id!=='secondGrade'){assert.deepEqual(g.profile.lights,[]);assert.ok(g.profile.achievements.includes(id));}
    else{assert.ok(g.profile.cosmetics.includes('namelessNotebook'));assert.equal(g.profile.finalePlayed,false);g.toHall();}
    while(g.phase==='corridorTransition')g.update(dt);
    assert.equal(g.screen,'hall');
    const snapshot=JSON.stringify(g.profile.endingSnapshots),count=g.profile.progress.endings[id];
    const outfit=COSMETICS.find(c=>c.id==='raincoat');g.profile.wrappers=outfit.price+7;
    assert.equal(g.model.buy('raincoat'),true);assert.equal(g.model.equip('raincoat'),true);
    const balance=g.profile.wrappers;
    const {game:reloaded,saved:resaved}=fresh(saved());
    assert.equal(reloaded.profile.equippedSlots.skin,'raincoat');assert.equal(reloaded.profile.wrappers,balance);
    let movieArgs;
    reloaded.startEnding(id,true);reloaded.render({...surface,video(...args){movieArgs=args;return {visible:false,seconds:0,status:'loading'};}});
    assert.equal(movieArgs[5],0);assert.equal(movieArgs[8],'raincoat');click(reloaded,'回到回廊');
    assert.equal(reloaded.screen,'hall');assert.equal(reloaded.profile.progress.endings[id],count);
    assert.equal(JSON.stringify(reloaded.profile.endingSnapshots),snapshot);assert.equal(reloaded.profile.wrappers,balance);
    assert.equal(reloaded.model.buy('raincoat'),false);assert.equal(reloaded.profile.wrappers,balance);
    assert.equal(JSON.parse(resaved()).progress.endings[id],count);
  }
});

test('personal recording accepts success just before the ten-second deadline and rejects a result after the timeout',()=>{
  for(const [frames,accepted] of [[599,true],[600,false]]){
    let done;
    const {game:g}=fresh(null,{replay(active,callback){if(active)done=callback;}});
    g.start();g.profile.lights.push(...normal);g.startEnding('secondGrade');g.setEndingMediaProgress(12,'ended');
    for(let i=0;i<120;i++)g.update(dt);assert.equal(g.phase,'finale');
    for(let i=0;i<frames;i++)g.update(dt);
    done(true);assert.equal(g.profile.finalePlayed,accepted,'completion before and after deadline must differ');
    let lastFinaleTime = g.finaleTime;
    while(g.phase==='finale'){lastFinaleTime=g.finaleTime;g.update(dt);}
    while(g.phase==='corridorTransition')g.update(dt);
    assert.ok(lastFinaleTime>=15-dt&&lastFinaleTime<15+dt*2);assert.equal(g.profile.progress.endings.secondGrade,1);
  }
});
