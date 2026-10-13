"""本轮障碍专用本机 Qwen 工作流；原背景作材质参考，不重生人物或影片。"""
from __future__ import annotations
import argparse, hashlib, json, shutil, time, urllib.request, uuid
from pathlib import Path
import numpy as np
from PIL import Image, ImageDraw

ROOT=Path(__file__).resolve().parents[1]
OUT=ROOT/'build/qa/obstacle-qwen-v2'
COMFY=Path(r'D:\AI\ComfyUI_windows_portable\ComfyUI')
API='http://127.0.0.1:8188'
PLAN=json.loads((OUT/'authored-plan.json').read_text(encoding='utf8'))
SOURCE_SNAPSHOT=OUT/('generator-'+hashlib.sha256(Path(__file__).read_bytes()).hexdigest()+'.py')
if not SOURCE_SNAPSHOT.exists():shutil.copy2(__file__,SOURCE_SNAPSHOT)
SCALE=PLAN['scale']; TILE_W=1024/3; TILE_H=384
def sha(path):return hashlib.sha256(Path(path).read_bytes()).hexdigest()
def api(method,path,data=None):
    req=urllib.request.Request(API+path,method=method,data=None if data is None else json.dumps(data).encode(),headers={'Content-Type':'application/json'})
    with urllib.request.urlopen(req,timeout=60) as r:return json.load(r)
def color(value):
    if value.startswith('rgba'):return None
    return value
