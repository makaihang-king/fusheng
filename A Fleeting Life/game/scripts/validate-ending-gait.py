"""核新电影的真实位移步态，并从最终编码MP4取连续支撑帧。

数值证明来自真实rig关节和渲染像素取整；编码帧供人目检，不冒称光流测量。
落座、蹬跳、攀墙及摄影机升镜均不纳入纯步行锁地证明。
"""
import argparse, hashlib, json, math, subprocess
from pathlib import Path
from PIL import Image, ImageDraw, ImageFont
from generate_ending_import import ending_module
from xiaoman_rig import pose, RIG

film=ending_module();OUT=film.ROOT/'build/qa/gait-revision';OUT.mkdir(parents=True,exist_ok=True)
parser=argparse.ArgumentParser();parser.add_argument('--id',choices=film.IDS);parser.add_argument('--skin',choices=film.SKINS,default='base');parser.add_argument('--numeric-only',action='store_true');args=parser.parse_args()

def inspect(key,t):
    state=film.walk_state(key,t)
    p=round((state['phase']%1)*film.PHASE_SAMPLES)%film.PHASE_SAMPLES/film.PHASE_SAMPLES
    q=pose('run',p,state['override'])
    direction=-1 if state['direction']=='left' else 1
    originX=round((state['x']-state['size']/2)*film.S)+(1 if direction==-1 else 0)
    originY=round((state['floor']-state['size']*44/48)*film.S)
    feet=[]
    for i in (0,1):
        local=q['feet'][i];world=(state['x']+direction*(local[0]-24)*state['scale'],state['floor']+(local[1]-44)*state['scale'])
        # 平滑rig先在2倍RGBA画布画点，再LANCZOS缩回；记录点中心，不假称编码光流。
        rasterX=round(local[0]*state['size']*film.S*2/48)/2
        if direction==-1:rasterX=round(state['size'])*film.S-1-rasterX
        pixel=((originX+rasterX)/film.S,(originY+round(local[1]*state['size']*film.S*2/48)/2)/film.S)
        target=state['anchors'][i] if not state['starting'] else None
        error=math.dist(world,target) if target else None
        pixelError=math.dist(pixel,target) if target else None
        assert abs(math.dist(q['hip'],q['knees'][i])-RIG['upperLeg'])<.001
        assert abs(math.dist(q['knees'][i],local)-RIG['lowerLeg'])<.001
        armRoot=(q['shoulder'][0]+(-.9 if i==0 else .9),q['shoulder'][1]+1.3)
        assert abs(math.dist(armRoot,q['elbows'][i])-RIG['upperArm'])<.001
        assert abs(math.dist(q['elbows'][i],q['hands'][i])-RIG['lowerArm'])<.001
        if error is not None:assert error<1e-6,(key,t,i,error)
        if pixelError is not None:assert pixelError<.72,(key,t,i,pixelError)
        feet.append(dict(foot=i,stance=state['stance'][i] and not state['starting'],world=world,pixel=pixel,anchor=target,error=error,pixelError=pixelError,
            event=math.floor(state['phase']+i*.5)-i*.5))
    return dict(seconds=t,actorX=state['x'],floor=state['floor'],size=state['size'],phase=state['phase'],feet=feet)

routes=[]
for key,route in film.WALK_ROUTES.items():
    if args.id and not(key==args.id or key.startswith(args.id+'-')):continue
    end=min(route['end'],route.get('pureEnd',route['end']))
    samples=[inspect(key,route['start']+(end-route['start'])*n/1000) for n in range(1001)]
    exact=[f['error'] for s in samples for f in s['feet'] if f['stance']]
    raster=[f['pixelError'] for s in samples for f in s['feet'] if f['stance']]
    routes.append(dict(route=key,samples=1001,interval=[route['start'],end],strideLogicalPx=film.route_gait(key)['cycleTravel'],gait=film.route_gait(key),
        renderScale=route['size']/48,maxGroundedAnkleErrorPx=max(exact),maxRenderedRoundingErrorPx=max(raster),
        fixedBoneLengths=True,continuousActorX=True,direction=route.get('direction','right')))

report=dict(gaitRevision=film.GAIT_REVISION,rigSha256=film.RIG_SOURCE_SHA256,generatorSha256=film.GENERATOR_SOURCE_SHA256,
    method='Actual shared rig pose + rendered pixel rounding, with separately decoded MP4 specimens. This is not optical-flow tracking.',
    samplingMethod='Six consecutive encoded frames in one support event; the planted-foot crop must not intersect a visible subtitle region.',
    scope='Pure flat walking only. Seat depth, jumps, climbing and camera reveal use separate narrative motion.',routes=routes,encodedFilms=[])

