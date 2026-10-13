"""Independently validate the complete candidate scene set before packaging."""
from __future__ import annotations

import json
from pathlib import Path
from PIL import Image, ImageChops

ROOT = Path(__file__).resolve().parent.parent
SCENE = ROOT / "assets/resources/art/pixel/scene"
CANDIDATE = SCENE / "clear-v7"
REPORT = ROOT / "build/qa/background-clear-v7/final-validation.json"
SOURCE = CANDIDATE if CANDIDATE.is_dir() else SCENE

original = {p.relative_to(SCENE).as_posix(): p for p in SCENE.rglob("*.png")
            if CANDIDATE not in p.parents}
candidate = {p.relative_to(SOURCE).as_posix(): p for p in SOURCE.rglob("*.png")}
assert len(original) == 77, f"Expected 77 original scene files, found {len(original)}"
assert candidate.keys() == original.keys(), {
    "missing": sorted(original.keys() - candidate.keys()),
    "extra": sorted(candidate.keys() - original.keys()),
}

dimensions = {}
pixel_grid = []
for name, path in sorted(candidate.items()):
    with Image.open(path) as image, Image.open(original[name]) as source:
        assert image.size == source.size, (name, image.size, source.size)
        assert image.mode in ("RGB", "RGBA"), (name, image.mode)
        expected_size = ((2048, 540) if name.startswith("scroll/") else
                         (2560, 540) if name.startswith("choice/") else
                         (1440, 810) if name == "corridor-detail-v3.png" else
                         (1536, 864))
        assert image.size == expected_size, (name, image.size, expected_size)
        if SOURCE == SCENE:
            assert Path(str(path) + ".meta").is_file(), f"Missing Cocos metadata: {name}"
        dimensions[name] = image.size
        if name.startswith(("scroll/", "choice/")):
            assert image.width % 2 == 0 and image.height % 2 == 0, name
            half = image.resize((image.width // 2, image.height // 2), Image.Resampling.NEAREST)
            doubled = half.resize(image.size, Image.Resampling.NEAREST)
            assert ImageChops.difference(image, doubled).getbbox() is None, f"Broken 2x pixel grid: {name}"
            pixel_grid.append(name)

seams = []
for theme_dir in sorted((SOURCE / "scroll").iterdir()):
    panels = sorted(theme_dir.glob("*.png"))
    for left_path, right_path in zip(panels, panels[1:]):
        with Image.open(left_path) as left, Image.open(right_path) as right:
            overlap = 128
            lhs = left.crop((left.width - overlap, 0, left.width, left.height))
            rhs = right.crop((0, 0, overlap, right.height))
            assert ImageChops.difference(lhs, rhs).getbbox() is None, f"Visible seam: {theme_dir.name}/{left_path.stem}-{right_path.stem}"
            seams.append(f"{theme_dir.name}/{left_path.stem}-{right_path.stem}")

assert len(pixel_grid) == 63, len(pixel_grid)
assert len(seams) == 44, len(seams)
REPORT.parent.mkdir(parents=True, exist_ok=True)
report = {"pass": True, "source": "candidate" if SOURCE == CANDIDATE else "integrated",
          "sceneFiles": len(candidate), "pixelGridFiles": len(pixel_grid),
          "exactSeams": len(seams), "seams": seams, "dimensions": dimensions}
REPORT.write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding="utf-8")
print(json.dumps({"pass": True, "sceneFiles": len(candidate), "pixelGridFiles": len(pixel_grid),
                  "exactSeams": len(seams), "report": str(REPORT)}, ensure_ascii=False))
