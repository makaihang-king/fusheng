"""独立按最终 IK 足端审查跑步接地、方向、循环与起跑接续；CPU-only。"""
import csv, hashlib, json, math
from pathlib import Path
from PIL import Image, ImageDraw, ImageSequence
from xiaoman_rig import ROOT, RIG, GAIT, ACTIONS, MOTION, pose, run_foot, render_pose

qa=ROOT/'build/qa/xiaoman-gait-revision';qa.mkdir(parents=True,exist_ok=True)
source_hash=hashlib.sha256((ROOT/'scripts/xiaoman_rig.py').read_bytes()).hexdigest()
model=json.loads((ROOT/'xiaoman-model.json').read_text(encoding='utf8'))
assert model['sourceHash']==source_hash and model['gait']==GAIT
assert ACTIONS['run'][0]/ACTIONS['run'][1]*MOTION['runSpeed']==GAIT['cycleTravel']
previous=qa/'previous/xiaoman-model.json'
unchanged=0
if previous.exists():
    old=json.loads(previous.read_text(encoding='utf8'))
    assert old['rig']==RIG and old['canonicalHash']==model['canonicalHash']
    assert old['canonicalPngHash']==model['canonicalPngHash']
    hashes={f['path']:f['sha256'] for f in model['frames']}
    for f in old['frames']:
        # These actions were deliberately regenerated for fixed-rig-v3. Keep
        # the historical snapshot for provenance, but do not treat intended
        # motion-chain updates as accidental changes.
        if f['action'] in {'run','doubleJump','slideRecovery'}:continue
        assert hashes[f['path']]==f['sha256'],f['path']
        unchanged+=1

checks=[];trajectory=[];max_error=0
for scale in [1,2,3.2]:
    for leg,start in [(0,0),(1,.5),(0,1),(1,1.5)]:
        points=[]
        for i in range(501):
            phase=start+i/1000;q=pose('run',phase%1);f=q['feet'][leg]
            target,stance=run_foot(phase+leg*.5)
            assert stance
            error=math.dist(f,target);max_error=max(max_error,error)
            assert error<1e-10 and abs(f[1]-GAIT['ankleY'])<1e-10
            wx=phase*GAIT['cycleTravel']*scale+(f[0]-24)*scale
            points.append((wx,f[1]))
            if scale==1:trajectory.append(dict(phase=phase,leg=leg,ankleX=f[0],ankleY=f[1],scroll=phase*GAIT['cycleTravel'],worldX=wx,ikTargetError=error))
        drift=max(x for x,y in points)-min(x for x,y in points)
        assert drift<1e-10
        checks.append(dict(scale=scale,leg=leg,start=start,worldXDrift=drift,ankleYDrift=max(y for x,y in points)-min(y for x,y in points)))
for i in range(1000):
    phase=i/1000;q=pose('run',phase)
    for leg in (0,1):
        root=(q['shoulder'][0]+(-.9 if leg==0 else .9),q['shoulder'][1]+1.3)
        foot,_=run_foot(phase+leg*.5)
        assert (foot[0]-24)*(q['hands'][leg][0]-root[0])<=1e-10,'同侧手臂必须与腿反相'
        assert abs(math.dist(q['hip'],q['knees'][leg])-RIG['upperLeg'])<1e-8
        assert abs(math.dist(q['knees'][leg],q['feet'][leg])-RIG['lowerLeg'])<1e-8
for a,p,b,t in [('run',0,'run',1),('runStart',0,'idle',0),('runStart',1,'run',.5)]:
    assert render_pose(a,p,pixel=True,size=96).tobytes()==render_pose(b,t,pixel=True,size=96).tobytes(),(a,p,b,t)
entry=[]
for i in range(1001):
    p=i/1000;f=pose('runStart',p)['feet'][0]
    entry.append(f[0]+MOTION['runSpeed']*.1*p)
assert max(entry)-min(entry)<=.200000001,'入跑支撑脚不能向前滑'
with (qa/'foot-world-trajectories.csv').open('w',newline='',encoding='utf8') as f:
    writer=csv.DictWriter(f,fieldnames=trajectory[0].keys());writer.writeheader();writer.writerows(trajectory)

