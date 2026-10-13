"""用本机 Qwen 为结局布局生成统一画风的环境板，保留工作流与种子证据。"""
from __future__ import annotations
import argparse, hashlib, json, shutil, time, urllib.request, urllib.parse, uuid
from pathlib import Path
from PIL import Image

ROOT=Path(__file__).resolve().parents[1]
DEST=ROOT/'build/qa/ending-films/qwen-plates'
COMFY=Path(r'D:\AI\ComfyUI_windows_portable\ComfyUI')
API='http://127.0.0.1:8188'
STYLE=('Muted Chinese small-town storybook game illustration. Match the second reference color palette, '
       'warm ivory paper, soft dusty blue and gray, muted brown wood, gently dithered pixel texture, '
       'subtle painterly shading, calm lived-in environment. No glossy 3D, no photograph, no anime, '
       'no outlined vector art, no vivid saturated colors. This is an environment plate only: no people, '
       'no silhouettes, no faces, no text or subtitles.')

def api(method,path,data=None):
    req=urllib.request.Request(API+path,data=None if data is None else json.dumps(data).encode(),method=method,
        headers={'Content-Type':'application/json'})
    with urllib.request.urlopen(req,timeout=60) as r:return json.load(r)

def graph(job):
    g={
      '1':{'class_type':'UNETLoader','inputs':{'unet_name':'qwen_image_2.1_int4_convrot.safetensors','weight_dtype':'default'}},
      '2':{'class_type':'CLIPLoader','inputs':{'clip_name':'qwen3vl_8b_w4a8.safetensors','type':'qwen_image','device':'default'}},
      '3':{'class_type':'VAELoader','inputs':{'vae_name':'qwen_image_2.1_vae_bf16.safetensors'}},
      '4':{'class_type':'TextEncodeQwenImage21','inputs':{'clip':['2',0],'prompt':job['qwenPrompt'],
            'negative_prompt':'person, child, people, text, character, shifted furniture, changed layout, extra desks',
            'resolution':768,'vae':['3',0]}},
      '5':{'class_type':'QwenImage21Cache','inputs':{'model':['1',0],'device':'auto','dtype':'default'}},
      '6':{'class_type':'EmptyLatentImage','inputs':{'width':job.get('generationWidth',768),'height':job.get('generationHeight',432),'batch_size':1}},
      '7':{'class_type':'KSampler','inputs':{'model':['5',0],'positive':['4',0],'negative':['4',1],
          'latent_image':['6',0],'seed':job['seed'],'steps':25,'cfg':1,'sampler_name':'euler','scheduler':'simple','denoise':1}},
      '8':{'class_type':'VAEDecode','inputs':{'samples':['7',0],'vae':['3',0]}},
      '9':{'class_type':'SaveImage','inputs':{'images':['8',0],'filename_prefix':'Fusheng_review_'+job['name']}}
    }
    for i,p in enumerate([job['layout'],job['pixelReference']],1):
        name=f"Fusheng_review_{job['name']}_ref{i}.png"
        # 模型只看到两幅同尺寸参考，不把低分辨率背景当成新布局。
        im=Image.open(p).convert('RGB').resize((512,288),Image.Resampling.NEAREST if i==2 else Image.Resampling.LANCZOS)
        im.save(COMFY/'input'/name)
        node=str(9+i);g[node]={'class_type':'LoadImage','inputs':{'image':name}}
        g['4']['inputs'][f'images.image_{i}']=[node,0]
    return g

def run(job):
    DEST.mkdir(parents=True,exist_ok=True)
    path=DEST/(job['name']+'.png');record=DEST/(job['name']+'.json')
    if path.exists() and record.exists():return json.loads(record.read_text(encoding='utf8'))
    prior=json.loads(record.read_text(encoding='utf8')) if record.exists() else {}
    job=dict(job);job['seed']=2026092900+job['index']
    if job['scene']=='alarm' and not Path(job['pixelReference']).is_file():
        job['pixelReference']=str(ROOT/'assets/resources/art/pixel/scene/dawn.png')
    job['qwenPrompt']=job.get('customPrompt') or ('Repaint ONLY the surface texture and lighting of the FIRST reference image. '
       'The FIRST image is the exact camera composition: keep every furniture edge, floor baseline, '
       'door opening, seat top, desktop, wall top and vanishing point at its original normalized coordinates. '
       'Do not reposition, resize or add objects. Use the SECOND reference ONLY as material and color style. '
       +STYLE+' Scene: '+job['prompt'])
    g=graph(job);(DEST/(job['name']+'.workflow.json')).write_text(json.dumps(g,indent=2),encoding='utf8')
    if prior.get('state')=='running' and prior.get('prompt_id'):
        job.update(prior);pid=prior['prompt_id'];start=time.monotonic()
    else:
        while True:
            q=api('GET','/queue')
            if not q.get('queue_running') and not q.get('queue_pending'):break
            time.sleep(3)
        start=time.monotonic();pid=api('POST','/prompt',{'prompt':g,'client_id':str(uuid.uuid4())})['prompt_id']
        job.update(state='running',prompt_id=pid)
        record.write_text(json.dumps(job,ensure_ascii=False,indent=2),encoding='utf8')
    print('START',job['name'],pid,flush=True)
    for _ in range(1200):
        h=api('GET','/history/'+urllib.parse.quote(pid))
        if pid in h:
            h=h[pid]
            (DEST/(job['name']+'.history.json')).write_text(json.dumps(h,ensure_ascii=False,indent=2),encoding='utf8')
            if isinstance(h.get('prompt'),list) and len(h['prompt'])>2 and isinstance(h['prompt'][2],dict):
                (DEST/(job['name']+'.workflow.json')).write_text(json.dumps(h['prompt'][2],indent=2),encoding='utf8')
            if h.get('status',{}).get('status_str')=='error':raise RuntimeError(json.dumps(h.get('status')))
            outputs=[e for v in h.get('outputs',{}).values() for e in v.get('images',[])]
            if not outputs:raise RuntimeError('No Qwen output')
            e=outputs[0];source=COMFY/'output'/e.get('subfolder','')/e['filename']
            shutil.copy2(source,path)
            job.update(state='complete',output=str(path),prompt_id=pid,seconds=round(time.monotonic()-start,2),
                model='qwen_image_2.1_int4_convrot.safetensors',steps=25,
                width=Image.open(path).width,height=Image.open(path).height,
                sha256=hashlib.sha256(path.read_bytes()).hexdigest())
            record.write_text(json.dumps(job,ensure_ascii=False,indent=2),encoding='utf8')
            print('DONE',job['name'],job['seconds'],flush=True);return job
        time.sleep(3)
    raise TimeoutError(pid)

def main():
    p=argparse.ArgumentParser();p.add_argument('--limit',type=int,default=0);p.add_argument('--name',action='append',default=[])
    a=p.parse_args();jobs=json.loads((ROOT/'build/qa/ending-films/h3-layouts/manifest.json').read_text(encoding='utf8'))
    jobs=[dict(j,index=i) for i,j in enumerate(jobs)]
    if a.name:jobs=[j for j in jobs if j['name'] in a.name]
    if a.limit:jobs=jobs[:a.limit]
    result=[run(j) for j in jobs]
    (DEST/'manifest.json').write_text(json.dumps(result,ensure_ascii=False,indent=2),encoding='utf8')

if __name__=='__main__':main()
