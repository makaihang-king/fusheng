'use strict';
const fs=require('node:fs'),path=require('node:path');
const root=path.resolve(__dirname,'..'),output=path.join(root,'build/qa/frame-save-v8');
fs.mkdirSync(output,{recursive:true});
const isolate=`(()=>{const store=window.parent.qaStore;const api={getItem:key=>store.has(key)?store.get(key):null,setItem:(key,value)=>store.set(String(key),String(value)),removeItem:key=>store.delete(key),clear:()=>store.clear(),key:index=>[...store.keys()][index]||null,get length(){return store.size;}};Object.defineProperty(window,'localStorage',{value:api,configurable:true});})();`;
fs.writeFileSync(path.join(output,'isolated-store.js'),isolate);
const source=fs.readFileSync(path.join(root,'preview/index.html'),'utf8');
fs.writeFileSync(path.join(output,'frame.html'),source.replace('<head>','<head><base href="/preview/">').replace('  <script src="../build/web/game.js">','  <script src="/build/qa/frame-save-v8/isolated-store.js"></script>\n  <script src="../build/web/game.js">'));
const cocos=path.join(root,'build/web-desktop/index.html');
if(fs.existsSync(cocos))fs.writeFileSync(path.join(output,'native-frame.html'),fs.readFileSync(cocos,'utf8').replace('<head>','<head><base href="/build/web-desktop/"><script src="/build/qa/frame-save-v8/isolated-store.js"></script>'));
const html=`<!doctype html><html lang="zh-CN"><meta charset="utf-8"><title>浮生 · 画幅与存档检查</title><style>html,body{margin:0;height:100%;font:14px system-ui;background:#eeeade;color:#334941}header{height:62px;display:flex;align-items:center;gap:8px;padding:0 12px;box-sizing:border-box}button,select{padding:6px;border:1px solid #a4b6a1;background:#f5f1e7;color:#334941}#status{font-size:12px}iframe{display:block;border:0;width:100%;height:calc(100vh - 62px)}</style><header><select id="engine"><option value="web">网页版</option><option value="native">Cocos 原生绘制</option></select><select id="scene"><option value="pause">暂停存档</option><option value="saved">保存反馈</option><option value="boundary">换片前后</option><option value="shake">受击抖动</option><option value="choice">选择淡入</option><option value="hall">回廊继续</option></select><button id="next">下一个场景</button><button id="restore">关闭重开验证</button><span id="status">准备检查</span></header><iframe id="frame" title="隔离的游戏检查画面"></iframe><script>
window.qaStore=new Map();const frame=document.getElementById('frame'),status=document.getElementById('status');let index=0,token=0,game=null;
const themes=['dawn','rain','noon','gray','dusk','night','graduate','alley','playground','dream','heaven','hell'];const check=(ok,label)=>{if(!ok)throw Error(label);};
function click(label){game.render(frame.contentWindow.fleetingLife.painter);const b=game.buttons.find(b=>b.label===label);check(!!b,'按钮存在：'+label);game.pointerDown(b.x+b.w/2,b.y+b.h/2);game.pointerUp(b.x+b.w/2,b.y+b.h/2);}
function setup(){const mode=document.getElementById('scene').value;game.settings.muted=true;game.update=()=>{};game.start();game.beginSegment(mode==='pause'||mode==='saved'?2:1);game.obstacles=[];game.pickups=[];game.notice='';game.noticeTime=0;game.subtitle='';game.subtitleTime=0;game.clock=1.1;game.time=9;game.paused=false;
if(mode==='pause'||mode==='saved'){game.paused=true;if(mode==='saved')click('保存存档点');status.textContent=game.checkpointState.location+' · 已保存';}
if(mode==='boundary'){game.theme=themes[index%themes.length];game.time=(960+(index%3-1))/72;status.textContent=game.theme+' camera='+Math.round(game.time*72);}
if(mode==='shake'){game.theme=themes[index%themes.length];game.time=8;game.shake=.25;status.textContent=game.theme+' 受击边缘';}
if(mode==='choice'){game.beginChoice(index%6+1);game.phaseTime=.3;status.textContent='选择 '+game.choice+' 淡入';}
if(mode==='hall'){game.toHall();status.textContent='回廊默认继续：'+game.checkpointState.location;}
}
function load(){const current=++token;game=null;frame.src=document.getElementById('engine').value==='native'?'native-frame.html':'frame.html';const timer=setInterval(()=>{if(current!==token){clearInterval(timer);return;}const app=frame.contentWindow.fleetingLife;if(!app?.game)return;clearInterval(timer);game=app.game;setup();},50);}
document.getElementById('scene').onchange=()=>{index=0;setup();};document.getElementById('engine').onchange=load;document.getElementById('next').onclick=()=>{index++;setup();};document.getElementById('restore').onclick=()=>{try{game.settings.muted=true;game.start();game.beginSegment(3);game.time=17;game.paused=true;click('保存存档点');const expected=game.checkpointState.location;game.toHall();const replacement=new game.constructor({load:()=>qaStore.get('fleeting-life-s1')||null,save:value=>qaStore.set('fleeting-life-s1',value)});check(replacement.continueCheckpoint(),'恢复成功');check(replacement.segment===3&&replacement.time===0,'从第三段段首恢复');check(replacement.checkpointState.location===expected,'存档位置一致');status.textContent='通过：保存 → 关闭 → 重开 → 第三段起点';document.getElementById('scene').value='hall';}catch(error){status.textContent='失败：'+error.message;console.error(error);}};load();
</script></html>`;
fs.writeFileSync(path.join(output,'index.html'),html);
console.log(output);

