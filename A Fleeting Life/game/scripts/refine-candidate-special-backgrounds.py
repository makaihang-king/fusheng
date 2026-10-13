"""Finish the two hand-authored clear-v7 interaction plates.

This deliberately edits only clear-v7 candidates.  The public scene assets are
promoted after the complete visual review.
"""

from __future__ import annotations

from pathlib import Path
from random import Random

from PIL import Image, ImageChops, ImageDraw


ROOT = Path(__file__).resolve().parents[1]
CANDIDATE = ROOT / "assets/resources/art/pixel/scene/clear-v7"
QA = ROOT / "build/qa/background-clear-v7"
NEAREST = Image.Resampling.NEAREST


def rect(draw: ImageDraw.ImageDraw, box: tuple[int, int, int, int], color: str) -> None:
    draw.rectangle(box, fill=color)


def transom(draw: ImageDraw.ImageDraw, cx: int, tint: str, lit: bool = False) -> None:
    """A small old-school fanlight aligned with a foreground memory door."""
    left, right = cx - 20, cx + 19
    rect(draw, (left - 1, 83, right + 2, 86), "#ab9c79")
    rect(draw, (left, 64, right, 83), "#796e59")
    rect(draw, (left + 2, 66, right - 2, 80), "#d4c6a4")
    rect(draw, (left + 4, 68, right - 4, 78), tint)
    rect(draw, (left + 5, 69, cx - 2, 72), "#d9ddc6" if lit else "#becdc4")
    rect(draw, (cx + 4, 73, right - 5, 77), "#aec2ba")
    rect(draw, (cx - 1, 67, cx + 1, 80), "#8a816a")
    rect(draw, (left + 3, 73, right - 3, 74), "#8a816a")
    rect(draw, (left + 5, 79, right - 5, 80), "#f0dfb5")
    # A transom latch reads clearly at 480 pixels without competing with lamps.
    rect(draw, (cx - 1, 80, cx + 1, 82), "#6f6858")
    rect(draw, (cx, 81, cx, 82), "#e6d195")


def notice(draw: ImageDraw.ImageDraw, x: int, y: int, tone: str) -> None:
    rect(draw, (x, y, x + 14, y + 21), "#877962")
    rect(draw, (x + 1, y + 1, x + 13, y + 20), "#baab84")
    rect(draw, (x + 3, y + 3, x + 11, y + 15), "#e6dec2")
    rect(draw, (x + 4, y + 5, x + 10, y + 6), tone)
    rect(draw, (x + 4, y + 9, x + 9, y + 9), "#a6a189")
    rect(draw, (x + 4, y + 12, x + 11, y + 12), "#a6a189")
    rect(draw, (x + 2, y + 17, x + 5, y + 18), "#c8b47b")
    rect(draw, (x + 10, y + 17, x + 12, y + 18), "#8c9980")


def sconce(draw: ImageDraw.ImageDraw, cx: int, y: int) -> None:
    rect(draw, (cx - 3, y - 1, cx + 3, y + 11), "#6d6b55")
    rect(draw, (cx - 2, y + 1, cx + 2, y + 7), "#c7a66d")
    rect(draw, (cx - 1, y + 2, cx + 1, y + 5), "#f3dca0")
    rect(draw, (cx - 5, y + 8, cx + 5, y + 9), "#7a7157")
    rect(draw, (cx - 1, y + 10, cx + 1, y + 13), "#978b69")


