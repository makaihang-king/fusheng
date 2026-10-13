"""按当前TS实际绘制命令与PNG alpha核验障碍实体/滑铲净空，CPU-only。"""
from pathlib import Path
from PIL import Image, ImageDraw, ImageColor
import argparse, datetime, hashlib, json, math, re, subprocess

ROOT=Path(__file__).resolve().parents[1]
parser=argparse.ArgumentParser();parser.add_argument('--output',default='build/qa/independent-obstacle-v2/final-materials');parser.add_argument('--report-only',action='store_true');args=parser.parse_args()
out=ROOT/args.output;out.mkdir(parents=True,exist_ok=True)
node=r"""
const fs=require('fs'),path=require('path');
const root=process.cwd(),ts=require(path.resolve(root,'../需要的软件/CocosCreator/3.8.8/resources/app.asar.unpacked/node_modules/typescript')),cache={};
function load(id){id=id.replace(/^\.\//,'');if(cache[id])return cache[id].exports;
 const m={exports:{}};cache[id]=m;const file=path.join(root,'assets/scripts',id+'.ts');
 const js=ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{target:ts.ScriptTarget.ES2020,module:ts.ModuleKind.CommonJS},fileName:file}).outputText;
 new Function('require','module','exports',js)(load,m,m.exports);return m.exports;}
const c=load('Content'),logic=load('ObstacleLogic'),r=load('ObstacleRendering'),geom=load('Geometry');
const art=new Map(c.ART_MANIFEST.map(e=>[e.key,e]));
const labels=new Map();for(const [route,level] of [...Object.entries(c.SEGMENTS),...Object.entries(c.BRANCHES)])for(const o of level.obstacles||[])labels.set(o.kind+'|'+o.label,{...o,route});
const cases=[];
for(const authored of labels.values()){
 const o={...authored,at:0,eventElapsed:logic.OBSTACLE_EVENT_SECONDS,cueSeen:true},frame=logic.obstacleFrame(o,0),commands=[],missing=[];
 const record=(op,...a)=>commands.push({op,a});
 const supplied=key=>{const e=art.get(key);if(!e?.path||!fs.existsSync(path.join(root,'assets/resources',e.path))){missing.push(key);return false;}return true;};
 const p={rect:(...a)=>record('rect',...a),line:(...a)=>record('line',...a),circle:(...a)=>record('circle',...a),poly:(...a)=>record('poly',...a),text(){},
 image:(key,...a)=>{if(!supplied(key))return false;record('image',key,...a);return true;},
 imageRegion:(key,...a)=>{if(!supplied(key))return false;record('imageRegion',key,...a);return true;}};
 r.drawPhysicalObstacle(p,o,0,'#86907a');cases.push({authored,frame,artwork:r.obstacleArtwork(o),commands,missing});
}
process.stdout.write(JSON.stringify({cases,art:Object.fromEntries([...art].filter(([k,v])=>v.path)),standing:geom.playerBodyBounds(0,'run'),sliding:geom.playerBodyBounds(0,'slide')}));
"""
data=json.loads(subprocess.run(['node','-e',node],cwd=ROOT,capture_output=True,text=True,encoding="utf8",check=True).stdout)
image_cache={}
def color(text):
    if text.startswith('rgba'):
        v=[float(x) for x in re.findall(r'[\d.]+',text)];return (round(v[0]),round(v[1]),round(v[2]),round(v[3]*255))
    return ImageColor.getcolor(text,'RGBA')
def asset(key):
    if key not in image_cache:image_cache[key]=Image.open(ROOT/'assets/resources'/data['art'][key]['path']).convert('RGBA')
    return image_cache[key]
def compose(commands):
    image=Image.new('RGBA',(960,540))
    for command in commands:
        op,a=command['op'],command['a'];layer=Image.new('RGBA',image.size);d=ImageDraw.Draw(layer)
        if op in ('image','imageRegion'):
            key=a[0];src=asset(key)
            if op=='image':x,y,w,h=a[1:5];opacity=a[5] if len(a)>5 else 1
            else:
                sx,sy,sw,sh,x,y,w,h=a[1:9];opacity=a[9] if len(a)>9 else 1
                left=max(0,math.floor(sx*src.width));top=max(0,math.floor(sy*src.height));right=min(src.width,math.ceil((sx+sw)*src.width));bottom=min(src.height,math.ceil((sy+sh)*src.height))
                src=src.crop((left,top,right,bottom))
            if w<=0 or h<=0:continue
            src=src.resize((max(1,round(w*2)),max(1,round(h*2))),Image.Resampling.NEAREST)
            if opacity<1:src.putalpha(src.getchannel('A').point(lambda v:round(v*opacity)))
            layer.alpha_composite(src,(round(x*2),round(y*2)))
        elif op=='rect':
            x,y,w,h,c=a;d.rectangle((round(x*2),round(y*2),round((x+w)*2)-1,round((y+h)*2)-1),fill=color(c))
        elif op=='line':
            x1,y1,x2,y2,c=a[:5];width=a[5] if len(a)>5 else 1;d.line((round(x1*2),round(y1*2),round(x2*2),round(y2*2)),fill=color(c),width=max(1,round(width*2)))
        elif op=='poly':d.polygon([(round(x*2),round(y*2)) for x,y in a[0]],fill=color(a[1]))
        elif op=='circle':
            x,y,r,c=a;d.ellipse((round((x-r)*2),round((y-r)*2),round((x+r)*2),round((y+r)*2)),fill=color(c))
        image=Image.alpha_composite(image,layer)
    return image
