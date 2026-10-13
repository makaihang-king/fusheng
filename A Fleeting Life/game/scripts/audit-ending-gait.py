"""只读现成 MP4：记录旧步态支撑足运动并提取实际编码连续帧。

旧源快照保存于 build/qa/gait-revision；不调用模型、不重写电影。
"""
import hashlib, importlib.util, json, math, subprocess, sys
from pathlib import Path
from PIL import Image, ImageDraw, ImageFont

ROOT=Path(__file__).resolve().parents[1]
OUT=ROOT/'build/qa/gait-revision';OUT.mkdir(parents=True,exist_ok=True)
sys.path.insert(0,str(ROOT/'scripts'))

def module(name,path,virtual_path=None):
    spec=importlib.util.spec_from_file_location(name,path)
    result=importlib.util.module_from_spec(spec)
    if virtual_path:
        result.__file__=str(virtual_path)
        exec(compile(path.read_text(encoding='utf8'),str(virtual_path),'exec'),result.__dict__)
    else:spec.loader.exec_module(result)
    return result

rig=module('old_gait_rig',OUT/'previous-xiaoman-rig.py')
film=module('old_gait_film',OUT/'previous-generate-ending-films.py',ROOT/'scripts/generate-ending-films.py')
film.ACTORS_ENABLED=False
rows=[]
for id in film.IDS:
    samples=[]
    for n in range(360):
        film.ACTOR_REQUESTS=[];film.SCENES[id](n/30)
        if not film.ACTOR_REQUESTS:continue
        r=film.ACTOR_REQUESTS[0]
        if r['action']!='run' or (r['pose_mix'] and r['pose_mix'][1]>0):continue
        phase=int((r['t']%1)*360)/360
        q=rig.pose('run',phase)
        for foot in (0,1):
            # Raw target is flat only during the planted half-cycle. Also reject
            # an IK-clamped endpoint, because it is not an exact planted target.
            raw_y=42-5*max(0,math.sin(2*math.pi*phase)*(1 if foot==0 else -1))
            if abs(raw_y-42)>.00001 or abs(q['feet'][foot][1]-42)>.02:continue
            samples.append(dict(frame=n,seconds=n/30,foot=foot,phase=phase,
                actorX=r['x'],floor=r['floor'],size=r['size'],
                localFootX=q['feet'][foot][0],
                worldFootX=r['x']-r['size']/2+q['feet'][foot][0]*r['size']/48))
    candidates=[]
    for first in samples:
        chain=[first]
        for offset in (2,4,6,8,10):
            entry=next((r for r in samples if r['frame']==first['frame']+offset and r['foot']==first['foot']),None)
            if entry is None:break
            chain.append(entry)
        if len(chain)!=6:continue
        if any(abs(r['floor']-first['floor'])>.01 or abs(r['size']-first['size'])>.01 for r in chain):continue
        if any(b['localFootX']<=a['localFootX'] or b['actorX']<=a['actorX'] for a,b in zip(chain,chain[1:])):continue
        candidates.append(chain)
    if not candidates:raise AssertionError('No unambiguous reverse-stance specimen: '+id)
    chain=candidates[0]
    path=film.DEST/f'{id}.mp4';sub=OUT/'legacy-encoded'/id;sub.mkdir(parents=True,exist_ok=True)
    filt='+'.join('eq(n\\,'+str(r['frame'])+')' for r in chain)
    subprocess.run([str(film.FFMPEG),'-v','error','-y','-i',str(path),'-vf','select='+filt,'-vsync','0',str(sub/'%02d.png')],check=True)
    sheet=Image.new('RGB',(640*3,390*2),'#efe9dc');draw=ImageDraw.Draw(sheet)
    font=ImageFont.truetype(film.FONT,18)
    for k,(screenshot,sample) in enumerate(zip(sorted(sub.glob('*.png')),chain)):
        x=(k%3)*640;y=(k//3)*390
        sheet.paste(Image.open(screenshot).resize((640,360)),(x,y+30))
        draw.text((x+8,y+4),f"{id} actual frame {sample['frame']} / {sample['seconds']:.3f}s",font=font,fill='#354c44')
    contact=OUT/'legacy-encoded'/f'{id}-stance-contact.png';sheet.save(contact)
    rows.append(dict(id=id,mp4Sha256=hashlib.sha256(path.read_bytes()).hexdigest(),
        actualEncodedContact=str(contact.relative_to(ROOT)),samples=chain,
        plantedFootWorldDriftPx=chain[-1]['worldFootX']-chain[0]['worldFootX'],
        actorTravelPx=chain[-1]['actorX']-chain[0]['actorX'],
        conclusion='贴地脚相对身体向前移动，并叠加演员向前位移；确有反向步态与滑步。'))
    print(id+' grounded world drift '+str(round(rows[-1]['plantedFootWorldDriftPx'],3)),flush=True)
report=dict(method='Read-only old rig joint inference plus actual encoded sequential frames; not optical-flow measurements.',
    previousRigSha256=hashlib.sha256((OUT/'previous-xiaoman-rig.py').read_bytes()).hexdigest(),
    previousGeneratorSha256=hashlib.sha256((OUT/'previous-generate-ending-films.py').read_bytes()).hexdigest(),
    films=rows)
(OUT/'legacy-gait-diagnosis.json').write_text(json.dumps(report,ensure_ascii=False,indent=2),encoding='utf8')
