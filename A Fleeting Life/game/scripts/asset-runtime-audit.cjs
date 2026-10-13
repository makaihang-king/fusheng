'use strict';
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const root=path.resolve(__dirname,'..');
const {ART_MANIFEST,CHARACTER_ANIMATIONS,ENDING_MEDIA,XIAOMAN_IDENTITY}=require('../build/Content.js');
const resources=path.join(root,'assets','resources'),seen=new Set(),missing=[],duplicates=[];
for(const entry of ART_MANIFEST){
 if(seen.has(entry.key))duplicates.push(entry.key);seen.add(entry.key);
 if(entry.path&&!fs.existsSync(path.join(resources,entry.path)))missing.push({key:entry.key,path:entry.path});
}
const actions={};
for(const [action,spec] of Object.entries(CHARACTER_ANIMATIONS)){
 const frames=[];
 for(let i=0;i<spec.frames;i++){
  const key=`character.pixel.${action}.${String(i).padStart(2,'0')}`,entry=ART_MANIFEST.find(entry=>entry.key===key);
  if(!entry){missing.push({key,path:'manifest entry absent'});continue;}
  const file=path.join(resources,entry.path);if(!fs.existsSync(file))continue;
  const bytes=fs.readFileSync(file),png=bytes.subarray(1,4).toString()==='PNG';
  frames.push({key,width:png?bytes.readUInt32BE(16):null,height:png?bytes.readUInt32BE(20):null,sha256:crypto.createHash('sha256').update(bytes).digest('hex')});
 }
 actions[action]={...spec,seconds:Number((spec.frames/spec.fps).toFixed(6)),frames};
}
const endings=Object.entries(ENDING_MEDIA).map(([key,media])=>{
 const file=path.join(resources,media.path),present=fs.existsSync(file);
 if(!present)missing.push({key,path:media.path});
 return {key,...media,bytes:present?fs.statSync(file).size:0,sha256:present?crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex'):null};
});
const report={checkedAt:new Date().toISOString(),identity:XIAOMAN_IDENTITY,manifestEntries:ART_MANIFEST.length,missing,duplicates,actions,endings};
const destination=path.join(root,'build','qa','asset-runtime-audit.json');fs.mkdirSync(path.dirname(destination),{recursive:true});fs.writeFileSync(destination,JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify({report:destination,entries:ART_MANIFEST.length,actions:Object.keys(actions).length,endings:endings.length,missing,duplicates}));
if(missing.length||duplicates.length)process.exitCode=1;
