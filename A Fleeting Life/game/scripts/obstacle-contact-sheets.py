"""Group actual browser screenshots for visual source and motion inspection."""
from pathlib import Path
import json
from PIL import Image, ImageDraw, ImageFont

ROOT=Path(__file__).resolve().parents[1]
OUT=ROOT/'build/qa/obstacle-sources'
report=json.loads((OUT/'report.json').read_text(encoding='utf-8'))
font=ImageFont.truetype('C:/Windows/Fonts/msyh.ttc',15)

def frame(path):
    image=Image.open(path).convert('RGB')
    return image.resize((480,270),Image.Resampling.NEAREST)

for group in range((len(report['cases'])+3)//4):
    subset=report['cases'][group*4:group*4+4]
    sheet=Image.new('RGB',(980,310*len(subset)+10),'#ede9dd')
    draw=ImageDraw.Draw(sheet)
    for row,case in enumerate(subset):
        yy=10+row*310
        draw.text((10,yy),f"{case['id']} · {case['label']} — 来源预告 / 完全展开",font=font,fill='#334941')
        sheet.paste(frame(OUT/f"{case['id']}-before.png"),(10,yy+28))
        sheet.paste(frame(OUT/f"{case['id']}-active.png"),(500,yy+28))
    sheet.save(OUT/f'contact-{group+1}.png')

for case in report['cases']:
    if case['motion']=='fixed':continue
    frames=[frame(path) for path in sorted(OUT.glob(f"{case['id']}-motion-*.png"))]
    frames[0].save(OUT/f"{case['id']}.gif",save_all=True,append_images=frames[1:],duration=160,loop=0)
    film=Image.new('RGB',(480*3,296*3),'#ede9dd')
    draw=ImageDraw.Draw(film)
    for i,img in enumerate(frames):
        xx=(i%3)*480;yy=(i//3)*296
        draw.text((xx+8,yy+3),f"{case['label']} · {i*1.3/8:.2f}s",font=font,fill='#334941')
        film.paste(img,(xx,yy+26))
    film.save(OUT/f"{case['id']}-motion-sheet.png")
print(OUT)
