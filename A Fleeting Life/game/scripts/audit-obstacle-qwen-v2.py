"""离线核实际 Comfy history、原图、参考及最终部件，不把旧资产或母板当实播证据。"""
from __future__ import annotations
import datetime,hashlib,json,subprocess
from pathlib import Path
from PIL import Image
ROOT=Path(__file__).resolve().parents[1];OUT=ROOT/'build/qa/obstacle-qwen-v2'
def sha(p):return hashlib.sha256(Path(p).read_bytes()).hexdigest()
def rel(p):return str(Path(p).relative_to(ROOT)).replace('\\','/')
def load(p):return json.loads(Path(p).read_text(encoding='utf-8-sig'))
def main():
    plan=load(OUT/'authored-plan.json');runtime=load(OUT/'runtime-manifest.json')
    assert len(runtime)==len(plan['sprites'])==47
    content=json.loads(subprocess.check_output([r'D:\NODE\node.exe','-e',"console.log(JSON.stringify(require('./build/Content').ART_MANIFEST.filter(r=>r.key.startsWith('props.obstacles.v2.'))))"],cwd=ROOT,encoding='utf8'))
    assert len(content)==47;content={r['key']:r for r in content}
    jobs=[];allcells=[]
    rejected={(2,'bicycle'):'original 48 px-wide bicycle extends beyond the fixed 24 px front collision span; replaced by foreshortened plate 10',
      (3,'books.open'):'looks closed rather than opened; replaced by explicit open-page guide in plate 8',
      (4,'crate.folded'):'looks like a cabinet door rather than a folded desk; replaced by visible folded metal legs in plate 8',
      (4,'bench.high'):'front board too thin; replaced by a broad front-board guide in plate 8'}
    final={(r['sourcePlate'],r['id']):r for r in runtime}
    for n in range(1,11):
        record=load(OUT/f'plate-{n:02}.json');historyPath=OUT/f'plate-{n:02}.history.json';workflowPath=OUT/f'plate-{n:02}.workflow.json'
        history=load(historyPath);workflow=load(workflowPath);graph=history['prompt'][2]
        assert history['status']['completed'] and history['status']['status_str']=='success'
        assert graph==workflow;assert history['prompt'][1]==record['prompt_id']
        assert record['executedSeed']==graph['7']['inputs']['seed']==202609294000+n
        assert record['executedSteps']==graph['7']['inputs']['steps']==25
        assert record['executedModel']==graph['1']['inputs']['unet_name']=='qwen_image_2.1_int4_convrot.safetensors'
        assert sha(workflowPath)==record['workflowSha256'];raw=ROOT/record['output'];assert sha(raw)==record['sha256']
        for ref in record['referenceSnapshots']:assert sha(ROOT/ref['path'])==ref['sha256']
        for bg in record['backgrounds']:assert sha(ROOT/bg['source'])==bg['sha256']
        with Image.open(raw) as im:assert im.size==(1024,768);im.verify()
        cells=[]
        for row in record['rows']:
            key=(n,row['id']);asset=final.get(key);reason=rejected.get(key)
            assert asset is not None or reason is not None,key
            cell={'id':row['id'],'cell':row['cell'],'accepted':asset is not None,'reason':reason,
                  'role':asset['assemblyRole'] if asset else None,'frontFragmentRemoved':bool(asset and asset['clearedWorldRegion'])}
            cells.append(cell);allcells.append(cell)
        jobs.append({'plate':n,'promptId':record['prompt_id'],'executedSeed':record['executedSeed'],'executedSteps':record['executedSteps'],
          'model':record['executedModel'],'seconds':record['seconds'],'raw':{'path':rel(raw),'sha256':sha(raw),'pixelSize':[1024,768]},
          'workflow':{'path':rel(workflowPath),'sha256':sha(workflowPath)},'history':{'path':rel(historyPath),'sha256':sha(historyPath)},
          'references':record['referenceSnapshots'],'backgrounds':record['backgrounds'],
          'generatorShaAtRecordCompletion':record['generatorSha256'],'generatorSnapshot':record.get('generatorSnapshot'),
          'cells':cells})
    assets=[];uuids=set()
    for row in runtime:
        entry=content[row['key']];assert entry['path']==row['path'];p=ROOT/'assets/resources'/row['path'];assert sha(p)==row['sha256']
        meta=p.with_suffix('.png.meta');m=load(meta);assert m['uuid'] not in uuids;uuids.add(m['uuid'])
        assert m['subMetas']['6c48a']['uuid']==m['uuid']+'@6c48a'
        with Image.open(p) as im:
            assert im.mode=='RGBA' and list(im.size)==row['pixelSize'];assert [x/2 for x in im.size]==row['logicalSize']
            alpha=im.getchannel('A');assert list(alpha.getextrema())==list(row['alphaRange'])
        with Image.open(p) as verified:verified.verify()
        assert row['preparerSha256']==sha(ROOT/'scripts/prepare-obstacle-qwen-v2.py')
        assets.append({**row,'path':rel(p),'metaPath':rel(meta),'metaSha256':sha(meta),'uuid':m['uuid'],'contentPath':entry['path'],
          'accepted':True,'acceptanceScope':'new-source provenance and authored assembly; final host play/visual evidence is separately required'})
    fixtures=load(OUT/'gameplay/report.json');assert len(fixtures['cases'])==34
    assert not fixtures['errors'] and not fixtures['consoleErrors'] and not fixtures['networkErrors']
    for c in fixtures['cases']:
        for expected in c['expected']:assert any('/'+expected+'.png' in url for url in c['activeProof'])
    knownFiles=['assets/scripts/ObstacleRendering.ts','assets/scripts/Content.ts','assets/scripts/Geometry.ts','assets/scripts/ObstacleLogic.ts',
      'scripts/obstacle-qwen-v2-plan.cjs','scripts/generate-obstacle-qwen-v2.py','scripts/prepare-obstacle-qwen-v2.py']
    proof={'schema':'fusheng.obstacle-qwen-v2.executed-audit.v1','createdUtc':datetime.datetime.now(datetime.timezone.utc).isoformat(),
      'passed':True,'scope':'offline actual generation and resource/Content wiring audit; Canvas fixture images are visual arrangements, not natural traversal or Android native playback',
      'actualRawJobs':10,'rawCells':len(allcells),'acceptedRuntimeSprites':47,'rejectedCells':len(rejected),'allNewSourcePlates':True,
      'sourceFiles':[{'path':name,'sha256':sha(ROOT/name)} for name in knownFiles],
      'generatorHashNote':'For jobs 1–7 the hash was sampled at record completion; a metadata-only cellCrop field was added during that session. The immutable executed workflow/history and saved references establish actual generation. Jobs 8–10 additionally archive the generator source snapshot captured before execution.',
      'jobs':jobs,'sprites':assets,'canvasFixtures':{'path':rel(OUT/'gameplay/report.json'),'sha256':sha(OUT/'gameplay/report.json'),
        'cases':34,'standardSources':21,'semanticVariants':13,'dynamicEvents':3,'allDrawImageProofsPresent':True},
      'ownedService':load(OUT/'owned-service.json')}
    assert proof['ownedService']['finalQueueEmpty'] and proof['ownedService']['stoppedUtc']
    target=OUT/'executed-generation-audit.json';target.write_text(json.dumps(proof,ensure_ascii=False,indent=2),encoding='utf8')
    print(json.dumps({'passed':True,'actualJobs':10,'rawCells':len(allcells),'acceptedSprites':47,'rejectedCells':4,'audit':str(target)},ensure_ascii=False))
if __name__=='__main__':main()
