const fs=require('fs'),path=require('path');
const root=path.resolve(__dirname,'..');
const candidates=[process.env.TYPESCRIPT_PATH,path.resolve(root,'../需要的软件/CocosCreator/3.8.8/resources/app.asar.unpacked/node_modules/typescript'),path.resolve(root,'node_modules/typescript')].filter(Boolean);
let ts;for(const file of candidates){try{ts=require(file);break;}catch{}}if(!ts)throw new Error('TypeScript unavailable. Install Cocos Creator 3.8.8 or set TYPESCRIPT_PATH.');
const source=path.join(root,'assets/scripts');const files=fs.readdirSync(source).filter(n=>n.endsWith('.ts')&&!['Bootstrap.ts','WebMoments.ts'].includes(n));
const options={target:ts.ScriptTarget.ES2020,module:ts.ModuleKind.CommonJS,strict:true,esModuleInterop:true,skipLibCheck:true,noEmit:true};
const program=ts.createProgram(files.map(n=>path.join(source,n)),options);const diagnostics=ts.getPreEmitDiagnostics(program);
if(diagnostics.length){console.error(ts.formatDiagnosticsWithColorAndContext(diagnostics,{getCurrentDirectory:()=>root,getCanonicalFileName:n=>n,getNewLine:()=> '\n'}));process.exit(1);}
const out=path.join(root,'build');fs.mkdirSync(out,{recursive:true});let bundle="(function(global){'use strict';const modules={},cache={};\n";
for(const name of files){const src=fs.readFileSync(path.join(source,name),'utf8');const output=ts.transpileModule(src,{compilerOptions:{...options,noEmit:false},fileName:name}).outputText;const id=name.slice(0,-3);fs.writeFileSync(path.join(out,id+'.js'),output);bundle+='modules['+JSON.stringify(id)+']=function(require,module,exports){\n'+output+'\n};\n';}
bundle+="function req(id){id=id.replace(/^\\.\\//,'').replace(/\\.js$/,'');if(cache[id])return cache[id].exports;if(!modules[id])throw Error('Missing module '+id);const m=cache[id]={exports:{}};modules[id](req,m,m.exports);return m.exports;}const content=req('Content'),music=req('SceneMusic');global.FleetingLife={...req('Game'),...music,...req('RainWeather'),...req('SceneBackdrop'),ART_MANIFEST:content.ART_MANIFEST,ART_PIXEL_DENSITY:content.ART_PIXEL_DENSITY,ENDING_MEDIA:content.ENDING_MEDIA};})(globalThis);\n";
fs.mkdirSync(path.join(root,'build/web'),{recursive:true});fs.writeFileSync(path.join(root,'build/web/game.js'),bundle);
console.log('Checked and compiled '+files.length+' TypeScript modules. Preview: http://127.0.0.1:4318/preview/');
