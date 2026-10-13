#!/usr/bin/env python3
"""生成紧凑、等比显示的《浮生》字标；保留旧字标，不安装或复制系统字体。"""

from __future__ import annotations

import json
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont


GAME = Path(__file__).resolve().parents[1]
FONT = GAME / "assets/resources/fonts/FusionPixel.ttf"
ASSET = GAME / "assets/resources/art/ui/logo-detail-v3.png"
QA = GAME / "build/qa/ui-detail-v3/wordmark"
INK = "#334941"
GOLD = "#cfac68"
PAPER = "#f0efe1"
UUID = "71a1a914-7e59-4a7f-af3a-4b849b672ab3"


def wordmark() -> Image.Image:
    """24px 字号保留字体原生 12px 字格的两倍笔画，以 2x PNG 存储。"""
    mask = Image.new("L", (66, 26), 0)
    draw = ImageDraw.Draw(mask)
    font = ImageFont.truetype(str(FONT), 24)
    # 分别绘制方形字格，字间 6px。不上窄体、不做非等比拉伸。
    draw.text((6, -4), "浮", fill=255, font=font)
    draw.text((36, -4), "生", fill=255, font=font)
    mask = mask.point(lambda value: 255 if value >= 128 else 0)
    image = Image.new("RGBA", mask.size, (0, 0, 0, 0))
    # 向右下偏一格的浅金底边，像木刻字上轻轻留出的纸边。
    shadow = Image.new("L", mask.size, 0)
    shadow.paste(mask, (1, 1))
    image.paste(GOLD, (0, 0), shadow)
    image.paste(INK, (0, 0), mask)
    return image.resize((132, 52), Image.Resampling.NEAREST)


def write_meta() -> None:
    source = json.loads((ASSET.parent / "logo.png.meta").read_text(encoding="utf-8"))
    source["uuid"] = UUID
    texture = source["subMetas"]["6c48a"]
    texture["uuid"] = UUID + "@6c48a"
    texture["displayName"] = ASSET.stem
    texture["userData"].update({
        "wrapModeS": "clamp-to-edge", "wrapModeT": "clamp-to-edge",
        "minfilter": "nearest", "magfilter": "nearest",
        "imageUuidOrDatabaseUri": UUID,
    })
    source["userData"]["redirect"] = UUID + "@6c48a"
    ASSET.with_suffix(".png.meta").write_text(
        json.dumps(source, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


def contact_sheet(image: Image.Image) -> None:
    canvas = Image.new("RGB", (960, 540), PAPER)
    draw = ImageDraw.Draw(canvas)
    label = ImageFont.truetype(str(FONT), 16)
    title = ImageFont.truetype(str(FONT), 24)
    draw.text((28, 20), "浮生 / 字标校正", fill=INK, font=title)
    draw.text((28, 56), "原始字标保留。新增紧凑画幅，方形字格，两倍原生笔画。", fill=INK, font=label)

    old = Image.open(ASSET.parent / "logo.png").convert("RGBA")
    old_view = old.resize((68, 60), Image.Resampling.NEAREST)
    new_view = image
    draw.text((40, 106), "旧大厅 34 × 30", fill=INK, font=label)
    canvas.paste(old_view, (40, 138), old_view)
    draw.text((280, 106), "新大厅 66 × 26", fill=INK, font=label)
    canvas.paste(new_view, (280, 142), new_view)
    draw.text((530, 106), "四倍逻辑像素 / 笔画细节", fill=INK, font=label)
    zoom = image.resize((264, 104), Image.Resampling.NEAREST)
    canvas.paste(zoom, (530, 134), zoom)

    draw.rectangle((28, 278, 931, 470), fill=INK)
    draw.text((48, 294), "深色底 / 字形仍保持方正", fill=PAPER, font=label)
    dark = image.copy()
    # 对深色纸底可用同一字形，字面更换为纸色；仅用作检查，不新增消费资源。
    pixels = dark.load()
    for y in range(dark.height):
        for x in range(dark.width):
            if pixels[x, y][:3] == (51, 73, 65):
                pixels[x, y] = (240, 239, 225, pixels[x, y][3])
    zoom = dark.resize((264, 104), Image.Resampling.NEAREST)
    canvas.paste(zoom, (70, 338), zoom)
    draw.text((450, 346), "PNG: 132 × 52", fill=PAPER, font=label)
    draw.text((450, 382), "显示: 66 × 26 / nearest", fill=PAPER, font=label)
    draw.text((450, 418), "字体: FusionPixel / SIL OFL 1.1", fill=PAPER, font=label)
    canvas.save(QA / "wordmark-contactsheet.png")


def main() -> None:
    QA.mkdir(parents=True, exist_ok=True)
    image = wordmark()
    image.save(ASSET)
    write_meta()
    contact_sheet(image)
    old = Image.open(ASSET.parent / "logo.png").convert("RGBA")
    report = {
        "asset": str(ASSET),
        "sourceSize": image.size,
        "displaySize": [66, 26],
        "alphaBounds": image.getchannel("A").getbbox(),
        "oldSourceSize": old.size,
        "oldAlphaBounds": old.getchannel("A").getbbox(),
        "alphaLevels": [level for level, count in enumerate(image.getchannel("A").histogram()) if count],
        "palette": [INK, GOLD],
        "font": "FusionPixel.ttf (SIL Open Font License 1.1)",
        "method": "deterministic font rasterization on an integer pixel grid",
        "oldAssetPreserved": True,
    }
    (QA / "wordmark-validation.json").write_text(
        json.dumps(report, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(json.dumps(report, ensure_ascii=False))


if __name__ == "__main__":
    main()
