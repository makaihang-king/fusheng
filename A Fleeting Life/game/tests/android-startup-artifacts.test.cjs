'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('fs'),path=require('path'),os=require('os');
const {execFileSync}=require('child_process');
const {compressScriptUuid,hasAttachedBootstrap,validateBootstrapArtifacts,validateApkBootstrap}=require('../scripts/prepare-android.cjs');
const root=path.resolve(__dirname,'..'),fullUuid='4c78423a-9939-4f37-b09a-9b36b6678721',id='4c784I6mTlPN7Camza2Z4ch';
function fixture(){
 const base=fs.realpathSync(os.tmpdir()),folder=fs.mkdtempSync(path.join(base,'fleeting-startup-'));
 const project=path.join(folder,'原工程'),data=path.join(project,'build/android/data');
 const write=(file,text)=>{fs.mkdirSync(path.dirname(file),{recursive:true});fs.writeFileSync(file,text);};
 for(const file of ['assets/scenes/Main.scene','assets/scenes/Main.scene.meta','assets/scripts/Bootstrap.ts','assets/scripts/Bootstrap.ts.meta'])write(path.join(project,file),fs.readFileSync(path.join(root,file)));
 const main=JSON.parse(fs.readFileSync(path.join(project,'assets/scenes/Main.scene.meta'),'utf8')).uuid;
 const scene=path.join(data,'assets/main/import',main.slice(0,2),main+'.json'),bundle=path.join(data,'assets/main/index.js');
 write(path.join(data,'src/settings.json'),JSON.stringify({engine:{platform:'android'},assets:{preloadBundles:[{bundle:'main'}],bundleVers:{}},scripting:{scriptPackages:['../chunks/bundle.js']},launch:{launchScene:'db://assets/scenes/Main.scene'}}));
 write(path.join(data,'src/chunks/bundle.js'),'System.register("chunks:///_virtual/rollupPluginModLoBabelHelpers.js",[],function(){});');
 write(path.join(data,'assets/main/cc.config.json'),JSON.stringify({name:'main',hasPreloadScript:true,importBase:'import',scenes:{'db://assets/scenes/Main.scene':main}}));
 // A minimal Creator 3.8 compiled scene with an actual nested Bootstrap instance.
 const compiled=[1,0,[],[['cc.Node',['_name','_components']], [id,['node']]],[[0,0,1,2],[1,0,1]],[[0,'Game',[[1,-1]]]],0,[],[],[],[]];
 write(scene,JSON.stringify(compiled));write(bundle,'cclegacy._RF.push({}, "'+id+'", "Bootstrap", undefined); const decorator=ccclass("Bootstrap");');
 const cleanup=()=>{const target=fs.realpathSync(folder);assert.equal(path.dirname(target),base);assert.match(path.basename(target),/^fleeting-startup-[A-Za-z0-9]+$/);fs.rmSync(target,{recursive:true,force:true});};
 return {folder,project,data,scene,bundle,compiled,write,cleanup};
}
function zip(f,destination){
 execFileSync('powershell.exe',['-NoProfile','-NonInteractive','-Command',"Add-Type -AssemblyName System.IO.Compression.FileSystem; [IO.Compression.ZipFile]::CreateFromDirectory($env:FLEETING_FIXTURE_DATA, $env:FLEETING_FIXTURE_ZIP)"],{windowsHide:true,encoding:'utf8',env:{...process.env,FLEETING_FIXTURE_DATA:f.data,FLEETING_FIXTURE_ZIP:destination}});
}
test('source script UUID uses Creator prefix-five compression and requires an attached non-null component',()=>{
 const f=fixture();try{
  assert.equal(compressScriptUuid(fullUuid),id);
  assert.equal(hasAttachedBootstrap(f.compiled,id),true);
  const out=path.join(f.folder,'startup.json'),proof=validateBootstrapArtifacts(f.project,f.data,out);assert.equal(proof.bootstrapUuid,id);assert.equal(proof.artifacts.length,4);assert.ok(proof.sourceSha256['assets/scripts/Bootstrap.ts']);
  assert.equal(proof.startupChain.bootstrapEntry,'assets/main/index.js');assert.equal(proof.checks.preloadMain,true);
  f.compiled[5][0][2]=[null];f.write(f.scene,JSON.stringify(f.compiled));
  assert.equal(hasAttachedBootstrap(f.compiled,id),false);
  assert.throws(()=>validateBootstrapArtifacts(f.project,f.data,null),/non-null Bootstrap/,'a remaining class table is not an attached startup component');
  assert.throws(()=>execFileSync(process.execPath,[path.join(root,'scripts/prepare-android.cjs'),'--check-startup',f.project,f.data,out],{windowsHide:true,stdio:'pipe'}));
  assert.equal(JSON.parse(fs.readFileSync(out,'utf8')).passed,false,'a failed CLI check replaces old passing proof');
 }finally{f.cleanup();}
});
test('main requires RF registration and the real settings/config loading chain; shared helper bytes cannot satisfy it',()=>{
 const f=fixture();try{
  f.write(f.bundle,'const decorator=ccclass("Bootstrap"); class Bootstrap {}');
  f.write(path.join(f.data,'src/chunks/bundle.js'),'cclegacy._RF.push({}, "'+id+'", "Bootstrap", undefined); const decorator=ccclass("Bootstrap");');
  assert.throws(()=>validateBootstrapArtifacts(f.project,f.data,null),/RF UUID registration/);
  f.write(f.bundle,'cclegacy._RF.push({}, "'+id+'", "Bootstrap", undefined); const decorator=ccclass("Bootstrap");');
  const settingsFile=path.join(f.data,'src/settings.json'),settings=JSON.parse(fs.readFileSync(settingsFile,'utf8'));settings.assets.preloadBundles=[];f.write(settingsFile,JSON.stringify(settings));
  assert.throws(()=>validateBootstrapArtifacts(f.project,f.data,null),/do not preload/);
  settings.assets.preloadBundles=[{bundle:'main'}];f.write(settingsFile,JSON.stringify(settings));
  const configFile=path.join(f.data,'assets/main/cc.config.json'),config=JSON.parse(fs.readFileSync(configFile,'utf8'));config.hasPreloadScript=false;f.write(configFile,JSON.stringify(config));
  assert.throws(()=>validateBootstrapArtifacts(f.project,f.data,null),/does not load its preload script/);
 }finally{f.cleanup();}
});
test('actual APK ZIP startup bytes must match the checked scene and JavaScript, and source changes invalidate proof',()=>{
 const f=fixture();try{
  const proof=validateBootstrapArtifacts(f.project,f.data,null),good=path.join(f.folder,'good.apk');zip(f,good);
  const report=validateApkBootstrap(f.project,good,proof,null);assert.equal(report.passed,true);assert.equal(report.entries.length,4);
  const original=fs.readFileSync(f.bundle);f.write(f.bundle,Buffer.concat([original,Buffer.from('\n// stale package bytes')]));
  const stale=path.join(f.folder,'stale.apk');zip(f,stale);f.write(f.bundle,original);
  assert.throws(()=>validateApkBootstrap(f.project,stale,proof,null),/APK startup bytes differ/);
  fs.appendFileSync(path.join(f.project,'assets/scripts/Bootstrap.ts'),'\n// source changed after generation');
  assert.throws(()=>validateApkBootstrap(f.project,good,proof,null),/source changed/);
 }finally{f.cleanup();}
});
