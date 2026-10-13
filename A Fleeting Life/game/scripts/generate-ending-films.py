"""生成七支真正的 12 秒结局电影。所有演员直接使用游戏唯一 xiaoman_rig。

最终背景由本机 Qwen 风格参考与 MiniMax H3 环境动态生成；同源骨骼演员控制人物身份。
无模型背景时仅可导出分镜预览，最终交付与验收要求真实 H3 动态源。
输出 1280x720 / 30 fps / H.264 + AAC，另存同片剧情关键帧供解码失败降级。
"""
from __future__ import annotations
import argparse, hashlib, json, math, subprocess, wave, uuid
from functools import lru_cache
from pathlib import Path
import numpy as np
from PIL import Image, ImageDraw, ImageFont, ImageOps
from xiaoman_rig import render_pose, RIG, PALETTE, GAIT, run_foot, pose

ROOT = Path(__file__).resolve().parents[1]
RIG_SOURCE_SHA256 = hashlib.sha256((ROOT/'scripts/xiaoman_rig.py').read_bytes()).hexdigest()
GENERATOR_SOURCE_SHA256 = hashlib.sha256(Path(__file__).read_bytes()).hexdigest()
QA = ROOT/'build/qa/ending-films'
DEST = ROOT/'assets/resources/video/endings'
FALLBACK = ROOT/'assets/resources/art/endings/cinematic'
FFMPEG = ROOT.parents[1]/'美术交付_20260926/tools/vendor/imageio_ffmpeg/binaries/ffmpeg-win-x86_64-v7.1.exe'
W,H,S,FPS,SECONDS = 640,360,2,30,12
IDS = ['morning','backrow','outside','desk','secondGrade','runaway','wall']
NAMES = ['明天的早自习','教室后排','跑道之外','小一号的课桌','回到二年级','跑出去','墙的另一边']
LINES = ['明天，还是这间教室。','有些话，后来就没有说。','路不是跑道，也一直在。','桌子小了，是我大了。','那天下午没有课。','围墙外面，也是人间。','墙的那边，也只是路。']
CLOSERS = [
 ['闹钟响了，你还是穿上了校服。','什么都没改变，也什么都还在。'],
 ['你成了那个不说话的人。','窗外很亮，桌子有点凉。'],
 ['你提前走出了校门。','不是逃离，是换了一条路走。'],
 ['升上初中以后，你回了一次小学。','那张课桌比你记得的小得多。'],
 ['某个下午，所有的门都还开着，','你还没有做过任何一个选择。'],
 ['围墙塌了。你一直跑，画面变白。','围墙外面，也只是普通的街。'],
 ['你爬到墙头，看见另一边。','墙的那边，也只是路。'],
]
COLORS = ['#f4ecd3','#b5c0c6','#efc574','#dc9976','#d4badb','#eedbb2','#a7bec5']
SKINS = ['base','waistJacket','raincoat','namelessNotebook']
CURRENT_SKIN = 'base'
ACTORS_ENABLED = True
TEXT_ENABLED = True
DYNAMIC_ELEMENTS_ENABLED = True
ACTOR_REQUESTS = []
H3_BACKGROUNDS = {}
FONT = 'C:/Windows/Fonts/msyh.ttc'
PHASE_SAMPLES = 4096
GAIT_REVISION = 'world-distance-walk-run-v2'
WALK_GAIT = dict(cycleTravel=24,stanceFraction=.5,ankleY=42.8,halfSpan=6,hipY=30.5,hipBob=.12,swingLift=2.6)
LONG_WALK_GAIT = dict(cycleTravel=32,stanceFraction=.5,ankleY=42.8,halfSpan=8,hipY=31.55,hipBob=.15,swingLift=2.6)

# 每条路线的演员位移独立于镜头。纯步行保留平坦通道；进桌椅深度属于落座。
WALK_ROUTES = {
 'morning':dict(start=1.65,end=4.9,startX=83,endX=444,floor=345,size=138,pureEnd=4.2,profile='seatApproach',seatStart=4.2,seatX=400),
 'backrow':dict(start=0,end=4.2,startX=86,endX=459,floor=345,size=136,pureEnd=3.45,profile='seatApproach',seatStart=3.45,seatX=426),
 'outside-street':dict(start=0,end=5.2,startX=98,endX=496,floor=316,size=128,profile='linear'),
 'outside-fork':dict(start=5.2,end=8.2,startX=209,endX=320,floor=330,size=126,profile='linear',exitSeconds=.25,pureEnd=7.95),
 'desk-gate':dict(start=0,end=2.3,startX=94,endX=350,floor=310,size=148,profile='linear'),
 'desk-corridor':dict(start=2.3,end=5.1,startX=107,endX=546,floor=343,size=149,profile='linear',mode='longWalk'),
 'secondGrade-corridor':dict(start=0,end=2.3,startX=115,endX=326,floor=320,size=118,profile='linear'),
 'secondGrade-enter':dict(start=4.6,end=7.4,startX=92,endX=363,floor=345,size=132,profile='linear',exitSeconds=.25,pureEnd=7.15),
 'secondGrade-leave':dict(start=9.2,end=12,startX=363,endX=94,floor=345,size=132,direction='left',profile='linear',entryTravel=5),
 'runaway':dict(start=0,end=7,startX=86,endX=515,floor=318,size=131,mode='run'),
 'wall-approach':dict(start=0,end=1.6,startX=93,endX=318,floor=314,size=132,mode='run'),
}
for _i in range(3):
    WALK_ROUTES[f'wall-runner-{_i}']=dict(start=4.9,end=12,startX=650+_i*120,
        endX=650+_i*120-(12-4.9)*58,floor=203+_i*23,size=37+_i*2,
        profile='linear',startPhase=_i*.27,secondary=True,direction='left',mode='run')

def clamp(v): return max(0,min(1,v))
def ease(v): v=clamp(v); return v*v*(3-2*v)
def lerp(a,b,t): return a+(b-a)*t
def rgb(c): return tuple(int(c[i:i+2],16) for i in (1,3,5))

def walk_position(key,t):
    route=WALK_ROUTES[key];u=clamp((t-route['start'])/(route['end']-route['start']))
    if route.get('profile')=='seatApproach':
        x=lerp(route['startX'],route['seatX'],clamp((t-route['start'])/(route['seatStart']-route['start']))) if t<route['seatStart'] else lerp(route['seatX'],route['endX'],ease((t-route['seatStart'])/(route['end']-route['seatStart'])))
        return x,route['floor'],route['size']
    amount=u if route.get('profile')=='linear' else ease(u)
    return lerp(route['startX'],route['endX'],amount),route['floor'],route['size']

def route_gait(key):
    mode=WALK_ROUTES[key].get('mode','walk')
    return GAIT if mode=='run' else LONG_WALK_GAIT if mode=='longWalk' else WALK_GAIT

def gait_foot(phase,gait):
    phase=phase%1
    if phase<=.5:return (24+gait['halfSpan']-gait['cycleTravel']*phase,gait['ankleY']),True
    v=(phase-.5)*2;offset=gait['halfSpan']*(-1-2*v+12*v*v-8*v*v*v)
    return (24+offset,gait['ankleY']-gait['swingLift']*math.sin(math.pi*v)),False

def gait_override(phase,gait,feet):
    if gait is GAIT:return {'feetTargets':feet}
    hip=(24,gait['hipY']+gait['hipBob']*math.cos(4*math.pi*phase));lean=.025
    shoulder=(hip[0]+math.sin(lean)*RIG['torsoLength'],hip[1]-math.cos(lean)*RIG['torsoLength'])
    hands=[]
    for i in (0,1):
        swing=-(gait_foot(phase+i*.5,gait)[0][0]-24)/gait['halfSpan']
        root=(shoulder[0]+(-.9 if i==0 else .9),shoulder[1]+1.3)
        hands.append((root[0]+2.2*swing,root[1]+10.7-.5*abs(swing)))
    return dict(hip=hip,lean=lean,feetTargets=feet,handTargets=hands)

