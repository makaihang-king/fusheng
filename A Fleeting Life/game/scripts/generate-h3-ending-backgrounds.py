"""由本机 Qwen 风格底图生成 MiniMax H3 环境电影。

H3 永远只生成环境，不重造小满的人脸。首尾均约束于校验后的同一 Qwen 图；
真实 56 帧运动在剧情时槽中慢放，无复制末帧填长。角色由 xiaoman_rig 合成。
"""
from __future__ import annotations
import argparse, hashlib, json, shutil, time, urllib.request, urllib.parse, uuid
from pathlib import Path
from generate_ending_import import ending_module

FILM=ending_module()
ROOT=FILM.ROOT
QA=FILM.QA
PLATES=QA/'qwen-plates'
DEST=QA/'h3-backgrounds'
COMFY='http://127.0.0.1:8188'
INPUT=Path(r'D:\AI\ComfyUI_windows_portable\ComfyUI\input')
OUTPUT=Path(r'D:\AI\ComfyUI_windows_portable\ComfyUI\output')
BASE=ROOT.parents[1]/'美术交付_20260926/workflows/minimax_h3_t2v_lowvram_api.json'
SEED_OFFSET=0
GUIDE_MIDDLE=False

def api(method,path,data=None):
    body=None if data is None else json.dumps(data,ensure_ascii=False).encode('utf8')
    req=urllib.request.Request(COMFY+path,data=body,method=method,headers={'Content-Type':'application/json'})
    try:
        with urllib.request.urlopen(req,timeout=45) as r:return json.load(r)
    except urllib.error.HTTPError as e:raise RuntimeError(e.read().decode('utf8',errors='replace')) from e

def save(path,data):path.write_text(json.dumps(data,ensure_ascii=False,indent=2),encoding='utf8')

def graph(shot,index):
    g=json.loads(BASE.read_text(encoding='utf8'));name=shot['name'];image=f'Fusheng_S1_new_{name}.png'
    environment=shot['prompt']
    if name=='runaway-yard':environment='An empty primary school running track. Preserve all parallel white lines, the distant goal, the teaching building and the completely uninterrupted gravel foreground exactly as in the supplied frame. The right foreground stays entirely open and empty throughout. Only very faint moving dust and natural light. No additional structure, panel, door, fence, barrier, curtain or wall ever enters any part of the frame. Fixed side camera.'
    if name=='wall-track':environment='A completely empty, unoccupied school sports field seen above a horizontal brick wall. The reference contains only the horizontal wall cap, parallel white running-track lines, distant goal and one teaching building. Preserve these exact objects and their fixed positions. The entire track and wall crest remain empty from first frame through last frame. Only gentle natural light variation and subtle dust. Still architecture, fixed camera, no other object enters the scene.'
    if name=='desk-detail':environment='One empty flat wooden tabletop filling the supplied composition. Bare uninterrupted horizontal wood grain, exact constant tabletop edges and texture. All existing shapes remain fixed and identical to the reference throughout. The only motion is a very slight uniform warm exposure fluctuation across the entire frame. Uniformly lit bare wood everywhere; absolutely nothing new appears, crosses or covers the surface. Locked close camera.'
    prompt=(
        'Preserve the supplied frame exactly as the environment, composition and visual style. '
        'Refined Chinese childhood picturebook game artwork, textured high-density pixel clusters, '
        'stepped edges, carefully restricted soft palette, subtle painted details. Fixed camera. '
        'All floor planes, desk tops, chair seats, wall ledges, doors, windows and furniture geometry '
        'must stay at precisely the same position and size in every frame. '
        'A little natural light variation and slow gentle environmental motion. '
        'No people, no character, no humanoid, no portrait, no writing, no numbers, no arrows, '
        'no logos, no subtitles, no random object, no 3D, no photorealism, no drastic redesign, '
        'no new doors, no flicker, no cuts. Every output frame is an unoccupied environment plate containing only the same inanimate objects in the reference frame. '
        +environment+' Audio: quiet natural ambience, no voice or dialogue.'
    )
    if name=='desk-classroom':prompt+=' The left wooden door panel remains absolutely stationary. It never opens or moves. No object or figure appears from the doorway; the only movement is dust and sunlight.'
    if name=='desk-detail':prompt+=' The bare tabletop remains completely unobstructed from first to last frame. Fixed texture, uniform illumination, exposure-only subtle movement.'
    g['5']['inputs'].update(prompt=prompt,width=512,height=288,length=56,first_frame=['15',0],last_frame=['15',0])
    g['6']['inputs']['noise_seed']=2609297100+index+SEED_OFFSET
    g['14']['inputs']['filename_prefix']='video/Fusheng_S1_new_'+name
    g['15']={'class_type':'LoadImage','inputs':{'image':image}}
    if GUIDE_MIDDLE:
        previous='5'
        for node,frame_index in zip(('16','17','18'),(14,28,41)):
            g[node]={'class_type':'MiniMaxH3AddGuide','inputs':{'positive':[previous,0],'vae':['3',0],'latent':['5',1],'image':['15',0],'frame_idx':frame_index}}
            previous=node
        g['7']['inputs']['conditioning']=[previous,0]
    return g,image

