"""小满唯一人物源：固定骨长/头脸/衣料，连续关节动画，游戏与结局共用。

不是不同姿势的人像拼接，也不使用光流改变脸。render_pose 返回透明 RGBA。
python scripts/xiaoman_rig.py 会完整重建运行帧、兼容帧及视觉验收图。
"""
from __future__ import annotations
import hashlib, json, math
from pathlib import Path
from PIL import Image, ImageDraw, ImageChops

ROOT = Path(__file__).resolve().parents[1]
PALETTE = dict(outline='#283d46', skin='#ddb58b', skinShade='#bb896b', hair='#302e2b',
    hairLight='#524740', shirt='#eee6cf', shirtShade='#c6bfac', collar='#faf2df',
    scarf='#a95347', trousers='#36596c', trousersShade='#294656',
    shoe='#e5dfce', sole='#aca99b', bag='#334d60', bagLight='#506879', strap='#546e78')
RIG = dict(characterId='xiaoman', revision='fixed-rig-v3', canvas=[48,48], foot=[24,44],
    visibleStandingHeight=40, headHeight=8, headWidth=7.8, torsoLength=14,
    upperLeg=7, lowerLeg=7, upperArm=6.1, lowerArm=5.6,
    visualAge=11, referenceHeightCm=142, referenceMassKg=34, palette=PALETTE)
MOTION = dict(slideSeconds=.8, slideEntrySeconds=.12, slideRecoverySeconds=.25,
    slideRecoveryLowSeconds=.15, standingCollisionHeight=40, slidingCollisionHeight=18,
    runSpeed=72, jumpVelocity=230, gravity=600, diveVelocity=-500)
GAIT = dict(cycleTravel=32, stanceFraction=.5, ankleY=42.8, halfSpan=8, hipY=30.8, hipBob=.6, swingLift=8)
ACTIONS = dict(idle=(8,12), run=(16,36), runStart=(6,60), jump=(16,16/(460/600)),
    doubleJump=(16,16/(460/600)), dive=(6,60), slide=(20,25),
    slideRecovery=(8,32), land=(6,24), hurt=(8,24), sit=(8,12),
    climb=(16,24), break_=(10,25), sleep=(8,12), celebrate=(16,24))
SKINS = ['waistJacket','raincoat','namelessNotebook']
VARIANTS = ['obedient','rebel','cheerful','closed','givingup','persistent','neat','messy']
LEGACY = dict(idle=4,run=10,jump=6,doubleJump=6,dive=4,slide=6,land=4,hurt=4,sit=4)
TEXTURE = dict(kind='deterministic-paper-grain',amplitudeRgb=2,alphaPreserved=True,pixelGame=False)
_PAPER_NOISE={}

def clamp(v): return max(0,min(1,v))
def smooth(v): v=clamp(v); return v*v*(3-2*v)
def mix(a,b,t): return tuple(x+(y-x)*t for x,y in zip(a,b))
def add(a,b): return a[0]+b[0], a[1]+b[1]
def mul(a,v): return a[0]*v,a[1]*v
def rotate(v,a): return (v[0]*math.cos(a)-v[1]*math.sin(a),v[0]*math.sin(a)+v[1]*math.cos(a))

def ik(root, target, l1, l2, side=1):
    dx,dy=target[0]-root[0],target[1]-root[1]
    dist=max(.001,math.hypot(dx,dy)); reach=min(dist,l1+l2-.001)
    along=(l1*l1-l2*l2+reach*reach)/(2*reach)
    height=math.sqrt(max(0,l1*l1-along*along))
    # Restrict the foot target to physical leg reach rather than stretch a limb.
    end=(root[0]+dx/dist*reach,root[1]+dy/dist*reach)
    knee=(root[0]+dx/dist*along+dy/dist*height*side,
          root[1]+dy/dist*along-dx/dist*height*side)
    return knee,end

