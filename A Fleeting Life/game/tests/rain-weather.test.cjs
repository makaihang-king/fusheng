'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const {drawRainWeather}=require('../build/RainWeather.js');

function draw(clock=0,reducedMotion=false,bounds){
 const calls=[];
 drawRainWeather({
  line(x1,y1,x2,y2,color,width){calls.push({x1,y1,x2,y2,color,width});},
  circle(){throw new Error('Weather does not need bright rain beads');}
 },clock,reducedMotion,bounds);
 return calls;
}
const drops=calls=>calls.filter(c=>c.color.startsWith('rgba(225,239,235,'));
const splashes=calls=>calls.filter(c=>c.color.startsWith('rgba(197,220,215,'));

test('rain falls in independent depth layers with varied streaks and gentle leftward wind',()=>{
 const a=drops(draw(2.1)),b=drops(draw(2.105));
 assert.ok(a.length>=30&&a.length<=75,'rain stays sparse enough to read the world');
 assert.equal(new Set(a.map(c=>c.width)).size,3,'all three depths are visible');
 assert.ok(new Set(a.map(c=>(c.y2-c.y1).toFixed(2))).size>20,'streak lengths do not repeat as a grid');
 const velocities=[];
 for(const line of a){
  const next=b.find(c=>c.color===line.color&&c.width===line.width&&
   Math.abs((c.y2-c.y1)-(line.y2-line.y1))<.0001&&Math.abs(c.x1-line.x1)<1);
  if(!next)continue;
  const fall=(next.y1-line.y1)/.005;
  if(fall<0)continue; // A wrapped drop leaves the frame rather than reversing direction.
  assert.ok(fall>60&&fall<255,'fall speed remains consistent with rain depth');
  assert.ok(next.x1<line.x1,'the motion agrees with the left-leaning streak');
  velocities.push(fall);
 }
 assert.ok(velocities.length>25,'most drops keep a continuous trajectory across nearby frames');
 assert.ok(Math.max(...velocities)-Math.min(...velocities)>100,'the field does not fall in lockstep');
});

test('rain is deterministic, fades lightly, and stops at the ground without covering floor UI',()=>{
 const calls=draw(3.8);
 assert.deepEqual(calls,draw(3.8));
 for(const line of calls){
  assert.ok([line.x1,line.y1,line.x2,line.y2,line.width].every(Number.isFinite));
  assert.ok(line.y1<=218&&line.y2<=218);
 }
 for(const line of drops(calls)){
  assert.ok(line.y2<=216);
  const alpha=Number(line.color.match(/,([\d.]+)\)$/)[1]);
  assert.ok(alpha>0&&alpha<=.34,'foreground rain does not wash out scene detail');
 }
});

test('reduced motion freezes a lower density rain field and quiet ground marks',()=>{
 const still=draw(0,true);
 assert.deepEqual(still,draw(20,true));
 assert.ok(drops(still).length<drops(draw(0)).length*.5);
 for(const mark of splashes(still))assert.equal(mark.y1,mark.y2,'no upward splash motion remains');
});

test('ground splashes appear briefly at separate times and remain small',()=>{
 const frames=Array.from({length:18},(_,i)=>splashes(draw(i*.17)));
 assert.ok(frames.some(calls=>calls.length>0));
 assert.ok(new Set(frames.map(calls=>JSON.stringify(calls))).size>10);
 for(const calls of frames)for(const mark of calls){
  assert.ok(mark.y1>=213&&mark.y1<=218);
  assert.ok(mark.x2-mark.x1<5.5);
 }
});

test('wide margins retain the exact central rain field, including extended sky',()=>{
 const core=calls=>drops(calls).filter(c=>c.x1>=0&&c.x1<=480&&c.y2>=0);
 const normal=core(draw(4.3));
 const wide=core(draw(4.3,false,{left:-160,top:-100,right:640,bottom:350}));
 assert.deepEqual(wide,normal,'preview margins cannot change positions inside the stage');
});