def visible_foot_crop(id,sample):
    # 只选可直接看见鞋/地面的编码取样。片内字幕也属于真实编码，不能抹掉后冒称原画。
    t=sample['seconds'];x,y=sample['pixel'];crop=(x-26,y-14,x+26,y+10)
    regions=[]
    if 1.2<t<4.6 and not (id=='morning' and t<1.65):regions.append((128,325,512,350))
    if (8.5 if id=='runaway' else 7)<t<11.85:regions.append((78,316,562,354))
    return all(crop[2]<=left or crop[0]>=right or crop[3]<=top or crop[1]>=bottom for left,top,right,bottom in regions)
if not args.numeric_only:
    for id in ([args.id] if args.id else film.IDS):
        candidates=[];film.ACTORS_ENABLED=False
        for n in range(360):
            film.ACTOR_REQUESTS=[];film.SCENES[id](n/30)
            for r in film.ACTOR_REQUESTS:
                gait=r.get('gait')
                if not gait or not gait['pureWalking']:continue
                sample=inspect(gait['route'],n/30)
                for foot in sample['feet']:
                    if not foot['stance']:continue
                    candidates.append(dict(frame=n,route=gait['route'],seconds=n/30,actorX=r['x'],floor=r['floor'],size=r['size'],**foot))
        film.ACTORS_ENABLED=True
        groups=[]
        for first in candidates:
            chain=[first]
            for offset in range(1,6):
                found=next((r for r in candidates if r['frame']==first['frame']+offset and r['route']==first['route'] and r['foot']==first['foot'] and r['event']==first['event']),None)
                if found is None:break
                chain.append(found)
            if len(chain)==6 and all(visible_foot_crop(id,s) for s in chain):groups.append(chain)
        if not groups:raise AssertionError('No continuous encoded six-frame support interval: '+id)
        chain=max(groups,key=lambda rows:abs(rows[-1]['actorX']-rows[0]['actorX']))
        movie=film.DEST/f'{id}.mp4' if args.skin=='base' else film.DEST/'skins'/args.skin/f'{id}.mp4'
        manifest=json.loads((film.QA/args.skin/f'{id}-manifest.json').read_text(encoding='utf8'))
        assert manifest['rigSha256']==film.RIG_SOURCE_SHA256 and manifest['generatorSha256']==film.GENERATOR_SOURCE_SHA256
        assert manifest.get('gaitRevision')==film.GAIT_REVISION
        sha=hashlib.sha256(movie.read_bytes()).hexdigest();assert sha==manifest['sha256']
        sub=OUT/'new-encoded'/args.skin/id;sub.mkdir(parents=True,exist_ok=True)
        filt='+'.join('eq(n\\,'+str(r['frame'])+')' for r in chain)
        subprocess.run([str(film.FFMPEG),'-v','error','-y','-i',str(movie),'-vf','select='+filt,'-vsync','0',str(sub/'%02d.png')],check=True)
        screenshots=sorted(sub.glob('*.png'));assert len(screenshots)==6
        sheet=Image.new('RGB',(640*3,470*2),'#efe9dc');draw=ImageDraw.Draw(sheet);font=ImageFont.truetype(film.FONT,17)
        for k,(screenshot,sample) in enumerate(zip(screenshots,chain)):
            x=(k%3)*640;y=(k//3)*470;actual=Image.open(screenshot)
            sheet.paste(actual.resize((640,360)),(x,y+30))
            draw.text((x+8,y+4),f"{id} frame {sample['frame']} / {sample['seconds']:.3f}s",font=font,fill='#354c44')
            footX,footY=sample['pixel'];region=(round((footX-26)*2),round((footY-14)*2),round((footX+26)*2),round((footY+10)*2))
            sheet.paste(actual.crop(region).resize((208,96)),(x+2,y+373))
            draw.text((x+220,y+385),f"body x={sample['actorX']:.2f}",font=font,fill='#354c44')
            draw.text((x+220,y+410),f"planted ankle x={sample['world'][0]:.3f}",font=font,fill='#354c44')
        contact=OUT/'new-encoded'/args.skin/f'{id}-stance-contact.png';sheet.save(contact)
        report['encodedFilms'].append(dict(id=id,skin=args.skin,sha256=sha,actualEncodedContact=str(contact.relative_to(film.ROOT)),
            actualFrames=chain,actorTravelPx=abs(chain[-1]['actorX']-chain[0]['actorX']),
            supportWorldDriftPx=math.dist(chain[-1]['world'],chain[0]['world']),
            renderedPixelSpanPx=max(s['pixel'][0] for s in chain)-min(s['pixel'][0] for s in chain),
            contactSha256=hashlib.sha256(contact.read_bytes()).hexdigest(),
            decodedFrameSha256=[dict(path=str(path.relative_to(film.ROOT)),sha256=hashlib.sha256(path.read_bytes()).hexdigest(),frame=sample['frame']) for path,sample in zip(screenshots,chain)]))
        print('STANCE ENCODED '+args.skin+'/'+id,flush=True)

suffix=('preflight' if args.numeric_only else args.skin)+('-'+args.id if args.id else '')
path=OUT/f'new-gait-proof-{suffix}.json';path.write_text(json.dumps(report,ensure_ascii=False,indent=2),encoding='utf8')
print(str(path),flush=True)