def run_foot(phase):
    """右行步态：支撑脚向后走32px/周期，腾空脚收回前方。

    世界坐标 x=actorX+(footX-24)*scale；按位移/32/scale累计phase，
    支撑半周期的世界脚点恒定。Hermite摆腿在两端保持同一水平速度。
    """
    phase=phase%1
    if phase<=GAIT['stanceFraction']:
        return (24+GAIT['halfSpan']-GAIT['cycleTravel']*phase,GAIT['ankleY']),True
    v=(phase-GAIT['stanceFraction'])/(1-GAIT['stanceFraction'])
    offset=GAIT['halfSpan']*(-1-2*v+12*v*v-8*v*v*v)
    return (24+offset,GAIT['ankleY']-GAIT['swingLift']*math.sin(math.pi*v)),False

def pose(action,p,override=None):
    p=clamp(p); cycle=2*math.pi*p
    if action=='runStart':
        # 左脚在100ms入跑期间保持支撑，右脚先抬起再前摆；末端接run相位0.5。
        # 7px入跑脚程对应72px/s的0.1秒，量化误差最多0.2px，绝不向前蹭地。
        first=pose('idle',0);last=pose('run',.5)
        entry=dict(hip=mix(first['hip'],last['hip'],p),lean=first['lean']+(last['lean']-first['lean'])*smooth(p),
            feetTargets=[mix(first['feet'][i],last['feet'][i],p) for i in (0,1)],
            handTargets=[mix(first['hands'][i],last['hands'][i],smooth(p)) for i in (0,1)])
        entry['feetTargets'][1]=add(entry['feetTargets'][1],(0,-4*math.sin(math.pi*p)))
        entry.update(override or {})
        return pose('run',.5,entry)
    hip=(24,28.3); lean=0; lf=(23,42); rf=(26,42)
    arms=[(-.4,1.3),(1.8,1.1)] # shoulder -> elbow/hand forward offsets, filled below
    if action=='run':
        hip=(24,GAIT['hipY']+GAIT['hipBob']*math.cos(2*cycle)); lean=.14
        lf,_=run_foot(p);rf,_=run_foot(p+.5)
    elif action=='jump':
        tuck=math.sin(math.pi*p)**.7
        hip=(24,30); lean=.1*math.sin(cycle)
        lf=(22-5*tuck,42-7*tuck); rf=(27+3*tuck,42-10*tuck)
    elif action=='doubleJump':
        # 二段跳采用单独的收膝/摆臂节奏；仍由同一固定骨架反解，避免
        # 复制普通跳跃帧后看起来像动作没有发生。
        tuck=math.sin(math.pi*p)**.62
        lift=math.sin(math.pi*p)
        hip=(24.35,30.35-.55*lift); lean=-.12+.08*lift
        lf=(21.2-4.6*tuck+1.1*lift,41.6-8.6*tuck)
        rf=(28.4+3.8*tuck-1.1*lift,41.4-7.8*tuck)
    elif action=='dive':
        strength=smooth(p)
        hip=(24,28.5+.5*strength); lean=.2+.26*strength
        lf=(21-strength,40-2*strength); rf=(29,41-strength)
    elif action in ('slide','slideRecovery'):
        # 恢复阶段在全部 8 帧上连续抬髋。旧公式会把前 5 帧锁在同一
        # 低姿态，导致重复帧和突然站起；时间归一化后首帧仍与滑铲
        # 末端相接，末帧回到站立骨架。
        low= smooth(p*MOTION['slideSeconds']/MOTION['slideEntrySeconds']) if action=='slide' else 1-smooth(p)
        hip=mix((24,28.3),(18,40),low); lean=math.radians(80)*low
        lf=mix((23,42),(8,42),low);rf=mix((26,42),(30,42),low)
        if action=='slide' and low>.999:
            # The low body settles with road motion instead of freezing 17 keys.
            hip=add(hip,(.28*math.sin(cycle*2),.12*math.sin(cycle*3)))
            lean+=math.radians(.7)*math.sin(cycle*2)
    elif action=='land':
        squash=math.sin(math.pi*p)*2.6
        hip=(24,28.3+squash); lean=.05
        lf=(21.5,42);rf=(27.5,42)
    elif action=='hurt':
        hip=(24-1.5*math.sin(math.pi*p),28.3+.4*math.sin(math.pi*p));lean=-.18*math.sin(math.pi*p)
        lf=(21,42);rf=(28,42)
    elif action in ('sit','deskSit','sleep'):
        hip=(21,28);lean=.04+.007*math.sin(cycle) if action!='sleep' else .8
        lf=(29,42);rf=(32,42)
    elif action=='climb':
        hip=(24,29);lean=.14
        lf=(21,38-3*math.sin(cycle));rf=(29,38+3*math.sin(cycle))
    elif action in ('break','break_'):
        hip=(23,28.3);lean=.14*math.sin(math.pi*p)
    elif action=='celebrate':
        hip=(24,28.3-.5*math.sin(cycle));lean=.03*math.sin(cycle)
    elif action=='idle':
        # Breathing moves the torso a fraction of a pixel; shoes stay planted.
        hip=(24,28.3+.15*math.sin(cycle))
    override=override or {}
    if 'hip' in override:hip=tuple(override['hip'])
    if 'lean' in override:lean=float(override['lean'])
    if 'feetTargets' in override:lf,rf=override['feetTargets']
    shoulder=add(hip,(math.sin(lean)*RIG['torsoLength'],-math.cos(lean)*RIG['torsoLength']))
    head=add(shoulder,(.7+1.4*math.sin(lean),-5.7))
    knees=[]; feet=[]
    for j,foot in enumerate((lf,rf)):
        bend=-1 if action in ('slide','slideRecovery') and j==0 and hip[1]>33 else 1
        knee,end=ik(hip,foot,7,7,bend);knees.append(knee);feet.append(end)
    if action in ('sit','deskSit','sleep') and 'feetTargets' not in override:
        # Thigh lies on the seat, shin hangs vertically. A child's feet may hang
        # above the ground; forcing feet to the standing anchor stretches bones.
        knees=[(27.9,29.15),(28,28)];feet=[(28.5,36.12),(28.4,34.99)]
    elbows=[]; hands=[]
    for i in (0,1):
        root=add(shoulder,(-.9 if i==0 else .9,1.3))
        if action=='run':
            # 同侧手臂与腿反相：前脚着地时该侧手在后方，保持正常跑姿。
            swing=-(run_foot(p+i*.5)[0][0]-24)/GAIT['halfSpan']
            hand=add(root,(5.6*swing,7-2*abs(swing)))
        elif action=='jump':
            hand=add(root,((-5 if i==0 else 6)*math.sin(math.pi*p),5-7*math.sin(math.pi*p)))
        elif action=='doubleJump':
            burst=math.sin(math.pi*p)
            side=-1 if i==0 else 1
            hand=add(root,(side*(3+(4 if i else 3)*burst),4-8*burst))
        elif action in ('slide','slideRecovery'):
            low=smooth(p*.8/.12) if action=='slide' else 1-smooth(p)
            hand=mix(add(root,(-1 if i==0 else 2,11)),(19 if i==0 else 36,41),low)
        elif action=='climb':
            hand=add(root,(8,-7+(3 if i==0 else -3)*math.sin(cycle)))
        elif action in ('break','break_'):
            hand=add(root,(2+10*math.sin(math.pi*p) if i else -3,3 if i else 7))
        elif action=='sleep': hand=(32 if i else 29,24)
        elif action=='deskSit': hand=(32 if i else 30,21.4)
        elif action=='sit': hand=add(hip,(9 if i else 6,-1))
        elif action=='celebrate':hand=add(root,(7 if i else -6,-8))
        elif action=='hurt':hand=add(root,(-3 if i else 5,5))
        else:hand=add(root,(2 if i else -1,10.8))
        if 'handTargets' in override:hand=tuple(override['handTargets'][i])
        arm_bend=1 if i==0 else -1
        if action in ('slide','slideRecovery') and i==1 and shoulder[1]>27:arm_bend=1
        elbow,end=ik(root,hand,6.1,5.6,arm_bend)
        elbows.append(elbow);hands.append(end)
    if action=='sleep': head=(32,20.1+.035*math.sin(cycle))
    return dict(hip=hip,shoulder=shoulder,head=head,lean=lean,knees=knees,feet=feet,elbows=elbows,hands=hands)

