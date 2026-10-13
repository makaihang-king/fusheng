"""Keep one story-significant school gate per clear-v7 scrolling chapter.

The base backgrounds are re-rendered through the existing pixel scene painter,
with only the gateway iterator restricted to its first location. This script
does not change the shared generator or the published scene assets.
"""

from __future__ import annotations

import builtins
import runpy
from pathlib import Path

from PIL import Image, ImageChops, ImageDraw


ROOT = Path(__file__).resolve().parents[1]
SCENE = ROOT / "assets/resources/art/pixel/scene"
CANDIDATE = SCENE / "clear-v7"
QA = ROOT / "build/qa/background-clear-v7"
GENERATOR = ROOT / "scripts/generate-clear-pixel-backgrounds.py"
TILE_WIDTH = 1024
TILE_STRIDE = 960
NEAREST = Image.Resampling.NEAREST


def rect(d: ImageDraw.ImageDraw, xy: tuple[int, int, int, int], color: str) -> None:
    d.rectangle(xy, fill=color)


def line(d: ImageDraw.ImageDraw, points: list[tuple[int, int]], color: str, width: int = 1) -> None:
    d.line(points, fill=color, width=width)


def notice_board(d: ImageDraw.ImageDraw, x: int, y: int, w: int, h: int, *, graduate: bool) -> None:
    dark = "#705747" if graduate else "#665345"
    wood = "#c49c73" if graduate else "#b8956e"
    cork = "#c6ab85" if graduate else "#af906e"
    rect(d, (x - 2, y + 2, x + w + 2, y + h + 4), "#806b58")
    rect(d, (x, y, x + w, y + h), dark)
    rect(d, (x + 2, y + 2, x + w - 2, y + h - 2), wood)
    rect(d, (x + 5, y + 5, x + w - 5, y + h - 5), cork)
    rect(d, (x + 2, y + h - 2, x + w - 2, y + h - 1), "#e2bc88")
    paper_w = 13 if w < 68 else 16
    count = 2 if w < 68 else 4
    gap = (w - 14 - count * paper_w) // max(1, count - 1)
    for i in range(count):
        px = x + 7 + i * (paper_w + gap)
        py = y + 8 + (i % 2)
        paper = "#e8dcc0" if i % 2 == 0 else "#d7ccb0"
        rect(d, (px, py, px + paper_w - 1, py + h - 17), paper)
        rect(d, (px + paper_w // 2, py + 1, px + paper_w // 2 + 1, py + 2), "#a77958")
        for yy in (py + 6, py + 10, py + 14):
            rect(d, (px + 3, yy, px + paper_w - 4 - (yy % 3), yy),
                 "#9b9b84" if graduate else "#987f65")
    rect(d, (x + 6, y + h - 9, x + w - 6, y + h - 8), "#8f7760")


def wall_mural(d: ImageDraw.ImageDraw, x: int, y: int, w: int, h: int, *, graduate: bool) -> None:
    rim = "#80624d" if graduate else "#715a49"
    paper = "#d7c6a2" if graduate else "#d0b28b"
    rect(d, (x, y, x + w, y + h), rim)
    rect(d, (x + 3, y + 3, x + w - 3, y + h - 3), paper)
    rect(d, (x + 7, y + 6, x + w - 7, y + 7), "#eee0b8")
    mid = x + w // 2
    # A small laurel/school emblem rather than a second doorway.
    d.ellipse((mid - 11, y + 10, mid + 11, y + 30), fill="#87947b", outline="#5e705e", width=2)
    d.ellipse((mid - 5, y + 15, mid + 5, y + 25), fill="#d9bd86")
    rect(d, (mid - 1, y + 17, mid + 1, y + 24), "#816a53")
    for i in range(4):
        rect(d, (x + 8 + i * 7, y + h - 9, x + 12 + i * 7, y + h - 8), "#9a8b70")
        rect(d, (x + w - 36 + i * 7, y + h - 9, x + w - 32 + i * 7, y + h - 8), "#9a8b70")


def window_wing(d: ImageDraw.ImageDraw, x: int, y: int, w: int, *, graduate: bool) -> None:
    wall = "#c29c78" if graduate else "#b49375"
    trim = "#775e4f" if graduate else "#6c5b4d"
    sill = "#e1c49a" if graduate else "#cdb084"
    rect(d, (x, y + 10, x + w, 204), trim)
    rect(d, (x + 3, y + 13, x + w - 3, 201), wall)
    rect(d, (x - 4, y + 7, x + w + 4, y + 12), trim)
    rect(d, (x - 2, y + 8, x + w + 2, y + 9), sill)
    for px in (x + 11, x + w // 2 - 11, x + w - 33):
        rect(d, (px - 2, y + 22, px + 23, y + 56), trim)
        rect(d, (px + 1, y + 25, px + 20, y + 52), "#839793")
        rect(d, (px + 3, y + 27, px + 9, y + 38), "#b1bcb0")
        rect(d, (px + 11, y + 27, px + 18, y + 31), "#a9b9ab")
        rect(d, (px + 10, y + 26, px + 11, y + 52), trim)
        rect(d, (px + 1, y + 39, px + 20, y + 40), trim)
        rect(d, (px - 4, y + 55, px + 25, y + 58), sill)
    for yy in (y + 66, y + 82):
        line(d, [(x + 5, yy), (x + w - 5, yy)], "#9a775e")
    rect(d, (x + 2, 201, x + w - 2, 205), "#8e745e")


def little_flag(d: ImageDraw.ImageDraw, x: int, top: int, *, graduate: bool) -> None:
    line(d, [(x, top), (x, 205)], "#665949", 2)
    rect(d, (x - 2, 204, x + 3, 207), "#b49b74")
    d.polygon([(x + 1, top + 2), (x + 34, top + 5), (x + 25, top + 22),
               (x + 2, top + 17)], fill="#cbb08b" if graduate else "#ba916a")
    rect(d, (x + 7, top + 8, x + 23, top + 9), "#e8d2a3")
    rect(d, (x + 10, top + 13, x + 19, top + 14), "#7c8d74")


def ribbon(d: ImageDraw.ImageDraw, x: int, y: int, w: int, *, graduate: bool) -> None:
    line(d, [(x - 6, y - 3), (x + w + 6, y)], "#8a725b")
    colors = ("#c6a978", "#e1cba0", "#879b87", "#b9896c") if graduate else (
        "#c39d72", "#dfbf8e", "#8e9a77", "#ad7f66")
    for i, px in enumerate(range(x, x + w, 18)):
        d.polygon([(px, y), (px + 12, y + 1), (px + 6, y + 14)], fill=colors[i % len(colors)])


def decorate_dawn(im: Image.Image) -> None:
    d = ImageDraw.Draw(im)
    # The first x=232 school gateway stays. Later wall bays reveal everyday life.
    notice_board(d, 1012, 153, 57, 43, graduate=False)
    wall_mural(d, 1817, 151, 72, 44, graduate=False)
    window_wing(d, 2627, 129, 107, graduate=False)
    little_flag(d, 3452, 111, graduate=False)
    notice_board(d, 3381, 155, 55, 39, graduate=False)
    for x, y in [(1072, 172), (1799, 171), (2609, 186), (3514, 178)]:
        rect(d, (x, y, x + 3, y + 23), "#697961")
        rect(d, (x - 3, y, x + 7, y + 5), "#788663")


def decorate_graduate(im: Image.Image) -> None:
    d = ImageDraw.Draw(im)
    # x=148 is the one actual school gate in the graduation run.
    notice_board(d, 839, 150, 83, 47, graduate=True)
    notice_board(d, 1597, 151, 48, 43, graduate=True)
    ribbon(d, 1566, 127, 79, graduate=True)
    window_wing(d, 2387, 128, 99, graduate=True)
    wall_mural(d, 3070, 149, 93, 47, graduate=True)
    notice_board(d, 3854, 152, 59, 44, graduate=True)
    ribbon(d, 3770, 131, 89, graduate=True)
    notice_board(d, 4650, 151, 84, 45, graduate=True)
    little_flag(d, 4772, 119, graduate=True)


def render_single_gate(module: dict[str, object], theme: str, count: int) -> Image.Image:
    width = TILE_WIDTH + (count - 1) * TILE_STRIDE
    first, step = (232, 812) if theme == "dawn" else (148, 746)
    painter = module[f"{theme}_scene"]
    globals_dict = painter.__globals__
    previous_range = globals_dict.get("range")
    calls = 0

    def one_gateway_range(*args: int):
        nonlocal calls
        if args == (first, width, step):
            calls += 1
            return (first,)
        return builtins.range(*args)

    globals_dict["range"] = one_gateway_range
    try:
        image = painter(width)
    finally:
        if previous_range is None:
            globals_dict.pop("range", None)
        else:
            globals_dict["range"] = previous_range
    assert calls == 1, f"{theme}: expected exactly one gateway pass, saw {calls}"
    module["theme_accents"](module["Painter"](image, ImageDraw.Draw(image), width, theme))
    if theme == "dawn":
        decorate_dawn(image)
    else:
        decorate_graduate(image)
    return image


def render_original(module: dict[str, object], theme: str, count: int) -> Image.Image:
    width = TILE_WIDTH + (count - 1) * TILE_STRIDE
    image = module[f"{theme}_scene"](width)
    module["theme_accents"](module["Painter"](image, ImageDraw.Draw(image), width, theme))
    return image


def save_theme(theme: str, count: int, original: Image.Image, image: Image.Image) -> None:
    theme_dir = CANDIDATE / "scroll" / theme
    before = [original.crop((i * TILE_STRIDE, 0, i * TILE_STRIDE + TILE_WIDTH, 270))
              for i in range(count)]
    after: list[Image.Image] = []
    for i in range(count):
        crop = image.crop((i * TILE_STRIDE, 0, i * TILE_STRIDE + TILE_WIDTH, 270))
        crop.resize((2048, 540), NEAREST).save(theme_dir / f"{i:02d}.png", optimize=True)
        after.append(crop)

    QA.mkdir(parents=True, exist_ok=True)
    contact = Image.new("RGB", (2048, count * 270), "#ece4d4")
    d = ImageDraw.Draw(contact)
    for i, (old, new) in enumerate(zip(before, after)):
        contact.paste(old, (0, i * 270))
        contact.paste(new, (1024, i * 270))
        rect(d, (0, i * 270, 112, i * 270 + 15), "#544c43")
        rect(d, (1024, i * 270, 1144, i * 270 + 15), "#544c43")
        d.text((4, i * 270 + 3), f"{theme.upper()} {i:02} BEFORE", fill="#f7efdc")
        d.text((1028, i * 270 + 3), f"{theme.upper()} {i:02} AFTER", fill="#f7efdc")
    contact.save(QA / f"{theme}-unique-gate-contact.png", optimize=True)

    # Match the original fallback rule: first 480 logical pixels of tile 00.
    standby_size = Image.open(SCENE / f"{theme}.png").size
    after[0].crop((0, 0, 480, 270)).resize(standby_size, NEAREST).save(
        CANDIDATE / f"{theme}.png", optimize=True)

    saved = [Image.open(theme_dir / f"{i:02d}.png").convert("RGB") for i in range(count)]
    for i in range(count - 1):
        left = saved[i].crop((1920, 0, 2048, 540))
        right = saved[i + 1].crop((0, 0, 128, 540))
        assert ImageChops.difference(left, right).getbbox() is None, f"{theme} seam {i}->{i+1}"
    standby = Image.open(CANDIDATE / f"{theme}.png").convert("RGB")
    assert standby.size == standby_size
    assert ImageChops.difference(standby.resize((480, 270), NEAREST),
                                 after[0].crop((0, 0, 480, 270))).getbbox() is None
    print(f"{theme}: 1 gate, {count - 1}/{count - 1} seams exact, standby {standby_size}")


def main() -> None:
    module = runpy.run_path(str(GENERATOR))
    for theme, count in (("dawn", 4), ("graduate", 5)):
        original = render_original(module, theme, count)
        save_theme(theme, count, original, render_single_gate(module, theme, count))


if __name__ == "__main__":
    main()
