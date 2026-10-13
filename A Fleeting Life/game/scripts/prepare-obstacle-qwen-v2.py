"""机械抠白、以已定逻辑尺寸落图；不合成新绘画，不改游戏碰撞几何。"""
from __future__ import annotations
import argparse, hashlib, json, uuid
from pathlib import Path
import numpy as np
from PIL import Image, ImageDraw, ImageFont, ImageFilter, ImageOps

ROOT=Path(__file__).resolve().parents[1];OUT=ROOT/'build/qa/obstacle-qwen-v2'
DEST=ROOT/'assets/resources/art/props/obstacles/qwen-v2'
def sha(p):return hashlib.sha256(Path(p).read_bytes()).hexdigest()
def meta(p):
    m=p.with_suffix('.png.meta')
    if m.exists():return
    u=str(uuid.uuid4());name=p.stem
    obj={'ver':'1.0.27','importer':'image','imported':True,'uuid':u,'files':['.json','.png'],
        'subMetas':{'6c48a':{'importer':'texture','uuid':u+'@6c48a','displayName':name,'id':'6c48a','name':'texture',
          'userData':{'wrapModeS':'clamp-to-edge','wrapModeT':'clamp-to-edge','minfilter':'nearest','magfilter':'nearest','mipfilter':'none','anisotropy':0,'isUuid':True,'imageUuidOrDatabaseUri':u,'visible':False},
          'ver':'1.0.22','imported':True,'files':['.json'],'subMetas':{}}},
        'userData':{'type':'texture','fixAlphaTransparencyArtifacts':False,'hasAlpha':True,'redirect':u+'@6c48a'}}
    m.write_text(json.dumps(obj,ensure_ascii=False,indent=2),encoding='utf8')