def layouts(number,rows):
    layout=Image.new('RGB',(1024,768),'white');styles=Image.new('RGB',(1024,768),'white'); refs=[]
    for row in rows:
        cx=(row['cell']%3)*TILE_W;cy=(row['cell']//3)*TILE_H
        box=row['box'];origin=(cx+TILE_W/2-(box[0]+box[2]/2)*SCALE,cy+343-216*SCALE)
        tile=Image.new('RGB',(int(TILE_W)+1,TILE_H),'white');d=ImageDraw.Draw(tile)
        def pt(x,y):return (origin[0]-cx+(x-96)*SCALE,origin[1]-cy+y*SCALE)
        for name,*args in row['calls']:
            if name=='rect':
                x,y,w,h,c=args
                if color(c) and w>0 and h>0:d.rectangle((*pt(x,y),*pt(x+w,y+h)),fill=c)
            elif name=='line':
                x,y,xx,yy,c,*w=args
                if color(c):d.line([pt(x,y),pt(xx,yy)],fill=c,width=max(1,round((w[0] if w else 1)*SCALE)))
            elif name=='circle':
                x,y,r,c=args
                if color(c):d.ellipse((*pt(x-r,y-r),*pt(x+r,y+r)),fill=c)
            elif name=='poly':
                points,c=args
                if color(c):d.polygon([pt(x,y) for x,y in points],fill=c)
        # Cabinet body excludes its animated leaf; each output occupies only its own authored box.
        allowed=(int((box[0]*SCALE+origin[0])-cx)-3,int(box[1]*SCALE+origin[1]-cy)-3,
                 int((box[0]+box[2])*SCALE+origin[0]-cx)+4,int((box[1]+box[3])*SCALE+origin[1]-cy)+4)
        clean=Image.new('RGB',tile.size,'white');clean.paste(tile.crop(allowed),allowed[:2])
        layout.paste(clean,(round(cx),int(cy)))
        bg=ROOT/f"assets/resources/art/pixel/scene/scroll/{row['theme']}/00.png"
        if not bg.exists():bg=ROOT/f"assets/resources/art/pixel/scene/{row['theme']}.png"
        scene=Image.open(bg).convert('RGB');sx=max(0,(scene.width-round(TILE_W))//2)
        patch=scene.crop((sx,60,sx+round(TILE_W),444)).resize((round(TILE_W),384),Image.Resampling.NEAREST)
        styles.paste(patch,(round(cx),int(cy)));refs.append({'id':row['id'],'source':str(bg.relative_to(ROOT)),'sha256':sha(bg)})
        row['plateCrop']=[round(box[0]*SCALE+origin[0])-5,round(box[1]*SCALE+origin[1])-5,
                          round((box[0]+box[2])*SCALE+origin[0])+5,round((box[1]+box[3])*SCALE+origin[1])+5]
        row['cellCrop']=[round(cx),int(cy),round(cx+TILE_W),int(cy+TILE_H)]
    a=OUT/f'plate-{number:02}-layout.png';b=OUT/f'plate-{number:02}-style.png';layout.save(a);styles.save(b)
    return a,b,refs
def graph(number,rows,refs):
    seed=202609294000+number
    instructions='; '.join(f"cell {r['cell']+1} (row {r['cell']//3+1}, column {r['cell']%3+1}): {r['description']}" for r in rows)
    prompt=('Create an isolated sprite atlas on a perfectly pure solid WHITE background. '
        'FIRST reference gives the exact silhouettes, bounding rectangles, object size and 3-column by 2-row placement. '
        'Retain these positions and proportions precisely. Each cell is independent. Do not join objects from different cells. '
        'Do not fill any empty white gaps within a frame, underneath a bench, between bicycle spokes, beneath a crossbar, or around objects. '
        'The SECOND reference shows the ACTUAL game backgrounds corresponding to each cell. '
        'Paint each object using its corresponding background material, low-saturation palette, warm aged paper feel, '
        'subtle pixel clusters, believable worn wood grain, metal patina, fabric stitching, ambient occlusion and soft light from upper left. '
        'Use a SIDE-VIEW game camera with shallow front-facing thickness, not an isometric camera. '
        'Give clear readable silhouettes at small gameplay size. Match the soft detailed painterly pixel game backgrounds; '
        'avoid flat solid-color vector outlines, thick black edges, glossy 3D, photographs or oversharp noisy details. '
        'No environment, no ground plane, no labels, no text, no watermarks, no people outside a vehicle. '
        'Entirely empty cells must remain white. Objects: '+instructions)
    g={
      '1':{'class_type':'UNETLoader','inputs':{'unet_name':'qwen_image_2.1_int4_convrot.safetensors','weight_dtype':'default'}},
      '2':{'class_type':'CLIPLoader','inputs':{'clip_name':'qwen3vl_8b_w4a8.safetensors','type':'qwen_image','device':'default'}},
      '3':{'class_type':'VAELoader','inputs':{'vae_name':'qwen_image_2.1_vae_bf16.safetensors'}},
      '4':{'class_type':'TextEncodeQwenImage21','inputs':{'clip':['2',0],'prompt':prompt,'negative_prompt':'flat vector art, thick outlines, 3D, photograph, text, watermark, extra props, solid background, perspective camera','resolution':768,'vae':['3',0]}},
      '5':{'class_type':'QwenImage21Cache','inputs':{'model':['1',0],'device':'auto','dtype':'default'}},
      '6':{'class_type':'EmptyLatentImage','inputs':{'width':1024,'height':768,'batch_size':1}},
      '7':{'class_type':'KSampler','inputs':{'model':['5',0],'positive':['4',0],'negative':['4',1],'latent_image':['6',0],'seed':seed,'steps':25,'cfg':1,'sampler_name':'euler','scheduler':'simple','denoise':1}},
      '8':{'class_type':'VAEDecode','inputs':{'samples':['7',0],'vae':['3',0]}},
      '9':{'class_type':'SaveImage','inputs':{'images':['8',0],'filename_prefix':f'Fusheng_obstacle_v2_{number:02}'}},
    }
    for i,source in enumerate(refs,1):
        name=f'Fusheng_obstacle_v2_{number:02}_ref{i}.png';shutil.copy2(source,COMFY/'input'/name)
        n=str(9+i);g[n]={'class_type':'LoadImage','inputs':{'image':name}};g['4']['inputs'][f'images.image_{i}']=[n,0]
    return g
def run(number,rows):
    layout,style,backgrounds=layouts(number,rows);g=graph(number,rows,[layout,style])
    base=OUT/f'plate-{number:02}';record=base.with_suffix('.json');image=base.with_suffix('.png')
    prior=json.loads(record.read_text(encoding='utf8')) if record.exists() else {}
    if prior.get('state')=='complete' and image.exists():
        assert prior['sha256']==sha(image);return prior
    if prior.get('state')=='running':pid=prior['prompt_id']
    else:
        q=api('GET','/queue');assert not q.get('queue_running') and not q.get('queue_pending'),'Other GPU work is already queued'
        pid=api('POST','/prompt',{'prompt':g,'client_id':str(uuid.uuid4())})['prompt_id']
        prior={'state':'running','prompt_id':pid,'plate':number,'startedUtc':time.strftime('%Y-%m-%dT%H:%M:%SZ',time.gmtime()),'seed':g['7']['inputs']['seed'],'spriteIds':[r['id'] for r in rows]}
        record.write_text(json.dumps(prior,ensure_ascii=False,indent=2),encoding='utf8')
    print('START',number,pid,flush=True)
    while True:
        history=api('GET','/history/'+pid)
        if pid in history:
            h=history[pid];(OUT/f'plate-{number:02}.history.json').write_text(json.dumps(h,ensure_ascii=False,indent=2),encoding='utf8')
            assert h['status']['status_str']=='success' and h['status']['completed'],h['status']
            actual=h['prompt'][2];(OUT/f'plate-{number:02}.workflow.json').write_text(json.dumps(actual,ensure_ascii=False,indent=2),encoding='utf8')
            outputs=[o for v in h['outputs'].values() for o in v.get('images',[])];assert outputs
            o=outputs[0];source=COMFY/'output'/o.get('subfolder','')/o['filename'];shutil.copy2(source,image)
            messages={n:d for n,d in h['status']['messages']}
            prior.update(state='complete',sha256=sha(image),output=str(image.relative_to(ROOT)),
                executedModel=actual['1']['inputs']['unet_name'],executedSeed=actual['7']['inputs']['seed'],executedSteps=actual['7']['inputs']['steps'],
                seconds=(messages['execution_success']['timestamp']-messages['execution_start']['timestamp'])/1000,
                generatorSha256=sha(SOURCE_SNAPSHOT),generatorSnapshot=str(SOURCE_SNAPSHOT.relative_to(ROOT)),workflowSha256=sha(OUT/f'plate-{number:02}.workflow.json'),
                referenceSnapshots=[{'path':str(p.relative_to(ROOT)),'sha256':sha(p)} for p in [layout,style]],backgrounds=backgrounds,rows=rows)
            record.write_text(json.dumps(prior,ensure_ascii=False,indent=2),encoding='utf8');print('DONE',number,prior['seconds'],flush=True);return prior
        time.sleep(3)
def main():
    p=argparse.ArgumentParser();p.add_argument('--plate',type=int,action='append');a=p.parse_args();numbers=a.plate or sorted({r['plate'] for r in PLAN['sprites']})
    for n in numbers:run(n,[dict(r) for r in PLAN['sprites'] if r['plate']==n])
if __name__=='__main__':main()
