"""等待首轮16镜完成后，串行重新生成已归档拒收镜头，不与首轮抢队列。"""
import json,subprocess,sys,time,urllib.request
from pathlib import Path
from generate_ending_import import ending_module

root=Path(__file__).resolve().parents[1]
dest=root/'build/qa/ending-films/h3-backgrounds'
names=['desk-classroom','desk-detail','runaway-yard']
all_names=[shot['name'] for shot in ending_module().BACKGROUND_SHOTS]
deadline=time.monotonic()+7200
while time.monotonic()<deadline:
    records=[json.loads((dest/f'{name}.json').read_text(encoding='utf8')) for name in all_names if (dest/f'{name}.json').is_file()]
    with urllib.request.urlopen('http://127.0.0.1:8188/queue',timeout=30) as response:queue=json.load(response)
    if len(records)==16 and all(r.get('state') in ('complete','rejected') for r in records) and not queue.get('queue_running') and not queue.get('queue_pending'):break
    time.sleep(5)
else:raise TimeoutError('Initial H3 generation did not finish')
for name in names:
    record=json.loads((dest/f'{name}.json').read_text(encoding='utf8'))
    if record.get('state')!='rejected':raise ValueError('Expected archived rejected source before regeneration: '+name)
    print('NEW SEED REGENERATION '+name,flush=True)
    subprocess.run([sys.executable,str(root/'scripts/generate-h3-ending-backgrounds.py'),'--name',name,'--seed-offset','1000'],cwd=root,check=True)
print('Regenerated sources still require actual visual acceptance.',flush=True)
