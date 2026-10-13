"""从本轮实际电影抽取走路、停步、落座、入跑及墙后跑者的接缝画面。"""
import argparse,hashlib,json,subprocess
from PIL import Image,ImageDraw,ImageFont
from generate_ending_import import ending_module
f=ending_module();p=argparse.ArgumentParser();p.add_argument('--skin',choices=f.SKINS,default='base');p.add_argument('--candidate',action='store_true');a=p.parse_args()
TIMES={
 'morning':[4.0,4.2,4.35,4.5,4.7,4.9],
 'backrow':[3.3,3.45,3.7,4.2,4.5,4.8],
 'outside':[7.8,7.95,8.05,8.2,8.3,8.4],
 'desk':[.4,1.2,2.0,2.6,3.4,4.2],
 'secondGrade':[7.05,7.2,7.4,9.2,9.3,9.4],
 'runaway':[.5,1.2,2.8,3.6,4.4,5.0],
 'wall':[.3,.7,1.3,7.8,9.6,10.5],
}
for id,times in TIMES.items():
    if a.candidate and id not in ('morning','outside','wall'):continue
    path=f.DEST/f'{id}.mp4' if a.skin=='base' else f.DEST/'skins'/a.skin/f'{id}.mp4'
    record=json.loads((f.QA/a.skin/f'{id}-manifest.json').read_text(encoding='utf8'))
    sha=hashlib.sha256(path.read_bytes()).hexdigest()
    assert sha==record['sha256'] and record['generatorSha256']==f.GENERATOR_SOURCE_SHA256 and record['rigSha256']==f.RIG_SOURCE_SHA256
    frames=[round(t*f.FPS) for t in times];out=f.ROOT/'build/qa/gait-revision/new-encoded'/a.skin/(id+'-transitions');out.mkdir(parents=True,exist_ok=True)
    filt='+'.join('eq(n\\,'+str(n)+')' for n in frames)
    subprocess.run([str(f.FFMPEG),'-v','error','-y','-i',str(path),'-vf','select='+filt,'-vsync','0',str(out/'%02d.png')],check=True)
    shots=sorted(out.glob('*.png'));assert len(shots)==6
    sheet=Image.new('RGB',(640*3,390*2),'#efe9dc');d=ImageDraw.Draw(sheet);font=ImageFont.truetype(f.FONT,18)
    for k,(shot,n) in enumerate(zip(shots,frames)):
        x=k%3*640;y=k//3*390;sheet.paste(Image.open(shot).resize((640,360)),(x,y+30))
        d.text((x+8,y+4),f'{id} actual frame {n} / {n/30:.3f}s',font=font,fill='#354c44')
    contact=out.parent/(id+'-transition-contact.png');sheet.save(contact)
    (out/'provenance.json').write_text(json.dumps(dict(path=str(path.relative_to(f.ROOT)),sha256=sha,generatorSha256=f.GENERATOR_SOURCE_SHA256,rigSha256=f.RIG_SOURCE_SHA256,actualFrameIndices=frames,contact=str(contact.relative_to(f.ROOT)),contactSha256=hashlib.sha256(contact.read_bytes()).hexdigest(),decodedFrameSha256=[dict(path=str(shot.relative_to(f.ROOT)),sha256=hashlib.sha256(shot.read_bytes()).hexdigest(),frame=n) for shot,n in zip(shots,frames)]),indent=2),encoding='utf8')
    print(str(contact),flush=True)
