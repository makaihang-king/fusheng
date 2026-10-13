"""对白底 Qwen 双道具图做连通背景抠图；同一母图避免车与门的画风漂移。"""
import hashlib,json
from pathlib import Path
import numpy as np
from PIL import Image,ImageDraw
ROOT=Path(__file__).resolve().parents[1]
src=ROOT/'build/qa/ending-films/qwen-plates/vehicle-sprites.png'
im=Image.open(src).convert('RGBA');a=np.array(im);rgb=a[:,:,:3].astype(np.int16)
white=(rgb.min(2)>225)&((rgb.max(2)-rgb.min(2))<20)
# fromarray 的 L 图可能共享只读 buffer；floodfill 对其写入会静默返回。
m=Image.fromarray((white*255).astype('uint8')).copy()
ImageDraw.floodfill(m,(0,0),128,thresh=0)
a[:,:,3]=np.where(np.array(m)==128,0,255)
im=Image.fromarray(a)
dest=ROOT/'assets/resources/art/props/obstacles';rows=[]
for name,box,size,key in [('body',(36,54,658,518),(188,124),'props.obstacles.vehicle.body'),
                         ('door',(753,113,959,401),(56,82),'props.obstacles.vehicle.door')]:
    crop=im.crop(box)
    assert crop.getchannel('A').getextrema()==(0,255),f'{name}: background removal failed'
    crop=crop.crop(crop.getbbox()).resize(size,Image.Resampling.LANCZOS)
    corners=[crop.getpixel(p) for p in [(0,0),(size[0]-1,0),(0,size[1]-1),(size[0]-1,size[1]-1)]]
    # 门板自身是矩形，裁到紧边后可能全不透明；不得将其误判成残留白底。
    assert all(p[3]==0 or min(p[:3])<225 for p in corners),f'{name}: white matte survived'
    p=dest/f'vehicle_{name}.png';crop.save(p)
    rows.append(dict(key=key,path=str(p.relative_to(ROOT)),logicalSize=[n/2 for n in size],
        source=str(src),sourceSha256=hashlib.sha256(src.read_bytes()).hexdigest(),crop=box,
        sha256=hashlib.sha256(p.read_bytes()).hexdigest()))
(ROOT/'build/qa/ending-films/qwen-plates/vehicle-runtime.json').write_text(json.dumps(rows,ensure_ascii=False,indent=2),encoding='utf8')
print(json.dumps(rows,ensure_ascii=False))
