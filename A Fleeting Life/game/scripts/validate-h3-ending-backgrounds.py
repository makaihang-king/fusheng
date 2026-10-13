"""对实际 H3 输出全解码、计算环境运动量并保存真实早中晚帧。"""
import argparse,hashlib,json,subprocess
import numpy as np
from PIL import Image,ImageDraw,ImageFont
from generate_ending_import import ending_module
f=ending_module();parser=argparse.ArgumentParser();parser.add_argument('--available',action='store_true');parser.add_argument('--name',choices=[s['name'] for s in f.BACKGROUND_SHOTS]);args=parser.parse_args()
out=f.QA/'h3-backgrounds/decoded';out.mkdir(parents=True,exist_ok=True);rows=[]
for shot in f.BACKGROUND_SHOTS:
    if args.name and shot['name']!=args.name:continue
    path=f.QA/'h3-backgrounds'/f'{shot["name"]}.mp4'
    if not path.is_file():
        if args.available:continue
        raise FileNotFoundError(path)
    result=subprocess.run([str(f.FFMPEG),'-v','error','-i',str(path),'-vf','scale=512:288:flags=neighbor','-f','rawvideo','-pix_fmt','rgb24','pipe:1'],capture_output=True,check=True)
    if result.stderr:raise RuntimeError(result.stderr.decode(errors='replace'))
    raw=np.frombuffer(result.stdout,dtype=np.uint8).reshape((-1,288,512,3));count=len(raw)
    if count!=56:raise ValueError(f'{shot["name"]}: expected 56 real frames, got {count}')
    delta=np.abs(raw[1:].astype(np.int16)-raw[:-1].astype(np.int16));motion=float(delta.mean())
    if motion<.02:raise ValueError('No measurable generated background motion: '+shot['name'])
    indices=[0,round((count-1)*.25),round((count-1)*.5),round((count-1)*.75),count-1]
    sheet=Image.new('RGB',(512*3,310*2),'#eee7d6');d=ImageDraw.Draw(sheet);font=ImageFont.truetype(f.FONT,18);shots=[]
    for i,index in enumerate(indices):
        image=Image.fromarray(raw[index]);fp=out/f'{shot["name"]}-{index:02d}.png';image.save(fp);shots.append(str(fp))
        x=(i%3)*512;y=(i//3)*310;sheet.paste(image,(x,y+22));d.text((x+6,y),f'{shot["name"]} {index}/55',fill='#3c544b',font=font)
    contact=out/f'{shot["name"]}-contact.png';sheet.save(contact)
    dense=Image.new('RGB',(256*8,162*7),'#eee7d6');dense_draw=ImageDraw.Draw(dense);dense_font=ImageFont.truetype(f.FONT,12)
    for index in range(count):
        x=(index%8)*256;y=(index//8)*162
        dense.paste(Image.fromarray(raw[index]).resize((256,144),Image.Resampling.NEAREST),(x,y+18))
        dense_draw.text((x+4,y),f'{index}/55',fill='#3c544b',font=dense_font)
    dense_contact=out/f'{shot["name"]}-all56-contact.png';dense.save(dense_contact)
    review=json.loads((f.QA/'h3-backgrounds'/f'{shot['name']}.json').read_text(encoding='utf8'))
    row=dict(name=shot['name'],path=str(path),sha256=hashlib.sha256(path.read_bytes()).hexdigest(),fullDecodePassed=True,frames=count,fps=24,width=512,height=288,temporalMeanDifference=motion,firstLastMeanDifference=float(np.abs(raw[0].astype(np.int16)-raw[-1].astype(np.int16)).mean()),sampleHashes=[hashlib.sha256(raw[index].tobytes()).hexdigest() for index in indices],screenshots=shots,contact=str(contact),all56Contact=str(dense_contact),state=review.get('state'),acceptedForFinal=review.get('acceptedForFinal') is True)
    rows.append(row);print(f'H3 DECODE PASS {shot["name"]}: {count} frames, motion={motion:.4f}',flush=True)
(out/('report-'+args.name+'.json' if args.name else 'report.json')).write_text(json.dumps(dict(count=len(rows),all16Present=len(rows)==16,backgrounds=rows),ensure_ascii=False,indent=2),encoding='utf8')