class Canvas:
    def __init__(self,size): self.factor=size/48;self.image=Image.new('RGBA',(size,size));self.draw=ImageDraw.Draw(self.image)
    def pt(self,v):return (round(v[0]*self.factor),round(v[1]*self.factor))
    def poly(self,pts,c):self.draw.polygon([self.pt(q) for q in pts],fill=c)
    def line(self,pts,c,w):self.draw.line([self.pt(q) for q in pts],fill=c,width=max(1,round(w*self.factor)),joint='curve')
    def ellipse(self,x,y,rx,ry,c):self.draw.ellipse([self.pt((x-rx,y-ry)),self.pt((x+rx,y+ry))],fill=c)
    def limb(self,a,b,w,c):
        self.line([a,b],PALETTE['outline'],w+.55);self.ellipse(*a,(w+.55)/2,(w+.55)/2,PALETTE['outline']);self.ellipse(*b,(w+.55)/2,(w+.55)/2,PALETTE['outline'])
        self.line([a,b],c,w);self.ellipse(*a,w/2,w/2,c);self.ellipse(*b,w/2,w/2,c)

def render_pose(action,progress=0,skin='base',variant='',wet=0,pixel=False,size=512,pose_override=None,paper_texture=True,hand_targets=None,pose_mix=None):
    """唯一输出接口。progress为0..1。pixel=False保留细腻边缘供结局使用。"""
    action='break' if action=='break_' else action
    override=dict(pose_override or {})
    if pose_mix:
        other,amount=pose_mix;amount=smooth(amount)
        first=pose(action,progress);second=pose(other,progress)
        blended=dict(hip=mix(first['hip'],second['hip'],amount),lean=first['lean']+(second['lean']-first['lean'])*amount,
            feetTargets=[mix(first['feet'][i],second['feet'][i],amount) for i in (0,1)],
            handTargets=[mix(first['hands'][i],second['hands'][i],amount) for i in (0,1)])
        blended.update(override);override=blended
    if hand_targets is not None:override['handTargets']=hand_targets
    q=pose(action,progress,override);c=Canvas(size*2 if not pixel else 96)
    pal=dict(PALETTE);older=variant=='older'
    if older:pal.update(shirt='#344e65',shirtShade='#263c50',collar='#e6ded0')
    if skin=='raincoat':pal.update(shirt='#cbb465',shirtShade='#ab954f',collar='#e0cf91')
    h=q['hip'];s=q['shoulder'];a=q['lean'];hd=q['head']
    def local(x,y):return add(h,rotate((x,y*RIG['torsoLength']/14),a))
    # Rear limbs always precede the body: no random layer/depth drift between keys.
    for i in (0,1):
        col=pal['trousersShade'] if i==0 else pal['trousers']
        c.limb(h,q['knees'][i],3.3,col);c.limb(q['knees'][i],q['feet'][i],2.9,col)
        f=q['feet'][i];toe=(f[0]+2.8,min(43.5,f[1]+.7))
        c.poly([(f[0]-1.3,f[1]-.9),(f[0]+1.1,f[1]-.9),(toe[0]+.7,toe[1]),(toe[0]+.7,toe[1]+.65),(f[0]-1.3,f[1]+1.2)],pal['outline'])
        c.poly([(f[0]-1.05,f[1]-.65),(f[0]+.9,f[1]-.65),(toe[0]+.45,toe[1]),(toe[0]+.45,min(44,toe[1]+.6)),(f[0]-1.05,min(44,f[1]+.95))],pal['shoe'])
        c.line([(f[0]-.8,min(44,f[1]+.95)),(toe[0]+.4,min(44,toe[1]+.6))],pal['sole'],.5)
        c.line([(f[0]+.2,f[1]-.3),(f[0]+1.3,f[1])],pal['bagLight'],.3)
    # Backpack follows torso orientation; its shape, pocket and two straps are fixed.
    bag=[local(-5,-13),local(-2,-12),local(-2,-2),local(-5.1,-1),local(-6.4,-3),local(-6.3,-10)]
    c.poly(bag,pal['outline']);c.poly([local(-5,-12.3),local(-2.5,-11.4),local(-2.5,-2.5),local(-5.2,-2),local(-5.8,-4),local(-5.7,-10)],pal['bag'])
    c.line([local(-5.3,-10),local(-3,-10)],pal['bagLight'],.55)
    c.poly([local(-5.6,-6),local(-3,-6),local(-3,-3),local(-5.6,-3)],pal['bagLight'])
    # Back sleeve/arm, same bone lengths and cuff registration as the front.
    def arm(i):
        root=add(s,(-.9 if i==0 else .9,1.3));elbow=q['elbows'][i];hand=q['hands'][i]
        c.limb(root,elbow,2.6,pal['shirtShade'] if i==0 else pal['shirt'])
        cuff=mix(elbow,hand,.76)
        c.limb(elbow,cuff,2.2,pal['shirtShade'] if i==0 else pal['shirt'])
        c.line([mix(elbow,hand,.66),cuff],pal['collar'],2.3)
        c.limb(cuff,hand,1.85,pal['skin']);c.ellipse(*hand,1.1,1.25,pal['skin'])
    arm(0)
    body=[local(-2.7,-13.8),local(2.3,-13.8),local(3.1,-1.0),local(-3.2,-.6)]
    c.poly(body,pal['outline']);c.poly([local(-2.2,-13.3),local(1.8,-13.3),local(2.5,-1.1),local(-2.6,-1.1)],pal['shirt'])
    c.poly([local(-2.2,-12),local(-.7,-11),local(-.6,-1.2),local(-2.6,-1.2)],pal['shirtShade'])
    c.line([local(1.0,-10),local(1.2,-2)],pal['shirtShade'],.35)
    for y in (-9,-6,-3):c.ellipse(*local(1.05,y),.18,.18,pal['outline'])
    c.line([local(-1.4,-12.8),local(-1.8,-2.8)],pal['strap'],.85)
    c.line([local(2,-12.3),local(1.6,-4.5)],pal['strap'],.6)
    c.poly([add(s,(-.8,-2.1)),add(s,(1.7,-2.1)),add(s,(1.7,.5)),add(s,(-.8,.5))],pal['skin'])
    c.poly([local(-1.8,-13.7),local(.1,-12.1),local(.6,-13.8)],pal['collar'])
    c.poly([local(.6,-13.8),local(2,-12.8),local(1.2,-11.9)],pal['collar'])
    if not older:
        c.poly([local(-1.3,-13.5),local(.5,-12.4),local(1.5,-13.4),local(.5,-10.7)],pal['scarf'])
        c.poly([local(.4,-11.4),local(1.7,-7.9),local(.4,-8.5),local(-.1,-10.9)],pal['scarf'])
    if skin=='waistJacket':
        c.poly([local(-3,-3),local(3,-3),local(3.6,-.3),local(-3.5,-.1)],'#6c8d98')
        c.poly([local(.7,-1),local(2,-1),local(2.2,3.8),local(.9,4.4)],'#698590')
    if skin=='raincoat':
        c.line([local(-2.2,-12.6),local(1.9,-12.6)],'#927f48',.4)
        c.poly([local(-2.8,-3),local(2.8,-3),local(3.4,2),local(-3.7,2)],pal['shirt'])
    arm(1)
    if skin=='namelessNotebook':
        c.poly([local(-5,-5.8),local(-2,-6.1),local(-1.7,-1.5),local(-4.7,-1.2)],'#d5c79e')
        c.line([local(-4.5,-5.6),local(-4.2,-1.6)],'#a09270',.35)
    # Head template is drawn once with fixed landmarks. Expressions never redraw identity.
    hx,hy=hd
    c.ellipse(hx,hy,3.55,3.8,pal['outline']);c.ellipse(hx+.25,hy+.5,3.3,3.15,pal['skin'])
    c.poly([(hx+2.45,hy-.9),(hx+4.15,hy+.4),(hx+2.8,hy+1.05),(hx+2.65,hy+2.3),(hx+1.4,hy+3.3),(hx-.2,hy+3.5)],pal['skin'])
    c.ellipse(hx-2,hy+.7,.8,1.2,pal['skinShade']);c.ellipse(hx-1.85,hy+.65,.5,.9,pal['skin'])
    hair=[(hx-3.8,hy+.8),(hx-3.95,hy-1.0),(hx-3.1,hy-3.0),(hx-1.9,hy-4.0),(hx+.8,hy-4.15),(hx+2.6,hy-3.7),(hx+3.4,hy-2.4),(hx+2.65,hy-1.0),(hx+2.1,hy-2.1),(hx+1.3,hy-.85),(hx+.5,hy-2.05),(hx-.4,hy-.6),(hx-1.4,hy-1.4),(hx-1.6,hy+.75),(hx-2.5,hy+1.35)]
    c.poly(hair,pal['hair']);c.line([(hx-2.4,hy-2.7),(hx-.8,hy-3.35),(hx+1.1,hy-3.2)],pal['hairLight'],.5)
    if action=='sleep':c.line([(hx+1.2,hy+.75),(hx+2.45,hy+.8)],pal['outline'],.4)
    else:
        c.ellipse(hx+2.12,hy+.55,.36,.48,pal['outline']);c.ellipse(hx+2.25,hy+.35,.11,.13,'#f9f0d8')
        brow=-.4 if variant in ('persistent','rebel') else -.15
        c.line([(hx+1.1,hy-.55+brow),(hx+2.5,hy-.6)],pal['hair'],.36)
    mouthY=hy+2.22
    c.line([(hx+1.65,mouthY),(hx+2.6,mouthY+(.25 if variant=='cheerful' else -.12 if variant=='closed' else 0))],pal['skinShade'],.32)
    if variant=='messy':c.line([local(.3,-7),local(1.8,-6.6)],'#9a9788',.45)
    if variant=='rebel':c.poly([local(-2,-6),local(-.7,-6),local(-.7,-4.8),local(-2,-4.8)],'#996c5d')
    if wet:
        # Wetness affects fabric only. It never replaces the head/skin/template.
        alpha=int(95*clamp(wet/100));wash=Image.new('RGBA',c.image.size);wd=ImageDraw.Draw(wash)
        for px,py in [(-1,-3),(1,-2),(-4,-4)]:
            x,y=local(px,py);wd.ellipse([c.pt((x-.8,y-1.4)),c.pt((x+.8,y+1.4))],fill=(57,91,107,alpha))
        c.image=Image.alpha_composite(c.image,wash)
    # Output uses one canvas size and anchor for every posture. No pose-specific fit.
    if pixel:return c.image.resize((size,size),Image.Resampling.NEAREST)
    result=c.image.resize((size,size),Image.Resampling.LANCZOS)
    if paper_texture:
        # Deterministic, faint paper grain. It affects RGB by at most two levels;
        # the alpha mask, face landmarks, pose and palette identity stay fixed.
        noise=_PAPER_NOISE.get(size)
        if noise is None:
            noise=Image.frombytes('L',(size,size),bytes(126+(((i*1664525+1013904223)^((i//size)*2909))%5) for i in range(size*size)))
            _PAPER_NOISE[size]=noise
        result=Image.merge('RGBA',(*[ImageChops.add(result.getchannel(ch),noise,offset=-128) for ch in 'RGB'],result.getchannel('A')))
    return result

def frame_progress(action,i,n):
    if action=='slideRecovery':
        # 让恢复序列最后一帧真正落到站立端点，避免跑步第一帧再跳一次。
        return i/max(1,n-1)
    return i/n if action in ('idle','run','runStart','sit','sleep','climb','celebrate','slide','jump','doubleJump','dive') else i/max(1,n-1)

def main():
    resource=ROOT/'assets/resources/art';out=resource/'pixel/character/hd';qa=ROOT/'build/qa/xiaoman-fixed-rig';qa.mkdir(parents=True,exist_ok=True)
    records=[]
    fallback={}; anchors={}; colors=[]
    def write(path,action,i,n,skin='base',variant='',wet=0):
        path.parent.mkdir(parents=True,exist_ok=True)
        img=render_pose(action,frame_progress(action,i,n),skin,variant,wet,pixel=True,size=96)
        img.save(path)
        records.append(dict(path=str(path.relative_to(ROOT)).replace('\\','/'),sha256=hashlib.sha256(path.read_bytes()).hexdigest(),action=action,skin=skin,variant=variant,wet=wet,frame=i,progress=frame_progress(action,i,n)))
    for action,(count,fps) in ACTIONS.items():
        action='break' if action=='break_' else action
        fallback[action]=[]
        anchors[action]=[]
        for i in range(count):
            write(out/action/f'{i:02d}.png',action,i,count)
            q=pose(action,frame_progress(action,i,count));anchors[action].append([*q['hands'][1],*q['head'],*q['hip']])
            im=render_pose(action,frame_progress(action,i,count),pixel=True,size=96)
            runs=[]
            for y in range(96):
                x=0
                while x<96:
                    rgba=im.getpixel((x,y));start=x;x+=1
                    while x<96 and im.getpixel((x,y))==rgba:x+=1
                    if not rgba[3]:continue
                    color='#%02x%02x%02x'%rgba[:3]
                    if color not in colors:colors.append(color)
                    runs.append([start,y,x-start,1,colors.index(color)])
            # Merge equal adjacent row strips into rectangles.
            blocks=[];last={}
            for rx,ry,rw,rh,col in runs:
                key=(rx,rw,col);before=last.get(key)
                if before is not None and blocks[before][1]+blocks[before][3]==ry:blocks[before][3]+=1
                else:last[key]=len(blocks);blocks.append([rx,ry,rw,rh,col])
            fallback[action].append(blocks)
        for skin in SKINS:
            for i in range(count):write(out/'skins'/skin/action/f'{i:02d}.png',action,i,count,skin)
    # Every retained compatibility frame is rebuilt from the same rig too.
    for action,n in LEGACY.items():
        for i in range(n):
            write(resource/'character'/action/f'{i:02d}.png',action,i,n)
            write(resource/'character/hd'/action/f'{i:02d}.png',action,i,n)
            for skin in SKINS:write(resource/'character/skins'/skin/action/f'{i:02d}.png',action,i,n,skin)
            for wet in (0,15,40,70,100):write(resource/'character/wet'/str(wet)/action/f'{i:02d}.png',action,i,n,wet=wet)
    for variant in VARIANTS:
        write(resource/'character/variants'/variant/'idle.png','idle',0,1,variant=variant)
        for i in range(10):write(resource/'character/variants'/variant/'run'/f'{i:02d}.png','run',i,10,variant=variant)
        for skin in SKINS:
            write(resource/'character/skins'/skin/'variants'/variant/'idle/00.png','idle',0,1,skin,variant)
            for i in range(10):write(resource/'character/skins'/skin/'variants'/variant/'run'/f'{i:02d}.png','run',i,10,skin,variant)
        for action in ('idle','run'):
            n=ACTIONS[action][0]
            for i in range(n):
                write(out/'variants'/variant/action/f'{i:02d}.png',action,i,n,variant=variant)
                for skin in SKINS:write(out/'skins'/skin/'variants'/variant/action/f'{i:02d}.png',action,i,n,skin,variant)
    atlas_alias=dict(break_='break',climb='climb',dive='dive',double_jump='doubleJump',hurt='hurt',idle='idle',jump_air='jump',jump_start='jump',land='land',run_contact='run',run_flight='run',run_pass='run',run_push='run',sit='sit',slide='slide')
    for name,action in atlas_alias.items():
        name='break' if name=='break_' else name
        write(out/f'{name}.png',action,0 if name in ('idle','run_contact','jump_start') else 1,4)
    canonical=render_pose('idle',0,size=1024);canonical.save(qa/'canonical.png')
    for action,(n,fps) in ACTIONS.items():
        name='break' if action=='break_' else action
        frames=[]
        for i in range(n):
            img=render_pose(name,frame_progress(name,i,n),pixel=True,size=384)
            bg=Image.new('RGBA',img.size,'#e0e2d8');bg.alpha_composite(img);frames.append(bg.convert('RGB'))
        frames[0].save(qa/f'{name}.gif',save_all=True,append_images=frames[1:],duration=([round((i+1)*100/fps)*10-round(i*100/fps)*10 for i in range(n)] if name=='run' else round(1000/fps)),loop=0)
    sheet=Image.new('RGB',(128*8,154*len(ACTIONS)),'#e0e2d8');d=ImageDraw.Draw(sheet)
    for row,(action,(n,fps)) in enumerate(ACTIONS.items()):
        action='break' if action=='break_' else action
        for col in range(8):
            i=round(col*(n-1)/7);img=render_pose(action,frame_progress(action,i,n),pixel=True,size=128)
            sheet.paste(img,(col*128,row*154),img);d.line([(col*128,row*154+117),(col*128+127,row*154+117)],fill='#94a699')
            d.text((col*128+4,row*154+133),f'{action} {i:02d}',fill='#283d46')
    sheet.save(qa/'all-actions.png')
    model_hash=hashlib.sha256(json.dumps(RIG,sort_keys=True).encode()).hexdigest()
    fallback_ts='// 自动生成自 scripts/xiaoman_rig.py；资源未加载时仍画相同模型。\nimport type { Painter } from "./Painter";\nimport type { CharacterAnimation } from "./Content";\n'
    fallback_ts+=f'export const XIAOMAN_FALLBACK_MODEL_HASH={json.dumps(model_hash)};\n'
    fallback_ts+='const colors='+json.dumps(colors,separators=(',',':'))+';\n'
    fallback_ts+='const frames:Record<string,number[][][]>='+json.dumps(fallback,separators=(',',':'))+';\n'
    fallback_ts+='const anchors:Record<string,number[][]>='+json.dumps(anchors,separators=(',',':'))+';\n'
    fallback_ts+='export function xiaomanFrameAnchors(action:CharacterAnimation,frame:number){const keys=anchors[action]||anchors.idle;return keys[Math.min(frame,keys.length-1)];}\n'
    fallback_ts+='export function drawXiaomanFallback(p:Painter,action:CharacterAnimation,frame:number,x:number,ground:number){const keys=frames[action]||frames.idle;for(const [rx,ry,w,h,c] of keys[Math.min(frame,keys.length-1)])p.rect(x-24+rx/2,ground-44+ry/2,w/2,h/2,colors[c]);}\n'
    (ROOT/'assets/scripts/XiaomanFallback.ts').write_text(fallback_ts,encoding='utf-8')
    manifest=dict(rig=RIG,motion=MOTION,actions={a.replace('break_','break'):dict(frames=n,fps=fps) for a,(n,fps) in ACTIONS.items()},gait=GAIT,texture=TEXTURE,canonicalHash=model_hash,sourceHash=hashlib.sha256(Path(__file__).read_bytes()).hexdigest(),canonicalPngHash=hashlib.sha256((qa/'canonical.png').read_bytes()).hexdigest(),frames=records)
    (ROOT/'xiaoman-model.json').write_text(json.dumps(manifest,ensure_ascii=False,indent=2),encoding='utf-8')
    print(f'Rebuilt {len(records)} RGBA frames. canonicalHash={model_hash}')
    print(f'Canonical: {qa/"canonical.png"}\nVisual sheet: {qa/"all-actions.png"}')

if __name__=='__main__':main()
