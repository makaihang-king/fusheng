"""重合本轮28片；仅显式指定、且源哈希完全一致的本轮base审片可以复用。

不改渲染器、不跳过缺资产、不复用旧轮占位。复用片的源码、影片、24帧、
背景SHA必须与当前执行源完全一致；全部16背景仍须通过生成器接受门槛。
"""
import argparse,hashlib,json
from pathlib import Path
from generate_ending_import import ending_module

film=ending_module()
parser=argparse.ArgumentParser()
parser.add_argument('--reuse-reviewed-base',nargs='*',choices=film.IDS,default=[])
args=parser.parse_args()
prefix=args.reuse_reviewed_base
sha=lambda p:hashlib.sha256(Path(p).read_bytes()).hexdigest()
rows=[]
driver_sha=sha(__file__)

def current_row(id):
    record=film.QA/'base'/f'{id}-manifest.json'
    row=json.loads(record.read_text(encoding='utf8'))
    assert row['id']==id and row['skin']=='base'
    assert row['generatorSha256']==film.GENERATOR_SOURCE_SHA256,'Stale generator: '+id
    assert row['rigSha256']==film.RIG_SOURCE_SHA256,'Stale rig: '+id
    assert row.get('gaitRevision')==film.GAIT_REVISION,'Stale gait: '+id
    assert sha(film.ROOT/row['path'])==row['sha256'],'Stale movie: '+id
    assert len(row['fallbackSha256'])==24 and row['decoded'] and row['frames']==360
    for item in row['fallbackSha256']+row['backgroundSourceSha256']:
        assert sha(film.ROOT/item['path'])==item['sha256'],'Stale scene/fallback: '+item['path']
    return row

def status(completed,complete=False):
    path=film.QA/'generation-status.json'
    previous=json.loads(path.read_text(encoding='utf8')) if path.is_file() else {}
    previous.update(expected=28,completed=completed,generationComplete=complete,fullReady=False,
        visualAccepted=False,decoded=complete,generatorSha256=film.GENERATOR_SOURCE_SHA256,
        rigSha256=film.RIG_SOURCE_SHA256,gaitRevision=film.GAIT_REVISION,currentRevisionComplete=False)
    path.write_text(json.dumps(previous,ensure_ascii=False,indent=2),encoding='utf8')

reviewed={id:current_row(id) for id in prefix}
status(0)
film.load_h3_backgrounds()
for skin in film.SKINS:
    for id in film.IDS:
        row=reviewed[id] if skin=='base' and id in reviewed else film.generate(id,skin)
        row['assemblyDriverSha256']=driver_sha
        repairs=[]
        for shot in film.BACKGROUND_SHOTS:
            if shot['id']!=id:continue
            source=json.loads((film.QA/'h3-backgrounds'/f'{shot['name']}.json').read_text(encoding='utf8'))
            if source.get('repairSpec'):repairs.append(dict(name=shot['name'],repairSpec=source['repairSpec']))
        row['backgroundRepairSpecs']=repairs
        (film.QA/skin/f'{id}-manifest.json').write_text(json.dumps(row,ensure_ascii=False,indent=2),encoding='utf8')
        rows.append(row)
        (film.QA/'generation-manifest.json').write_text(json.dumps(rows,ensure_ascii=False,indent=2),encoding='utf8')
        status(len(rows))
    film.contact_sheet(skin)
    print('COMPLETE SKIN '+skin+' 7/7',flush=True)
assert len(rows)==28
(film.QA/'generation-manifest.json').write_text(json.dumps(rows,ensure_ascii=False,indent=2),encoding='utf8')
status(28,True)
print('ALL28 GENERATED AND FULLY DECODED; actual encoded-frame visual audit still required.',flush=True)
