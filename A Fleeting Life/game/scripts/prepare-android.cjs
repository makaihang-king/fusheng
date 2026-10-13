'use strict';
const fs=require('fs'),path=require('path'),crypto=require('crypto'),{execFileSync}=require('child_process');
const defaultRoot=path.resolve(__dirname,'..');

// Properties.load decodes Unicode escapes and escaped separators. Forward
// slashes avoid backslash escape sequences being mistaken for path characters.
function propertyValue(value){
 return value.replace(/\\/g,'/').replace(/[:=#!]/g,c=>'\\'+c)
  .replace(/[^\x00-\x7f]/g,c=>'\\u'+c.charCodeAt(0).toString(16).padStart(4,'0'));
}
function setProperty(raw,key,value){
 const line=key+'='+propertyValue(value),pattern=new RegExp('^'+key.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')+'[ \t]*[=:].*$','m');
 return pattern.test(raw)?raw.replace(pattern,()=>line):raw.replace(/\s*$/,'')+'\n'+line+'\n';
}
function requirePath(file,directory){
 if(!fs.existsSync(file)||(directory?!fs.statSync(file).isDirectory():!fs.statSync(file).isFile()))throw Error('Required Android '+(directory?'directory':'file')+' is missing: '+file);
 return fs.realpathSync(file);
}
function samePath(a,b){return process.platform==='win32'?a.toLowerCase()===b.toLowerCase():a===b;}
function createAndroidAliases(root=defaultRoot,toolRoot=process.env.FLEETING_TOOL_ROOT?path.resolve(process.env.FLEETING_TOOL_ROOT):path.resolve(root,'..'),aliasBase=process.env.FLEETING_ASCII_ALIAS_ROOT){
 root=fs.realpathSync(root);toolRoot=fs.realpathSync(toolRoot);
 const sdk=requirePath(path.join(toolRoot,'android/android-sdk'),true);
 const ndk=requirePath(path.join(sdk,'ndk/28.2.13676358'),true);
 const jdk=requirePath(path.join(toolRoot,'android/jdk-17.0.20.1+1'),true);
 requirePath(path.join(jdk,'bin/java.exe'),false);
 const creator=requirePath(path.join(toolRoot,'需要的软件/CocosCreator/3.8.8'),true);
 requirePath(path.join(creator,'CocosCreator.exe'),false);
 requirePath(path.join(creator,'resources/tools/keystore/debug.keystore'),false);
 const engine=requirePath(path.join(toolRoot,'需要的软件/CocosCreator/3.8.8/resources/resources/3d/engine'),true);
 requirePath(path.join(engine,'native'),true);
 aliasBase=path.resolve(aliasBase||path.join(path.parse(root).root,'fleeting-build-links'));
 if(/[^\x20-\x7e]/.test(aliasBase))throw Error('Android alias root must be an absolute ASCII path: '+aliasBase);
 const key=crypto.createHash('sha256').update(process.platform==='win32'?root.toLowerCase():root).digest('hex').slice(0,16);
 const folder=path.join(aliasBase,'project-'+key),ownerFile=path.join(folder,'owner.json');
 const sourceAliases={project:root,creator,engine,sdk,jdk};
 const owner={schema:1,purpose:'fleeting-life-android-build-junctions',sourceProject:root,sourceToolRoot:toolRoot,aliases:sourceAliases};
 if(fs.existsSync(folder)){
  if(!fs.existsSync(ownerFile))throw Error('Existing Android alias folder has no ownership metadata: '+folder);
  const previous=JSON.parse(fs.readFileSync(ownerFile,'utf8'));
  if(previous.schema!==owner.schema||previous.purpose!==owner.purpose||!samePath(previous.sourceProject||'',root)||!samePath(previous.sourceToolRoot||'',toolRoot))throw Error('Android alias folder belongs to another project or tool root: '+folder);
 }
 // Check every existing entry before creating anything. Never replace a user's
 // directory, retarget a junction, or hide a dangling link behind existsSync.
 for(const [name,target] of Object.entries(sourceAliases)){
  const alias=path.join(folder,name);let stat;
  try{stat=fs.lstatSync(alias);}catch(error){if(error.code!=='ENOENT')throw error;}
  if(stat&&(!stat.isSymbolicLink()||!fs.existsSync(alias)||!samePath(fs.realpathSync(alias),target)))throw Error('Android alias is not the expected source junction: '+alias);
 }
 fs.mkdirSync(folder,{recursive:true});
 if(!fs.existsSync(ownerFile))fs.writeFileSync(ownerFile,JSON.stringify(owner,null,2)+'\n',{flag:'wx'});
 for(const [name,target] of Object.entries(sourceAliases)){
  const alias=path.join(folder,name);if(!fs.existsSync(alias))fs.symlinkSync(target,alias,'junction');
  if(!samePath(fs.realpathSync(alias),target))throw Error('Android alias verification failed: '+alias);
 }
 const result={sourceProject:root,sourceToolRoot:toolRoot,aliasFolder:folder,ownerFile,project:path.join(folder,'project'),creator:path.join(folder,'creator'),engine:path.join(folder,'engine'),sdk:path.join(folder,'sdk'),jdk:path.join(folder,'jdk')};
 result.ndk=path.join(result.sdk,path.relative(sdk,ndk));result.javaExe=path.join(result.jdk,'bin/java.exe');result.creatorExe=path.join(result.creator,'CocosCreator.exe');result.keystore=path.join(result.creator,'resources/tools/keystore/debug.keystore');
 for(const value of Object.values(result).filter(value=>typeof value==='string'&&!samePath(value,root)&&!samePath(value,toolRoot)))if(/[^\x20-\x7e]/.test(value))throw Error('Android compilation path is not ASCII: '+value);
 return result;
}
function prepareAndroid(root=defaultRoot,toolRoot=process.env.FLEETING_TOOL_ROOT?path.resolve(process.env.FLEETING_TOOL_ROOT):path.resolve(root,'..'),aliasBase=process.env.FLEETING_ASCII_ALIAS_ROOT){
 root=fs.realpathSync(root);toolRoot=fs.realpathSync(toolRoot);
 const project=requirePath(path.join(root,'build/android/proj'),true);
 requirePath(path.join(root,'native/engine/android'),true);
 const cfg=requirePath(path.join(project,'cfg.cmake'),false);
 const properties=requirePath(path.join(project,'gradle.properties'),false);
 const stringsDir=requirePath(path.join(project,'res/values'),true);
 const aliases=createAndroidAliases(root,toolRoot,aliasBase);
 const normalized=path.join(aliases.engine,'native').replace(/\\/g,'/');
 const nativeDir=path.join(aliases.project,'native/engine/android');
 const resPath=path.join(aliases.project,'build/android');
 let gradle=fs.readFileSync(properties,'utf8');
 for(const [key,value] of Object.entries({COCOS_ENGINE_PATH:normalized,RES_PATH:resPath,NATIVE_DIR:nativeDir,RELEASE_STORE_FILE:aliases.keystore}))gradle=setProperty(gradle,key,value);
 fs.writeFileSync(properties,gradle.replace(/[^\x00-\x7f]/g,c=>'\\u'+c.charCodeAt(0).toString(16).padStart(4,'0')));
 const local=path.join(project,'local.properties');
 fs.writeFileSync(local,setProperty(fs.existsSync(local)?fs.readFileSync(local,'utf8'):'','sdk.dir',aliases.sdk)
  .replace(/[^\x00-\x7f]/g,c=>'\\u'+c.charCodeAt(0).toString(16).padStart(4,'0')));
 let cmake=fs.readFileSync(cfg,'utf8');
 if(!/set\(COCOS_X_PATH "[^"]+"\)/.test(cmake))throw Error('Android CMake template has no COCOS_X_PATH setting: '+cfg);
 cmake=cmake.replace(/set\(COCOS_X_PATH "[^"]+"\)/,'set(COCOS_X_PATH "'+normalized+'")');fs.writeFileSync(cfg,cmake);
 fs.writeFileSync(path.join(stringsDir,'strings.xml'),'<?xml version="1.0" encoding="UTF-8"?><resources><string name="app_name" translatable="false">浮生</string></resources>');
 return {...aliases,toolRoot,sdk:aliases.sdk,engine:normalized,nativeDir,resPath,keystore:aliases.keystore,gradleProject:path.join(aliases.project,'build/android/proj')};
}
function compressScriptUuid(uuid){
 const hex=uuid.replace(/-/g,'');if(!/^[a-f\d]{32}$/i.test(hex))throw Error('Invalid source script UUID: '+uuid);
 const alphabet='ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/',prefix=hex.slice(0,5);
 let result=prefix;for(let i=5;i<32;i+=3){const value=parseInt(hex.slice(i,i+3),16);result+=alphabet[value>>6]+alphabet[value&63];}return result;
}
function fileSha(file){return crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');}
function startupSourceSha(root){
 const files=['assets/scenes/Main.scene','assets/scenes/Main.scene.meta'];
 for(const file of fs.readdirSync(path.join(root,'assets/scripts')).filter(file=>file.endsWith('.ts')).sort()){
  files.push('assets/scripts/'+file);if(fs.existsSync(path.join(root,'assets/scripts',file+'.meta')))files.push('assets/scripts/'+file+'.meta');
 }
 return Object.fromEntries(files.map(file=>[file,fileSha(path.join(root,file))]));
}
function hasAttachedBootstrap(scene,uuid){
 if(!Array.isArray(scene))return false;
 if(scene[0]&&typeof scene[0]==='object'&&!Array.isArray(scene[0])){
  const node=scene.find(record=>record&&record.__type__==='cc.Node'&&record._name==='Game');
  return !!node&&Array.isArray(node._components)&&node._components.length>0&&node._components.every(component=>component!==null)&&node._components.some(component=>{
   const value=component&&Number.isInteger(component.__id__)?scene[component.__id__]:component;return value&&value.__type__===uuid;
  });
 }
 // Creator 3.8 compiled JSON: class table, instance masks and nested instances.
 const types=scene[3],masks=scene[4],instances=scene[5];
 if(!Array.isArray(types)||!Array.isArray(masks)||!Array.isArray(instances)||!types.some(type=>type[0]===uuid))return false;
 const info=record=>{
  if(!Array.isArray(record)||!Number.isInteger(record[0]))return null;
  const mask=masks[record[0]],type=mask&&types[mask[0]];if(!Array.isArray(mask)||!Array.isArray(type)||!Array.isArray(type[1]))return null;
  const values={};for(let i=1;i<mask.length-1;i++)if(type[1][mask[i]]!==undefined)values[type[1][mask[i]]]=record[i];
  return {type:type[0],values};
 };
 const containsType=value=>Array.isArray(value)&&(info(value)?.type===uuid||value.some(containsType));
 let attached=false;
 const walk=value=>{
  if(!Array.isArray(value))return;
  const record=info(value);if(record?.type==='cc.Node'&&record.values._name==='Game'){
   const components=record.values._components;
   if(Array.isArray(components)&&components.length>0&&components.every(component=>component!==null)&&containsType(components))attached=true;
  }
  value.forEach(walk);
 };
 walk(instances);return attached;
}
function validateBootstrapArtifacts(root=defaultRoot,dataRoot=path.join(root,'build/android/data'),out=path.join(root,'build/qa/android-startup-artifacts.json')){
 root=fs.realpathSync(root);dataRoot=fs.realpathSync(dataRoot);
 const sourceMeta=JSON.parse(fs.readFileSync(path.join(root,'assets/scripts/Bootstrap.ts.meta'),'utf8'));
 const bootstrapUuid=compressScriptUuid(sourceMeta.uuid),mainUuid=JSON.parse(fs.readFileSync(path.join(root,'assets/scenes/Main.scene.meta'),'utf8')).uuid;
 const settingsFile=path.join(dataRoot,'src/settings.json'),settings=JSON.parse(fs.readFileSync(settingsFile,'utf8'));
 if(settings.launch?.launchScene!=='db://assets/scenes/Main.scene')throw Error('Startup settings do not launch the current Main.scene.');
 const mainPreload=settings.assets?.preloadBundles?.find(bundle=>bundle.bundle==='main');
 if(!mainPreload)throw Error('Startup settings do not preload the main bundle.');
 const version=mainPreload.version||settings.assets?.bundleVers?.main||'',platform=settings.engine?.platform;
 const mainDir=path.join(dataRoot,'assets/main'),configFile=path.join(mainDir,(platform==='android'?'cc.config':'config')+(version?'.'+version:'')+'.json');
 const config=JSON.parse(fs.readFileSync(configFile,'utf8'));
 if(config.name!=='main'||config.hasPreloadScript!==true)throw Error('Startup main bundle does not load its preload script.');
 if(config.encrypted)throw Error('Encrypted startup script cannot be checked as JavaScript.');
 if(config.scenes?.['db://assets/scenes/Main.scene']!==mainUuid)throw Error('Startup bundle does not map the current Main.scene UUID.');
 const sceneFile=path.join(mainDir,config.importBase||'import',mainUuid.slice(0,2),mainUuid+'.json');
 const scene=JSON.parse(fs.readFileSync(sceneFile,'utf8'));
 if(!hasAttachedBootstrap(scene,bootstrapUuid))throw Error('Startup Main.scene has no attached non-null Bootstrap component: '+bootstrapUuid);
 // Official JSB downloadBundle resolves hasPreloadScript to this index file.
 // settings.scripting.scriptPackages can contain shared helpers, not the actor.
 const bundleFile=path.join(mainDir,'index'+(version?'.'+version:'')+'.js');
 const script=fs.readFileSync(bundleFile,'utf8');
 const registrations=[...script.matchAll(/_RF\.push\s*\(\s*[^,]*,\s*(['"])([^'"]+)\1\s*,\s*(['"])([^'"]+)\3/g)];
 if(!registrations.some(match=>match[2]===bootstrapUuid&&match[4]==='Bootstrap'))throw Error('Startup JavaScript is missing the current Bootstrap RF UUID registration: '+bootstrapUuid);
 if(!/ccclass\s*\(\s*['"]Bootstrap['"]\s*\)/.test(script))throw Error('Startup JavaScript is missing the Bootstrap class decorator.');
 const report={generatedAt:new Date().toISOString(),passed:true,scope:'Current Creator startup loading chain, artifacts and source hashes; not native playback.',sourceProject:root,dataRoot,mainUuid,bootstrapSourceUuid:sourceMeta.uuid,bootstrapUuid,sourceSha256:startupSourceSha(root),artifacts:[settingsFile,configFile,sceneFile,bundleFile].map(file=>({path:file,relative:path.relative(dataRoot,file).replace(/\\/g,'/'),sha256:fileSha(file),bytes:fs.statSync(file).size})),startupChain:{platform,mainBundleVersion:version,launchScene:settings.launch.launchScene,preloadBundle:mainPreload,hasPreloadScript:config.hasPreloadScript,scriptPackages:settings.scripting?.scriptPackages||[],bootstrapEntry:path.relative(dataRoot,bundleFile).replace(/\\/g,'/'),officialLoader:'Cocos 3.8.8 platforms/native/engine/jsb-loader.js downloadBundle: hasPreloadScript -> assets/main/index.js; cocos/game/game.ts _loadProjectBundles: settings.assets.preloadBundles'},checks:{settingsLaunchMain:true,preloadMain:true,mainHasPreloadScript:true,currentMainUuid:true,attachedNonNullBootstrap:true,currentScriptRfRegistration:true,bootstrapDecorator:true}};
 if(out){fs.mkdirSync(path.dirname(out),{recursive:true});fs.writeFileSync(out,JSON.stringify(report,null,2)+'\n');}return report;
}
function validateApkBootstrap(root=defaultRoot,apk,proofFile=path.join(root,'build/qa/android-startup-artifacts.json'),out=path.join(root,'build/qa/android-startup-apk.json')){
 const proof=typeof proofFile==='string'?JSON.parse(fs.readFileSync(proofFile,'utf8')):proofFile;
 if(!proof?.passed)throw Error('APK startup proof is missing or did not pass.');
 const current=validateBootstrapArtifacts(root,proof.dataRoot,null);
 if(proof.bootstrapUuid!==current.bootstrapUuid||proof.mainUuid!==current.mainUuid||JSON.stringify(proof.sourceSha256)!==JSON.stringify(current.sourceSha256))throw Error('Startup source changed after Creator generation; rebuild before APK delivery.');
 if(JSON.stringify(proof.artifacts)!==JSON.stringify(current.artifacts))throw Error('Startup artifacts changed after the pre-Gradle check.');
 requirePath(apk,false);
 const zipScript=`$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'
Add-Type -AssemblyName System.IO.Compression.FileSystem
$archive = [IO.Compression.ZipFile]::OpenRead($env:FLEETING_APK_AUDIT_PATH)
try {
 $wanted = $env:FLEETING_STARTUP_ARTIFACTS | ConvertFrom-Json
 $rows = @()
 foreach ($relative in $wanted) {
  $matches = @($archive.Entries | Where-Object { $entryName = $_.FullName.Replace([char]92, [char]47); $entryName -eq $relative -or $entryName.EndsWith('/' + $relative) })
  if ($matches.Count -ne 1) { throw ('Expected one actual startup ZIP entry: ' + $relative + ', found ' + $matches.Count) }
  $stream = $matches[0].Open(); $sha = [Security.Cryptography.SHA256]::Create()
  try { $digest = ([BitConverter]::ToString($sha.ComputeHash($stream))).Replace('-', '').ToLowerInvariant() } finally { $stream.Dispose(); $sha.Dispose() }
  $rows += [PSCustomObject]@{relative=$relative;entry=$matches[0].FullName;bytes=$matches[0].Length;sha256=$digest}
 }
 ConvertTo-Json -InputObject $rows -Compress
} finally { $archive.Dispose() }
`;
 const output=execFileSync('powershell.exe',['-NoProfile','-NonInteractive','-EncodedCommand',Buffer.from(zipScript,'utf16le').toString('base64')],{windowsHide:true,encoding:'utf8',maxBuffer:4*1024*1024,env:{...process.env,FLEETING_APK_AUDIT_PATH:path.resolve(apk),FLEETING_STARTUP_ARTIFACTS:JSON.stringify(current.artifacts.map(artifact=>artifact.relative))}});
 const entries=JSON.parse(output.trim());
 for(const artifact of current.artifacts){const entry=entries.find(entry=>entry.relative===artifact.relative);if(!entry||entry.bytes<=0||entry.sha256!==artifact.sha256)throw Error('APK startup bytes differ from the checked Creator artifact: '+artifact.relative);}
 const report={generatedAt:new Date().toISOString(),passed:true,scope:'Actual APK ZIP startup scene and JavaScript match checked Creator artifacts; not native playback.',apk:path.resolve(apk),apkSha256:fileSha(apk),mainUuid:current.mainUuid,bootstrapUuid:current.bootstrapUuid,sourceSha256:current.sourceSha256,entries};
 if(out){fs.mkdirSync(path.dirname(out),{recursive:true});fs.writeFileSync(out,JSON.stringify(report,null,2)+'\n');}return report;
}
module.exports={prepareAndroid,createAndroidAliases,propertyValue,setProperty,compressScriptUuid,hasAttachedBootstrap,validateBootstrapArtifacts,validateApkBootstrap};
if(require.main===module){
 const command=process.argv[2],special=['--paths-only','--check-startup','--check-apk-startup'].includes(command),args=process.argv.slice(special?3:2);
 try{
  const result=command==='--paths-only'?createAndroidAliases(...args):command==='--check-startup'?validateBootstrapArtifacts(...args):command==='--check-apk-startup'?validateApkBootstrap(...args):prepareAndroid(...args);
  console.log(JSON.stringify(result));
 }catch(error){
  if(command==='--check-startup'||command==='--check-apk-startup'){
   const root=args[0]||defaultRoot,out=command==='--check-startup'?(args[2]||path.join(root,'build/qa/android-startup-artifacts.json')):(args[3]||path.join(root,'build/qa/android-startup-apk.json'));
   fs.mkdirSync(path.dirname(out),{recursive:true});fs.writeFileSync(out,JSON.stringify({generatedAt:new Date().toISOString(),passed:false,scope:'Startup guard rejected; this is not a deliverable APK proof.',error:error.message},null,2)+'\n');
  }
  console.error(error.message);process.exitCode=1;
 }
}
