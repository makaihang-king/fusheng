const fs=require('fs'),path=require('path'),os=require('os'),assert=require('node:assert/strict'),{spawn,execFile}=require('child_process');
const root=path.resolve(__dirname,'..'),edge='C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
const delay=ms=>new Promise(r=>setTimeout(r,ms));

/** One owned browser and temporary profile per invocation, including parallel QA runs. */
async function openBrowser({width=1200,height=800,gpu=false}={}){
 const tempRoot=fs.realpathSync(os.tmpdir()),profile=fs.mkdtempSync(path.join(tempRoot,'fleeting-life-cdp-'));
 let child,ws,spawnError,launchDiagnostics='',next=0,closed=false;const pending=new Map(),errors=[],consoleErrors=[],networkErrors=[],resourceResponses=[];
 const send=(method,params={},timeout=20000)=>new Promise((resolve,reject)=>{
  if(!ws||ws.readyState!==WebSocket.OPEN)return reject(Error('CDP is not connected: '+method));
  const id=++next,timer=setTimeout(()=>{pending.delete(id);reject(Error('CDP timeout: '+method));},timeout);
  pending.set(id,{resolve,reject,timer});ws.send(JSON.stringify({id,method,params}));
 });
 const close=async()=>{
  if(closed)return;closed=true;
  if(ws?.readyState===WebSocket.OPEN)await send('Browser.close',{},1500).catch(()=>{});
  ws?.close();for(const p of pending.values()){clearTimeout(p.timer);p.reject(Error('QA browser closed'));}pending.clear();
  if(child&&child.exitCode===null&&child.signalCode===null){
   await Promise.race([new Promise(r=>child.once('exit',r)),delay(1800)]);
   if(child.exitCode===null&&child.signalCode===null){
    if(process.platform==='win32')await new Promise(resolve=>execFile('taskkill.exe',['/PID',String(child.pid),'/T','/F'],{windowsHide:true},()=>resolve()));
    else child.kill('SIGKILL');
   }
  }
  // Validate the exact mkdtemp scope before recursive deletion. Never clean a shared profile.
  const resolved=path.resolve(profile);
  if(path.dirname(resolved)!==tempRoot||!/^fleeting-life-cdp-[A-Za-z0-9]+$/.test(path.basename(resolved)))throw Error('Unexpected temporary browser profile: '+resolved);
  for(let i=0;i<50;i++){
   try{fs.rmSync(resolved,{recursive:true,force:true});return;}catch(e){if(i===49)throw Error('Could not clean owned QA profile '+resolved+': '+e.message);await delay(300);}
  }
 };
 try{
  // This machine denies the Edge GPU child process under its sandbox, even in headless mode.
  child=spawn(edge,['--headless=new',...(gpu?[]:['--disable-gpu']),'--disable-gpu-sandbox','--no-sandbox','--no-first-run','--no-default-browser-check','--remote-allow-origins=*','--remote-debugging-port=0','--user-data-dir='+profile,'--window-size='+width+','+height,'about:blank'],{stdio:['ignore','ignore','pipe'],windowsHide:true});
  child.stderr.on('data',data=>{launchDiagnostics=(launchDiagnostics+data.toString()).slice(-8192);});
  child.on('error',e=>{spawnError=e;});
  let tabs;
  for(let i=0;i<300;i++){
   if(spawnError)throw spawnError;if(child.exitCode!==null)throw Error('QA browser exited before CDP connected');
   try{const port=fs.readFileSync(path.join(profile,'DevToolsActivePort'),'utf8').split(/\r?\n/)[0];tabs=await(await fetch('http://127.0.0.1:'+port+'/json',{signal:AbortSignal.timeout(1000)})).json();if(tabs.some(t=>t.type==='page'))break;}catch{}
   await delay(150);
  }
  if(!tabs?.some(t=>t.type==='page'))throw Error('Owned Edge debug endpoint did not start: '+launchDiagnostics);
  ws=new WebSocket(tabs.find(t=>t.type==='page').webSocketDebuggerUrl);
  await new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(Error('CDP websocket timed out')),5000);ws.onopen=()=>{clearTimeout(timer);resolve();};ws.onerror=e=>{clearTimeout(timer);reject(e);};});
  ws.onmessage=e=>{
   const m=JSON.parse(e.data);
   if(m.method==='Runtime.exceptionThrown')errors.push(m.params.exceptionDetails);
   if(m.method==='Runtime.consoleAPICalled'&&m.params.type==='error')consoleErrors.push(m.params.args.map(x=>x.value||x.description).join(' '));
   if(m.method==='Network.responseReceived')resourceResponses.push({url:m.params.response.url,status:m.params.response.status,type:m.params.type});
   if(m.method==='Network.responseReceived'&&m.params.response.status>=400)networkErrors.push({url:m.params.response.url,status:m.params.response.status});
   if(m.method==='Network.loadingFailed'&&!m.params.canceled)networkErrors.push({requestId:m.params.requestId,error:m.params.errorText});
   const p=pending.get(m.id);if(p){clearTimeout(p.timer);pending.delete(m.id);m.error?p.reject(Error(JSON.stringify(m.error))):p.resolve(m.result);}
  };
  ws.onclose=()=>{for(const p of pending.values()){clearTimeout(p.timer);p.reject(Error('QA browser disconnected'));}pending.clear();};
  await send('Runtime.enable');await send('Page.enable');await send('Network.enable');
  const evaluate=async expression=>{const r=await send('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true});if(r.exceptionDetails)throw Error(r.exceptionDetails.exception?.description||r.exceptionDetails.text);return r.result.value;};
  return {send,evaluate,errors,consoleErrors,networkErrors,resourceResponses,close,profile};
 }catch(e){await close();throw e;}
}
module.exports={openBrowser,delay};