def idle():
    while True:
        q=api('GET','/queue')
        if not q.get('queue_running') and not q.get('queue_pending'):return
        time.sleep(10)

def generate(shot,index):
    name=shot['name'];record=DEST/f'{name}.json';target=DEST/f'{name}.mp4'
    if target.is_file() and record.is_file():
        prior=json.loads(record.read_text(encoding='utf8'))
        if prior.get('state')=='complete' and prior.get('sourceSha256')==hashlib.sha256((PLATES/f'{name}.png').read_bytes()).hexdigest():
            print('SKIP '+name,flush=True);return prior
    source=PLATES/f'{name}.png'
    if not source.is_file():raise FileNotFoundError(source)
    idle();g,input_name=graph(shot,index);shutil.copy2(source,INPUT/input_name);save(DEST/f'{name}-workflow.json',g)
    started=time.monotonic();submitted=api('POST','/prompt',{'prompt':g,'client_id':str(uuid.uuid4())});pid=submitted['prompt_id']
    row={**shot,'state':'running','promptId':pid,'source':str(source),'sourceSha256':hashlib.sha256(source.read_bytes()).hexdigest(),'model':'MiniMax H3 fl2va fp8, Qwen3VL 32B nvfp4 AWQ encoder','framesRequested':56,'fps':24,'resolution':[512,288],'steps':20,'seed':2609297100+index+SEED_OFFSET,'workflow':str(DEST/f'{name}-workflow.json')}
    row['keyframeGuides']=[0,14,28,41,55] if GUIDE_MIDDLE else [0,55]
    save(record,row);print(f'H3 RUN {index+1}/{len(FILM.BACKGROUND_SHOTS)} {name} {pid}',flush=True)
    deadline=started+2400
    while time.monotonic()<deadline:
        history=api('GET','/history/'+urllib.parse.quote(pid))
        if pid not in history:time.sleep(10);continue
        entry=history[pid];save(DEST/f'{name}-history.json',entry)
        if entry.get('status',{}).get('status_str')=='error':
            row.update(state='error',history=str(DEST/f'{name}-history.json'));save(record,row)
            raise RuntimeError(json.dumps(entry.get('status'),ensure_ascii=False))
        videos=[v for out in entry.get('outputs',{}).values() for k in ('images','videos','gifs') for v in out.get(k,[]) if Path(v.get('filename','')).suffix.lower() in ('.mp4','.webm','.mov')]
        if not videos:raise RuntimeError('H3 finished without a video: '+name)
        v=videos[0];origin=OUTPUT/v.get('subfolder','')/v['filename'];shutil.copy2(origin,target)
        row.update(state='complete',path=str(target),original=str(origin),sha256=hashlib.sha256(target.read_bytes()).hexdigest(),generationSeconds=round(time.monotonic()-started,1));save(record,row)
        print(f'H3 DONE {name} {row["generationSeconds"]}s',flush=True);return row
    row['state']='timeout';save(record,row);raise TimeoutError(name)

if __name__=='__main__':
    parser=argparse.ArgumentParser();parser.add_argument('--name');parser.add_argument('--dry-run',action='store_true');parser.add_argument('--seed-offset',type=int,default=0);parser.add_argument('--guide-middle',action='store_true');args=parser.parse_args()
    SEED_OFFSET=args.seed_offset
    GUIDE_MIDDLE=args.guide_middle
    DEST.mkdir(parents=True,exist_ok=True);manifest=DEST/'generation-manifest.json'
    rows=json.loads(manifest.read_text(encoding='utf8')) if args.name and manifest.is_file() else []
    for index,shot in enumerate(FILM.BACKGROUND_SHOTS):
        if args.name and args.name!=shot['name']:continue
        if args.dry_run:
            g,_=graph(shot,index);save(DEST/f'{shot["name"]}-workflow.json',g);print(shot['name']);continue
        row=generate(shot,index);rows=[prior for prior in rows if prior['name']!=shot['name']]+[row]
        rows.sort(key=lambda prior:next(i for i,s in enumerate(FILM.BACKGROUND_SHOTS) if s['name']==prior['name']))
        save(manifest,rows)
