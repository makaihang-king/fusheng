#!/usr/bin/env python3
"""用整数像素重绘界面图标；保留导入 UUID，并备份首次替换前的资源。"""

from __future__ import annotations

import json
import shutil
from pathlib import Path

from PIL import Image, ImageDraw, ImageFilter, ImageFont


GAME = Path(__file__).resolve().parents[1]
ICONS = GAME / "assets/resources/art/ui/icons"
QA = GAME / "build/qa/ui-polish-v2"
BACKUP = QA / "original-icons"
IDS = (
    "heart", "fragment", "wrapper", "lamp_morning", "lamp_backrow",
    "lamp_outside", "lamp_desk", "pause", "exit", "play", "achievement",
    "book", "shop", "wardrobe", "settings", "chapter", "shield", "magnet",
    "eraser", "check", "feather", "lock", "motion", "rewind", "sound",
)
STATES = ("normal", "active")
INK = "#334941"
PAPER = "#eeeade"
GOLD = "#cfac68"
HEART = "#c87564"
PALETTE = {tuple(bytes.fromhex(c[1:])) + (255,) for c in (INK, PAPER, GOLD, HEART)}


def draw_icon(icon_id: str, active: bool) -> Image.Image:
    """每条线、轮廓和色块都落在 16×16 像素网格，不使用模糊和抗锯齿。"""
    image = Image.new("RGBA", (16, 16), (0, 0, 0, 0))
    mask = Image.new("L", (16, 16))
    silhouette = ImageDraw.Draw(mask)
    detail = []
    fill = GOLD if active else PAPER
    accent = PAPER if active else GOLD

    def rect(box, color=None):
        if color is None:
            silhouette.rectangle(box, fill=255)
        else:
            detail.append(("rectangle", box, color))

    def line(points, color=INK, width=1):
        detail.append(("line", points, color, width))

    def poly(points, color=None):
        if color is None:
            silhouette.polygon(points, fill=255)
        else:
            detail.append(("polygon", points, color))

    if icon_id == "heart":
        poly([(3, 3), (5, 3), (7, 5), (8, 5), (10, 3), (12, 3),
              (13, 4), (13, 7), (11, 9), (8, 12), (7, 12), (4, 9), (2, 7), (2, 4)])
        fill = HEART if active else PAPER
        if active:
            rect((3, 4, 4, 5), PAPER)
        else:
            line([(5, 9), (7, 11), (8, 11), (10, 9)], GOLD)
    elif icon_id == "fragment":
        poly([(7, 2), (11, 4), (13, 8), (8, 13), (3, 10), (2, 5)])
        line([(7, 3), (7, 7), (3, 9)], INK)
        line([(7, 7), (11, 5)], INK)
        line([(7, 7), (9, 11)], accent)
        rect((5, 4, 5, 5), accent)
    elif icon_id == "wrapper":
        poly([(2, 5), (5, 6), (6, 4), (10, 4), (11, 6), (13, 5),
              (13, 10), (11, 9), (10, 11), (6, 11), (5, 9), (2, 10)])
        line([(5, 6), (5, 9)], INK)
        line([(11, 6), (11, 9)], INK)
        rect((7, 6, 9, 9), accent)
    elif icon_id == "lamp_morning":
        poly([(5, 4), (10, 4), (11, 5), (11, 8), (9, 10),
              (9, 11), (6, 11), (6, 10), (4, 8), (4, 5)])
        rect((6, 12, 9, 12))
        line([(5, 6), (6, 5)], accent)
        line([(7, 9), (8, 9)], INK)
        line([(2, 3), (3, 4)], GOLD)
        line([(12, 3), (13, 2)], GOLD)
        line([(7, 1), (8, 1)], GOLD)
    elif icon_id == "lamp_backrow":
        rect((4, 4, 11, 11))
        rect((6, 2, 9, 2))
        rect((5, 12, 10, 12))
        line([(6, 3), (9, 3)], INK)
        line([(4, 6), (11, 6)], INK)
        line([(7, 6), (7, 10)], INK)
        rect((5, 8, 5, 9), accent)
        rect((9, 8, 9, 9), accent)
    elif icon_id == "lamp_outside":
        rect((4, 3, 11, 8))
        rect((7, 9, 8, 12))
        rect((5, 13, 10, 13))
        rect((3, 3, 12, 3), INK)
        line([(5, 4), (5, 7)], accent)
        line([(10, 4), (10, 7)], accent)
        line([(6, 8), (9, 8)], INK)
    elif icon_id == "lamp_desk":
        poly([(4, 3), (10, 3), (12, 6), (2, 6)])
        poly([(9, 7), (10, 7), (7, 10), (7, 12), (6, 12), (6, 10)])
        rect((3, 13, 11, 13))
        line([(5, 4), (9, 4)], accent)
        line([(4, 8), (3, 9)], GOLD)
    elif icon_id == "pause":
        rect((3, 3, 5, 12))
        rect((10, 3, 12, 12))
        line([(4, 4), (4, 6)], accent)
        line([(11, 4), (11, 6)], accent)
    elif icon_id == "exit":
        rect((3, 3, 8, 12))
        rect((9, 9, 10, 12))
        rect((4, 4, 7, 11), INK)
        poly([(9, 5), (11, 5), (11, 3), (13, 7), (11, 10), (11, 8), (9, 8)])
        line([(6, 6), (6, 9)], accent)
    elif icon_id == "play":
        poly([(4, 3), (6, 3), (12, 7), (12, 8), (6, 12), (4, 12)])
        line([(5, 4), (5, 8)], accent)
    elif icon_id == "achievement":
        poly([(4, 2), (6, 2), (7, 5), (8, 5), (9, 2), (11, 2),
              (10, 6), (12, 8), (12, 10), (10, 12), (5, 12), (3, 10),
              (3, 8), (5, 6)])
        line([(5, 3), (6, 5)], INK)
        line([(10, 3), (9, 5)], INK)
        poly([(7, 7), (8, 7), (8, 8), (10, 8), (9, 9), (9, 11),
              (8, 10), (7, 10), (6, 11), (6, 9), (5, 8), (7, 8)], accent)
    elif icon_id == "book":
        poly([(2, 3), (5, 3), (7, 4), (8, 4), (10, 3), (13, 3),
              (13, 12), (10, 12), (8, 13), (7, 13), (5, 12), (2, 12)])
        line([(7, 5), (7, 11)], INK)
        line([(3, 5), (5, 5)], accent)
        line([(3, 7), (5, 7)], INK)
        line([(3, 9), (5, 9)], INK)
        line([(9, 6), (12, 6)], INK)
        line([(9, 8), (11, 8)], accent)
    elif icon_id == "shop":
        rect((3, 6, 12, 12))
        poly([(4, 2), (11, 2), (13, 5), (13, 6), (2, 6), (2, 5)])
        line([(4, 3), (3, 5)], accent)
        line([(7, 3), (7, 5)], INK)
        line([(10, 3), (11, 5)], accent)
        rect((5, 8, 8, 11), INK)
        rect((10, 8, 11, 9), accent)
        rect((2, 13, 13, 13), INK)
    elif icon_id == "wardrobe":
        poly([(5, 3), (6, 3), (6, 5), (9, 5), (9, 3), (10, 3),
              (13, 5), (13, 7), (11, 7), (11, 12), (4, 12),
              (4, 7), (2, 7), (2, 5)])
        line([(6, 6), (9, 6)], INK)
        rect((8, 8, 9, 9), accent)
        line([(5, 11), (10, 11)], accent)
    elif icon_id == "settings":
        poly([(6, 2), (9, 2), (9, 4), (11, 4), (12, 3), (13, 4),
              (12, 6), (13, 6), (13, 9), (12, 9), (12, 11), (13, 12),
              (11, 13), (9, 12), (9, 13), (6, 13), (6, 12), (4, 12),
              (3, 13), (2, 11), (3, 9), (2, 9), (2, 6), (3, 6),
              (3, 4), (2, 3), (4, 2), (6, 3)])
        rect((6, 6, 9, 9), INK)
        rect((7, 7, 8, 8), accent)
        rect((6, 3, 8, 3), accent)
    elif icon_id == "chapter":
        poly([(4, 2), (10, 2), (12, 4), (12, 13), (4, 13)])
        rect((10, 2, 10, 4), INK)
        rect((10, 4, 12, 4), INK)
        line([(6, 6), (10, 6)], INK)
        line([(6, 8), (10, 8)], INK)
        line([(6, 10), (8, 10)], INK)
        rect((2, 4, 2, 12))
        rect((5, 3, 6, 3), accent)
    elif icon_id == "shield":
        poly([(2, 3), (6, 3), (7, 2), (8, 2), (9, 3), (13, 3),
              (13, 8), (11, 11), (8, 13), (7, 13), (4, 11), (2, 8)])
        line([(7, 4), (7, 11)], INK)
        line([(4, 5), (4, 8), (5, 10)], accent)
    elif icon_id == "magnet":
        poly([(3, 3), (6, 3), (6, 9), (7, 10), (8, 10), (9, 9),
              (9, 3), (12, 3), (12, 10), (10, 12), (5, 12), (3, 10)])
        rect((3, 3, 6, 5), PAPER)
        rect((9, 3, 12, 5), PAPER)
        line([(3, 6), (6, 6)], INK)
        line([(9, 6), (12, 6)], INK)
        line([(5, 10), (6, 11)], accent)
    elif icon_id == "eraser":
        poly([(7, 3), (10, 3), (13, 6), (13, 8), (8, 13),
              (5, 13), (2, 10), (2, 8)])
        poly([(3, 8), (5, 6), (9, 10), (7, 12), (5, 12), (3, 10)], accent)
        line([(5, 6), (9, 10)], INK)
        rect((10, 13, 13, 13), INK)
    elif icon_id == "check":
        poly([(2, 7), (4, 7), (6, 9), (11, 3), (13, 3), (13, 5),
              (7, 12), (5, 12), (2, 9)])
        line([(3, 8), (5, 10)], accent)
    elif icon_id == "feather":
        poly([(10, 2), (13, 2), (13, 6), (11, 9), (8, 10),
              (5, 10), (4, 12), (3, 13), (2, 13), (5, 9), (5, 6), (8, 3)])
        line([(5, 10), (10, 5)], INK)
        line([(8, 7), (12, 6)], accent)
        line([(7, 8), (7, 5)], INK)
    elif icon_id == "lock":
        rect((3, 7, 12, 13))
        poly([(4, 6), (4, 4), (6, 2), (9, 2), (11, 4), (11, 6),
              (9, 6), (9, 4), (6, 4), (6, 6)])
        rect((7, 9, 8, 10), INK)
        rect((7, 11, 7, 11), INK)
        line([(4, 8), (4, 10)], accent)
    elif icon_id == "motion":
        # 以脚步和运动方向表达动态效果，避免与声音图标混淆。
        rect((9, 2, 10, 3))
        poly([(7, 5), (9, 5), (10, 7), (12, 7), (12, 8), (9, 8),
              (8, 7), (7, 9), (9, 11), (9, 13), (7, 13), (7, 11),
              (5, 10), (4, 12), (2, 12), (4, 8), (5, 5)])
        rect((2, 4, 4, 4), GOLD)
        rect((2, 6, 3, 6), GOLD)
        rect((7, 6, 7, 7), accent)
    elif icon_id == "rewind":
        poly([(5, 2), (2, 5), (5, 8), (5, 6), (8, 6), (8, 4), (5, 4)])
        poly([(9, 3), (11, 4), (13, 6), (13, 9), (11, 12), (5, 12),
              (3, 10), (3, 8), (5, 8), (5, 10), (10, 10), (11, 8),
              (11, 7), (10, 5), (9, 5)])
        line([(6, 11), (9, 11)], accent)
    elif icon_id == "sound":
        poly([(2, 6), (5, 6), (8, 3), (9, 3), (9, 12), (8, 12),
              (5, 9), (2, 9)])
        line([(6, 6), (6, 9)], INK)
        line([(11, 5), (12, 6), (12, 9), (11, 10)], GOLD)
        rect((3, 7, 3, 8), accent)
    else:
        raise ValueError(f"Unknown icon: {icon_id}")

    # 一像素轮廓随原始像素边缘扩展，保证小字号缩放时仍有实色边界。
    outline = mask.filter(ImageFilter.MaxFilter(3))
    image.paste(INK, (0, 0), outline)
    image.paste(fill, (0, 0), mask)
    painter = ImageDraw.Draw(image)
    for operation in detail:
        method, geometry, color, *width = operation
        if method == "line":
            painter.line(geometry, fill=color, width=width[0])
        else:
            getattr(painter, method)(geometry, fill=color)
    return image


