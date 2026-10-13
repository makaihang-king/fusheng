"""最终28条影片全量解码，验证时长、帧数、同源人物与全部降级图。"""
import argparse,hashlib,json,re,subprocess
from datetime import datetime,timezone
from pathlib import Path
from PIL import Image,ImageDraw
ROOT=Path(__file__).resolve().parents[1]
QA=ROOT/'build/qa/ending-films'
FFMPEG=ROOT.parents[1]/'美术交付_20260926/tools/vendor/imageio_ffmpeg/binaries/ffmpeg-win-x86_64-v7.1.exe'
IDS=['morning','backrow','outside','desk','secondGrade','runaway','wall']
SKINS=['base','waistJacket','raincoat','namelessNotebook']
parser=argparse.ArgumentParser();parser.add_argument('--skin',choices=SKINS)
parser.add_argument('--id',choices=IDS,action='append');args=parser.parse_args()
rig_hash=hashlib.sha256((ROOT/'scripts/xiaoman_rig.py').read_bytes()).hexdigest()
generator_hash=hashlib.sha256((ROOT/'scripts/generate-ending-films.py').read_bytes()).hexdigest()
identity=json.loads((ROOT/'xiaoman-model.json').read_text(encoding='utf8'))
assert identity['sourceHash']==rig_hash,'game actor metadata does not match the frozen source'
rows=[]
contacts=QA/'encoded-film-contacts';contacts.mkdir(parents=True,exist_ok=True)
for skin in ([args.skin] if args.skin else SKINS):
    for id in (args.id or IDS):
        record=QA/skin/f'{id}-manifest.json'
        row=json.loads(record.read_text(encoding='utf8'))
        p=ROOT/row['path']
        assert row['generation']=='Qwen game-style reference + MiniMax H3 dynamic environment + fixed game xiaoman_rig.py actor'
        assert row['rigSha256']==rig_hash,f'{skin}/{id}: actor source changed after generation'
        assert row['generatorSha256']==generator_hash,f'{skin}/{id}: film source changed after generation'
        assert row['identity']==identity['rig'],f'{skin}/{id}: actor parameters differ'
        assert hashlib.sha256(p.read_bytes()).hexdigest()==row['sha256']
        proc=subprocess.run([str(FFMPEG),'-hide_banner','-v','info','-i',str(p),'-map','0',
            '-progress','pipe:1','-nostats','-f','null','-'],capture_output=True,check=True)
        stdout=proc.stdout.decode(errors='replace');stderr=proc.stderr.decode(errors='replace')
        frame=int(re.findall(r'^frame=(\d+)$',stdout,re.M)[-1])
        measured=re.search(r'Duration: (\d+):(\d+):(\d+\.\d+)',stderr)
        duration=int(measured[1])*3600+int(measured[2])*60+float(measured[3])
        assert frame==360 and abs(duration-12)<.05,f'{skin}/{id}: {frame} frames / {duration}s'
        assert '1280x720' in stderr and 'h264' in stderr and 'aac' in stderr and 'yuv420p' in stderr and '30 fps' in stderr
        assert row['seconds']==12 and row['frames']==360 and row['fps']==30 and row['resolution']==[1280,720]
        assert not re.search(r'Error|corrupt|invalid|failed',stderr,re.I),stderr[-1000:]
        images=ROOT/'assets/resources/art/endings/cinematic'
        images=images/id if skin=='base' else images/'skins'/skin/id
        for i in range(24):
            f=images/f'{i:02d}.png';im=Image.open(f);assert im.size==(960,540);im.verify()
        assert len(row['fallbackSha256'])==24
        assert {item['path'] for item in row['fallbackSha256']}=={str((images/f'{i:02d}.png').relative_to(ROOT)).replace('\\','/') for i in range(24)}
        for image in row['fallbackSha256']:
            assert hashlib.sha256((ROOT/image['path']).read_bytes()).hexdigest()==image['sha256']
        assert len(row['backgroundSourceSha256'])==len(row['backgroundSources'])>0
        for background in row['backgroundSourceSha256']:
            assert hashlib.sha256((ROOT/background['path']).read_bytes()).hexdigest()==background['sha256']
        for background in row['backgroundSources']:
            assert Path(background).is_file()
        decoded=subprocess.run([str(FFMPEG),'-v','error','-i',str(p),'-map','0:v:0',
            '-vf','select=not(mod(n\\,15)),scale=480:270','-vsync','0','-frames:v','24','-f','rawvideo','-pix_fmt','rgb24','pipe:1'],
            capture_output=True,check=True)
        assert not decoded.stderr,decoded.stderr.decode(errors='replace')
        assert len(decoded.stdout)==24*480*270*3
        indices=list(range(0,360,15))
        frame_hashes=[]
        sheet=Image.new('RGB',(480*4,294*6),'#eee7d2');draw=ImageDraw.Draw(sheet)
        for i in range(24):
            x=(i%4)*480;y=(i//4)*294
            draw.text((x+6,y+4),f'{skin}/{id} frame {indices[i]} / {indices[i]/30:.1f}s',fill='#2d4646')
            pixels=decoded.stdout[i*480*270*3:(i+1)*480*270*3]
            frame_hashes.append(hashlib.sha256(pixels).hexdigest())
            im=Image.frombytes('RGB',(480,270),pixels)
            sheet.paste(im,(x,y+24))
        contact=contacts/f'{skin}-{id}-encoded.png';sheet.save(contact)
        rows.append({'id':id,'skin':skin,'file':str(p),'seconds':duration,'frames':frame,
            'fullVideoAudioDecode':True,'fallbackFrames':24,'sameActorSource':True,'sha256':row['sha256'],
            'actualEncodedFrameContact':str(contact),
            'actualEncodedFrameIndices':indices,'actualEncodedFrameSeconds':[n/30 for n in indices],
            'decodedRgbFrameSha256':frame_hashes,
            'contactSha256':hashlib.sha256(contact.read_bytes()).hexdigest()})
        print('PASS',skin,id,'12s/360frames/24images',flush=True)
partial=bool(args.skin or args.id)
label=(args.skin or 'all')+('-'+'-'.join(args.id) if args.id else '')
out=QA/(f'partial-media-audit-{label}.json' if partial else 'final-media-audit.json')
out.write_text(json.dumps({'capturedAt':datetime.now(timezone.utc).isoformat(),'canonicalHash':identity['canonicalHash'],'rigSha256':rig_hash,
    'generatorSha256':generator_hash,'films':rows,'movieCount':len(rows),'fallbackImageCount':24*len(rows),
    'partial':partial},ensure_ascii=False,indent=2),encoding='utf8')
print(json.dumps({'passed':True,'movies':len(rows),'fallbackImages':24*len(rows),'report':str(out)}))