# 使用游戏实际16张96px帧；地纹左移，每个36fps关键帧位移2逻辑px。
frames=[];factor=4;floor=190;actor_x=220
for i in range(64):
    phase=(i%16)/16;travel=i*GAIT['cycleTravel']/16
    im=Image.new('RGBA',(480,224),'#e8e4d8');d=ImageDraw.Draw(im)
    d.rectangle((0,floor,480,224),fill='#b8b6a0');d.line((0,floor,480,floor),fill='#778e78')
    for n in range(-2,12):
        xx=round(n*GAIT['cycleTravel']*factor-travel*factor)%512-16
        d.line((xx,floor+3,xx,floor+16),fill='#69816b',width=2)
    actor=Image.open(ROOT/f'assets/resources/art/pixel/character/hd/run/{i%16:02d}.png').resize((192,192),Image.Resampling.NEAREST)
    im.alpha_composite(actor,(actor_x-96,floor-176))
    d.text((8,8),f'RUN {i%16:02d} / RIGHT TRAVEL / GROUND SCROLL LEFT',fill='#263d46')
    frames.append(im.convert('RGB'))
durations=[round((i+1)*100/36)*10-round(i*100/36)*10 for i in range(len(frames))]
frames[0].save(qa/'run-grounded-scroll.gif',save_all=True,append_images=frames[1:],duration=durations,loop=0)
contact=Image.new('RGB',(960,224*4),'#eee9db')
for k,i in enumerate([0,2,4,6,8,10,12,14]):contact.paste(frames[i],((k%2)*480,(k//2)*224))
contact.save(qa/'ground-scroll-contact.png')
# 60fps的起跑预览也按累计时间分配10/20ms，避免GIF逐帧向下量化成60ms。
# 此处只重编码已生成PNG的QA预览，不修改冻结的模型或任何运行帧。
entry_frames=[]
entry_count,entry_fps=ACTIONS['runStart']
for i in range(entry_count):
    actor=Image.open(ROOT/f'assets/resources/art/pixel/character/hd/runStart/{i:02d}.png').resize((384,384),Image.Resampling.NEAREST)
    background=Image.new('RGBA',actor.size,'#e0e2d8');background.alpha_composite(actor)
    entry_frames.append(background.convert('RGB'))
entry_durations=[round((i+1)*100/entry_fps)*10-round(i*100/entry_fps)*10 for i in range(entry_count)]
entry_frames[0].save(ROOT/'build/qa/xiaoman-fixed-rig/runStart.gif',save_all=True,append_images=entry_frames[1:],duration=entry_durations,loop=0)
gifs=[]
for action in ['runStart','run']:
    im=Image.open(ROOT/f'build/qa/xiaoman-fixed-rig/{action}.gif')
    durations=[f.info.get('duration',0) for f in ImageSequence.Iterator(im)]
    gifs.append(dict(action=action,frames=len(durations),durationMs=sum(durations),frameDurationMs=durations))
assert gifs[1]['durationMs']==440,'36fps GIF需要分配20/30ms，而不能每帧截为20ms'
assert gifs[0]['durationMs']==100,'入跑GIF预览必须呈现100ms的真实过渡'
report=dict(sourceHash=source_hash,canonicalHash=model['canonicalHash'],gait=GAIT,
    actions=model['actions'],actualIKSupportChecks=checks,maxIKTargetError=max_error,
    oppositeArms=True,loopSeamIdentical=True,entryEndpointPixelsIdentical=True,
    entryWorldDriftPx=max(entry)-min(entry),unchangedNonRunPngs=unchanged,
    footCoordinateConvention='ankle; heel+1.2px touches logical y44',gifMetadata=gifs)
(qa/'gait-report.json').write_text(json.dumps(report,ensure_ascii=False,indent=2),encoding='utf8')
print(f'PASS: final IK ground supports, phase direction, opposite arms, loop seam, entry, {unchanged} unchanged PNGs')
print(qa/'gait-report.json')
