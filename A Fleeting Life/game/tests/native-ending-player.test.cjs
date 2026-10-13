'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const root=path.resolve(__dirname,'..');
const ts=require(path.resolve(root,'../需要的软件/CocosCreator/3.8.8/resources/app.asar.unpacked/node_modules/typescript'));
const {VideoReplayEvidence}=require('../build/ReplayEvidence.js');

function nativePlayer(isNative=true){
 const source=fs.readFileSync(path.join(root,'assets/scripts/Bootstrap.ts'),'utf8');
 const compiled=ts.transpileModule(source.slice(source.indexOf('class CocosPainter implements Painter {'),source.indexOf('type RawMomentFrame=')),{compilerOptions:{target:ts.ScriptTarget.ES2020}}).outputText;
 let now=0;
 class Transform {setContentSize(w,h){this.width=w;this.height=h;}}
 class Node {constructor(name){this.name=name;this.children=[];this.components=new Map();this.events=new Map();this.position={x:0,y:0};this.active=true;}addChild(n){n.parent=this;this.children.push(n);}addComponent(Type){const c=new Type(this);this.components.set(Type,c);return c;}getComponent(Type){return this.components.get(Type);}on(type,cb){this.events.set(type,cb);}emit(type){this.events.get(type)?.();}setPosition(x,y){this.position={x,y};}getSiblingIndex(){return this.parent.children.indexOf(this);}setSiblingIndex(index){const a=this.parent.children;a.splice(a.indexOf(this),1);a.splice(index,0,this);}}
 class Player {constructor(node){this.node=node;this.currentTime=0;this.plays=0;this.pauses=0;this.resumes=0;}set clip(v){this._clip=v;this.currentTime=0;}get clip(){return this._clip;}play(){this.plays++;this.node.emit('playing');}pause(){this.pauses++;}resume(){this.resumes++;this.node.emit('playing');}stop(){this.currentTime=0;}}
 Player.EventType={READY_TO_PLAY:'ready',PLAYING:'playing',COMPLETED:'completed',ERROR:'error'};Player.ResourceType={LOCAL:0};
 const releases=[];const resources={load(p,type,cb){cb(null,{path:p});},release(p){releases.push(p);}};
 const globals={Node,UITransform:Transform,Layers:{Enum:{UI_2D:1}},ART_MANIFEST:[],ART_PIXEL_DENSITY:2,ENDING_MEDIA:{'ending.video.morning':{seconds:12,resourcePath:'video/endings/morning',skins:{raincoat:{resourcePath:'video/endings/skins/raincoat/morning'}}}},VideoPlayer:Player,VideoClip:class {},VideoReplayEvidence,resources,sys:{isNative},performance:{now:()=>now}};
 const Painter=new Function(...Object.keys(globals),compiled+'\nreturn CocosPainter;')(...Object.values(globals));
 const painter=new Painter(new Node('stage'));
 function draw(paused=false,session=1,skin='base',muted=false){painter.begin();const result=painter.video('ending.video.morning',0,0,480,270,0,paused,session,skin,muted);painter.end();return result;}
 const tick=(seconds,wallMs=seconds*1000)=>{now=wallMs;painter.endingVideoPlayer.currentTime=seconds;return draw();};
 return {painter,draw,tick,setNow:n=>{now=n;},releases};
}

test('native ending surface keeps the top controls clear and exposes the pause menu without seeking',()=>{
 const m=nativePlayer();assert.equal(m.draw().status,'loading');const node=m.painter.endingVideoNode;
 node.emit('ready');assert.equal(m.draw().status,'playing');const transform=[...node.components.values()].find(c=>c.width);
 assert.equal(transform.width,416);assert.equal(transform.height,234);assert.deepEqual(node.position,{x:0,y:-14});
 m.tick(3,3000);m.setNow(3500);const paused=m.draw(true);assert.equal(paused.seconds,3);assert.equal(paused.visible,false);assert.equal(node.active,false);
 m.setNow(5000);const resumed=m.draw(false);assert.equal(resumed.seconds,3);assert.equal(resumed.visible,true);assert.equal(node.active,true);assert.equal(m.painter.endingVideoPlayer.currentTime,3);
});

test('web video surface leaves pause/replay controls clickable and reveals the paused menu',()=>{
 const m=nativePlayer(false);m.draw();const node=m.painter.endingVideoNode;node.emit('ready');m.draw();
 const transform=[...node.components.values()].find(c=>c.width);
 assert.equal(transform.width,416);assert.equal(transform.height,234);assert.deepEqual(node.position,{x:0,y:-14});
 m.tick(3,3000);m.setNow(3300);assert.equal(m.draw(true).visible,false);assert.equal(node.active,false);
 m.setNow(4600);assert.equal(m.draw(false).visible,true);assert.equal(m.painter.endingVideoPlayer.currentTime,3);
});

test('native completion event requires a full real advance and accepts the documented end reset',()=>{
 const invalid=nativePlayer();invalid.draw();invalid.painter.endingVideoNode.emit('ready');invalid.draw();invalid.painter.endingVideoNode.emit('completed');assert.equal(invalid.draw().status,'failed');
 const valid=nativePlayer();valid.draw();valid.painter.endingVideoNode.emit('ready');valid.draw();
 for(let i=1;i<=119;i++)valid.tick(i/10,i*100);
 valid.setNow(12000);valid.painter.endingVideoPlayer.currentTime=0;valid.painter.endingVideoNode.emit('completed');
 const end=valid.draw();assert.equal(end.status,'ended');assert.equal(end.seconds,12);
});

test('native replay creates a new outfit resource at zero and releases the previous session',()=>{
 const m=nativePlayer();m.draw();m.painter.endingVideoNode.emit('ready');m.draw();m.tick(4,4000);
 const again=m.draw(false,2,'raincoat');assert.equal(again.status,'loading');assert.equal(again.seconds,0);
 assert.equal(m.painter.endingVideoPlayer.clip.path,'video/endings/skins/raincoat/morning');assert.ok(m.releases.includes('video/endings/morning'));
 m.painter.endingVideoNode.emit('completed');assert.equal(m.draw(false,2,'raincoat').status,'loading');
 m.painter.endingVideoNode.emit('ready');assert.equal(m.draw(false,2,'raincoat').status,'playing');
});

test('a late native READY starts its own stall window and repeated PLAYING cannot conceal a stalled decoder',()=>{
 const m=nativePlayer();m.draw();
 for(let ms=100;ms<=7000;ms+=100){m.setNow(ms);assert.equal(m.draw().status,'loading');}
 m.painter.endingVideoNode.emit('ready');assert.equal(m.draw().status,'playing');
 for(let ms=7100;ms<=13000;ms+=100){m.setNow(ms);m.painter.endingVideoNode.emit('playing');assert.equal(m.draw().status,'playing');}
 m.setNow(13100);assert.equal(m.draw().status,'failed');
});

test('cinematic sound follows the same mute setting as the game',()=>{
 const m=nativePlayer();m.draw(false,1,'base',true);assert.equal(m.painter.endingVideoPlayer.mute,true);
 m.draw(false,1,'base',false);assert.equal(m.painter.endingVideoPlayer.mute,false);
});
