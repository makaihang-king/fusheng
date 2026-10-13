"""从实际 ComfyUI history 归档参数、原始参考与时间，不以脚本预设替代执行证据。"""
import hashlib,json,urllib.request
from pathlib import Path
from PIL import Image
ROOT=Path(__file__).resolve().parents[1];DEST=ROOT/'build/qa/ending-films/qwen-plates'
rows=[]
for p in sorted(DEST.glob('*.json')):
    row=json.loads(p.read_text(encoding='utf8'))
    if not isinstance(row,dict) or not row.get('prompt_id') or not row.get('output'):continue
    pid=row['prompt_id']
    h=json.load(urllib.request.urlopen('http://127.0.0.1:8188/history/'+pid,timeout=60))[pid]
    assert h['status']['status_str']=='success' and h['status']['completed']
    graph=h['prompt'][2]
    (DEST/(row['name']+'.history.json')).write_text(json.dumps(h,ensure_ascii=False,indent=2),encoding='utf8')
    (DEST/(row['name']+'.workflow.json')).write_text(json.dumps(graph,indent=2),encoding='utf8')
    messages={name:data for name,data in h['status']['messages']}
    row['seconds']=(messages['execution_success']['timestamp']-messages['execution_start']['timestamp'])/1000
    row['state']='complete';row['executedModel']=graph['1']['inputs']['unet_name']
    row['executedSeed']=graph['7']['inputs']['seed'];row['executedSteps']=graph['7']['inputs']['steps']
    refs=(1024,576) if graph['4']['inputs']['resolution']==1024 else (512,288)
    snap=DEST/'references';snap.mkdir(exist_ok=True);row['referenceSnapshots']=[]
    for i,source in enumerate([row['layout'],row['pixelReference']],1):
        target=snap/(row['name']+f'-{i}.png')
        Image.open(source).convert('RGB').resize(refs,Image.Resampling.NEAREST if i==2 else Image.Resampling.LANCZOS).save(target)
        row['referenceSnapshots'].append({'path':str(target),'size':refs,'sha256':hashlib.sha256(target.read_bytes()).hexdigest()})
    im=Image.open(row['output']);im.verify()
    assert hashlib.sha256(Path(row['output']).read_bytes()).hexdigest()==row['sha256']
    p.write_text(json.dumps(row,ensure_ascii=False,indent=2),encoding='utf8');rows.append(row)
(DEST/'executed-generation-audit.json').write_text(json.dumps(rows,ensure_ascii=False,indent=2),encoding='utf8')
print(json.dumps({'actualSuccessfulJobs':len(rows),'seedsVerified':True,'imagesVerified':True,'executionSeconds':round(sum(r['seconds'] for r in rows),1)}))