async function main(){
 fs.mkdirSync(path.join(root,'build/qa'),{recursive:true});const browser=await openBrowser();
 try{
  const {send,evaluate,errors,consoleErrors,networkErrors}=browser;
  const url=process.argv[2]||'http://127.0.0.1:4318/preview/',isCocos=new URL(url).pathname.includes('/build/web-desktop/');
  await send('Page.navigate',{url});
  for(let i=0;i<150;i++){if(await evaluate('!!window.fleetingLife?.game'))break;await delay(100);}await delay(300);
  const initial=await evaluate('({title:document.title,error:document.getElementById("error")?.textContent||"",game:!!window.fleetingLife,screen:window.fleetingLife?.game.screen})');
  assert.equal(initial.game,true);assert.equal(initial.error,'');
  const layouts=[];
  for(const [width,height,mobile] of [[960,540,false],[852,393,true],[740,360,true],[2560,1080,false],[393,852,true]]){
   await send('Emulation.setDeviceMetricsOverride',{width,height,deviceScaleFactor:1,mobile});await delay(250);
   const layout=await evaluate('(()=>{const c=document.querySelector("#game,#GameCanvas"),r=c.getBoundingClientRect(),core=window.fleetingLife.getLayout?.().core||r;return {viewport:{width:innerWidth,height:innerHeight},core:{left:core.left,top:core.top,width:core.width,height:core.height},overflow:document.documentElement.scrollWidth>innerWidth||document.documentElement.scrollHeight>innerHeight,background:getComputedStyle(document.body).backgroundColor};})()');
   const c=layout.core,fit=Math.min(width/480,height/270),expected=fit<2?fit:Math.floor(fit);
   assert.equal(layout.overflow,false);assert.ok(c.left>=-.5&&c.top>=-.5&&c.left+c.width<=width+.5&&c.top+c.height<=height+.5);assert.ok(Math.abs(c.width/c.height-480/270)<.005);
   if(!isCocos)assert.ok(Math.abs(c.width-480*expected)<1,'maximum fit below 2×; integer fit at 2× or above');
   if(fit<2)assert.ok(Math.max(c.width/width,c.height/height)>.99,'mobile limiting dimension fills viewport');
   assert.notEqual(layout.background,'rgb(17, 25, 34)');layouts.push(layout);
  }
  await send('Emulation.setDeviceMetricsOverride',{width:960,height:540,deviceScaleFactor:1,mobile:false});await delay(250);
  const shot=await send('Page.captureScreenshot',{format:'png'});fs.writeFileSync(path.join(root,isCocos?'build/qa/cocos-hall.png':'build/qa/hall.png'),Buffer.from(shot.data,'base64'));
  assert.deepEqual(errors,[]);assert.deepEqual(consoleErrors,[]);assert.deepEqual(networkErrors,[]);
  console.log(JSON.stringify({initial,layouts,errors,consoleErrors,networkErrors},null,2));
 }finally{await browser.close();}
}
if(require.main===module)main().catch(e=>{console.error(e);process.exitCode=1;});
