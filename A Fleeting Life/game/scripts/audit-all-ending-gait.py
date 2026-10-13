"""严格汇总四套实际编码步态/起停取帧证明，用于本轮交付guard。"""
import hashlib,json
from datetime import datetime,timezone
from pathlib import Path
from generate_ending_import import ending_module
f=ending_module();out=f.ROOT/'build/qa/gait-revision'
sha=lambda p:hashlib.sha256(Path(p).read_bytes()).hexdigest()
films=[];reports=[]
for skin in f.SKINS:
    reportPath=out/f'new-gait-proof-{skin}.json'
    proof=json.loads(reportPath.read_text(encoding='utf8'))
    assert proof['rigSha256']==f.RIG_SOURCE_SHA256 and proof['generatorSha256']==f.GENERATOR_SOURCE_SHA256
    assert proof['gaitRevision']==f.GAIT_REVISION and len(proof['routes'])==14
    assert {row['route'] for row in proof['routes']}==set(f.WALK_ROUTES)
    assert all(row['samples']==1001 and row['fixedBoneLengths'] and row['continuousActorX'] and row['maxGroundedAnkleErrorPx']<1e-6 and row['maxRenderedRoundingErrorPx']<.5 for row in proof['routes'])
    assert len(proof['encodedFilms'])==7
    reports.append(dict(path=str(reportPath.relative_to(f.ROOT)),sha256=sha(reportPath)))
    for id in f.IDS:
        record=f.QA/skin/f'{id}-manifest.json';manifest=json.loads(record.read_text(encoding='utf8'))
        movie=f.ROOT/manifest['path'];movieHash=sha(movie)
        assert manifest['rigSha256']==f.RIG_SOURCE_SHA256 and manifest['generatorSha256']==f.GENERATOR_SOURCE_SHA256
        assert manifest['gaitRevision']==f.GAIT_REVISION and manifest['sha256']==movieHash
        foot=next(r for r in proof['encodedFilms'] if r['id']==id and r['skin']==skin)
        transitionPath=out/'new-encoded'/skin/(id+'-transitions')/'provenance.json'
        transition=json.loads(transitionPath.read_text(encoding='utf8'))
        assert foot['sha256']==transition['sha256']==movieHash
        assert transition['rigSha256']==f.RIG_SOURCE_SHA256 and transition['generatorSha256']==f.GENERATOR_SOURCE_SHA256
        for item in foot['decodedFrameSha256']+transition['decodedFrameSha256']:
            assert sha(f.ROOT/item['path'])==item['sha256'],item['path']
            assert 0<=item['frame']<360
        assert len(foot['decodedFrameSha256'])==len(transition['decodedFrameSha256'])==6
        assert sha(f.ROOT/foot['actualEncodedContact'])==foot['contactSha256']
        assert sha(f.ROOT/transition['contact'])==transition['contactSha256']
        actualFrames=[s['frame'] for s in foot['actualFrames']]
        assert actualFrames==list(range(actualFrames[0],actualFrames[0]+6))
        assert actualFrames==[s['frame'] for s in foot['decodedFrameSha256']]
        assert transition['actualFrameIndices']==[s['frame'] for s in transition['decodedFrameSha256']]
        assert foot['supportWorldDriftPx']<1e-6 and foot['renderedPixelSpanPx']<=.5
        films.append(dict(id=id,skin=skin,path=manifest['path'],sha256=movieHash,
            rigSha256=f.RIG_SOURCE_SHA256,generatorSha256=f.GENERATOR_SOURCE_SHA256,
            manifestSha256=sha(record),stanceActualFrameIndices=actualFrames,
            stanceActualSeconds=[n/30 for n in actualFrames],stanceContact=foot['actualEncodedContact'],stanceContactSha256=foot['contactSha256'],
            stanceDecodedFrameSha256=foot['decodedFrameSha256'],supportWorldDriftPx=foot['supportWorldDriftPx'],renderedPixelSpanPx=foot['renderedPixelSpanPx'],
            transitionActualFrameIndices=transition['actualFrameIndices'],transitionActualSeconds=[n/30 for n in transition['actualFrameIndices']],
            transitionContact=transition['contact'],transitionContactSha256=transition['contactSha256'],transitionDecodedFrameSha256=transition['decodedFrameSha256'],
            transitionProvenancePath=str(transitionPath.relative_to(f.ROOT)),transitionProvenanceSha256=sha(transitionPath)))

assert len(films)==28
preflightPath=out/'new-gait-proof-preflight.json';preflight=json.loads(preflightPath.read_text(encoding='utf8'))
assert preflight['rigSha256']==f.RIG_SOURCE_SHA256 and preflight['generatorSha256']==f.GENERATOR_SOURCE_SHA256
summary=dict(generatedAt=datetime.now(timezone.utc).isoformat(),passed=True,gaitRevision=f.GAIT_REVISION,
    rigSha256=f.RIG_SOURCE_SHA256,generatorSha256=f.GENERATOR_SOURCE_SHA256,filmCount=28,
    routeCount=14,numericSamplesPerRoute=1001,numericRoutes=preflight['routes'],proofReports=reports,
    numericPreflightSha256=sha(preflightPath),actualEncodedStanceFrames=168,actualEncodedTransitionFrames=168,
    method=proof['method'],scope=proof['scope'],films=films)
path=out/'final-gait-audit.json';path.write_text(json.dumps(summary,ensure_ascii=False,indent=2),encoding='utf8')
print(json.dumps(dict(passed=True,films=28,routes=14,stanceFrames=168,transitionFrames=168,report=str(path)),ensure_ascii=False))