def plant(draw: ImageDraw.ImageDraw, x: int, floor: int, *, tall: bool) -> None:
    leaf, dark, light = "#617d69", "#4d695a", "#9baa7d"
    top = floor - (37 if tall else 28)
    draw.line([(x, floor - 11), (x, top + 7)], fill=dark, width=2)
    draw.line([(x - 1, floor - 17), (x - 9, top + 11)], fill=dark, width=2)
    draw.line([(x + 1, floor - 18), (x + 8, top + 8)], fill=dark, width=2)
    for ox, oy, w, h in [(-11, 10, 7, 5), (-7, 4, 7, 5), (-1, 0, 6, 5),
                          (5, 6, 7, 5), (8, 12, 6, 4), (-4, 13, 7, 4)]:
        rect(draw, (x + ox, top + oy, x + ox + w, top + oy + h), leaf)
        rect(draw, (x + ox + 1, top + oy, x + ox + 2, top + oy + 1), light)
    rect(draw, (x - 7, floor - 12, x + 7, floor - 10), "#9c8065")
    draw.polygon([(x - 6, floor - 10), (x + 6, floor - 10),
                  (x + 4, floor - 1), (x - 4, floor - 1)], fill="#a77558")
    rect(draw, (x - 4, floor - 9, x - 2, floor - 3), "#c99870")
    rect(draw, (x - 6, floor, x + 6, floor + 1), "#777c67")


def finish_corridor() -> Image.Image:
    source = CANDIDATE / "corridor-detail-v3.png"
    canvas = Image.open(source).convert("RGB").resize((480, 270), NEAREST)
    draw = ImageDraw.Draw(canvas)
    # Architectural trim and age marks, kept quiet beneath the prominent doors.
    rect(draw, (0, 37, 479, 39), "#b2a47e")
    rect(draw, (0, 39, 479, 40), "#ede0b8")
    rect(draw, (0, 47, 479, 48), "#bda980")
    rect(draw, (0, 49, 479, 49), "#f4ebd5")
    for x in (0, 77, 151, 225, 299, 373, 451):
        rect(draw, (x - 5, 48, x + 8, 51), "#b3a27e")
        rect(draw, (x - 3, 50, x + 6, 52), "#d9c99f")
        rect(draw, (x + 1, 54, x + 2, 157), "#f1e8d0")
        rect(draw, (x + 4, 55, x + 4, 157), "#9e9b82")

    for cx, tint, lit in [
        (40, "#a7bdb4", True), (110, "#9caeaa", False),
        (184, "#a9b9ad", False), (258, "#a7b9af", True),
        (332, "#aaa89c", False), (414, "#96a59a", False),
    ]:
        transom(draw, cx, tint, lit)

    # Restrained wall fixtures in the narrow gaps between the six foreground doors.
    sconce(draw, 73, 104)
    sconce(draw, 371, 106)
    notice(draw, 138, 120, "#8c9a82")
    notice(draw, 286, 124, "#bd8f72")
    rect(draw, (213, 129, 221, 135), "#b4a886")
    rect(draw, (214, 130, 220, 134), "#eee5c9")
    rect(draw, (216, 131, 218, 132), "#8a9a83")

    # The wall clock sits outside the interactive door and top-bar footprints.
    draw.ellipse((451, 67, 473, 89), fill="#766c59")
    draw.ellipse((454, 70, 470, 86), fill="#e9dfbe")
    draw.ellipse((456, 72, 468, 84), fill="#f6edcf")
    draw.line([(462, 78), (462, 73)], fill="#5e6658", width=1)
    draw.line([(462, 78), (466, 80)], fill="#5e6658", width=1)
    rect(draw, (461, 77, 463, 79), "#957b59")
    for x, y in [(461, 71), (469, 77), (461, 84), (454, 77)]:
        rect(draw, (x, y, x + 1, y + 1), "#ad9471")

    plant(draw, 71, 207, tall=False)
    plant(draw, 462, 207, tall=True)
    # A few clustered chips and floor reflections signal a lived-in school.
    rng = Random(52041)
    for x0, y0, count in [(11, 123, 11), (79, 146, 10), (231, 139, 9), (380, 137, 10), (442, 153, 7)]:
        for _ in range(count):
            x = x0 + rng.randrange(13)
            y = y0 + rng.randrange(13)
            rect(draw, (x, y, x + rng.randrange(1, 4), y + rng.randrange(1, 3)),
                 rng.choice(["#c8c2a9", "#eee8d2", "#b9baa4"]))
    for x in (35, 108, 182, 257, 329, 412):
        draw.polygon([(x - 7, 216), (x + 8, 216), (x + 18, 226), (x - 14, 226)],
                     fill="#cfc7ae")
        rect(draw, (x - 8, 216, x + 9, 217), "#e2d5b7")
    for x, y, w in [(27, 235, 9), (158, 251, 8), (211, 226, 6), (344, 244, 11), (441, 258, 8)]:
        rect(draw, (x, y, x + w, y), "#aaa18b")
        rect(draw, (x + 1, y + 1, x + w - 1, y + 1), "#e2d6b7")
    return canvas


