"""校验真实生成帧、尺寸、低姿高度、全部骨长与兼容人物来源。"""
from pathlib import Path
import hashlib,json,math,re
from PIL import Image,ImageDraw,ImageChops
from xiaoman_rig import ROOT,RIG,ACTIONS,pose,frame_progress,render_pose

data=json.loads((ROOT/'xiaoman-model.json').read_text(encoding='utf-8'))
assert data['canonicalHash']==hashlib.sha256(json.dumps(RIG,sort_keys=True).encode()).hexdigest()
assert data['sourceHash']==hashlib.sha256((ROOT/'scripts/xiaoman_rig.py').read_bytes()).hexdigest(), '请完整重新运行人物生成'
fallback_source=(ROOT/'assets/scripts/XiaomanFallback.ts').read_text(encoding='utf-8')
fallback_colors=json.loads(re.search(r'const colors=(.*);',fallback_source).group(1))
fallback_frames=json.loads(re.search(r'const frames:Record<string,number\[\]\[\]\[\]>=(.*);',fallback_source).group(1))
assert data['canonicalHash'] in fallback_source
for entry in data['frames']:
    file=ROOT/entry['path'];im=Image.open(file)
    assert im.mode=='RGBA' and im.size==(96,96),(file,im.size,im.mode)
    assert hashlib.sha256(file.read_bytes()).hexdigest()==entry['sha256'], file
    box=im.getchannel('A').getbbox()
    assert box and box[0]>=0 and box[2]<=96 and box[3]<=90,(file,box)
for action,(count,_) in ACTIONS.items():
    action=action.replace('break_','break')
    for i in range(count):
        reference=Image.open(ROOT/f'assets/resources/art/pixel/character/hd/{action}/{i:02d}.png').convert('RGBA')
        fallback=Image.new('RGBA',(96,96));fd=ImageDraw.Draw(fallback)
        for rx,ry,width,height,col in fallback_frames[action][i]:fd.rectangle([rx,ry,rx+width-1,ry+height-1],fill=fallback_colors[col])
        assert reference.tobytes()==fallback.tobytes(),(action,i,'纹理未载入的兜底必须逐像素等同当前角色')
        q=pose(action,frame_progress(action,i,count))
        for j in (0,1):
            assert abs(math.dist(q['hip'],q['knees'][j])-RIG['upperLeg'])<.04,(action,i,'thigh')
            assert abs(math.dist(q['knees'][j],q['feet'][j])-RIG['lowerLeg'])<.04,(action,i,'shin')
            root=(q['shoulder'][0]+(-.9 if j==0 else .9),q['shoulder'][1]+1.3)
            assert abs(math.dist(root,q['elbows'][j])-RIG['upperArm'])<.001,(action,i,'upperArm')
            assert abs(math.dist(q['elbows'][j],q['hands'][j])-RIG['lowerArm'])<.001,(action,i,'lowerArm')
    if action=='slide':
        for i in range(3,count):
            im=Image.open(ROOT/f'assets/resources/art/pixel/character/hd/slide/{i:02d}.png')
            top=im.getchannel('A').getbbox()[1]/2
            assert 44-top<=18.1,(i,top,'低姿必须真实小于18px，而非缩小人物')
    if action in ('run','jump','dive','climb','break'):
        hashes={entry['sha256'] for entry in data['frames'] if entry['action']==action and entry['skin']=='base' and not entry['variant'] and entry['wet']==0 and '/pixel/character/hd/'+action+'/' in entry['path']}
        assert len(hashes)>=min(5,count),(action,len(hashes),'实际动作不能只是复制同一张立绘')
for targets in [[(24,5.3),(27,5.3)],[(24,22.18),(27,22.18)]]:
    q=pose('climb',0,{'handTargets':targets})
    for i in (0,1):
        assert math.dist(q['hands'][i],targets[i])<.001,'墙顶手目标必须实际可达'
        assert abs(math.dist(q['elbows'][i],q['hands'][i])-5.6)<.001
plain=render_pose('idle',0,size=512,paper_texture=False)
paper=render_pose('idle',0,size=512,paper_texture=True)
assert plain.getchannel('A').tobytes()==paper.getchannel('A').tobytes(),'纸纹不得改变角色轮廓'
assert all(ImageChops.difference(plain,paper).getchannel(ch).getextrema()[1]<=2 for ch in 'RGB')
print(f"PASS: {len(data['frames'])} RGBA帧、{len(ACTIONS)}动作、全骨长、统一画幅/锚点、真实低姿与模型哈希")