def walk_state(key,t):
    route=WALK_ROUTES[key];gait=route_gait(key);x,floor,size=walk_position(key,t);scale=size/48
    direction=-1 if route.get('direction')=='left' else 1
    entry=route.get('entryTravel',0);initial=route.get('startPhase',.5-entry/gait['cycleTravel'] if entry else 0)
    travel=abs(x-route['startX']);phase=initial+travel/(gait['cycleTravel']*scale)
    feet=[];stance=[];anchors=[]
    for i in (0,1):
        foot,on_ground=gait_foot(phase+i*.5,gait);stance.append(on_ground)
        if on_ground:
            event=math.floor(phase+i*.5)-i*.5
            anchor=route['startX']+direction*(event-initial)*gait['cycleTravel']*scale+direction*gait['halfSpan']*scale
            foot=(24+direction*(anchor-x)/scale,gait['ankleY'])
            anchors.append((anchor,floor+(gait['ankleY']-44)*scale))
        else:anchors.append(None)
        feet.append(foot)
    override=gait_override(phase,gait,feet);starting=entry>0 and travel<entry*scale
    if starting:
        u=clamp(travel/(entry*scale));smooth=ease(u);idle=pose('idle',0)
        target=gait_override(.5,gait,[gait_foot(.5+i*.5,gait)[0] for i in (0,1)])
        override=dict(hip=tuple(lerp(a,b,smooth) for a,b in zip(idle['hip'],target['hip'])),
            lean=lerp(idle['lean'],target['lean'],smooth),
            feetTargets=[tuple(lerp(a,b,u) for a,b in zip(idle['feet'][i],target['feetTargets'][i])) for i in (0,1)],
            handTargets=[tuple(lerp(a,b,smooth) for a,b in zip(idle['hands'][i],target['handTargets'][i])) for i in (0,1)])
        override['feetTargets'][1]=(override['feetTargets'][1][0],override['feetTargets'][1][1]-2.6*math.sin(math.pi*u))
    return dict(x=x,floor=floor,size=size,phase=phase,travel=travel,scale=scale,gait=gait,
        direction=route.get('direction','right'),feetTargets=feet,stance=stance,anchors=anchors,override=override,starting=starting)

def walk_actor(c,key,t,variant='',skin=None,floor=None,pose_mix=None):
    state=walk_state(key,t)
    route=WALK_ROUTES[key]
    if pose_mix is None and route.get('exitSeconds'):
        pose_mix=('idle',clamp((t-(route['end']-route['exitSeconds']))/route['exitSeconds']))
    mixing=pose_mix is not None and pose_mix[1]>0
    override=state['override']
    if mixing:
        p=round((state['phase']%1)*PHASE_SAMPLES)%PHASE_SAMPLES/PHASE_SAMPLES
        first=pose('run',p,override);second=pose(pose_mix[0],p);amount=ease(pose_mix[1])
        override=dict(hip=tuple(lerp(a,b,amount) for a,b in zip(first['hip'],second['hip'])),
            lean=lerp(first['lean'],second['lean'],amount),
            feetTargets=[tuple(lerp(a,b,amount) for a,b in zip(first['feet'][i],second['feet'][i])) for i in (0,1)],
            handTargets=[tuple(lerp(a,b,amount) for a,b in zip(first['hands'][i],second['hands'][i])) for i in (0,1)])
    proof=dict(route=key,phase=state['phase'],travelPx=state['travel'],
        stridePx=state['gait']['cycleTravel']*state['scale'],stance=state['stance'],
        worldAnchors=state['anchors'],pureWalking=not mixing and not state['starting'])
    actor(c,'run',state['phase'],state['x'],state['floor'] if floor is None else floor,
        state['size'],variant,direction=state['direction'],skin=skin,
        pose_override=override,gait=proof)

def route_contact_times(key):
    route=WALK_ROUTES[key];start=walk_state(key,route['start'])['phase'];end=walk_state(key,route['end'])['phase']
    result=[]
    for half in range(math.floor(start*2)+1,math.floor(end*2)+1):
        target=half/2;lo,hi=route['start'],route['end']
        for _ in range(40):
            mid=(lo+hi)/2
            if walk_state(key,mid)['phase']<target:lo=mid
            else:hi=mid
        contact=(lo+hi)/2
        if contact<route.get('pureEnd',route['end'])-.02:result.append(contact)
    return result

class Canvas:
    def __init__(self,color='#eee7d2',image=None):
        self.im=Image.new('RGB',(W*S,H*S),color) if image is None else image.convert('RGB').copy()
        self.d=ImageDraw.Draw(self.im,'RGBA')
    def rect(self,x,y,w,h,c): self.d.rectangle([x*S,y*S,(x+w)*S,(y+h)*S],fill=c)
    def round(self,x,y,w,h,r,c): self.d.rounded_rectangle([x*S,y*S,(x+w)*S,(y+h)*S],r*S,fill=c)
    def line(self,pts,c,width=1): self.d.line([(x*S,y*S) for x,y in pts],fill=c,width=max(1,round(width*S)),joint='curve')
    def poly(self,pts,c): self.d.polygon([(x*S,y*S) for x,y in pts],fill=c)
    def ellipse(self,x,y,rx,ry,c): self.d.ellipse([(x-rx)*S,(y-ry)*S,(x+rx)*S,(y+ry)*S],fill=c)
    def text(self,txt,x,y,size=12,c='#31474a',anchor='mm'):
        if not TEXT_ENABLED:return
        self.d.text((x*S,y*S),txt,font=ImageFont.truetype(FONT,round(size*S)),fill=c,anchor=anchor)
    def overlay(self,col,alpha):
        self.im=Image.blend(self.im,Image.new('RGB',self.im.size,col),clamp(alpha))
        self.d=ImageDraw.Draw(self.im,'RGBA')

@lru_cache(maxsize=300)
def actor_image(action,frame,size,variant='',skin='base',override='',mix=''):
    return render_pose(action,frame/PHASE_SAMPLES,skin=skin,variant=variant,pixel=False,size=size*S,pose_override=json.loads(override) if override else None,pose_mix=tuple(json.loads(mix)) if mix else None)

def actor(c,action,t,x,floor,size=130,variant='',alpha=1,direction='right',shadow=True,skin=None,pose_override=None,pose_mix=None,gait=None):
    if not ACTORS_ENABLED:
        ACTOR_REQUESTS.append(dict(action=action,t=t,x=x,floor=floor,size=size,variant=variant,alpha=alpha,direction=direction,shadow=shadow,skin=skin,pose_override=pose_override,pose_mix=pose_mix,gait=gait))
        return
    phase=round((t%1)*PHASE_SAMPLES)%PHASE_SAMPLES
    im=actor_image(action,phase,round(size),variant,skin or CURRENT_SKIN,json.dumps(pose_override,sort_keys=True) if pose_override else '',json.dumps(pose_mix) if pose_mix else '')
    if direction=='left':im=ImageOps.mirror(im)
    if alpha<1:
        im=im.copy();im.putalpha(im.getchannel('A').point(lambda a:round(a*alpha)))
    if shadow:c.ellipse(x,floor+1,size*.18,size*.024,(48,66,60,42))
    # 镜像图像的像素中心是 width-1；补一物理像素保持逻辑脚锚点(24,44)。
    c.im.paste(im,(round((x-size/2)*S)+(1 if direction=='left' else 0),round((floor-size*44/48)*S)),im)
    c.d=ImageDraw.Draw(c.im,'RGBA')

def dust(c,t,count=24,color=(255,247,213,110)):
    for i in range(count):
        x=(i*83.17+t*(2+(i%5)*.3))%660-10
        y=45+(i*37.71+t*(.7+i%3*.4))%210
        c.ellipse(x,y,.65+(i%3)*.15,.65+(i%3)*.15,color)

def tree(c,x,y,scale=1,color='#81927c'):
    c.line([(x,y),(x-2*scale,y-85*scale),(x-23*scale,y-117*scale)],'#6c6e5d',7*scale)
    c.line([(x-2*scale,y-77*scale),(x+27*scale,y-109*scale)],'#6c6e5d',4*scale)
    for dx,dy,r in [(-29,-118,31),(11,-125,35),(37,-110,25),(-7,-91,29)]:c.ellipse(x+dx*scale,y+dy*scale,r*scale,r*.77*scale,color)

def window(c,x,y,w=110,h=115,cool=False):
    c.rect(x-4,y-4,w+8,h+8,'#9b9d8d' if cool else '#b7a789')
    c.rect(x,y,w,h,'#e1e9e4' if cool else '#eee3c4')
    c.poly([(x,y+h*.63),(x+w*.18,y+h*.37),(x+w*.32,y+h*.57),(x+w*.65,y+h*.33),(x+w,y+h*.64),(x+w,y+h),(x,y+h)],'#91a89b' if cool else '#bcc4a0')
    c.rect(x+w/2-2,y,4,h,'#bdbaa4');c.rect(x,y+h*.57,w,4,'#bdb69e')
    c.rect(x-8,y+h,w+16,7,'#cfc3a5')

