"""只读冻结人物源，核对运行 metadata 并抽取现有 GIF 帧；不生成新模型。"""
from pathlib import Path
import hashlib,json,math,subprocess
from PIL import Image,ImageDraw,ImageSequence
from xiaoman_rig import ROOT,RIG,MOTION,GAIT,ACTIONS,TEXTURE

qa=ROOT/'build/qa/xiaoman-fixed-rig/final-audit'
qa.mkdir(parents=True,exist_ok=True)
metadata=json.loads((ROOT/'xiaoman-model.json').read_text(encoding='utf8'))
assert metadata['rig']==RIG and metadata['motion']==MOTION and metadata['texture']==TEXTURE and metadata['gait']==GAIT
assert metadata['sourceHash']==hashlib.sha256((ROOT/'scripts/xiaoman_rig.py').read_bytes()).hexdigest()
assert metadata['canonicalHash']==hashlib.sha256(json.dumps(RIG,sort_keys=True).encode()).hexdigest()
compiler=ROOT.parent/'需要的软件/CocosCreator/3.8.8/resources/app.asar.unpacked/node_modules/typescript'
node="""
const fs=require('fs'),vm=require('vm'),ts=require(process.argv[1]);
const source=fs.readFileSync(process.argv[2],'utf8');
const js=ts.transpileModule(source,{compilerOptions:{target:ts.ScriptTarget.ES2020,module:ts.ModuleKind.CommonJS}}).outputText;
const context={exports:{}};vm.runInNewContext(js,context);
const c=context.exports;process.stdout.write(JSON.stringify({actions:c.CHARACTER_ANIMATIONS,motion:c.XIAOMAN_MOTION,gait:c.XIAOMAN_GAIT,identity:c.XIAOMAN_IDENTITY,density:c.ART_PIXEL_DENSITY}));
"""
runtime=json.loads(subprocess.run(['node','-e',node,str(compiler),str(ROOT/'assets/scripts/Content.ts')],cwd=ROOT,capture_output=True,text=True,check=True).stdout)
assert runtime['gait']==GAIT
assert metadata['actions']==runtime['actions']
for key,value in MOTION.items():assert runtime['motion'][key]==value,(key,value,runtime['motion'][key])
for key,value in RIG.items():
    if key in ('canvas','foot','visibleStandingHeight','palette'):continue
    assert runtime['identity'][key]==value,key
for key,value in runtime['identity']['palette'].items():assert RIG['palette'][key]==value,key
assert runtime['density']==2 and runtime['motion']['canvas']==48
assert (runtime['motion']['anchorX'],runtime['motion']['anchorY'])==tuple(RIG['foot'])
actions=[]
for key,(count,fps) in ACTIONS.items():
    name=key.replace('break_','break');actual=runtime['actions'][name]
    assert actual['frames']==count and math.isclose(actual['fps'],fps,rel_tol=1e-12),name
    actions.append(dict(action=name,frames=count,fps=fps,durationSeconds=count/fps))
doc=(ROOT/'小满固定模型与动作参数.md').read_text(encoding='utf8')
assert metadata['canonicalHash'] in doc
assert metadata['sourceHash'] in doc
for text in ['142 cm','34 kg','96 × 96','48 × 48','(24,44)','14 / 7 / 7','6.1 / 5.6','0.12 s','0.15 s','0.10 s','72 px/s','230 px/s','600 px/s²','-500 px/s','实际调用本地 Qwen','实际调用 MiniMax H3']:
    assert text in doc,text

# 从已有 GIF 解码每一帧，保留其真实 GIF 时间；不调用 render_pose 或 GPU。
rows=[];gif_data=[]
for action in ['runStart','run','slide','slideRecovery','hurt','land','climb','sit']:
    im=Image.open(qa.parent/(action+'.gif'));frames=[];durations=[]
    for frame in ImageSequence.Iterator(im):
        frames.append(frame.copy().convert('RGB'));durations.append(frame.info.get('duration',0))
    gif_data.append(dict(action=action,decodedFrames=len(frames),durationMs=sum(durations),frameDurationMs=durations))
    for start in range(0,len(frames),10):rows.append((action,start,frames[start:start+10],durations[start:start+10]))
sheet=Image.new('RGB',(1120,len(rows)*136),'#e0e2d8');draw=ImageDraw.Draw(sheet)
for row,(action,start,frames,durations) in enumerate(rows):
    for column,(frame,duration) in enumerate(zip(frames,durations)):
        frame=frame.resize((112,112),Image.Resampling.NEAREST);sheet.paste(frame,(column*112,row*136))
        draw.line([(column*112,row*136+102),(column*112+111,row*136+102)],fill='#94a699')
        draw.text((column*112+3,row*136+117),f'{action} {start+column:02d} {duration}ms',fill='#283d46')
sheet.save(qa/'gif-decoded-contact.png')
report=dict(canonicalHash=metadata['canonicalHash'],sourceHash=metadata['sourceHash'],
    actualRgbaFiles=len(metadata['frames']),baseActionFrames=sum(a['frames'] for a in actions),
    runtimeMetadataMatchesFrozenRig=True,docFixedValuesMatch=True,rigRegenerated=False,
    identity=runtime['identity'],motion=runtime['motion'],gait=runtime['gait'],actions=actions,gifMetadata=gif_data)
(qa/'parameter-report.json').write_text(json.dumps(report,ensure_ascii=False,indent=2),encoding='utf8')
print('PASS: frozen rig / metadata / documented fixed values; decoded existing GIFs only.')
print(qa/'parameter-report.json')
print(qa/'gif-decoded-contact.png')
