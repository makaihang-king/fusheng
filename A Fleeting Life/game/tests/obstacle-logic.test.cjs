'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {Game,makeHellCourse}=require('../build/Game');
const {SEGMENTS,BRANCHES,XIAOMAN_MOTION}=require('../build/Content');
const {RUN_SPEED,obstacleBounds}=require('../build/Geometry');
const {advanceObstacleEvent,obstacleAppearance,obstacleContactSeconds,obstacleFrame,prepareObstacle,
  OBSTACLE_NOTICE_SECONDS,OBSTACLE_EVENT_LEAD_SECONDS}=require('../build/ObstacleLogic');
const {drawPhysicalObstacle}=require('../build/ObstacleRendering');
const dt=1/60;
const painter={rect(){},line(){},circle(){},poly(){},text(){},image(){return false;}};
const fresh=()=>new Game({load:()=>null,save(){}});
const definitions=[...SEGMENTS,...Object.values(BRANCHES)].flatMap(level=>level.obstacles);

test('all dynamic obstacles have their source visible before moving and complete at least two real seconds before contact',()=>{
  const moving=definitions.filter(o=>obstacleAppearance(o.label,o.kind).motion!=='fixed');
  assert.equal(moving.length,3);
  for(const def of moving)for(const multiplier of [1,1.04,1.3]){
    const o=prepareObstacle(def),speed=RUN_SPEED*multiplier;
    let time=0,wall=0,cueAt=null,movingAt=null,completed=false;
    while(time<def.at){
      advanceObstacleEvent(o,time,speed,dt);
      if(o.cueSeen&&cueAt===null){
        cueAt=wall;
        const frame=obstacleFrame(o,time);
        assert.ok(frame.x>96&&frame.x<480,'vehicle/cabinet/support is already on screen');
        assert.ok(obstacleContactSeconds(o,time,speed)<=OBSTACLE_NOTICE_SECONDS);
      }
      if(o.eventElapsed!==undefined&&movingAt===null){
        movingAt=wall;assert.ok(cueAt!==null);
        assert.ok(movingAt-cueAt>=.55,'source remains visible before motion begins');
        assert.ok(o.triggerLead<=OBSTACLE_EVENT_LEAD_SECONDS&&o.triggerLead>=2.58);
      }
      if(!completed&&obstacleFrame(o,time).progress===1){
        assert.ok(obstacleContactSeconds(o,time,speed)>=2,def.label+' at speed '+multiplier);
        completed=true;
      }
      time+=dt*multiplier;wall+=dt;
    }
    assert.ok(completed);assert.equal(obstacleFrame(o,time).progress,1,'one-way event cannot flicker shut');
  }
});

test('retries and late branch returns cannot inherit an open door or spawn an unannounced event',()=>{
  const def=SEGMENTS[0].obstacles.find(o=>/车门/.test(o.label));
  const first=prepareObstacle(def);advanceObstacleEvent(first,def.at-2,72,dt);
  assert.ok(first.eventElapsed>0);
  const replay=prepareObstacle(def);
  assert.equal(replay.eventElapsed,undefined);assert.equal(obstacleFrame(replay,0).progress,0);
  assert.equal(prepareObstacle(def,def.at-2,72),null,'late entry omits an event lacking its visible warning');
  assert.ok(prepareObstacle(def,def.at-6,72));
});

test('car doors block a sliding body while rails leave real clearance for the common low posture',()=>{
  const door=SEGMENTS[0].obstacles.find(o=>/车门/.test(o.label));
  assert.equal(door.kind,'tall');
  const doorBounds=obstacleFrame(door,door.at).bounds;
  assert.deepEqual(doorBounds,{x:88,y:164,w:13,h:52});
  assert.equal(216-(doorBounds.y+doorBounds.h),0,'the open outer corner meets the road');
  assert.ok(216-(doorBounds.y+doorBounds.h)<XIAOMAN_MOTION.slidingCollisionHeight);
  const rail=obstacleBounds('high',96);
  assert.equal(rail.h,12);assert.ok(216-(rail.y+rail.h)>XIAOMAN_MOTION.slidingCollisionHeight);
});