def chair(c,x,floor=310,size=130):
    seat=floor-size*16/48
    c.line([(x-18,seat),(x-18,floor),(x-9,seat),(x-9,floor)],'#796e5e',4)
    c.line([(x+20,seat),(x+20,floor)],'#796e5e',4)
    c.round(x-28,seat-51,7,53,2,'#a88b6a');c.round(x-30,seat-50,35,9,2,'#b89973')
    c.round(x-25,seat-2,54,6,2,'#bea37c')

def desk(c,x,y=246,w=105,floor=310,front=True):
    c.line([(x+9,y+8),(x+7,floor),(x+w-10,y+8),(x+w-7,floor)],'#8b7359',5)
    c.rect(x+5,y+7,w-10,18,'#a98964')
    c.round(x,y,w,8,2,'#c5a275')
    c.line([(x+4,y+2),(x+w-5,y+2)],'#e0c092',1)
    if front:c.line([(x+10,y+13),(x+w-10,y+13)],'#927655',1)

@lru_cache(maxsize=16)
def classroom(kind='morning'):
    cool=kind=='backrow';dusk=kind=='desk';dream=kind=='secondGrade'
    wall='#c5cfd0' if cool else '#efd8bd' if dusk else '#e8d9dd' if dream else '#e9e4d0'
    c=Canvas(wall);c.rect(0,213,640,147,'#9aa4a0' if cool else '#bca38c' if dusk else '#b8ada5' if dream else '#b7b294')
    for i in range(7):c.line([(i*115-80,360),(320+(i-3)*32,213)],'#8b8e7c' if cool else '#9d927b',1)
    for y in (232,260,305):c.line([(0,y),(640,y)],'#a29c84',1)
    c.rect(35,54,171,110,'#5b786d');c.rect(40,59,161,100,'#3d5c52');c.line([(41,164),(204,164)],'#baa47d',4)
    for x in (255,430):window(c,x,41,128,148,cool)
    c.rect(0,196,640,7,'#c3b493' if not cool else '#a2adaa')
    c.rect(8,72,44,140,'#847960');c.rect(13,77,34,135,'#56625b');c.poly([(13,77),(41,86),(41,212),(13,212)],'#b4a082')
    for x,y,w in [(92,227,87),(228,227,87),(72,281,112),(230,281,112)]:desk(c,x,y,w,y+41)
    # The last window desk remains physically separate from the central aisle.
    return c.im

def sunbeam(c,t,cool=False):
    shift=8*math.sin(t*.13)
    c.poly([(429,61),(552,61),(415+shift,329),(278+shift,329)],(246,246,226,27) if cool else (255,239,179,57))

def morning(t):
    if t<1.65:
        c=Canvas('#eee7d4');c.rect(0,239,640,121,'#bcac90');c.line([(0,239),(640,239)],'#d6c2a1',3)
        x=320+math.sin(t*80)*max(0,1-t/1.5)*2;c.ellipse(x,187,59,59,'#6e8076');c.ellipse(x,187,51,51,'#fff7dc')
        c.ellipse(x-42,119,24,12,'#9ca18c');c.ellipse(x+42,119,24,12,'#9ca18c')
        c.line([(x-42,228),(x-50,245),(x+42,228),(x+50,245)],'#64776d',5)
        for a in range(12):c.ellipse(x+43*math.sin(a*math.pi/6),187-43*math.cos(a*math.pi/6),1.5,1.5,'#69796b')
        c.line([(x,187),(x,150)],'#53675e',3);c.line([(x,187),(x+26,200)],'#53675e',3)
        c.text('明天，还是这间教室。',320,310,15,'#6c7868');return c
    c=Canvas(image=classroom('morning'));u=ease((t-1.65)/3.25);x=lerp(83,444,u)
    chair(c,444,310,138)
    floor=lerp(345,310,ease((t-4.2)/.7))
    if t<4.9:walk_actor(c,'morning',t,'obedient',floor=floor,pose_mix=('deskSit',ease((t-4.2)/.7)))
    else:actor(c,'deskSit',t*.15,444,310,138,'obedient')
    desk(c,449,245,112,310);sunbeam(c,t);dust(c,t)
    if t>10.5:c.overlay('#f4ecd3',ease((t-10.5)/1.5)*.85)
    return c

def backrow(t):
    c=Canvas(image=classroom('backrow'));sunbeam(c,t,True)
    chair(c,459,312,136)
    x=lerp(86,459,ease(t/4.2))
    floor=lerp(345,312,ease((t-3.45)/1.35))
    if t<4.8:walk_actor(c,'backrow',t,'closed',floor=floor,pose_mix=('deskSit',ease((t-3.45)/1.35)))
    else:actor(c,'deskSit',t*.12,x,312,136,'closed')
    desk(c,464,248,113,312);c.line([(476,249),(489,251),(503,249)],'#9d8c78',1);dust(c,t,14)
    if t>10.8:c.overlay('#b5c0c6',ease((t-10.8)/1.2)*.6)
    return c

@lru_cache(maxsize=4)
def street_base():
    c=Canvas('#ead9b6');c.rect(0,187,640,173,'#b6b399')
    for x,w,h,col in [(0,116,142,'#d6c7ac'),(131,111,164,'#d9ccad'),(283,126,135,'#c8c5a6'),(451,134,176,'#c9bca1')]:
        c.rect(x,190-h,w,h,col);c.poly([(x-6,190-h),(x+w+5,190-h),(x+w/2,190-h-20)],'#818979')
        c.rect(x+15,147,26,43,'#7d8e7e')
        for wx in range(round(x+13),round(x+w-25),42):window(c,wx,190-h+22,25,28)
    c.rect(473,136,100,15,'#708c76');c.text('小卖部',523,143,9,'#eee5c7')
    tree(c,415,199,.65,'#8a9b78');c.line([(36,8),(43,214)],'#758074',5);c.line([(43,23),(640,80)],'#7e887b',1)
    c.line([(481,63),(605,84)],'#8b8c7d',1)
    for x,y in [(511,69),(537,73),(563,77)]:c.poly([(x,y),(x+13,y+2),(x+10,y+18),(x-3,y+16)],'#e4dfc8')
    # A sleeping dog is ordinary street life, never a hazard.
    c.ellipse(545,224,24,8,'#b59668');c.ellipse(567,220,10,8,'#c7a779');c.poly([(563,211),(568,211),(567,220)],'#9e825c')
    c.line([(568,222),(573,222)],'#756a55',1);return c.im

def outside(t):
    if t<5.2:
        c=Canvas(image=street_base());c.rect(49,90,10,190,'#9c9d84');c.rect(171,90,10,190,'#9c9d84');c.rect(43,84,145,12,'#83947e')
        # 门叶向左外侧敞开，两根门柱之间留出完整通道。
        c.line([(49,101),(12,125),(12,236),(49,213),(49,101)],'#5f776c',3)
        for x in range(18,47,7):
            u=(x-12)/37;c.line([(x,lerp(125,101,u)),(x,lerp(236,213,u))],'#5f776c',2)
        c.text('小学',116,69,12,'#62776c');c.rect(259,232,22,57,'#667f6e');c.round(253,220,34,20,5,'#77917b')
        # Mailbox is beside the walkway. Xiaoman passes it instead of colliding with it.
        c.ellipse(412,295,27,10,'#95866b');c.ellipse(412,288,27,10,'#a99574')
        for k in range(5):c.ellipse(396+k*8,286-(k%2)*3,5,5,'#849b67')
        walk_actor(c,'outside-street',t,'rebel');dust(c,t,9)
    else:
        c=Canvas('#efdaa7');c.rect(0,170,640,190,'#d4c598')
        c.poly([(0,305),(300,263),(300,232),(0,206)],'#b4b197')
        c.poly([(277,360),(359,360),(345,256),(310,256)],'#a9b09a')
        c.poly([(335,261),(640,306),(640,207),(338,232)],'#b4b197')
        for x in (80,180,458,554):tree(c,x,203,.65,'#acb58b')
        c.line([(279,350),(319,267)],'#e8ddbc',2);c.line([(352,350),(339,267)],'#e8ddbc',2)
        c.line([(0,280),(301,249)],'#e6d9b7',2);c.line([(338,249),(640,280)],'#e6d9b7',2)
        if t<8.2:walk_actor(c,'outside-fork',t,'rebel')
        else:actor(c,'idle',t*.12,320,330,126,'rebel')
        dust(c,t,30,(255,245,207,80));c.overlay('#efc574',clamp((t-8)/4)*.17)
    return c

