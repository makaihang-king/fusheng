'use strict';
// 汇总已经完成的实际验收；任何缺项或旧成片播放报告都会中止。
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),assert=require('node:assert/strict');
const root=path.resolve(__dirname,'..'),qa=path.join(root,'build/qa');
const read=relative=>JSON.parse(fs.readFileSync(path.join(qa,relative),'utf8'));
const hash=file=>crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
const primarySources=['assets/scripts/Content.ts','assets/scripts/Game.ts','assets/scripts/Geometry.ts',
 'assets/scripts/ObstacleLogic.ts','assets/scripts/ObstacleRendering.ts','assets/scripts/SceneGround.ts',
 'assets/scripts/Renderer.ts','assets/scripts/Bootstrap.ts','assets/scripts/XiaomanFallback.ts',
 'preview/host.js','scripts/xiaoman_rig.py','scripts/generate-ending-films.py',
 'assets/scenes/Main.scene','assets/scripts/Bootstrap.ts.meta','scripts/build-cocos.ps1','scripts/prepare-android.cjs',
 'scripts/obstacle-qwen-v2-plan.cjs','scripts/generate-obstacle-qwen-v2.py','scripts/audit-ending-media.py'];
function scriptFiles(directory){return fs.readdirSync(path.join(root,directory),{withFileTypes:true}).flatMap(e=>{
 const relative=directory+'/'+e.name;return e.isDirectory()?scriptFiles(relative):/\.ts(?:\.meta)?$/.test(e.name)?[relative]:[];
});}
const applicationSources=[...new Set([...scriptFiles('assets/scripts'),'assets/scenes/Main.scene','assets/scenes/Main.scene.meta','preview/host.js'])];
const sources=[...new Set([...primarySources,...applicationSources])];
const latestApplicationChange=Math.max(...applicationSources.map(p=>fs.statSync(path.join(root,p)).mtimeMs));
const fresh=(when,label)=>assert.ok(Date.parse(when)>=latestApplicationChange,label+' must follow current application sources');
const units=fs.readFileSync(path.join(qa,'current-unit-tests.log'),'utf8');
const total=Number(units.match(/(?:#|ℹ) tests (\d+)/)?.[1]),passed=Number(units.match(/(?:#|ℹ) pass (\d+)/)?.[1]);
const failed=Number(units.match(/(?:#|ℹ) fail (\d+)/)?.[1]);
assert.ok(total>0&&passed===total&&failed===0,'complete unit suite must pass');
assert.ok(fs.statSync(path.join(qa,'current-unit-tests.log')).mtimeMs>=latestApplicationChange,'unit suite must follow current application sources');
const assets=read('asset-runtime-audit.json');assert.deepEqual(assets.missing,[]);assert.deepEqual(assets.duplicates,[]);
fresh(assets.checkedAt,'asset audit');
const qwen=read('ending-films/qwen-plates/executed-generation-audit.json');
assert.equal(qwen.length,17);assert.ok(qwen.every(j=>j.state==='complete'&&j.executedSeed===j.seed&&j.executedSteps===25));
const h3=read('ending-films/h3-backgrounds/executed-generation-audit.json');
assert.equal(h3.completed,16);assert.equal(h3.partial,false);assert.ok(h3.jobs.every(j=>j.fullDecode&&j.visuallyAccepted));
const media=read('ending-films/final-media-audit.json');assert.equal(media.movieCount,28);assert.equal(media.fallbackImageCount,672);assert.equal(media.partial,false);
const films=read('ending-films/generation-manifest.json');assert.equal(films.length,28);
const latestFilm=Math.max(...films.map(f=>fs.statSync(path.join(root,f.path)).mtimeMs));
const browser=[];
for(const host of ['canvas','cocos']){
 const report=read('ending-playback-'+host+'/report.json');
 assert.equal(report.endings.length,7);assert.equal(report.outfits.length,4);
 assert.ok(Date.parse(report.capturedAt)>=latestFilm,'real playback must follow the final film generation');
 fresh(report.capturedAt,host+' film playback');
 if(host==='cocos')assert.ok(Date.parse(report.capturedAt)>=fs.statSync(path.join(root,'assets/scripts/Bootstrap.ts')).mtimeMs,'Cocos playback must follow the final host fix');
 for(const key of ['errors','consoleErrors','networkErrors'])assert.deepEqual(report[key],[]);
 browser.push({host,url:report.url,report:'ending-playback-'+host+'/report.json',
  realFilms:7,outfitSelections:4,completedAt:report.completedAt});
}
const flow=read('browser-flow-report.json');assert.equal(flow.passed,flow.total);assert.ok(flow.total>=23);
fresh(flow.capturedAt||flow.generatedAt,'Canvas flow');
const runtime=read('cocos-runtime-results.json');assert.ok(runtime.checks.length>=23&&runtime.checks.every(c=>c.pass));
fresh(runtime.capturedAt,'Cocos runtime');
assert.equal(runtime.sourceBootstrapSha256,hash(path.join(root,'assets/scripts/Bootstrap.ts')));
assert.ok(fs.statSync(path.join(qa,'cocos-runtime-results.json')).mtimeMs>=fs.statSync(path.join(root,'assets/scripts/Bootstrap.ts')).mtimeMs,'Cocos runtime report must follow the final host fix');
for(const r of [flow,runtime])for(const key of ['errors','consoleErrors','networkErrors'])assert.deepEqual(r[key],[]);
const personal=[];
for(const host of ['canvas','cocos-web']){
 const report=read('personal-finale/'+host+'-report.json');assert.equal(report.passed,true);
 fresh(report.generatedAt,host+' personal replay');
 for(const key of ['errors','consoleErrors','networkErrors'])assert.deepEqual(report[key],[]);
 assert.equal(report.finished.screen,'hall');assert.equal(report.finished.savedFinalePlayed,true);
 assert.equal(report.recordings.clips.length,3);assert.deepEqual(report.reloaded,report.recordings);
 assert.ok(report.recordings.clips.every(c=>/^[a-f0-9]{64}$/.test(c.sha256)&&c.isBlob&&c.blobBytes>100));
 assert.ok(Math.abs(report.finished.finaleTime-15)<.05);
 if(host==='cocos-web')assert.ok(fs.statSync(path.join(qa,'personal-finale/'+host+'-report.json')).mtimeMs>=fs.statSync(path.join(root,'assets/scripts/Bootstrap.ts')).mtimeMs,'personal replay must follow the final host fix');
 personal.push({host,report:'personal-finale/'+host+'-report.json',finaleSeconds:report.finished.finaleTime});
}
const model=JSON.parse(fs.readFileSync(path.join(root,'xiaoman-model.json'),'utf8'));
assert.equal(model.sourceHash,hash(path.join(root,'scripts/xiaoman_rig.py')));
assert.equal(Object.keys(model.actions).length,15);assert.equal(model.actions.run.fps,36);
assert.equal(model.actions.runStart.frames,6);assert.equal(model.actions.runStart.fps,60);
for(const [name,action] of Object.entries(model.actions)){assert.equal(assets.actions[name].frames.length,action.frames);assert.equal(assets.actions[name].fps,action.fps);}
assert.equal(media.rigSha256,model.sourceHash);
assert.equal(media.generatorSha256,hash(path.join(root,'scripts/generate-ending-films.py')));
for(const film of films){assert.equal(film.rigSha256,model.sourceHash);assert.equal(film.generatorSha256,media.generatorSha256);
 assert.equal(film.gaitRevision,'world-distance-walk-run-v2');assert.equal(film.sha256,hash(path.join(root,film.path)));}
for(const film of media.films){assert.deepEqual(film.actualEncodedFrameIndices,Array.from({length:24},(_,i)=>i*15));
 assert.deepEqual(film.actualEncodedFrameSeconds,Array.from({length:24},(_,i)=>i/2));assert.equal(film.decodedRgbFrameSha256.length,24);
 assert.equal(film.contactSha256,hash(film.actualEncodedFrameContact));}
const gait=read('xiaoman-gait-revision/gait-report.json');
assert.equal(gait.sourceHash,model.sourceHash);assert.equal(gait.canonicalHash,model.canonicalHash);
assert.deepEqual(gait.actions,model.actions);assert.equal(gait.oppositeArms,true);assert.equal(gait.loopSeamIdentical,true);
assert.equal(gait.entryEndpointPixelsIdentical,true);assert.equal(gait.actualIKSupportChecks.length,12);
assert.ok(gait.actualIKSupportChecks.every(c=>c.worldXDrift<1e-8&&c.ankleYDrift<1e-8));
const endingGaitProofs=[];
for(const skin of ['base','waistJacket','raincoat','namelessNotebook']){
 const relative='gait-revision/new-gait-proof-'+skin+'.json',proof=read(relative);
 assert.equal(proof.rigSha256,model.sourceHash);assert.equal(proof.generatorSha256,media.generatorSha256);
 assert.equal(proof.gaitRevision,'world-distance-walk-run-v2');assert.equal(proof.routes.length,14);assert.equal(proof.encodedFilms.length,7);
 assert.ok(proof.routes.every(r=>r.fixedBoneLengths&&r.continuousActorX&&r.maxGroundedAnkleErrorPx<1e-6&&r.maxRenderedRoundingErrorPx<1));
 for(const film of proof.encodedFilms){const row=films.find(r=>r.skin===skin&&r.id===film.id);assert.ok(row);assert.equal(film.sha256,row.sha256);
  assert.equal(film.actualFrames.length,6);assert.ok(film.supportWorldDriftPx<1e-6);assert.ok(film.renderedPixelSpanPx<=1);}
 endingGaitProofs.push({path:'build/qa/'+relative,sha256:hash(path.join(qa,relative))});
}
const encodedGait=read('gait-revision/final-gait-audit.json');
assert.equal(encodedGait.passed,true);assert.equal(encodedGait.rigSha256,model.sourceHash);
assert.equal(encodedGait.generatorSha256,media.generatorSha256);assert.equal(encodedGait.filmCount,28);assert.equal(encodedGait.routeCount,14);
assert.equal(encodedGait.actualEncodedStanceFrames,168);assert.equal(encodedGait.actualEncodedTransitionFrames,168);
for(const evidence of encodedGait.films){const row=films.find(r=>r.skin===evidence.skin&&r.id===evidence.id);assert.ok(row);assert.equal(evidence.sha256,row.sha256);
 assert.equal(evidence.stanceContactSha256,hash(path.join(root,evidence.stanceContact)));
 assert.equal(evidence.transitionContactSha256,hash(path.join(root,evidence.transitionContact)));
 for(const frame of [...evidence.stanceDecodedFrameSha256,...evidence.transitionDecodedFrameSha256])assert.equal(frame.sha256,hash(path.join(root,frame.path)));
 assert.equal(evidence.transitionProvenanceSha256,hash(path.join(root,evidence.transitionProvenancePath)));
}
const material=read('independent-obstacle-v2/final-materials/report.json'),content=require(path.join(root,'build/Content.js'));
const authoredVariants=new Set([...Object.values(content.SEGMENTS),...Object.values(content.BRANCHES)].flatMap(r=>r.obstacles||[]).map(o=>o.kind+'|'+o.label));
assert.equal(material.failedCount,0);assert.equal(material.caseCount,authoredVariants.size);assert.equal(material.cases.length,authoredVariants.size);
assert.deepEqual(new Set(material.cases.map(c=>c.kind+'|'+c.label)),authoredVariants);assert.ok(material.cases.every(c=>c.errors.length===0&&c.colliderMaterial.opaquePixels>0&&c.standingHitMaterial.opaquePixels>0));
for(const [name,digest] of Object.entries(material.sourceHashes))assert.equal(digest,hash(path.join(root,'assets/scripts',name)));
const obstacleSprites=content.ART_MANIFEST.filter(e=>e.key.startsWith('props.obstacles.v2.'));
assert.equal(Object.keys(material.assetHashes).length,obstacleSprites.length);
for(const entry of obstacleSprites)assert.equal(material.assetHashes[entry.key],hash(path.join(root,'assets/resources',entry.path)));
const apk=fs.readdirSync(path.join(root,'dist')).filter(p=>p.endsWith('-debug.apk'));assert.equal(apk.length,1);
const apkPath=path.join(root,'dist',apk[0]),apkHash=hash(apkPath);
assert.ok(fs.readFileSync(path.join(root,'dist/APK-SHA256.txt'),'utf8').startsWith(apkHash));
const packaged=read('ending-films/packaged-resource-audit.json');assert.equal(packaged.passed,true);
assert.equal(packaged.targets.length,2);assert.equal(packaged.sourceHashesMatchFinalManifest,true);
assert.deepEqual(packaged.targets.map(t=>t.target).sort(),['android-apk','cocos-web']);
for(const target of packaged.targets){assert.equal(target.passed,true);assert.equal(target.matchingMovieCount,28);assert.equal(target.presentFallbackCount,672);}
assert.equal(packaged.targets.find(t=>t.target==='android-apk').apkSha256,apkHash);
const startup=read('android-startup-apk.json');assert.equal(startup.passed,true);assert.equal(startup.apkSha256,apkHash);
assert.equal(startup.sourceSha256['assets/scripts/Bootstrap.ts'],hash(path.join(root,'assets/scripts/Bootstrap.ts')));
for(const file of applicationSources.filter(p=>p.startsWith('assets/')))assert.equal(startup.sourceSha256[file],hash(path.join(root,file)),'APK source mismatch: '+file);
assert.equal(startup.entries.length,4);assert.ok(startup.entries.every(e=>e.bytes>0&&/^[a-f0-9]{64}$/.test(e.sha256)));
assert.deepEqual(startup.entries.map(e=>e.relative).sort(),[
 'assets/main/cc.config.json','assets/main/import/c7/c760c45a-125b-424e-9663-30ca12b2f19e.json',
 'assets/main/index.js','src/settings.json'].sort());
const signature=fs.readFileSync(path.join(root,'dist/APK-signature.txt'),'utf8');
assert.match(signature,/Verified using v1 scheme[^\r\n]*true/);assert.match(signature,/Verified using v2 scheme[^\r\n]*true/);
const packageInfo=read('android-final-package-info.json');assert.equal(packageInfo.passed,true);
assert.equal(packageInfo.apkSha256,apkHash);assert.equal(packageInfo.inspectionSha256,apkHash);
assert.equal(packageInfo.badgingSha256,hash(path.join(root,'dist/APK-badging.txt')));
assert.equal(packageInfo.manifestSha256,hash(path.join(root,'dist/APK-manifest.txt')));
assert.match(fs.readFileSync(path.join(root,'dist/APK-badging.txt'),'utf8'),/package: name='com\.fleetinglife\.s1'/);
const status=read('ending-films/generation-status.json');assert.equal(status.visualAccepted,true);
assert.equal(status.completed,28);assert.equal(status.decoded,true);
const visualReports=status.visualReviewReports.map(p=>({path:p,sha256:hash(path.join(root,p))}));assert.equal(visualReports.length,4);
for(const review of visualReports)assert.ok(fs.statSync(path.join(root,review.path)).mtimeMs>=latestFilm,'visual review must follow final new films: '+review.path);
const gpu=read('cocos-gpu-film-diagnosis.json');assert.equal(gpu.sourceBootstrapSha256,hash(path.join(root,'assets/scripts/Bootstrap.ts')));
fresh(gpu.capturedAt||gpu.generatedAt,'hardware surface');
assert.equal(gpu.media.status,'playing');assert.ok(gpu.media.clock>=2&&gpu.domAndGl.gl.unmaskedRenderer);
for(const key of ['errors','consoleErrors','networkErrors'])assert.deepEqual(gpu[key],[]);
const report={generatedAt:new Date().toISOString(),scope:'本机源码/资源/桌面 Edge 实播与构建；未连接 Android 设备，不代表原生真机验收。',
 unitTests:{total,passed,failed},canvasFlow:{passed:flow.passed,total:flow.total},cocosRuntime:{passed:runtime.checks.length,total:runtime.checks.length},
 model:{canonicalHash:model.canonicalHash,sourceHash:model.sourceHash,rig:model.rig,actions:model.actions,gait:gait.gait,
  gameGaitReport:'build/qa/xiaoman-gait-revision/gait-report.json',endingGaitProofs,
  actualEncodedGaitReport:'build/qa/gait-revision/final-gait-audit.json'},
 obstacleMaterials:{sprites:obstacleSprites.length,authoredVariants:material.caseCount,failed:material.failedCount,
  report:'build/qa/independent-obstacle-v2/final-materials/report.json',sha256:hash(path.join(qa,'independent-obstacle-v2/final-materials/report.json'))},
 currentH3:{acceptedJobs:h3.completed,report:'ending-films/h3-backgrounds/executed-generation-audit.json'},
 qwenReport:'ending-films/qwen-plates/executed-generation-audit.json',
 qwenCurrentImages:qwen.length,
 qwenAuditSha256:hash(path.join(qa,'ending-films/qwen-plates/executed-generation-audit.json')),
 movies:{count:media.movieCount,fallbackImages:media.fallbackImageCount,report:'ending-films/final-media-audit.json',generatorSha256:media.generatorSha256},
 browser,personal,visualReports,hardwareSurface:{report:'cocos-gpu-film-diagnosis.json',movie:'outside',seconds:gpu.media.clock,renderer:gpu.domAndGl.gl.unmaskedRenderer},
 packagedResources:{report:'ending-films/packaged-resource-audit.json',webMovies:28,apkMovies:28,fallbackImagesPerTarget:672},
 android:{path:path.relative(root,apkPath).replace(/\\/g,'/'),sha256:apkHash,bytes:fs.statSync(apkPath).size,signatureV1:true,signatureV2:true,startupSceneAndScriptChecked:true,startupReport:'android-startup-apk.json',packageInfoReport:'android-final-package-info.json',deviceVerified:false},
 sourceSha256:Object.fromEntries(sources.map(p=>[p,hash(path.join(root,p))]))};
const out=path.join(qa,'20260929-gait-obstacles-delivery-manifest.json');fs.writeFileSync(out,JSON.stringify(report,null,2));
console.log(JSON.stringify({passed:true,report:out,tests:total,movies:28,apkSha256:apkHash}));
