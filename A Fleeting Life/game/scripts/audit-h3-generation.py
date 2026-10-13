"""独立核对 H3 实际执行记录、Qwen 参考和每镜头全部解码帧。"""
import argparse, hashlib, json, subprocess
from pathlib import Path
import numpy as np
from PIL import Image, ImageDraw
from generate_ending_import import ending_module

FILM=ending_module();ROOT=FILM.ROOT;QA=FILM.QA/'h3-backgrounds'
parser=argparse.ArgumentParser();parser.add_argument('--partial',action='store_true');args=parser.parse_args()
def sha(path):return hashlib.sha256(Path(path).read_bytes()).hexdigest()
rows=[];out=QA/'independent-decoded';out.mkdir(parents=True,exist_ok=True)
for shot in FILM.BACKGROUND_SHOTS:
    name=shot['name'];record=QA/f'{name}.json'
    if not record.is_file():
        assert args.partial,f'Missing H3 job: {name}'
        continue
    row=json.loads(record.read_text(encoding='utf8'))
    if row['state']!='complete':
        assert args.partial,f'Incomplete H3 job: {name}'
        continue
    assert args.partial or row.get('acceptedForFinal') is True,f'{name}: not visually accepted for final films'
    history=json.loads((QA/f'{name}-history.json').read_text(encoding='utf8'))
    graph=history['prompt'][2]
    assert history['prompt'][1]==row['promptId']
    assert history['status']['status_str']=='success' and history['status']['completed']
    assert graph==json.loads((QA/f'{name}-workflow.json').read_text(encoding='utf8'))
    assert graph['1']['inputs']['unet_name']=='minimax_h3_fl2va_pruned_fp8_scaled.safetensors'
    assert graph['5']['inputs']['length']==56 and graph['13']['inputs']['fps']==24
    assert [graph['5']['inputs'][k] for k in ('width','height')]==[512,288]
    assert graph['5']['inputs']['first_frame']==graph['5']['inputs']['last_frame']==['15',0]
    guides=sorted(((key,node) for key,node in graph.items() if node['class_type']=='MiniMaxH3AddGuide'),
        key=lambda item:item[1]['inputs']['frame_idx'])
    previous=['5',0]
    for key,node in guides:
        inputs=node['inputs']
        assert inputs['positive']==previous and inputs['image']==['15',0] and inputs['latent']==['5',1]
        assert 0<inputs['frame_idx']<55
        previous=[key,0]
    assert graph['7']['inputs']['conditioning']==previous,'guide chain must feed the actual sampler guider'
    assert graph['6']['inputs']['noise_seed']==row['seed'] and graph['9']['inputs']['steps']==row['steps']==20
    assert sha(row['source'])==row['sourceSha256'] and sha(row['path'])==row['sha256']
    assert sha(row['original'])==row['sha256'],f'{name}: copied H3 source differs from the actual model output'
    proc=subprocess.run([str(FILM.FFMPEG),'-v','error','-i',row['path'],'-map','0:v:0',
        '-f','rawvideo','-pix_fmt','rgb24','pipe:1'],capture_output=True,check=True)
    assert not proc.stderr,proc.stderr.decode(errors='replace')
    assert len(proc.stdout)==56*512*288*3,f'{name}: unexpected full decode size'
    frames=np.frombuffer(proc.stdout,dtype=np.uint8).reshape(56,288,512,3)
    movement=float(np.abs(frames[1:].astype(np.int16)-frames[:-1].astype(np.int16)).mean())
    assert movement>.02,f'{name}: static or duplicate-only environment'
    sheet=Image.new('RGB',(512*3,310*2),'#eee7d2');draw=ImageDraw.Draw(sheet)
    for j,index in enumerate((0,14,28,41,55)):
        x=(j%3)*512;y=(j//3)*310
        draw.text((x+7,y+3),f'{name} {index}/55',fill='#2d4646')
        sheet.paste(Image.fromarray(frames[index]),(x,y+22))
    contact=out/f'{name}-contact.png';sheet.save(contact)
    full=Image.new('RGB',(256*7,160*8),'#eee7d2');full_draw=ImageDraw.Draw(full)
    for index in range(56):
        x=(index%7)*256;y=(index//7)*160
        full_draw.text((x+5,y+2),f'{index:02d}/55',fill='#2d4646')
        full.paste(Image.fromarray(frames[index]).resize((256,144),Image.Resampling.NEAREST),(x,y+16))
    full_contact=out/f'{name}-all56.png';full.save(full_contact)
    messages={kind:data for kind,data in history['status']['messages']}
    seconds=(messages['execution_success']['timestamp']-messages['execution_start']['timestamp'])/1000
    rows.append(dict(name=name,promptId=row['promptId'],seed=row['seed'],steps=20,frames=56,fps=24,
        resolution=[512,288],fullDecode=True,referenceVerified=True,workflowVerified=True,
        sha256=row['sha256'],visuallyAccepted=row.get('acceptedForFinal') is True,
        actualMidpointGuideFrames=[node['inputs']['frame_idx'] for _,node in guides],
        executionSeconds=round(seconds,3),temporalMeanDifference=movement,
        actualFrameContactSheet=str(contact),allDecodedFrameContactSheet=str(full_contact)))
    print('PASS',name,'56 actual frames',round(movement,4),flush=True)
assert args.partial or len(rows)==16
report=QA/('independent-partial-audit.json' if args.partial else 'executed-generation-audit.json')
report.write_text(json.dumps(dict(jobs=rows,completed=len(rows),expected=16,partial=args.partial),ensure_ascii=False,indent=2),encoding='utf8')
print(json.dumps(dict(passed=True,completed=len(rows),report=str(report)),ensure_ascii=False))