def prepare(record):
    src=ROOT/record['output'];assert sha(src)==record['sha256'];im=Image.open(src).convert('RGBA');rows=[]
    for row in record['rows']:
        cell=row['cell'];cx=round((cell%3)*1024/3);cy=(cell//3)*384
        cellCrop=row.get('cellCrop',[cx,cy,round((cell%3+1)*1024/3),cy+384])
        part=im.crop(cellCrop);a=np.array(part);rgb=a[:,:,:3].astype(np.int16)
        # Solid white and near-white atlas background, including enclosed frame openings.
        white=(rgb.min(2)>238)&((rgb.max(2)-rgb.min(2))<16)
        a[:,:,3]=np.where(white,0,255)
        # Undo the white matte in the two-pixel edge band instead of retaining a sticker halo.
        border=white.copy()
        for _ in range(2):
            dilated=border.copy()
            for dy,dx in [(0,1),(0,-1),(1,0),(-1,0)]:
                shifted=np.roll(border,(dy,dx),(0,1))
                if dy>0:shifted[:dy,:]=False
                if dy<0:shifted[dy:,:]=False
                if dx>0:shifted[:,:dx]=False
                if dx<0:shifted[:,dx:]=False
                dilated|=shifted
            border=dilated
        candidates=border&~white&(rgb.min(2)>208)&((rgb.max(2)-rgb.min(2))<40)
        assigned=np.zeros(white.shape,dtype=bool)
        offsets=sorted([(dy,dx) for dy in range(-3,4) for dx in range(-3,4) if dy or dx],key=lambda v:v[0]**2+v[1]**2)
        for dy,dx in offsets:
            neighbor=np.roll(rgb,(dy,dx),(0,1));dark=(neighbor.min(2)<208)&~np.roll(white,(dy,dx),(0,1))
            if dy>0:dark[:dy,:]=False
            if dy<0:dark[dy:,:]=False
            if dx>0:dark[:,:dx]=False
            if dx<0:dark[:,dx:]=False
            select=candidates&dark&~assigned
            if not select.any():continue
            coverage=np.clip((255-rgb.min(2))/(255-neighbor.min(2)).clip(1),.05,1)
            unmatted=(rgb.astype(float)-255*(1-coverage[:,:,None]))/coverage[:,:,None]
            a[:,:,:3][select]=np.clip(unmatted,0,255).astype('uint8')[select]
            a[:,:,3][select]=(coverage[select]*255).astype('uint8');assigned|=select
        part=Image.fromarray(a)
        bounds=part.getbbox();assert bounds,f"Empty generated object: {row['id']}"
        part=part.crop(bounds);w,h=row['box'][2:]
        # One downsample only, followed by the hosts' nearest pixel sampler.
        part=part.resize((w*2,h*2),Image.Resampling.NEAREST)
        alpha=part.getchannel('A');inset=ImageOps.expand(alpha,border=1,fill=0).filter(ImageFilter.MinFilter(3)).crop((1,1,w*2+1,h*2+1))
        part.putalpha(Image.blend(alpha,inset,.4))
        role='complete-object';clearance=None;registeredSupport=None
        awningPost=None
        if row['id']=='awning':
            supportAlpha=np.array(part.getchannel('A'))
            columns=np.where((supportAlpha[-14:,:]>64).sum(axis=0)>=3)[0]
            assert len(columns)>1,'Qwen awning has no grounded source upright'
            # The output's post drifts left of its guide. Reuse its real material,
            # place the upright at the authored rear corner, and retain the floor.
            c0,c1=int(columns.min()),int(columns.max())+1
            awningPost=part.crop((c0,0,c1,h*2)).resize((12,h*2),Image.Resampling.NEAREST)
            registeredSupport={'sourcePixelSlice':[c0,0,c1,h*2],'targetWorldRect':[21,106,6,110]}
        supports=['bench.high','lamp','rack','rack.rope','rack.shelving','rack.slide','rack.cloth','rack.tray','rack.mat','awning','rubble.high']
        if row['id'] in supports:
            role='rear-support';left,top,_,_=row['box']
            # The AI is allowed to paint material, not move the front obstacle. Its
            # original front fragment is removed before the authored face is placed.
            clearance=[-17,170,17,216]
            if row['id']=='lamp':clearance=[-19,174,18,216]
            if row['id']=='awning':clearance=[-26,166,20,216]
            if row['id']=='rack.cloth':clearance=[-18,160,18,216]
            if row['id']=='rubble.high':clearance=[-18,140,18,216]
            x0,y0,x1,y1=clearance
            aa=part.getchannel('A');draw=ImageDraw.Draw(aa)
            draw.rectangle((max(0,(x0-left)*2),max(0,(y0-top)*2),min(w*2,(x1-left)*2-1),min(h*2,(y1-top)*2-1)),fill=0);part.putalpha(aa)
            if awningPost is not None:part.alpha_composite(awningPost,((21-left)*2,0))
        p=DEST/(row['id'].replace('.','_')+'.png');part.save(p);meta(p)
        assert part.getchannel('A').getextrema()[0]==0 or row['id'] in ['banner.cloth','vehicle.door','cabinet.door','books.low','books.tall','books.open','cushions','crate.low','crate.tall','crate.paper','crate.folded','brick','rubble.low'],row['id']
        rows.append({'id':row['id'],'key':'props.obstacles.v2.'+row['id'],'path':str(p.relative_to(ROOT/'assets/resources')).replace('\\','/'),
            'box':row['box'],'logicalSize':[w,h],'pixelSize':[w*2,h*2],'sha256':sha(p),'sourcePlate':record['plate'],
            'sourcePath':record['output'],'sourceSha256':record['sha256'],'plateCrop':row['plateCrop'],'cellCrop':cellCrop,'contentCrop':list(bounds),
            'executedSeed':record['executedSeed'],'workflowSha256':record['workflowSha256'],'preparerSha256':sha(__file__),
            'alphaRange':part.getchannel('A').getextrema(),'assemblyRole':role,'clearedWorldRegion':clearance,'registeredSupport':registeredSupport,
            'status':'generated-needs-gameplay-visual-review'})
    return rows
def contacts(rows):
    font=ImageFont.truetype('C:/Windows/Fonts/msyh.ttc',16)
    for group in range((len(rows)+7)//8):
        sheet=Image.new('RGB',(1000,600),'#e7e0cc');d=ImageDraw.Draw(sheet)
        for i,row in enumerate(rows[group*8:group*8+8]):
            xx=(i%4)*250;yy=(i//4)*300
            d.text((xx+8,yy+8),row['id'],font=font,fill='#374c43')
            img=Image.open(ROOT/'assets/resources'/row['path']).convert('RGBA');box=row['box'];w,h=img.size
            # Left: actual 2x game density; right/bottom source style patch at equal density.
            sprite=next(r for r in json.loads((OUT/'authored-plan.json').read_text(encoding='utf8'))['sprites'] if r['id']==row['id'])
            bg=Image.open(ROOT/f"assets/resources/art/pixel/scene/scroll/{sprite['theme']}/00.png").convert('RGBA')
            bg=bg.crop((800,150,1050,400));sheet.paste(bg.convert('RGB'),(xx,yy+45))
            spriteX=xx+(250-w)//2;spriteY=yy+275-h
            sheet.paste(img,(spriteX,spriteY),img)
            d.text((xx+6,yy+278),f"{box[2]}×{box[3]} logical / plate {row['sourcePlate']}",font=font,fill='#374c43')
        sheet.save(OUT/f'asset-contact-{group+1}.png')
def main():
    p=argparse.ArgumentParser();p.add_argument('--plate',type=int,action='append');a=p.parse_args();DEST.mkdir(parents=True,exist_ok=True)
    manifest=OUT/'runtime-manifest.json';previous=json.loads(manifest.read_text(encoding='utf8')) if manifest.exists() else []
    rows={r['id']:r for r in previous}
    for file in sorted(OUT.glob('plate-*.json')):
        if '.history.' in file.name or '.workflow.' in file.name:continue
        rec=json.loads(file.read_text(encoding='utf8'))
        if rec.get('state')!='complete' or (a.plate and rec['plate'] not in a.plate):continue
        for r in prepare(rec):rows[r['id']]=r
    ordered=[rows[r['id']] for r in json.loads((OUT/'authored-plan.json').read_text(encoding='utf8'))['sprites'] if r['id'] in rows]
    manifest.write_text(json.dumps(ordered,ensure_ascii=False,indent=2),encoding='utf8');contacts(ordered)
    count=len(json.loads((OUT/'authored-plan.json').read_text(encoding='utf8'))['sprites'])
    print(json.dumps({'newGeneratedSprites':len(ordered),'planned':count,'generatedComplete':len(ordered)==count,'visualAccepted':False,'manifest':str(manifest)},ensure_ascii=False))
if __name__=='__main__':main()