test('the open vehicle leaf stays hinged on its actual body doorway and covers its collider',()=>{
  const door=SEGMENTS[0].obstacles.find(o=>/车门/.test(o.label));
  const calls=[],live={...door,eventElapsed:1,cueSeen:true};
  const art={...painter,
    image:(...args)=>{calls.push(['image',...args]);return true;},
    imageRegion:(...args)=>{calls.push(['imageRegion',...args]);return true;}};
  drawPhysicalObstacle(art,live,door.at,'#637b75');
  const body=calls.find(call=>call[0]==='image'&&call[1]==='props.obstacles.v2.vehicle.body');
  assert.deepEqual(body.slice(2),[43,154,94,62]);
  const leaf=calls.filter(call=>call[0]==='imageRegion'&&call[1]==='props.obstacles.v2.vehicle.door');
  assert.equal(leaf.length,12,'the door is sheared into a hinged surface, not stretched across the wheel');
  const b=obstacleFrame(live,door.at).bounds;
  assert.ok(leaf.every(call=>call[6]>=b.x-.01&&call[6]+call[8]<=b.x+b.w+.2));
  assert.ok(leaf.some(call=>Math.abs(call[7]+call[9]-216)<.01),'the free corner reaches the pavement');
});

test('slide collision follows the same entrance, hold and recovery heights as the character rig',()=>{
  const game=fresh();game.start();game.beginSegment(5);game.obstacles=[];game.pickups=[];
  game.down();assert.equal(game.playerBounds().h,40);assert.equal(game.playerBounds().w,14);
  for(let i=0;i<8;i++)game.update(dt);
  assert.equal(game.playerBounds().h,18);assert.equal(game.playerBounds().w,24);
  for(let i=0;i<42;i++)game.update(dt);
  assert.ok(game.slideRecovery>0);assert.equal(game.playerBounds().h,18);
  for(let i=0;i<14;i++)game.update(dt);
  assert.equal(game.playerBounds().h,40);assert.equal(game.playerBounds().w,14);
});

test('a physical obstacle applies at most one hit, including repeated fixed-step overlaps',()=>{
  const game=fresh();game.start();game.beginSegment(1);game.obstacles=[{at:12,kind:'low',label:'书包'}];
  game.time=11.9;game.stepRun(dt,0,11.9);
  const drops=game.run.drops;assert.equal(drops,1);
  for(let i=0;i<60;i++)game.stepRun(dt,0,game.time);
  assert.equal(game.run.drops,drops);
});

test('player-facing rendering never exposes collision outlines, including forced debug and query flags',()=>{
  const game=fresh();game.start();game.beginSegment(1);game.time=10;
  const collect=()=>{const calls=[];const traced={};for(const key of Object.keys(painter))traced[key]=(...args)=>{calls.push([key,...args]);return false;};game.render(traced);return calls;};
  const normal=collect();game.debugGeometry=true;game.geometryDebugAllowed=true;
  assert.deepEqual(collect(),normal);
  game.keyDown('F3');assert.equal(game.debugGeometry,true,'F3 cannot switch on an overlay');
  assert.equal(fresh().geometryDebugAllowed,false);
});

test('all authored entities and seeded hell rubble draw connected material with finite geometry',()=>{
  for(const o of [...definitions,...makeHellCourse(17)]){
    const calls=[];const trace={...painter};
    for(const key of ['rect','line','circle','poly'])trace[key]=(...args)=>calls.push([key,args]);
    const live={...o,eventElapsed:1,cueSeen:true};drawPhysicalObstacle(trace,live,o.at-.5,'#637b75');
    assert.ok(calls.length>=3,o.label);
    for(const [key,args] of calls){
      const coords=key==='poly'?args[0].flat():args.filter(v=>typeof v==='number');
      assert.ok(coords.every(Number.isFinite),o.label);
    }
    assert.ok(obstacleAppearance(o.label,o.kind).explanation.length>10);
  }
});
