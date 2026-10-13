#!/usr/bin/env python3
"""生成结构一致的圆穹顶鸟笼像素道具，保留旧素材并输出 v6 与预览。

64×80 源像素对应 32×40 游戏逻辑像素。所有几何先落到源像素网格，
不做抗锯齿、发光、模糊或透明实心罩；前后笼条按椭圆投影分层。
normal / active 共享全部几何，active 只改变少数金属高光的颜色。
"""

from __future__ import annotations

import hashlib
import json
import math
import uuid
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont


GAME = Path(__file__).resolve().parents[1]
OUT = GAME / "assets/resources/art/props/symbols"
QA = GAME / "build/qa/birdcage-detail-v6"
SIZE = (64, 80)
NAMESPACE = uuid.UUID("1ee0f0c4-4604-5fb3-bbc7-a215ef39e323")
COLORS = {
    "ink": "#4f5749",
    "back": "#73755a",
    "back_edge": "#979174",
    "metal_shadow": "#6f674d",
    "metal": "#a39469",
    "metal_light": "#cab78a",
    "glint": "#e0cba0",
    "wood_shadow": "#675746",
    "wood": "#94806a",
    "wood_light": "#b8a282",
    "floor": "#8d8268",
    "bird_shadow": "#918160",
    "bird_body": "#c7b389",
    "bird_breast": "#e2cda5",
    "bird_wing": "#919879",
    "bird_head": "#b99672",
    "beak": "#805d43",
}


def point(x: float, y: float) -> tuple[int, int]:
    return round(x), round(y)


def pixels(img: Image.Image):
    """兼容当前和旧版 Pillow，避免生成日志被 getdata 弃用告警淹没。"""
    return img.get_flattened_data() if hasattr(img, "get_flattened_data") else img.getdata()


def ellipse_arc(cx: float, cy: float, rx: float, ry: float,
                begin: int = 0, end: int = 360) -> list[tuple[int, int]]:
    return [point(cx + rx * math.cos(math.radians(a)),
                  cy + ry * math.sin(math.radians(a)))
            for a in range(begin, end + 1, 3)]


def cage_rib(angle: int) -> list[tuple[int, int]]:
    """穹顶经线、柱身、椭圆底座使用同一个 θ，避免笼条悬空/错接。"""
    theta = math.radians(angle)
    dome = [point(32 + 24 * math.sin(phi) * math.cos(theta),
                  26 - 10 * math.cos(phi) + 3 * math.sin(phi) * math.sin(theta))
            for phi in [math.pi * n / 40 for n in range(21)]]
    dome.append(point(32 + 24 * math.cos(theta), 65 + 4 * math.sin(theta)))
    return dome


