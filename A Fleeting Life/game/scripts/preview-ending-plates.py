"""仅检查 Qwen 布局与固定演员位置；静帧预览不作为最终影片交付证据。"""
import numpy as np
from PIL import Image,ImageDraw,ImageFont
from generate_ending_import import ending_module
f=ending_module();out=f.QA/'plate-composition';out.mkdir(parents=True,exist_ok=True)
rows=[]
for shot in f.BACKGROUND_SHOTS:
    source=f.QA/'qwen-plates'/f'{shot["name"]}.png'
    if not source.is_file():continue
    image=Image.open(source).convert('RGB').resize((640,360),Image.Resampling.LANCZOS)
    f.H3_BACKGROUNDS[shot['name']]=np.stack([np.asarray(image)]*2)
    t=shot['reference'];path=out/f'{shot["name"]}.png'
    f.frame(shot['id'],t).save(path);rows.append((shot['name'],path))
sheet=Image.new('RGB',(640*2,382*((len(rows)+1)//2)),'#eee7d6');d=ImageDraw.Draw(sheet);font=ImageFont.truetype(f.FONT,18)
for i,(name,path) in enumerate(rows):
    x=(i%2)*640;y=(i//2)*382;sheet.paste(Image.open(path).resize((640,360),Image.Resampling.LANCZOS),(x,y+22));d.text((x+6,y),name,fill='#3c544b',font=font)
sheet.save(out/'contact.png');print(str(out/'contact.png'))
