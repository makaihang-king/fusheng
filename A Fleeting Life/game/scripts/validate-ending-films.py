"""全解码所有 28 个结局版本，验证 360 帧 / 12 秒并取实际成片帧。"""
import hashlib,json,re,subprocess
from pathlib import Path
from PIL import Image,ImageDraw,ImageFont
from generate_ending_import import ending_module
f=ending_module();QA=f.QA/'decoded';QA.mkdir(parents=True,exist_ok=True)
rows=[]
for skin in f.SKINS:
    root=f.DEST if skin=='base' else f.DEST/'skins'/skin
    out=QA/skin;out.mkdir(parents=True,exist_ok=True)
    for id in f.IDS:
        path=root/f'{id}.mp4'
        if not path.is_file():raise FileNotFoundError(path)
        result=subprocess.run([str(f.FFMPEG),'-hide_banner','-nostdin','-i',str(path),'-f','null','-'],capture_output=True)
        log=result.stderr.decode(errors='replace');(out/f'{id}-decode.log').write_text(log,encoding='utf8')
        if result.returncode:raise RuntimeError(log)
        duration=re.search(r'Duration: (\d+):(\d+):(\d+(?:\.\d+)?)',log)
        seconds=int(duration[1])*3600+int(duration[2])*60+float(duration[3])
        counts=[int(n) for n in re.findall(r'frame=\s*(\d+)',log)]
        if max(counts,default=0)!=360:raise ValueError(f'{skin}/{id}: decoded frame count {counts}')
        if abs(seconds-12)>.04:raise ValueError(f'{skin}/{id}: {seconds} seconds')
        if '1280x720' not in log or '30 fps' not in log:raise ValueError(f'{skin}/{id}: wrong dimensions/fps')
        pattern=str(out/f'{id}-%02d.png')
        subprocess.run([str(f.FFMPEG),'-v','error','-y','-i',str(path),'-vf',r'select=eq(n\,0)+eq(n\,54)+eq(n\,81)+eq(n\,105)+eq(n\,144)+eq(n\,180)+eq(n\,270)+eq(n\,359)','-vsync','0',pattern],check=True)
        shots=sorted(out.glob(id+'-*.png'));assert len(shots)==8
        hashes=[hashlib.sha256(x.read_bytes()).hexdigest() for x in shots]
        if len(set(hashes))<4:raise ValueError('Insufficient visual narrative movement: '+id)
        manifest=json.loads((f.QA/skin/f'{id}-manifest.json').read_text(encoding='utf8'))
        if not manifest['backgroundSources']:raise ValueError('Final film must contain new H3 sources: '+id)
        assert len(manifest['fallbackSha256'])==24
        for source in manifest['fallbackSha256']+manifest['backgroundSourceSha256']:
            assert hashlib.sha256((f.ROOT/source['path']).read_bytes()).hexdigest()==source['sha256'],source['path']+' differs from the film source'
        rows.append(dict(id=id,skin=skin,path=str(path),seconds=seconds,decodedFrames=max(counts),fps=30,width=1280,height=720,fullDecodePassed=True,sha256=hashlib.sha256(path.read_bytes()).hexdigest(),rigSha256=manifest['rigSha256'],sources=manifest['backgroundSources'],screenshots=[str(x) for x in shots],uniqueScreenshots=len(set(hashes))))
        print('DECODE PASS '+skin+'/'+id,flush=True)
    sheet=Image.new('RGB',(384*8,238*7),'#eee7d6');d=ImageDraw.Draw(sheet);font=ImageFont.truetype(f.FONT,20)
    for row,id in enumerate(f.IDS):
        for col,shot in enumerate(sorted(out.glob(id+'-*.png'))):
            sheet.paste(Image.open(shot).resize((384,216),Image.Resampling.LANCZOS),(col*384,row*238+22))
        d.text((7,row*238),f.NAMES[row],fill='#3c544b',font=font)
    sheet.save(out/'actual-decoded-contact.png')
assert len(rows)==28
assert len(set(row['rigSha256'] for row in rows))==1,'all 28 must use identical rig code'
(QA/'report.json').write_text(json.dumps(dict(count=28,allPassed=True,films=rows),ensure_ascii=False,indent=2),encoding='utf8')
print(str(QA/'report.json'))