def draw_cage(active: bool = False) -> Image.Image:
    img = Image.new("RGBA", SIZE)
    d = ImageDraw.Draw(img)
    c = COLORS.copy()
    # 拾取态改变磨旧铜件的反光，鸟和笼门始终保持同一姿态。
    if active:
        c["metal_light"] = "#d5c092"
        c["glint"] = "#ecd8af"

    def line(path, color, width=1):
        d.line(path, fill=c[color], width=width)

    # 椭圆托盘：后沿先画，立面最终覆盖笼条根部。
    d.ellipse((6, 59, 58, 73), fill=c["metal_shadow"])
    d.ellipse((8, 60, 56, 70), fill=c["floor"])
    line(ellipse_arc(32, 65, 25, 6, 180, 360), "back_edge", 2)
    line(ellipse_arc(32, 65, 21, 4, 180, 360), "wood_shadow", 1)

    # 暗色后经线及后箍；整只笼子的内部仍完全透出场景。
    for angle in (-150, -120, -90, -60, -30):
        line(cage_rib(angle), "back", 1)
    line(ellipse_arc(32, 26, 24, 3, 180, 360), "back", 2)
    line(ellipse_arc(32, 34, 24, 4, 180, 360), "back", 1)

    # 栖木两端穿接至左右外框，端套与木纹区分材质。
    line([(9, 55), (54, 55)], "wood_shadow", 4)
    line([(10, 54), (53, 54)], "wood", 2)
    line([(11, 53), (48, 53)], "wood_light", 1)
    d.rectangle((8, 52, 11, 57), fill=c["metal_shadow"])
    d.rectangle((52, 52, 55, 57), fill=c["metal_shadow"])
    line([(9, 52), (10, 52)], "metal_light", 1)
    line([(52, 52), (54, 52)], "metal_light", 1)
    line([(16, 55), (21, 55)], "wood_shadow", 1)
    line([(43, 54), (47, 54)], "wood_shadow", 1)

    # 小雀侧面：尾羽/两足/胸腹/折翼/喙/眼分别保留可辨像素。
    bird = Image.new("RGBA", SIZE)
    bd = ImageDraw.Draw(bird)
    bd.polygon([(21, 48), (16, 44), (17, 49), (23, 51)], fill=c["bird_shadow"])
    bd.polygon([(22, 45), (27, 41), (34, 42), (39, 45), (36, 50),
               (29, 52), (23, 50)], fill=c["bird_shadow"])
    bd.polygon([(23, 45), (28, 42), (34, 43), (38, 46), (35, 50),
               (28, 51), (24, 49)], fill=c["bird_body"])
    bd.polygon([(33, 44), (37, 45), (37, 48), (34, 50), (29, 51),
               (29, 49)], fill=c["bird_breast"])
    bd.polygon([(23, 45), (27, 44), (32, 45), (31, 48), (25, 49)],
              fill=c["bird_wing"])
    bd.line([(25, 46), (29, 46), (30, 47)], fill=c["bird_shadow"], width=1)
    bd.ellipse((34, 36, 43, 45), fill=c["bird_head"])
    bd.polygon([(36, 37), (40, 37), (41, 39), (37, 39)], fill=c["bird_body"])
    bd.polygon([(41, 40), (46, 41), (42, 43)], fill=c["beak"])
    bd.rectangle((40, 39, 41, 40), fill=c["ink"])
    bd.point((40, 39), fill=c["bird_breast"])
    bd.line([(28, 51), (28, 54), (26, 54)], fill=c["beak"], width=1)
    bd.line([(33, 50), (33, 54), (35, 54)], fill=c["beak"], width=1)
    # 留出鸟头与小门间的空隙；两足仍踩在 y=54 的栖木上。
    img.alpha_composite(bird, (-4, 0))

    # 前经线：暗边占 2 像素，高光占 1 像素；不使用满屏等距网格。
    # 60° 经线中段留给独立小门，避免画出覆盖门口的连续笼条。
    for angle in (150, 120, 90, 60, 30):
        rib = cage_rib(angle)
        if angle == 60:
            line(rib[:-1], "metal_shadow", 2)
            line(rib[:-1], "metal_light", 1)
            line([rib[-2], (44, 35)], "metal_shadow", 2)
            line([(44, 61), rib[-1]], "metal_shadow", 2)
        else:
            line(rib, "metal_shadow", 2)
            line([(x - 1, y) for x, y in rib], "metal_light", 1)

    # 外侧立柱与肩部箍加强结构；侧边光不覆盖整只笼子。
    for angle in (0, 180):
        line(cage_rib(angle), "metal_shadow", 3)
        line([(x - 1, y) for x, y in cage_rib(angle)], "metal", 1)
    line(ellipse_arc(32, 26, 24, 3, 0, 180), "metal_shadow", 3)
    line(ellipse_arc(32, 25, 24, 3, 5, 166), "metal_light", 1)
    line(ellipse_arc(32, 34, 24, 4, 0, 180), "metal", 1)
    line(ellipse_arc(32, 60, 24, 4, 0, 180), "metal_shadow", 1)

    # 偏右小门沿圆柱前表面投影，门内与整笼材质一致。
    door = [(39, 61), (39, 39), (40, 36), (42, 34), (46, 34),
            (49, 36), (50, 40), (50, 61), (39, 61)]
    line(door, "metal_shadow", 3)
    line([(x - 1, y) for x, y in door], "metal_light", 1)
    line([(44, 36), (44, 60)], "metal", 1)
    line([(40, 48), (49, 48)], "metal", 1)
    for y in (41, 56):
        d.rectangle((37, y, 40, y + 2), fill=c["metal_shadow"])
        d.point((38, y), fill=c["glint"])
    d.rectangle((48, 48, 52, 50), fill=c["metal_shadow"])
    line([(49, 48), (51, 48)], "glint", 1)
    d.point((51, 49), fill=c["metal_light"])

    # 顶帽接经线，吊环真正落在顶帽上，内孔保持透明。
    d.ellipse((27, 12, 37, 18), fill=c["metal_shadow"])
    line(ellipse_arc(32, 14, 4, 2, 182, 352), "metal_light", 1)
    d.rectangle((30, 9, 34, 13), fill=c["metal_shadow"])
    line([(30, 10), (30, 12)], "metal_light", 1)
    line([(31, 3), (34, 3), (36, 5), (36, 8), (34, 10), (30, 10),
          (28, 8), (28, 5), (30, 3), (31, 3)], "metal_shadow", 2)
    line([(30, 3), (33, 3), (35, 5)], "glint", 1)
    line([(28, 5), (28, 8), (30, 10)], "metal", 1)

    # 前侧双层抽屉底托盖住笼条根部，形成连续椭圆立面。
    d.polygon([(6, 65), (10, 69), (19, 72), (32, 73), (45, 72),
               (54, 69), (58, 65), (58, 71), (53, 75), (43, 77),
               (21, 77), (11, 75), (6, 71)], fill=c["metal_shadow"])
    d.polygon([(8, 68), (15, 72), (27, 74), (38, 74), (50, 71),
               (56, 68), (56, 72), (49, 75), (39, 76), (22, 76),
               (13, 74), (8, 71)], fill=c["metal"])
    line(ellipse_arc(32, 65, 26, 8, 0, 180), "metal_light", 2)
    line(ellipse_arc(32, 69, 25, 7, 8, 172), "wood_shadow", 1)
    line(ellipse_arc(32, 72, 23, 4, 12, 167), "metal_light", 1)
    d.rectangle((28, 72, 36, 74), fill=c["metal_shadow"])
    line([(29, 72), (35, 72)], "metal_light", 1)
    d.point((13, 71), fill=c["glint"])
    d.point((51, 72), fill=c["metal_shadow"])
    return img


