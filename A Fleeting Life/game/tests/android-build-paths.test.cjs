'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('fs'),path=require('path'),os=require('os');
const {execFileSync}=require('child_process');
const {prepareAndroid,createAndroidAliases}=require('../scripts/prepare-android.cjs');
const root=path.resolve(__dirname,'..');
function fixture(){
 const tempBase=fs.realpathSync(os.tmpdir()),temporary=fs.mkdtempSync(path.join(tempBase,'fleeting-android-paths-'));
 const project=path.join(temporary,'游戏 space'),tools=path.join(temporary,'工具 space');
 const dir=p=>fs.mkdirSync(p,{recursive:true}),write=(p,s)=>{dir(path.dirname(p));fs.writeFileSync(p,s);};
 dir(path.join(tools,'android/android-sdk/ndk/28.2.13676358'));
 write(path.join(tools,'android/jdk-17.0.20.1+1/bin/java.exe'),'test placeholder; never executed');
 dir(path.join(tools,'需要的软件/CocosCreator/3.8.8/resources/resources/3d/engine/native'));
 write(path.join(tools,'需要的软件/CocosCreator/3.8.8/resources/tools/keystore/debug.keystore'),'fixture keystore');
 write(path.join(tools,'需要的软件/CocosCreator/3.8.8/CocosCreator.exe'),'test placeholder; never executed');
 dir(path.join(project,'native/engine/android'));dir(path.join(project,'build/android/proj/res/values'));
 const proj=path.join(project,'build/android/proj');
 write(path.join(proj,'cfg.cmake'),'set(COCOS_X_PATH "E:/A Fleeting Life/old-engine")\nset(USE_VIDEO ON)\n');
 write(path.join(proj,'gradle.properties'),'COCOS_ENGINE_PATH=E:/old\nRES_PATH=E:/old-res\nNATIVE_DIR=E:/old-native\nRELEASE_STORE_FILE=E:/old-sign\nPROP_APP_ABI=arm64-v8a\n');
 write(path.join(proj,'local.properties'),'sdk.dir=E\\:\\old-sdk\ncustom.setting=keep\n');
 write(path.join(project,'scripts/cocos-android.json'),fs.readFileSync(path.join(root,'scripts/cocos-android.json')));
 write(path.join(project,'scripts/cocos-web-desktop.json'),fs.readFileSync(path.join(root,'scripts/cocos-web-desktop.json')));
 write(path.join(project,'scripts/prepare-android.cjs'),fs.readFileSync(path.join(root,'scripts/prepare-android.cjs')));
 const aliases=path.join(temporary,'aliases');
 const cleanup=()=>{
  const target=fs.realpathSync(temporary);assert.equal(path.dirname(target),tempBase);assert.match(path.basename(target),/^fleeting-android-paths-[A-Za-z0-9]+$/);
  fs.rmSync(target,{recursive:true,force:true});
 };
 return {project,tools,proj,temporary,aliases,write,cleanup};
}
const slash=p=>p.replace(/\\/g,'/');

test('Android preparation uses verified ASCII project and tool junctions, including Java canonical project paths',()=>{
 const f=fixture();try{
  const result=prepareAndroid(f.project,f.tools,f.aliases);
  const local=fs.readFileSync(path.join(f.proj,'local.properties'),'utf8'),gradle=fs.readFileSync(path.join(f.proj,'gradle.properties'),'utf8');
  assert.ok(!/[^\x00-\x7f]/.test(local+gradle));assert.ok(!local.includes('old-sdk'));assert.ok(!gradle.includes('E:/'));
  assert.ok(gradle.includes('PROP_APP_ABI=arm64-v8a'));assert.ok(local.includes('custom.setting=keep'));
  for(const [alias,target] of Object.entries({project:f.project,creator:path.join(f.tools,'需要的软件/CocosCreator/3.8.8'),sdk:path.join(f.tools,'android/android-sdk'),jdk:path.join(f.tools,'android/jdk-17.0.20.1+1')})){
   assert.equal(fs.realpathSync(result[alias]),fs.realpathSync(target));assert.ok(!/[^\x20-\x7e]/.test(result[alias]));
  }
  assert.equal(fs.realpathSync(result.engine),fs.realpathSync(path.join(f.tools,'需要的软件/CocosCreator/3.8.8/resources/resources/3d/engine/native')));
  assert.ok(!/[^\x20-\x7e]/.test(result.gradleProject));
  const owner=JSON.parse(fs.readFileSync(result.ownerFile,'utf8'));assert.equal(owner.sourceProject,fs.realpathSync(f.project));assert.equal(owner.purpose,'fleeting-life-android-build-junctions');
  const cmake=fs.readFileSync(path.join(f.proj,'cfg.cmake'),'utf8');assert.ok(cmake.includes('set(COCOS_X_PATH "'+result.engine+'")'));assert.ok(cmake.includes('set(USE_VIDEO ON)'));
  const realToolRoot=process.env.FLEETING_TOOL_ROOT||path.resolve(root,'..'),java=path.join(realToolRoot,'android/jdk-17.0.20.1+1/bin/java.exe');
  if(fs.existsSync(java)){
   const probe=path.join(f.temporary,'PropertiesProbe.java');
   fs.writeFileSync(probe,'import java.io.*;import java.util.*;class PropertiesProbe{public static void main(String[]a)throws Exception{System.out.println("project.canonical="+new File(a[0]).getCanonicalPath());for(int i=1;i<a.length;i++){Properties p=new Properties();try(InputStream s=new FileInputStream(a[i])){p.load(s);}for(String k:new String[]{"sdk.dir","COCOS_ENGINE_PATH","RES_PATH","NATIVE_DIR","RELEASE_STORE_FILE"})if(p.getProperty(k)!=null)System.out.println(k+"="+p.getProperty(k));}}}');
   const decoded=execFileSync(java,['-Dfile.encoding=UTF-8',probe,result.gradleProject,path.join(f.proj,'local.properties'),path.join(f.proj,'gradle.properties')],{windowsHide:true,encoding:'utf8'});
   assert.ok(!/[^\x00-\x7f]/.test(decoded),'Java canonicalization must retain an ASCII Gradle project path');
   for(const [key,value] of Object.entries({'sdk.dir':result.sdk,COCOS_ENGINE_PATH:result.engine,RES_PATH:result.resPath,NATIVE_DIR:result.nativeDir,RELEASE_STORE_FILE:result.keystore}))assert.ok(decoded.includes(key+'='+slash(value)),key+' must survive standard Java Properties decoding');
  }
  prepareAndroid(f.project,f.tools,f.aliases);assert.equal(fs.readFileSync(path.join(f.proj,'gradle.properties'),'utf8'),gradle,'preparing twice is stable');
 }finally{f.cleanup();}
});

