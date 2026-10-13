"""本轮真实 Canvas 截图联系表及三类动态障碍的九帧预览。"""
from pathlib import Path
import json
from PIL import Image, ImageDraw, ImageFont
ROOT=Path(__file__).resolve().parents[1];OUT=ROOT/'build/qa/obstacle-qwen-v2/gameplay'
report=json.loads((OUT/'report.json').read_text(encoding='utf8'));font=ImageFont.truetype('C:/Windows/Fonts/msyh.ttc',15)
def frame(p):return Image.open(p).convert('RGB').resize((480,270),Image.Resampling.NEAREST)
for group in range((len(report['cases'])+3)//4):
    cases=report['cases'][group*4:group*4+4];sheet=Image.new('RGB',(980,310*len(cases)+10),'#ede9dd');d=ImageDraw.Draw(sheet)
    for i,c in enumerate(cases):
        yy=10+i*310;d.text((10,yy),f"Qwen v2 · {c['id']} · {c['label']} — 来源先可见 / 后续状态",font=font,fill='#334941')
        sheet.paste(frame(OUT/f"{c['id']}-before.png"),(10,yy+28));sheet.paste(frame(OUT/f"{c['id']}-active.png"),(500,yy+28))
    sheet.save(OUT/f'contact-{group+1}.png')
for c in report['cases']:
    if c['motion']=='fixed':continue
    frames=[frame(p) for p in sorted(OUT.glob(f"{c['id']}-motion-*.png"))]
    frames[0].save(OUT/f"{c['id']}.gif",save_all=True,append_images=frames[1:],duration=163,loop=0)
    sheet=Image.new('RGB',(1440,888),'#ede9dd');d=ImageDraw.Draw(sheet)
    for i,img in enumerate(frames):
        xx=(i%3)*480;yy=(i//3)*296;d.text((xx+8,yy+3),f"{c['label']} · fixture +{i*1.3/8:.3f}s",font=font,fill='#334941');sheet.paste(img,(xx,yy+26))
    sheet.save(OUT/f"{c['id']}-motion-sheet.png")
print(json.dumps({'actualCases':len(report['cases']),'dynamicNineFrameSequences':sum(c['motion']!='fixed' for c in report['cases']),'directory':str(OUT)},ensure_ascii=False))