def write_meta(path: Path) -> None:
    asset_id = str(uuid.uuid5(NAMESPACE, path.name))
    data = {
        "ver": "1.0.27", "importer": "image", "imported": True,
        "uuid": asset_id, "files": [".json", ".png"],
        "subMetas": {"6c48a": {
            "importer": "texture", "uuid": asset_id + "@6c48a",
            "displayName": path.stem, "id": "6c48a", "name": "texture",
            "userData": {
                "wrapModeS": "clamp-to-edge", "wrapModeT": "clamp-to-edge",
                "minfilter": "nearest", "magfilter": "nearest", "mipfilter": "none",
                "anisotropy": 0, "isUuid": True,
                "imageUuidOrDatabaseUri": asset_id, "visible": False,
            },
            "ver": "1.0.22", "imported": True,
            "files": [".json"], "subMetas": {},
        }},
        "userData": {"type": "texture", "fixAlphaTransparencyArtifacts": False,
                     "hasAlpha": True, "redirect": asset_id + "@6c48a"},
    }
    path.with_suffix(path.suffix + ".meta").write_text(
        json.dumps(data, indent=2) + "\n", encoding="utf-8")


def create_preview(images: dict[str, Image.Image]) -> Path:
    """对比图同时呈现源像素放大和实际 32×40 逻辑尺寸。"""
    canvas = Image.new("RGB", (864, 510), "#ebe9dc")
    draw = ImageDraw.Draw(canvas)
    font_file = Path("C:/Windows/Fonts/msyh.ttc")
    font = ImageFont.truetype(str(font_file), 20) if font_file.exists() else ImageFont.load_default()
    small = ImageFont.truetype(str(font_file), 15) if font_file.exists() else ImageFont.load_default()
    labels = ("原鸟笼", "v6 / 常态", "v6 / 接近时")
    old = Image.open(OUT / "birdcage_normal.png").convert("RGBA")
    old_full = old.resize((56, 64), Image.Resampling.NEAREST)
    panes = [old_full, images["normal"], images["active"]]
    for i, (label, sprite) in enumerate(zip(labels, panes)):
        x = i * 288
        draw.text((x + 26, 14), label, font=font, fill="#334941")
        for xx in range(x + 16, x + 272, 16):
            for yy in range(50, 374, 16):
                color = "#d3d8c9" if ((xx // 16 + yy // 16) % 2) else "#e3e4d6"
                draw.rectangle((xx, yy, xx + 15, yy + 15), fill=color)
        scaled = sprite.resize((sprite.width * 4, sprite.height * 4), Image.Resampling.NEAREST)
        canvas.paste(scaled, (x + (288 - scaled.width) // 2,
                              50 + (320 - scaled.height) // 2), scaled)
    draw.text((18, 387), "游戏逻辑尺寸：旧 28×32 → 新 32×40，以下在晨间场景上按 2 倍显示", font=small, fill="#5e7363")
    dawn = Image.open(GAME / "assets/resources/art/pixel/scene/dawn.png").convert("RGBA").resize(
        (480, 270), Image.Resampling.NEAREST)
    for i, sprite in enumerate((old, images["normal"], images["active"])):
        frame = dawn.crop((66, 130, 186, 170))
        logical = sprite.resize((28, 32) if i == 0 else (32, 40), Image.Resampling.NEAREST)
        frame.alpha_composite(logical, ((120 - logical.width) // 2, 40 - logical.height))
        frame = frame.resize((240, 80), Image.Resampling.NEAREST)
        canvas.paste(frame.convert("RGB"), (i * 288 + 24, 418))
    path = QA / "birdcage-contactsheet.png"
    canvas.save(path)
    return path


def main() -> None:
    OUT.mkdir(parents=True, exist_ok=True)
    QA.mkdir(parents=True, exist_ok=True)
    images = {state: draw_cage(state == "active") for state in ("normal", "active")}
    normal, active = images.values()
    assert normal.getchannel("A").tobytes() == active.getchannel("A").tobytes()
    palette = {tuple(bytes.fromhex(value[1:])) + (255,) for value in COLORS.values()}
    palette |= {(213, 192, 146, 255), (236, 216, 175, 255), (0, 0, 0, 0)}
    outputs = []
    for state, img in images.items():
        assert img.size == SIZE and set(pixels(img)) <= palette
        assert set(pixels(img.getchannel("A"))) == {0, 255}
        path = OUT / f"birdcage-detail-v6-{state}.png"
        img.save(path, optimize=False)
        write_meta(path)
        outputs.append({"state": state, "path": str(path), "sourcePixels": list(SIZE),
                        "logicalPixels": [32, 40], "alphaBounds": img.getbbox(),
                        "sha256": hashlib.sha256(path.read_bytes()).hexdigest()})
    changed = sum(a != b for a, b in zip(pixels(normal), pixels(active)))
    preview = create_preview(images)
    report = {"version": "birdcage-detail-v6", "geometryUnchangedBetweenStates": True,
              "activeChangedPixels": changed, "opacity": "binary, transparent holes",
              "paletteSizeNormal": len(set(pixels(normal))), "outputs": outputs,
              "preview": str(preview),
              "placement": {"width": 32, "height": 40, "xOffset": -16,
                            "yOffset": -38, "bottom": "symbol y+2"}}
    (QA / "asset-report.json").write_text(json.dumps(report, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(json.dumps(report, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
