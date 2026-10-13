"""同一张本地 Qwen 生成图含闭门车辆与独立门板；对齐、白底抠图后供游戏使用。"""
import importlib.util
from pathlib import Path
spec=importlib.util.spec_from_file_location('qwen_style',Path(__file__).with_name('generate-qwen-style-plates.py'))
m=importlib.util.module_from_spec(spec);spec.loader.exec_module(m)
m.run(dict(name='vehicle-sprites',scene='vehicle',index=101,
    layout=str(m.DEST/'vehicle-layout.png'),pixelReference=str(m.ROOT/'assets/resources/art/pixel/scene/dawn.png'),
    prompt='parked dusty green compact van with closed door, and a separate matching side door panel',
    generationWidth=1024,generationHeight=576,
    customPrompt='Generate two isolated video game sprites on a perfectly pure solid white background. '
    'Keep the FIRST reference exact object silhouettes and bounding positions: the closed side-view '
    'green compact van occupies x48..636 y70..503 of the 1024x576 canvas, wheels touch y503; '
    'the separate matching rectangular side door occupies x766..940 y126..386. '
    'The van is parked, all windows and door shut. The independent door is a flat door panel with a window '
    'and handle, no wheel, no hinge swing, no vehicle behind it. Use the SECOND reference ONLY as muted '
    'small-town game art texture and color style. Dusty green paint, soft cream highlights, dark rubber '
    'wheels, subtle light gray painted metal and paper texture, gently dithered pixel clusters. '
    'No scenery, no ground, no shadows outside silhouettes, no text, no people, no additional objects. '
    'No glossy 3D, no photography, no saturated cartoon colors.'))