def finish_side_door() -> None:
    base = CANDIDATE / "scroll/playground"
    one = Image.open(base / "01.png").convert("RGB").resize((1024, 270), NEAREST)
    draw = ImageDraw.Draw(one)
    # The interaction target is world x = 960 + 900, i.e. tile 01 source x =
    # 1800 / logical x = 900.  The entrance spans that point and interrupts the
    # school fence so its jump-over-threshold interaction remains readable.
    draw.polygon([(872, 122), (884, 116), (965, 116), (979, 122),
                  (979, 127), (872, 127)], fill="#816d5c")
    rect(draw, (874, 121, 978, 123), "#c3a880")
    rect(draw, (878, 124, 974, 134), "#b7a680")
    rect(draw, (881, 127, 971, 132), "#d8c69d")
    # Wide stone pilasters frame the two old wooden leaves.
    rect(draw, (876, 133, 978, 209), "#6b7568")
    rect(draw, (880, 136, 974, 207), "#d8ca9f")
    rect(draw, (885, 139, 969, 207), "#586f63")
    rect(draw, (888, 143, 966, 205), "#415b53")
    rect(draw, (876, 135, 884, 206), "#b4a481")
    rect(draw, (877, 137, 878, 205), "#e1d0a6")
    rect(draw, (970, 135, 978, 206), "#9a8d74")
    rect(draw, (973, 137, 974, 205), "#d4c296")
    for y in (143, 163, 185):
        rect(draw, (879, y, 883, y + 1), "#8a7c67")
        rect(draw, (971, y, 976, y + 1), "#756f60")

    # A cloudy transom, recessed beneath the lintel.
    rect(draw, (888, 141, 966, 153), "#776e5e")
    rect(draw, (891, 143, 963, 150), "#9fb3ab")
    rect(draw, (893, 144, 931, 145), "#d0d8bd")
    rect(draw, (931, 143, 933, 151), "#736e5b")
    rect(draw, (890, 151, 964, 153), "#c4ab7f")
    # Separate, slightly mismatched planks make the doors feel old and real.
    rect(draw, (889, 156, 926, 204), "#658073")
    rect(draw, (929, 156, 965, 204), "#61796c")
    rect(draw, (892, 158, 894, 202), "#90a08a")
    rect(draw, (897, 158, 898, 202), "#557064")
    rect(draw, (904, 158, 905, 202), "#52695f")
    rect(draw, (914, 158, 915, 202), "#809682")
    rect(draw, (921, 158, 922, 202), "#506a5f")
    rect(draw, (932, 158, 934, 202), "#819785")
    rect(draw, (942, 158, 943, 202), "#52695f")
    rect(draw, (952, 158, 953, 202), "#879983")
    rect(draw, (960, 158, 961, 202), "#4c675d")
    rect(draw, (926, 155, 929, 205), "#3e554d")
    for y in (172, 190):
        rect(draw, (891, y, 925, y + 2), "#536c61")
        rect(draw, (930, y, 964, y + 2), "#4f685e")
        rect(draw, (895, y, 917, y), "#9eaa8c")
        rect(draw, (934, y, 955, y), "#90a18b")
    for x0 in (896, 933):
        rect(draw, (x0, 177, x0 + 23, 198), "#536e62")
        rect(draw, (x0 + 2, 179, x0 + 21, 196), "#718778")
        rect(draw, (x0 + 4, 181, x0 + 19, 182), "#9ba98d")
    rect(draw, (922, 180, 924, 185), "#a68f66")
    rect(draw, (932, 180, 934, 185), "#a68f66")
    rect(draw, (923, 181, 923, 183), "#e4c88d")
    rect(draw, (933, 181, 933, 183), "#e4c88d")

    # Brass school bell and a weathered side-entrance plaque.
    rect(draw, (900, 126, 951, 136), "#706653")
    rect(draw, (903, 128, 948, 134), "#dfca9a")
    rect(draw, (907, 130, 918, 131), "#a18a65")
    rect(draw, (922, 130, 945, 131), "#a18a65")
    rect(draw, (906, 139, 912, 144), "#7f7058")
    rect(draw, (908, 140, 911, 142), "#e9d399")
    rect(draw, (942, 139, 948, 144), "#7f7058")
    rect(draw, (944, 140, 947, 142), "#e9d399")
    # Foreground threshold conceals the old continuous fence across the gate.
    rect(draw, (873, 205, 980, 210), "#aa9d78")
    rect(draw, (876, 205, 976, 206), "#e2d4ad")
    rect(draw, (881, 208, 974, 209), "#777e6a")
    rect(draw, (885, 210, 971, 211), "#c2a784")
    rect(draw, (872, 198, 875, 208), "#536d5e")
    rect(draw, (980, 198, 982, 208), "#536d5e")

    one = one.resize((2048, 540), NEAREST)
    one.save(base / "01.png", optimize=True)
    # The final 64 logical pixels are shared with tile 02; copy them exactly.
    two = Image.open(base / "02.png").convert("RGB")
    two.paste(one.crop((1920, 0, 2048, 540)), (0, 0))
    two.save(base / "02.png", optimize=True)