def uuid_tree(meta: dict) -> list[str]:
    return [meta["uuid"]] + [uuid for sub in meta.get("subMetas", {}).values()
                              for uuid in uuid_tree(sub)]


def update_texture_meta(meta: dict) -> None:
    if meta.get("importer") == "texture":
        meta["userData"]["minfilter"] = "nearest"
        meta["userData"]["magfilter"] = "nearest"
    for sub in meta.get("subMetas", {}).values():
        update_texture_meta(sub)


def pixel_colors(image: Image.Image) -> set:
    return {image.getpixel((x, y)) for y in range(image.height) for x in range(image.width)}


def main() -> None:
    expected = {f"{icon_id}_{state}.png" for icon_id in IDS for state in STATES}
    actual = {path.name for path in ICONS.glob("*.png")}
    if actual != expected:
        raise AssertionError(f"Icon inventory differs: missing={expected - actual}, extra={actual - expected}")
    BACKUP.mkdir(parents=True, exist_ok=True)
    for name in sorted(expected):
        for source in (ICONS / name, ICONS / f"{name}.meta"):
            destination = BACKUP / source.name
            if not destination.exists():
                shutil.copy2(source, destination)

    for icon_id in IDS:
        for state in STATES:
            path = ICONS / f"{icon_id}_{state}.png"
            draw_icon(icon_id, state == "active").resize((32, 32), Image.Resampling.NEAREST).save(path)
            meta_path = path.with_suffix(".png.meta")
            meta = json.loads(meta_path.read_text(encoding="utf-8-sig"))
            update_texture_meta(meta)
            meta_path.write_text(json.dumps(meta, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")

    font = ImageFont.load_default(size=12)
    sheet = Image.new("RGB", (660, 560), PAPER)
    painter = ImageDraw.Draw(sheet)
    painter.rectangle((0, 0, 659, 47), fill=INK)
    painter.text((18, 10), "A FLEETING LIFE / 16px UI ICONS", fill=PAPER, font=font)
    painter.text((18, 27), "Normal / Active     25 meanings, 50 transparent sprites", fill=GOLD, font=font)
    checked = []
    for index, icon_id in enumerate(IDS):
        x = (index % 5) * 132
        y = 48 + (index // 5) * 102
        painter.rectangle((x + 4, y + 5, x + 127, y + 96), outline="#d2cdbd")
        painter.text((x + 12, y + 12), icon_id, fill=INK, font=font)
        for column, state in enumerate(STATES):
            path = ICONS / f"{icon_id}_{state}.png"
            with Image.open(path) as source:
                sprite = source.convert("RGBA")
            assert sprite.size == (32, 32), path
            colors = pixel_colors(sprite)
            assert colors <= PALETTE | {(0, 0, 0, 0)}, path
            alpha = sprite.getchannel("A")
            assert pixel_colors(alpha) == {0, 255}, path
            bbox = alpha.getbbox()
            assert bbox and 0 < bbox[0] < bbox[2] < 32 and 0 < bbox[1] < bbox[3] < 32, (path, bbox)
            logical = sprite.resize((16, 16), Image.Resampling.NEAREST)
            assert logical.resize((32, 32), Image.Resampling.NEAREST).tobytes() == sprite.tobytes(), path
            meta = json.loads(path.with_suffix(".png.meta").read_text(encoding="utf-8"))
            previous = json.loads((BACKUP / f"{path.name}.meta").read_text(encoding="utf-8-sig"))
            assert uuid_tree(meta) == uuid_tree(previous), path
            assert all(sub["userData"]["minfilter"] == "nearest" and
                       sub["userData"]["magfilter"] == "nearest"
                       for sub in meta["subMetas"].values() if sub["importer"] == "texture"), path
            sx = x + 22 + column * 55
            sy = y + 34
            sheet.paste(sprite, (sx, sy), sprite)
            painter.text((sx - 2, sy + 38), state, fill=INK, font=font)
            checked.append({"file": path.name, "size": list(sprite.size), "alphaBounds": list(bbox),
                            "colors": len(colors - {(0, 0, 0, 0)}), "uuidPreserved": True})
    sheet.save(QA / "pixel-icons.png")
    report = {"logicalSize": 16, "outputSize": 32, "sprites": len(checked), "backups": len(list(BACKUP.iterdir())),
              "filter": "nearest", "transparent": True, "binaryAlpha": True,
              "noEdgeClipping": True, "files": checked}
    (QA / "pixel-icons-validation.json").write_text(json.dumps(report, indent=2) + "\n", encoding="utf-8")
    print(f"Generated and validated {len(checked)} icons; preserved all UUIDs; backed up 50 PNGs + 50 metas.")
    print(f"Contact sheet: {QA / 'pixel-icons.png'}")


if __name__ == "__main__":
    main()