def desk_ending(t):
    if t<2.3:
        c=Canvas('#efceb0');c.rect(0,227,640,133,'#bcad92');tree(c,508,228,1.05,'#b79b7e')
        for x in (236,449):c.rect(x,111,15,170,'#999f8c')
        c.rect(227,105,246,15,'#839586');c.text('小学',350,91,18,'#6f7967')
        c.line([(247,137),(192,165),(192,241),(247,219),(247,137)],'#809484',3)
        for x in range(197,246,10):
            u=(x-192)/55;c.line([(x,lerp(165,137,u)),(x,lerp(241,219,u))],'#809484',2)
        walk_actor(c,'desk-gate',t);c.text('三年后',84,48,16,'#7d796b')
    elif t<5.1:
        u=(t-2.3)/2.8;c=Canvas('#e4c8ac');c.rect(0,245,640,115,'#bca58d')
        for x in (65,255,455):window(c,x,61,97,139)
        c.line([(0,246),(640,246)],'#baa182',3)
        c.line([(86,311),(124,267)],'#8d836b',3);c.ellipse(130,311,11,4,'#a69878')
        c.rect(345,282,20,28,'#ac987d');c.line([(462,264),(462,310),(521,264),(521,310)],'#8b8872',4);c.line([(458,264),(525,264)],'#b1a183',5)
        walk_actor(c,'desk-corridor',t);c.poly([(50,70),(570,70),(488,318),(0,318)],(255,205,139,22))
    elif t<8.2:
        c=Canvas(image=classroom('desk'));chair(c,447,312,153);actor(c,'deskSit',t*.12,447,312,153)
        desk(c,452,241,95,312);sunbeam(c,t);dust(c,t,19)
        # The taller adolescent's knees overlap the old shallow desk, without changing his face.
        c.line([(469,254),(508,254)],'#856e56',2)
    else:
        c=Canvas('#c3a077');c.poly([(84,64),(598,78),(547,298),(32,281)],'#ba946a')
        for i in range(22):
            y=79+i*9;c.line([(68,y),(586-i*.2,y+14)],'#ae865f' if i%3 else '#d0ab7e',.65)
        c.poly([(131,91),(575,104),(536,271),(101,259)],(253,210,135,35))
        # Carved, proofread glyphs appear only on this desktop shot.
        if TEXT_ENABLED:
            c.line([(245,163),(341,165)],'#896d50',3);c.line([(245,163),(263,150)],'#896d50',3);c.line([(245,163),(263,177)],'#896d50',3)
            c.text('回去看看',382,163,19,'#846448');c.text('回去看看',381.4,162.4,19,'#d7b387')
        # A fingertip traces the old carving slowly, without an impossible floating hand.
        x=lerp(259,411,ease((t-8.2)/2.5))
        if ACTORS_ENABLED:
            c.poly([(492,360),(480,290),(x+16,167),(x-1,159),(x-9,167),(x+1,185),(444,319),(449,360)],PALETTE['skin'])
            c.line([(x-4,166),(x+7,176)],PALETTE['skinShade'],1.4)
        dust(c,t,9)
        if t>11.1:c.overlay('#f1dfc2',ease((t-11.1)/.9)*.55)
    return c

def second_grade(t):
    if t<2.3:
        c=Canvas('#e9e6df');c.poly([(0,60),(640,60),(507,288),(135,288)],'#eeeae2');c.rect(0,288,640,72,'#c9c8b7')
        for i,col in enumerate(['#f4ecd3','#b5c0c6','#efc574','#dc9976']):
            x=147+i*111;c.ellipse(x,99,12,12,col);c.ellipse(x,99,20,20,(*rgb(col),55))
        opening=ease(t/1.4);c.poly([(316,150),(326+opening*23,142),(330+opening*40,288),(316,288)],'#fff0c9')
        walk_actor(c,'secondGrade-corridor',t)
    elif t<4.6:
        # Restored symbols and an open door bridge memory into the second-grade afternoon.
        c=Canvas('#e8dcce');c.rect(0,251,640,109,'#b7afa0');window(c,435,43,115,161)
        c.rect(51,77,70,176,'#8b8873');c.rect(57,82,58,170,'#f4e5c4');c.poly([(56,83),(89,93),(89,251),(56,252)],'#aea388')
        c.round(197,190,72,48,14,'#b7aa8b')
        for x in (210,225,240,255):c.line([(x,194),(x,233)],'#897e67',1)
        c.line([(236,193),(274,193),(274,231)],'#938168',2) # birdcage door open
        c.line([(193,194),(164,181),(164,226),(193,239),(193,194)],'#938168',1.8)
        c.line([(190,246),(277,246)],'#938168',2)
        c.ellipse(331,211,28,28,'#839180');c.ellipse(331,211,23,23,'#eadcbc');c.line([(331,211),(331,194)],'#66796d',2);c.line([(331,211),(344,221)],'#66796d',2)
        c.poly([(454,79),(479,103),(456,134),(435,104)],'#bd9f87');c.line([(456,134),(439,177)],'#a2947a',1)
        c.rect(355,285,58,27,'#f3e9d2');dust(c,t,16)
    else:
        c=Canvas(image=classroom('secondGrade'))
        # Smaller self uses precisely the same head and costume, scaled uniformly.
        chair(c,441,312,110);actor(c,'sleep',t*.08,441,312,110)
        desk(c,432,266.2,113,312)
        x=lerp(92,363,ease((t-4.6)/2.8)) if t<7.4 else 363 if t<9.2 else lerp(363,94,ease((t-9.2)/2.8))
        if t<7.4:walk_actor(c,'secondGrade-enter',t)
        elif t>=9.2:walk_actor(c,'secondGrade-leave',t)
        else:actor(c,'idle',t*.1,x,345,132)
        # He keeps his distance and never touches or wakes the sleeping child.
        c.ellipse(399,33,27,3,'#92927f')
        c.line([(399,0),(399,33)],'#827f70',1.5);c.ellipse(399,2,5,2,'#918c7a')
        a=t*.65
        for k in range(3):
            ang=a+k*2*math.pi/3;c.line([(399,34),(399+33*math.cos(ang),34+9*math.sin(ang))],'#959483',3)
        sunbeam(c,t);dust(c,t,26)
        if t>11.1:c.overlay('#e9dbe2',ease((t-11.1)/.9)*.25)
    return c

def playground(c,far=False):
    c.rect(0,151,640,209,'#92a695' if far else '#9eae94');c.rect(0,167,640,126,'#b6a08b')
    for y in (192,220,252,280):c.line([(0,y),(640,y)],'#efe6cf',2)
    c.rect(437,94,145,62,'#b8bda9');c.poly([(430,94),(589,94),(571,78),(450,78)],'#839588')
    for x in range(449,575,27):c.rect(x,106,15,21,'#76938b')
    c.line([(80,153),(80,113),(151,113),(151,153)],'#d7ddc8',4)
    for x in range(83,150,9):c.line([(x,115),(x,153)],'#becdc0',.5)
    for y in range(117,153,9):c.line([(82,y),(150,y)],'#becdc0',.5)