def region(image,rect):
    x,y,w,h=rect['x'],rect['y'],rect['w'],rect['h'];crop=image.getchannel('A').crop((math.floor(x*2),math.floor(y*2),math.ceil((x+w)*2),math.ceil((y+h)*2)))
    values=crop.tobytes();return dict(opaquePixels=sum(v>=128 for v in values),pixelCount=len(values),opaqueCoverage=sum(v>=128 for v in values)/max(1,len(values)))
def intersection(a,b):
    x=max(a['x'],b['x']);y=max(a['y'],b['y']);return dict(x=x,y=y,w=max(0,min(a['x']+a['w'],b['x']+b['w'])-x),h=max(0,min(a['y']+a['h'],b['y']+b['h'])-y))
results=[];failures=[]
for case in data['cases']:
    f=case['frame'];source=f['source'];draws=case['commands'];image=compose(draws)
    # These parts are explicitly behind the runner; they are not the active door/cloth.
    rear={'props.obstacles.v2.vehicle.body','props.obstacles.v2.cabinet.body','props.obstacles.v2.banner.frame'}
    face_key='props.obstacles.v2.face.'+(case['artwork'] or {}).get('face','')
    has_face=any(c['op'] in ('image','imageRegion') and c['a'][0]==face_key for c in draws)
    if has_face:
        front=compose([c for c in draws if c['op'] in ('image','imageRegion') and c['a'][0]==face_key])
    elif source in ('vehicle','cabinet','banner'):
        front=compose([c for c in draws if not(c['op'] in ('image','imageRegion') and c['a'][0] in rear)])
    else:front=image
    collision=region(front,f['bounds']);hit=region(front,intersection(f['bounds'],data['standing']));slide=region(front,data['sliding'])
    expected_slide_block=case['authored']['kind']!='high' or source=='vehicle'
    errors=[]
    if not collision['opaquePixels']:errors.append('actual collider contains no opaque material')
    if not hit['opaquePixels']:errors.append('centered standing collision meets no opaque front material')
    if case['authored']['kind']=='high' and source!='vehicle' and slide['opaquePixels']:errors.append('opaque front material intrudes into the legal slide corridor')
    if source=='vehicle' and not slide['opaquePixels']:errors.append('the vehicle door has no visible material where sliding is forbidden')
    if case['missing']:errors.append('runtime artwork missing: '+','.join(case['missing']))
    name=f"{len(results):02d}-{source}-{case['authored']['kind']}";bg=Image.new('RGBA',image.size,'#d8ddcf');bg.alpha_composite(image)
    # QA-only overlay, never emitted to player rendering.
    d=ImageDraw.Draw(bg);b=f['bounds'];d.rectangle((b['x']*2,b['y']*2,(b['x']+b['w'])*2,(b['y']+b['h'])*2),outline='#b64b44',width=2)
    bg.crop((72,180,300,448)).save(out/(name+'.png'))
    row=dict(label=case['authored']['label'],kind=case['authored']['kind'],source=source,actualFrame=f,artwork=case['artwork'],frontFaceKey=face_key if has_face else None,colliderMaterial=collision,standingHitMaterial=hit,slideFrontMaterial=slide,expectedSlideBlocked=expected_slide_block,errors=errors,drawImageKeys=[c['a'][0] for c in draws if c['op'] in ('image','imageRegion')])
    results.append(row)
    if errors:failures.append(row)
sha=lambda p:hashlib.sha256(p.read_bytes()).hexdigest()
report=dict(capturedAt=datetime.datetime.now(datetime.timezone.utc).isoformat(),
    sourceHashes={p.name:sha(p) for p in [ROOT/'assets/scripts/ObstacleRendering.ts',ROOT/'assets/scripts/ObstacleLogic.ts',ROOT/'assets/scripts/Geometry.ts',ROOT/'assets/scripts/Content.ts']},
    assetHashes={k:(sha(ROOT/'assets/resources'/v['path']) if (ROOT/'assets/resources'/v['path']).exists() else None) for k,v in data['art'].items() if k.startswith('props.obstacles.v2.')},
    caseCount=len(results),failedCount=len(failures),cases=results,
    proofScope='Current TypeScript Painter commands and actual RGBA; QA-only collider overlays; not a browser traversal proof.')
(out/'report.json').write_text(json.dumps(report,ensure_ascii=False,indent=2),encoding='utf8')
print(f"Obstacle material audit: {len(results)} authored source/label/kind variants; {len(failures)} failures; {out/'report.json'}")
for f in failures:print(f['label'],f['errors'])
if failures and not args.report_only:raise SystemExit(1)