def make_qa(corridor: Image.Image) -> None:
    QA.mkdir(parents=True, exist_ok=True)
    side = Image.open(CANDIDATE / "scroll/playground/01.png").convert("RGB")
    next_tile = Image.open(CANDIDATE / "scroll/playground/02.png").convert("RGB")
    focus = Image.new("RGB", (960, 540), "#eee8d5")
    focus.paste(side.crop((1440, 0, 2048, 540)), (0, 0))
    focus.paste(next_tile.crop((128, 0, 480, 540)), (608, 0))
    focus.save(QA / "special-side-door-v7.png", optimize=True)
    corridor.resize((960, 540), NEAREST).save(QA / "special-corridor-v7.png", optimize=True)


def verify() -> None:
    base = CANDIDATE / "scroll/playground"
    tiles = [Image.open(base / f"{i:02}.png").convert("RGB") for i in range(4)]
    for i in range(3):
        mismatch = ImageChops.difference(tiles[i].crop((1920, 0, 2048, 540)),
                                         tiles[i + 1].crop((0, 0, 128, 540)))
        assert not mismatch.getbbox(), f"playground seam {i}→{i+1} differs"
    for name, size in [("corridor-detail-v3.png", (1440, 810)),
                       ("corridor.png", (1536, 864))]:
        assert Image.open(CANDIDATE / name).size == size
    print("special candidates: side door x=1800, 3/3 seams exact, corridor sizes intact")


def main() -> None:
    finish_side_door()
    corridor = finish_corridor()
    for name, size in [("corridor-detail-v3.png", (1440, 810)),
                       ("corridor.png", (1536, 864))]:
        corridor.resize(size, NEAREST).save(CANDIDATE / name, optimize=True)
    make_qa(corridor)
    verify()


if __name__ == "__main__":
    main()