test('Creator retains real project/install/config paths while its Android tool settings and Gradle paths use ASCII aliases',()=>{
 const f=fixture();try{
  const script=fs.readFileSync(path.join(root,'scripts/build-cocos.ps1'),'utf8'),launch=script.indexOf('$process = Start-Process');assert.ok(launch>0);
  const prelude=path.join(f.project,'scripts/build-prelude.ps1');
  fs.writeFileSync(prelude,script.slice(0,launch)+'\n[Console]::OutputEncoding = [Text.UTF8Encoding]::new($false)\n@{project=$projectPath;creator=$creatorPath;config=$config;log=$log;gradle=$gradleProjectPath} | ConvertTo-Json -Compress\n');
  const source=fs.readFileSync(path.join(f.project,'scripts/cocos-android.json'),'utf8');
  const output=execFileSync('powershell.exe',['-NoProfile','-ExecutionPolicy','Bypass','-File',prelude,'-Platform','android'],{windowsHide:true,env:{...process.env,FLEETING_TOOL_ROOT:f.tools,FLEETING_ASCII_ALIAS_ROOT:f.aliases},encoding:'utf8'});
  const aliases=createAndroidAliases(f.project,f.tools,f.aliases);
  const current=JSON.parse(fs.readFileSync(path.join(f.project,'build/cocos-android-current.json'),'utf8')).packages.android;
  assert.equal(current.sdkPath,aliases.sdk);assert.equal(current.ndkPath,aliases.ndk);
  assert.equal(current.javaHome,aliases.jdk);assert.equal(current.javaPath,aliases.javaExe);
  const launchPaths=JSON.parse(output.trim());
  assert.equal(launchPaths.project,f.project);assert.equal(launchPaths.creator,path.join(f.tools,'需要的软件/CocosCreator/3.8.8/CocosCreator.exe'));
  assert.equal(launchPaths.config,path.join(f.project,'build/cocos-android-current.json'));assert.equal(launchPaths.log,path.join(f.project,'build/cocos-android.log'));
  assert.equal(launchPaths.gradle,aliases.project);
  assert.equal(fs.readFileSync(path.join(f.project,'scripts/cocos-android.json'),'utf8'),source);
 }finally{f.cleanup();}
});

test('missing local Android tools are rejected before editing the generated project',()=>{
 const f=fixture();try{
  const file=path.join(f.proj,'gradle.properties'),before=fs.readFileSync(file,'utf8');
  fs.unlinkSync(path.join(f.tools,'需要的软件/CocosCreator/3.8.8/resources/tools/keystore/debug.keystore'));
  assert.throws(()=>prepareAndroid(f.project,f.tools,f.aliases),/keystore/);assert.equal(fs.readFileSync(file,'utf8'),before);
  assert.equal(fs.existsSync(f.aliases),false);
 }finally{f.cleanup();}
});

test('unowned or differently owned ASCII alias folders cannot be reused or retargeted',()=>{
 const f=fixture();try{
  const aliases=createAndroidAliases(f.project,f.tools,f.aliases),file=path.join(f.proj,'gradle.properties'),before=fs.readFileSync(file,'utf8');
  const owner=JSON.parse(fs.readFileSync(aliases.ownerFile,'utf8'));owner.sourceProject=path.join(f.temporary,'another-project');fs.writeFileSync(aliases.ownerFile,JSON.stringify(owner));
  assert.throws(()=>prepareAndroid(f.project,f.tools,f.aliases),/belongs to another/);assert.equal(fs.readFileSync(file,'utf8'),before);
  fs.unlinkSync(aliases.ownerFile);assert.throws(()=>prepareAndroid(f.project,f.tools,f.aliases),/no ownership metadata/);assert.equal(fs.readFileSync(file,'utf8'),before);
 }finally{f.cleanup();}
});