def runaway(t):
    if t<7.0:
        c=Canvas('#e5dfc8');playground(c)
        opening=ease((t-2.5)/1.7)
        if DYNAMIC_ELEMENTS_ENABLED:controlled_bricks(c,t)
        walk_actor(c,'runaway',t)
        for i in range(25):
            if t>2:c.ellipse(365+(i%8)*17+math.sin(i)*opening*65,241+(i//8)*18+(t-2)*3,2,1,(245,232,193,90))
        if t>5.3:c.overlay('#eedbb2',ease((t-5.3)/1.7))
    else:
        c=Canvas(image=street_base());dust(c,t,12);c.overlay('#eedbb2',1-ease((t-7)/1.5))
        # Final three seconds are an ordinary street, unchanged and free of magic.
    return c

def wall(t):
    c=Canvas('#bccfd0')
    if t<4.9:
        c.rect(0,248,640,112,'#9da99c');c.rect(0,75,176,175,'#c2c4b5');window(c,38,106,89,79,True)
        c.rect(364,88,213,226,'#8e9e94')
        for y in range(105,314,27):c.line([(365,y),(577,y)],'#b2b9a6',1)
        for y in range(105,314,54):
            for x in range(375,577,48):c.line([(x,y),(x,y+27)],'#b2b9a6',1)
        c.rect(325,221,48,15,'#bbc2ae');c.rect(344,236,22,78,'#97a498');c.rect(360,80,224,10,'#c5cfb9')
        if t<1.6:
            walk_actor(c,'wall-approach',t)
        elif t<2.45:
            u=(t-1.6)/.85;actor(c,'jump',u,lerp(318,350,ease(u)),314-93*u-22*math.sin(math.pi*u),132,shadow=False)
        elif t<2.75:actor(c,'land',(t-2.45)/.3,350,221,132,shadow=False)
        elif t<3.3:
            u=(t-2.75)/.55;actor(c,'jump',u,lerp(350,370,ease(u)),lerp(221,186.5,ease(u)),132,shadow=False)
        elif t<4.4:
            floor=lerp(186.5,140,ease((t-3.3)/1.1));base=floor-132*44/48
            targets=[((370-(370-66))/2.75,(80-base)/2.75),((377-(370-66))/2.75,(80-base)/2.75)]
            actor(c,'climb',.25,370,floor,132,shadow=False,pose_override={'handTargets':targets,'feetTargets':[(21,37),(29,38)]})
        else:
            u=ease((t-4.4)/.5);actor(c,'climb',.25,lerp(370,381,u),lerp(140,124,u),132,shadow=False,pose_override={'hip':(lerp(24,21,u),lerp(29,28,u)),'lean':lerp(.14,.04,u),'handTargets':[(lerp(24,27,u),lerp(22.18,27,u)),(lerp(26.55,30,u),lerp(22.18,27,u))],'feetTargets':[(lerp(21,28.5,u),lerp(37,36.12,u)),(lerp(29,28.4,u),lerp(38,34.99,u))]})
    else:
        playground(c,True)
        reveal=ease((t-4.9)/2.4);wall_top=lerp(107,278,reveal)
        c.rect(0,wall_top,640,360-wall_top,'#8d9f94');c.rect(0,wall_top-8,640,9,'#c5d0be')
        for y in (wall_top+30,wall_top+57):c.line([(0,y),(640,y)],'#a8b6a6',1)
        actor(c,'sit',t*.1,281,wall_top+132*16/48,132,shadow=False)
        # Other children keep running in the same white-lined school track, never looking at him.
        if reveal>.1:
            for i in range(3):walk_actor(c,f'wall-runner-{i}',t,['cheerful','','closed'][i],skin='base')
        if t>11:c.overlay('#22353a',ease((t-11)/1))
    return c

SCENES=dict(zip(IDS,[morning,backrow,outside,desk_ending,second_grade,runaway,wall]))
TIMELINES={
 'morning':[[0,1.65,'闹钟两声'],[1.65,4.2,'沿前排桌前345px平坦通道，支撑脚锁地'],[4.2,4.9,'转入310px椅前深度，连续落座'],[4.9,10.5,'双手安放，晨光移动'],[10.5,12,'温暖白化']],
 'backrow':[[0,3.45,'沿前排桌前345px平坦通道，支撑脚锁地'],[3.45,4.8,'停在窗边，转入312px椅前深度连续落座'],[4.8,10.8,'坐下望向亮窗，旧刻痕'],[10.8,12,'灰白收束']],
 'outside':[[0,5.2,'走出校门，沿正常街道经过邮筒和菜摊'],[5.2,8.2,'慢跑变走，进入三岔路口'],[8.2,12,'第一次停步，三条路延向晨光']],
 'desk':[[0,2.3,'三年后，同脸少年返回小学'],[2.3,5.1,'走过已无害的旧物'],[5.1,8.2,'膝盖抵着小课桌'],[8.2,12,'桌面刻痕向左箭头与回去看看，指尖抚过']],
 'secondGrade':[[0,2.3,'四盏灯全亮，墙缝暖光'],[2.3,4.6,'敞门、鸟笼、旧钟、风筝、空白卷子复原'],[4.6,7.4,'走近同款更小的自己'],[7.4,9.2,'停在远处安静看，不互动'],[9.2,12,'轻声离开；孩子全程睡着']],
 'runaway':[[0,2,'操场助跑'],[2,2.5,'砖块悬停半秒'],[2.5,5.3,'砖块缓落，从缝隙穿出无伤'],[5.3,7,'暖白转场'],[7,9,'普通街道显影'],[9,12,'普通小街定格三秒']],
 'wall':[[0,1.6,'巷子助跑'],[1.6,2.45,'跳起踩住221px真实窗台'],[2.45,2.75,'落地稳住'],[2.75,3.3,'蹬窗台第二跳才够到墙沿'],[3.3,4.4,'双手固定墙顶80px，定长IK拉身'],[4.4,4.9,'放手翻身，臀落到墙头'],[4.9,7.3,'坐定，镜头缓升揭示同样跑道'],[7.3,11,'远景停留，别的孩子各自跑'],[11,12,'黑场收束']],
}
BACKGROUND_SHOTS = [
 dict(name='morning-alarm',id='morning',start=0,end=1.65,reference=.75,scene='alarm',floor=239,prompt='Close view of a double-bell mechanical alarm clock on a wooden bedside table. The bells gently tremble twice and settle. No people. Warm ivory dawn.'),
 dict(name='morning-classroom',id='morning',start=1.65,end=12,reference=6,scene='dawn',floor=310,deskTop=245,seat=[444,264],prompt='Empty primary classroom at dawn. A diagonal warm sunbeam slowly advances across the last-row wooden desk. Tiny dust drifts. Furniture and floor remain perfectly still, an open door on the left.'),
 dict(name='backrow-classroom',id='backrow',start=0,end=12,reference=6,scene='gray',floor=312,deskTop=248,seat=[459,267],prompt='Empty last-row primary classroom at bright noon, cool gray palette. Outside the bright window faint tree leaves move. Only airborne dust and cool light move; every desk and chair remains locked.'),
 dict(name='outside-street',id='outside',start=0,end=5.2,reference=2,scene='dawn',floor=316,prompt='An ordinary Chinese small-town street outside an open primary school gate. A mailbox beside the walkway, a market basket on the roadside, a corner shop and a small sleeping yellow dog. Gentle leaf and clothesline motion. Quiet golden dawn.'),
 dict(name='outside-fork',id='outside',start=5.2,end=12,reference=9,scene='dawn',floor=298,prompt='A Y-shaped three-way road junction. Three unblocked paths lead into golden dawn, still road geometry and distant trees. Golden haze and leaves drift very gently. No people, no obstruction.'),
 dict(name='desk-gate',id='desk',start=0,end=2.3,reference=1,scene='dusk',floor=310,prompt='The familiar old primary school gate at orange dusk. Weathered open iron gate pillars, a large tree, an empty walkway. Light and leaves move softly. Keep pillars and road position exact.'),
 dict(name='desk-corridor',id='desk',start=2.3,end=5.1,reference=3.5,scene='dusk',floor=313,prompt='Quiet old primary school corridor at orange dusk. Broom against the wall, a low safe hurdle beside the wall, a small storage box outside the walkway. No threatening obstacles. Warm evening air and soft leaves outside the windows.'),
 dict(name='desk-classroom',id='desk',start=5.1,end=8.2,reference=6,scene='dusk',floor=312,deskTop=241,seat=[447,261],prompt='Empty childhood classroom, low small wooden desk and chair at the right, orange evening sunlight. Dust motes drift and a sunbeam gently moves across wood. Keep every furniture anchor unchanged.'),
 dict(name='desk-detail',id='desk',start=8.2,end=12,reference=9,scene='dusk',floor=None,deskPlane=[[84,64],[598,78],[547,298],[32,281]],prompt='Close view of one old wooden school desk surface, natural weathered horizontal wood grain in orange sunset. Absolutely no person, no hand, no text, no symbol. A gentle moving evening highlight across the unchanged tabletop.'),
 dict(name='secondGrade-corridor',id='secondGrade',start=0,end=2.3,reference=1.4,scene='corridor',floor=320,prompt='A quiet white memory corridor. Four small warm lamps on the distant wall are fully lit, a thin vertical wall opening glows gently. Fixed straight corridor perspective. No humans. Soft warm lavender air.'),
 dict(name='secondGrade-symbols',id='secondGrade',start=2.3,end=4.6,reference=3.2,scene='dream',floor=312,prompt='Quiet restored classroom objects: an intact small birdcage with cage door open, a working old wall clock, a kite hanging at the window, a blank paper on the floor, and a wide open classroom door. No people or writing. Slowly changing lavender sunlight.'),
 dict(name='secondGrade-classroom',id='secondGrade',start=4.6,end=12,reference=8,scene='dream',floor=313,deskTop=266.2,seat=[441,275],prompt='Empty second-grade classroom on a warm lavender afternoon. Small wooden desk and chair at right, door open at left, ceiling fan turns slowly, dust floats in a diagonal sunbeam. All furniture stays exactly fixed. No people.'),
 dict(name='runaway-yard',id='runaway',start=0,end=7,reference=0,scene='playground',floor=318,prompt='Empty primary school running track. White parallel track lines, distant goal and teaching building. At the right a clear empty foreground path is reserved for a controlled wall animation later. Gentle breeze and slow small dust particles. No wall, no explosion or people. Fixed side camera.'),
 dict(name='runaway-street',id='runaway',start=7,end=12,reference=10,scene='dawn',floor=316,prompt='A completely ordinary sunny Chinese small-town street: utility pole, clothesline, corner shop, quiet sleeping yellow dog at the shop door. Breeze moves hanging cloth and tree leaves gently. No people, no magical effect, no change in building geometry.'),
 dict(name='wall-alley',id='wall',start=0,end=4.9,reference=1.8,scene='alley',floor=314,ledgeTop=221,wallTop=80,prompt='An empty quiet alley ending at a high brick wall on the right. A sturdy brick window sill sticks out at x 325 to 373 and y 221, reachable for climbing. Afternoon blue gray side light, fixed geometry, only subtle dust and air motion.'),
 dict(name='wall-track',id='wall',start=4.9,end=12,reference=9,scene='playground',floor=None,wallTop=278,prompt='View from the crest of a blue gray school wall, wall occupies the bottom of the frame. Beyond it a school running track with parallel white lines, a matching goal and same teaching building. All geometry exactly fixed. Breeze and subtle distant foliage movement. No people; later actors will be added separately.'),
]

def export_layouts():
    global ACTORS_ENABLED,TEXT_ENABLED,DYNAMIC_ELEMENTS_ENABLED
    ACTORS_ENABLED=TEXT_ENABLED=DYNAMIC_ELEMENTS_ENABLED=False;out=QA/'h3-layouts';out.mkdir(parents=True,exist_ok=True);rows=[]
    for shot in BACKGROUND_SHOTS:
        path=out/f"{shot['name']}.png";SCENES[shot['id']](shot['reference']).im.save(path)
        row={**shot,'layout':str(path),'pixelReference':str(ROOT/'assets/resources/art/pixel/scene'/f"{shot['scene']}.png"),'firstFrameTarget':'Qwen: layout locked + game pixel-scene style','lastFrameTarget':'Use the same Qwen first frame as structural endpoint','H3frames':56,'H3fps':24,'actorSource':str(ROOT/'scripts/xiaoman_rig.py'),'compositionSize':[1280,720],'logicalSize':[640,360],'actors':'Rig is excluded from all model-generated background references. Actor face, skeleton and skins are never inferred by H3.'}
        rows.append(row)
    (out/'manifest.json').write_text(json.dumps(rows,ensure_ascii=False,indent=2),encoding='utf8');ACTORS_ENABLED=TEXT_ENABLED=DYNAMIC_ELEMENTS_ENABLED=True
    print(str(out/'manifest.json'),flush=True)

def subtitle(c,id,t):
    i=IDS.index(id)
    if id=='morning' and t<1.65:return
    if 1.2<t<4.6:
        a=min(ease((t-1.2)/.45),ease((4.6-t)/.45));c.round(128,325,384,25,8,(34,51,48,round(a*130)))
        c.text(LINES[i],320,337,12,(251,241,217,round(a*255)))
    start=8.5 if id=='runaway' else 7
    if start<t<11.85:
        a=min(ease((t-start)/.45),ease((11.85-t)/.35));c.round(78,316,484,38,7,(34,51,48,round(a*145)))
        for line,words in enumerate(CLOSERS[i]):c.text(words,320,327+line*15,11,(251,241,217,round(a*255)))

def load_h3_backgrounds(ids=None):
    for shot in BACKGROUND_SHOTS:
        if ids is not None and shot['id'] not in ids:continue
        name=shot['name'];path=QA/'h3-backgrounds'/f'{name}.mp4'
        if not path.is_file():raise FileNotFoundError('Missing generated H3 background: '+str(path))
        review=json.loads((QA/'h3-backgrounds'/f'{name}.json').read_text(encoding='utf8'))
        if review.get('state')!='complete' or review.get('acceptedForFinal') is not True:
            raise ValueError('H3 source has not passed visual review: '+name)
        if hashlib.sha256(path.read_bytes()).hexdigest()!=review.get('sha256'):
            raise ValueError('H3 file does not match the accepted execution record: '+name)
        plate=QA/'qwen-plates'/f'{name}.png'
        if not plate.is_file() or hashlib.sha256(plate.read_bytes()).hexdigest()!=review.get('sourceSha256'):
            raise ValueError('H3 was generated from a stale Qwen reference: '+name)
        decoded=subprocess.run([str(FFMPEG),'-v','error','-i',str(path),'-vf','scale=640:360:flags=neighbor','-f','rawvideo','-pix_fmt','rgb24','pipe:1'],capture_output=True,check=True).stdout
        count=len(decoded)//(640*360*3)
        if count!=56:raise ValueError('H3 background must contain all 56 generated frames: '+name)
        data=np.frombuffer(decoded,dtype=np.uint8).reshape((count,360,640,3))
        H3_BACKGROUNDS[name]=data
    report='decode-report'+('-'+'-'.join(ids) if ids else '')+'.json'
    (QA/'h3-backgrounds'/report).write_text(json.dumps([dict(name=name,frames=len(frames),decoded=True,temporalMeanDifference=float(np.abs(frames[1:].astype(np.int16)-frames[:-1].astype(np.int16)).mean())) for name,frames in H3_BACKGROUNDS.items()],indent=2),encoding='utf8')

def controlled_bricks(c,t):
    opening=ease((t-2.5)/1.7)
    release=ease((t-2)/.12)
    for row in range(9):
        for col in range(5):
            bx=347+col*26+(row%2)*13;by=116+row*24
            height=min(23,318-by)
            if t>2:
                # 砖块先轻轻离缝并悬停半秒，再向跑者前方的路旁缓落。
                # 4.2秒前中央通道已完全空出，砖块落地而非穿地消失。
                bx+=(col-2)*release*2+opening*(205+col*13)
                by=min(318-height,by-release*5+opening*opening*(318-height-by+5))
            c.rect(bx,by,25,height,'#a59f87' if row%2 else '#b4a78c')
            c.line([(bx+1,by+1),(bx+23,by+1)],'#c1b594',1);c.line([(bx+3,by+height-3),(bx+22,by+height-3)],'#918d77',1)
            for k in range(3):c.rect(bx+3+(row*7+col*3+k*9)%19,by+min(height-2,4+(col*5+k*7)%15),2,1,'#9b967e')

def desk_detail_foreground(c,t):
    c.line([(245,163),(341,165)],'#896d50',3);c.line([(245,163),(263,150)],'#896d50',3);c.line([(245,163),(263,177)],'#896d50',3)
    c.text('回去看看',382,163,19,'#846448');c.text('回去看看',381.4,162.4,19,'#d7b387')
    x=lerp(259,411,ease((t-8.2)/2.5));c.poly([(492,360),(480,290),(x+16,167),(x-1,159),(x-9,167),(x+1,185),(444,319),(449,360)],PALETTE['skin'])
    sleeve='#cbb465' if CURRENT_SKIN=='raincoat' else PALETTE['shirt']
    shade='#ab954f' if CURRENT_SKIN=='raincoat' else PALETTE['shirtShade']
    c.poly([(492,360),(480,290),(x+25,179),(x+10,190),(444,319),(449,360)],sleeve)
    c.line([(x+11,190),(x+25,179)],shade,2)
    c.line([(x-4,166),(x+7,176)],PALETTE['skinShade'],1.4)

def restored_memory_details(c,shot):
    if shot['name']=='secondGrade-classroom':
        # 当前 Qwen/H3 母图的风扇轮毂位于 (415,26)，固定吊杆接至天花板画外。
        c.line([(415,0),(415,26)],'#827f70',1.5);c.ellipse(415,2,5,2,'#918c7a')
    elif shot['name']=='secondGrade-symbols':
        # 在当前母图笼体左侧显示真正的空门口与外开门叶，右侧仍保留原生成栅栏。
        # 左开门避开紧邻右侧的旧钟。托架连接到墙面，不让笼子悬空。
        c.round(200,196,20,39,2,'#716957')
        for y in range(199,233,5):c.line([(203,y),(217,y+1)],(150,133,105,70),.6)
        c.line([(194,194),(164,181),(164,226),(194,239),(194,194)],'#8c7861',1.8)
        for y in (190,202,215):c.line([(165,y),(193,y+12)],'#98846a',.8)
        c.ellipse(167,209,1.5,2.2,'#b39b7b')
        c.line([(190,246),(278,246)],'#97816a',2)
        c.line([(201,247),(207,254),(207,247)],'#89775f',1.4)
        c.line([(261,247),(267,254),(267,247)],'#89775f',1.4)

def wall_ledge_window(c):
    # 用当前实际 H3 图的砖材质与左侧真窗裁片，补成与高墙连接的窄窗墙面。
    # 窗口下沿贴住现有脚踏的真实顶面；不改脚踏、墙顶或演员锚点。
    brick=c.im.crop((405*S,155*S,449*S,227*S))
    glazing=c.im.crop((38*S,98*S,133*S,213*S)).resize((34*S,50*S),Image.Resampling.NEAREST)
    cap=c.im.crop((385*S,75*S,429*S,79*S))
    c.im.paste(brick,(322*S,149*S));c.im.paste(cap,(322*S,149*S))
    c.im.paste(glazing,(329*S,167*S));c.d=ImageDraw.Draw(c.im,'RGBA')

def hybrid_frame(id,t):
    global ACTORS_ENABLED,TEXT_ENABLED,ACTOR_REQUESTS,DYNAMIC_ELEMENTS_ENABLED
    shot=next(s for s in BACKGROUND_SHOTS if s['id']==id and s['start']<=t<s['end'])
    frames=H3_BACKGROUNDS[shot['name']];progress=clamp((t-shot['start'])/(shot['end']-shot['start']))
    # Background motion is stretched to the precise story slot, actors stay at normal speed.
    sample=progress*(len(frames)-1);a=int(sample);b=min(len(frames)-1,a+1)
    raw=Image.fromarray(frames[a])
    if b!=a:raw=Image.blend(raw,Image.fromarray(frames[b]),sample-a)
    c=Canvas(image=raw.resize((1280,720),Image.Resampling.NEAREST))
    if id=='secondGrade':restored_memory_details(c,shot)
    if id=='wall' and t<4.9:wall_ledge_window(c)
    ACTOR_REQUESTS=[];ACTORS_ENABLED=TEXT_ENABLED=DYNAMIC_ELEMENTS_ENABLED=False
    SCENES[id](t);requests=ACTOR_REQUESTS[:]
    ACTORS_ENABLED=TEXT_ENABLED=DYNAMIC_ELEMENTS_ENABLED=True
    if id=='wall' and t>=4.9:
        top=lerp(107,278,ease((t-4.9)/2.4))
        wall_cap=c.im.crop((0,270*S,1280,278*S))
        wall_piece=c.im.crop((0,278*S,1280,720)).resize((1280,max(1,round((360-top)*S))),Image.Resampling.NEAREST)
        c.im.paste(wall_piece,(0,round(top*S)));c.d=ImageDraw.Draw(c.im,'RGBA')
        c.im.paste(wall_cap,(0,round((top-8)*S)));c.d=ImageDraw.Draw(c.im,'RGBA')
    if id=='runaway' and t<7:controlled_bricks(c,t)
    foreground=c.im.copy()
    if id=='wall' and t>=4.9:
        # 远处孩子在墙后，镜头越过墙帽前不能跑到竖直墙面上。
        for request in requests[1:]:actor(c,**request)
        top=lerp(107,278,ease((t-4.9)/2.4))
        region=(0,round((top-8)*S),1280,720)
        c.im.paste(foreground.crop(region),(region[0],region[1]));c.d=ImageDraw.Draw(c.im,'RGBA')
        if requests:actor(c,**requests[0])
    else:
        for request in requests:actor(c,**request)
    # Restore the actual generated desk front and supports after the actor. The actor's
    # head and hands remain above the tabletop; knees cannot show through wood.
    if shot.get('deskTop') is not None:
        x,width={'morning':(449,112),'backrow':(464,113),'desk':(452,95),'secondGrade':(432,113)}[id]
        y=shot['deskTop'];floor=shot['floor']
        for box in [(x+5,y+8,x+width-5,y+26),(x+6,y+8,x+12,floor),(x+width-13,y+8,x+width-6,floor)]:
            region=tuple(round(v*S) for v in box);c.im.paste(foreground.crop(region),(region[0],region[1]))
        c.d=ImageDraw.Draw(c.im,'RGBA')
    if id=='desk' and t>=8.2:desk_detail_foreground(c,t)
    if id=='desk' and t<2.3:c.text('三年后',84,48,16,'#7d796b')
    if id=='morning' and t>10.5:c.overlay('#f4ecd3',ease((t-10.5)/1.5)*.85)
    if id=='backrow' and t>10.8:c.overlay('#b5c0c6',ease((t-10.8)/1.2)*.6)
    if id=='outside' and t>=5.2:c.overlay('#efc574',clamp((t-8)/4)*.17)
    if id=='desk' and t>11.1:c.overlay('#f1dfc2',ease((t-11.1)/.9)*.55)
    if id=='secondGrade' and t>11.1:c.overlay('#e9dbe2',ease((t-11.1)/.9)*.25)
    if id=='runaway' and 5.3<t<7:c.overlay('#eedbb2',ease((t-5.3)/1.7))
    if id=='runaway' and 7<=t<8.5:c.overlay('#eedbb2',1-ease((t-7)/1.5))
    if id=='wall' and t>11:c.overlay('#22353a',ease((t-11)/1))
    return c

def frame(id,t):
    c=hybrid_frame(id,t) if H3_BACKGROUNDS else SCENES[id](t);subtitle(c,id,t)
    return c.im.convert('RGB')

def soundtrack(id,path):
    rate=48000;n=rate*SECONDS;t=np.arange(n)/rate;out=np.zeros(n,dtype=np.float64)
    # Quiet original score; no synthetic speech claims. The exact narrative is subtitled.
    notes=[261.63,329.63,392.00] if id not in ('backrow','wall') else [246.94,293.66,369.99]
    for j,start in enumerate([.7,2.2,4.0,7.4,9.3]):
        local=t-start;mask=(local>=0)&(local<2.3);u=local[mask];f=notes[j%3]
        env=np.exp(-u*2.6)*(1-np.exp(-u*22));out[mask]+=.027*env*(np.sin(2*np.pi*f*u)+.2*np.sin(4*np.pi*f*u))
    rng=np.random.default_rng(730+IDS.index(id));noise=rng.normal(0,1,n);out+=.0015*np.convolve(noise,np.ones(30)/30,mode='same')
    if id=='morning':
        for start in [.14,.56]:
            local=t-start;mask=(local>=0)&(local<.18);u=local[mask];out[mask]+=.042*np.exp(-u*18)*(np.sin(2*np.pi*920*u)+.4*np.sin(2*np.pi*1431*u))
    # 脚步声跟实际每半周期落足时刻；远处配角和落座不添加前景脚步声。
    for key,route in WALK_ROUTES.items():
        if route.get('secondary') or not (key==id or key.startswith(id+'-')):continue
        for start in route_contact_times(key):
            local=t-start;mask=(local>=0)&(local<.045);u=local[mask];out[mask]+=.015*np.exp(-u*95)*np.sin(2*np.pi*100*u)
    out*=np.minimum(1,t/.2)*np.minimum(1,(SECONDS-t)/.5)
    pcm=(np.clip(out,-1,1)*32767).astype('<i2')
    with wave.open(str(path),'wb') as w:w.setnchannels(1);w.setsampwidth(2);w.setframerate(rate);w.writeframes(pcm.tobytes())

def write_meta(path):
    meta=Path(str(path)+'.meta')
    if meta.exists():return
    identity=str(uuid.uuid5(uuid.NAMESPACE_URL,str(path.relative_to(ROOT)).replace('\\','/')))
    if path.is_dir():data=dict(ver='1.2.0',importer='directory',imported=True,uuid=identity,files=[],subMetas={},userData={})
    elif path.suffix=='.mp4':data=dict(ver='1.0.0',importer='video-clip',imported=True,uuid=identity,files=['.json','.mp4'],subMetas={},userData={})
    elif path.suffix=='.png':
        template=json.loads((ROOT/'assets/resources/art/ui/hd/ending_card.png.meta').read_text(encoding='utf8'))
        encoded=json.dumps(template).replace(template['uuid'],identity);data=json.loads(encoded)
        for sub in data['subMetas'].values():
            sub['displayName']=path.stem;sub['userData'].update(wrapModeS='clamp-to-edge',wrapModeT='clamp-to-edge',minfilter='linear',magfilter='linear')
        data['userData']['hasAlpha']=False
    else:return
    meta.write_text(json.dumps(data,ensure_ascii=False,indent=2),encoding='utf8')

def register_meta(path):
    resource=ROOT/'assets/resources';parent=path
    while parent!=resource and resource in parent.parents:
        write_meta(parent);parent=parent.parent

def generate(id,skin='base'):
    global CURRENT_SKIN
    if hashlib.sha256((ROOT/'scripts/xiaoman_rig.py').read_bytes()).hexdigest()!=RIG_SOURCE_SHA256:
        raise RuntimeError('Rig changed after import; reload frozen source before generating.')
    if hashlib.sha256(Path(__file__).read_bytes()).hexdigest()!=GENERATOR_SOURCE_SHA256:
        raise RuntimeError('Generator changed during this run; restart from frozen source.')
    CURRENT_SKIN=skin
    qa=QA/skin;dest=DEST if skin=='base' else DEST/'skins'/skin;fallback=FALLBACK/id if skin=='base' else FALLBACK/'skins'/skin/id
    qa.mkdir(parents=True,exist_ok=True);dest.mkdir(parents=True,exist_ok=True);fallback.mkdir(parents=True,exist_ok=True)
    audio=qa/f'{id}.wav';soundtrack(id,audio)
    out=dest/f'{id}.mp4';tmp=qa/f'{id}.render.mp4';log=qa/f'{id}-encode.log'
    args=[str(FFMPEG),'-hide_banner','-y','-f','rawvideo','-pix_fmt','rgb24','-s','1280x720','-r',str(FPS),'-i','pipe:0','-i',str(audio),'-c:v','libx264','-preset','veryfast','-crf','20','-pix_fmt','yuv420p','-profile:v','main','-level','3.1','-c:a','aac','-b:a','96k','-movflags','+faststart','-t','12',str(tmp)]
    with log.open('wb') as lf:
        p=subprocess.Popen(args,stdin=subprocess.PIPE,stdout=subprocess.DEVNULL,stderr=lf)
        try:
            for i in range(FPS*SECONDS):
                im=frame(id,i/FPS);p.stdin.write(im.tobytes())
                if i%15==0:
                    fp=fallback/f'{i//15:02d}.png';im.resize((960,540),Image.Resampling.LANCZOS).save(fp);register_meta(fp)
                if i in (0,90,180,270,359):im.save(qa/f'{id}-{i:03d}.png')
            p.stdin.close();code=p.wait()
        except BaseException:
            p.kill();p.wait();raise
        if code:raise RuntimeError(log.read_text(errors='replace'))
    tmp.replace(out)
    register_meta(out)
    # Full decode catches truncation and codec trouble, not only container metadata.
    check=subprocess.run([str(FFMPEG),'-v','error','-i',str(out),'-f','null','-'],capture_output=True)
    if check.returncode or check.stderr:raise RuntimeError(check.stderr.decode(errors='replace'))
    row=dict(id=id,skin=skin,name=NAMES[IDS.index(id)],path=str(out.relative_to(ROOT)).replace('\\','/'),seconds=12,frames=360,fps=30,resolution=[1280,720],codec='H.264 main / yuv420p + AAC',generation='Qwen game-style reference + MiniMax H3 dynamic environment + fixed game xiaoman_rig.py actor' if H3_BACKGROUNDS else 'deterministic 2D storyboard, shared xiaoman_rig.py',identity=RIG,rigSha256=hashlib.sha256((ROOT/'scripts/xiaoman_rig.py').read_bytes()).hexdigest(),sha256=hashlib.sha256(out.read_bytes()).hexdigest(),bytes=out.stat().st_size,decoded=True,timeline=TIMELINES[id],fallbackFrames=24,backgroundSources=[str(QA/'h3-backgrounds'/f'{s["name"]}.mp4') for s in BACKGROUND_SHOTS if s['id']==id] if H3_BACKGROUNDS else [])
    row['fallbackSha256']=[dict(path=str((fallback/f'{i:02d}.png').relative_to(ROOT)).replace('\\','/'),sha256=hashlib.sha256((fallback/f'{i:02d}.png').read_bytes()).hexdigest()) for i in range(24)]
    row['backgroundSourceSha256']=[dict(path=str(Path(path).relative_to(ROOT)).replace('\\','/'),sha256=hashlib.sha256(Path(path).read_bytes()).hexdigest()) for path in row['backgroundSources']]
    row['generatorSha256']=GENERATOR_SOURCE_SHA256
    row['rigSha256']=RIG_SOURCE_SHA256
    row['gaitRevision']=GAIT_REVISION
    row['gait']=GAIT
    row['walkingGaits']=dict(walk=WALK_GAIT,longWalk=LONG_WALK_GAIT)
    row['walkRoutes']={key:route for key,route in WALK_ROUTES.items() if key==id or key.startswith(id+'-')}
    row['gaitMethod']='Actor world travel / (route cycleTravel logical px * rendered size / 48); walk stride24/lift2.6, long walk stride32/lift2.6, run stride32/lift8. Planted ankles stay at fixed world points. Mirrored left walking uses positive travel phase. Start/stop/seat transitions are excluded from pure-ground proof; same bones are re-solved by IK.'
    row['footstepSoundTimes']={key:route_contact_times(key) for key,route in row['walkRoutes'].items() if not route.get('secondary')}
    row['controlledEnvironmentOverlays']=([dict(scene='secondGrade-classroom',detail='fixed ceiling hanger attached to actual H3 fan hub',anchor=[415,26],source='current H3 scene geometry + this generator'),dict(scene='secondGrade-symbols',detail='open left cage door, unobstructed doorway and connected wall shelf',region=[164,181,278,254],source='current H3 cage geometry + this generator')] if id=='secondGrade' else [dict(scene='wall-alley',detail='small window above the existing sill, connected brick bay',region=[322,149,366,221],source='current H3 frame: brick crop [405,155,449,227], real window crop [38,98,133,213], wall cap crop [385,75,429,79]; composited before actor'),dict(scene='wall-track',detail='far runners are behind the actual H3 wall and cap; main actor remains visible on the crest',source='restore current H3 wall foreground between secondary actors and main actor')] if id=='wall' else [])
    if id=='wall':row['secondaryActorsSkin']='base'
    (qa/f'{id}-manifest.json').write_text(json.dumps(row,ensure_ascii=False,indent=2),encoding='utf8')
    print(json.dumps({k:row[k] for k in ('id','skin','seconds','frames','bytes','decoded')},ensure_ascii=False),flush=True)
    return row

def contact_sheet(skin='base'):
    im=Image.new('RGB',(384*5,238*7),'#eee7d6');d=ImageDraw.Draw(im);font=ImageFont.truetype(FONT,20)
    for row,id in enumerate(IDS):
        for col,i in enumerate((0,90,180,270,359)):
            shot=Image.open(QA/skin/f'{id}-{i:03d}.png').resize((384,216),Image.Resampling.LANCZOS)
            im.paste(shot,(col*384,row*238+22))
        d.text((7,row*238),NAMES[row],fill='#3c544b',font=font)
    im.save(QA/skin/'all-endings-contact.png')

if __name__=='__main__':
    parser=argparse.ArgumentParser();parser.add_argument('--id',choices=IDS);parser.add_argument('--skin',choices=SKINS);parser.add_argument('--preview',action='store_true');parser.add_argument('--export-layouts',action='store_true');parser.add_argument('--h3',action='store_true');args=parser.parse_args()
    QA.mkdir(parents=True,exist_ok=True)
    if args.h3:load_h3_backgrounds([args.id] if args.id else None)
    if args.export_layouts:export_layouts()
    elif args.preview:
        CURRENT_SKIN=args.skin or 'base';(QA/CURRENT_SKIN).mkdir(parents=True,exist_ok=True)
        for id in ([args.id] if args.id else IDS):
            for i in (0,90,180,270,359):frame(id,i/FPS).save(QA/CURRENT_SKIN/f'{id}-{i:03d}.png')
        if not args.id:contact_sheet(CURRENT_SKIN)
        print(str(QA/CURRENT_SKIN))
    else:
        rows=[generate(id,skin) for skin in ([args.skin] if args.skin else SKINS) for id in ([args.id] if args.id else IDS)]
        if not args.id:
            for skin in ([args.skin] if args.skin else SKINS):contact_sheet(skin)
            (QA/'generation-manifest.json').write_text(json.dumps(rows,ensure_ascii=False,indent=2),encoding='utf8')
