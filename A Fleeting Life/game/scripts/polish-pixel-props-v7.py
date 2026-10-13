"""Redraw foreground plates on the same two-screen-pixel grid as the scene art.

The PNG dimensions and Cocos .meta files are intentionally left untouched.  The
art is painted at half source resolution and expanded with nearest-neighbour
sampling, so a 480x270 logical view shows consistent 2x pixel clusters.
"""

from __future__ import annotations

from pathlib import Path

from PIL import Image, ImageDraw


ROOT = Path(__file__).resolve().parents[1] / "assets/resources/art"
OBSTACLES = ROOT / "props/obstacles/qwen-v2"
CHOICE = ROOT / "pixel/props/choice"
NEAREST = Image.Resampling.NEAREST


def plate(width: int, height: int):
    canvas = Image.new("RGBA", (width, height), (0, 0, 0, 0))
    return canvas, ImageDraw.Draw(canvas)


def rect(draw, x0, y0, x1, y1, color):
    draw.rectangle((x0, y0, x1, y1), fill=color)


def line(draw, points, color, width=1):
    draw.line(points, fill=color, width=width, joint="curve")


def polygon(draw, points, color):
    draw.polygon(points, fill=color)


def wood_lines(draw, x0, y0, x1, y1, light, dark):
    for x, y, length in ((x0 + 4, y0 + 3, 6), (x1 - 12, y0 + 5, 7),
                         (x0 + 9, y1 - 3, 8), (x1 - 17, y1 - 2, 5)):
        if x + length < x1 and y < y1:
            line(draw, [(x, y), (x + length, y)], light)
    for x, y, length in ((x0 + 13, y0 + 2, 5), (x1 - 9, y1 - 4, 3)):
        if x + length < x1 and y < y1:
            line(draw, [(x, y), (x + length, y)], dark)


def draw_step_wall():
    image, d = plate(18, 68)
    # A short damp parapet at the rear curb, rather than a freestanding door.
    rect(d, 2, 45, 15, 66, "#314453")
    rect(d, 3, 47, 14, 64, "#61717b")
    rect(d, 2, 44, 16, 48, "#394c5b")
    rect(d, 3, 44, 15, 45, "#97a8aa")
    rect(d, 4, 49, 13, 50, "#84959b")
    line(d, [(3, 54), (14, 54)], "#3d525e")
    line(d, [(6, 55), (6, 60)], "#425660")
    line(d, [(3, 61), (14, 61)], "#3d525e")
    line(d, [(10, 62), (10, 65)], "#425660")
    rect(d, 1, 65, 16, 67, "#354a55")
    rect(d, 4, 51, 6, 51, "#9baaaa")
    rect(d, 11, 57, 12, 57, "#86969a")
    return image


def draw_step():
    image, d = plate(64, 91)
    # The renderer uses the upper 79% here; all visible detail stays low.
    rect(d, 12, 49, 51, 55, "#3b505b")
    rect(d, 13, 49, 50, 51, "#a4b1ae")
    rect(d, 15, 52, 48, 54, "#617683")
    rect(d, 7, 56, 56, 63, "#3c4f5b")
    rect(d, 8, 56, 55, 58, "#99a9aa")
    rect(d, 9, 59, 54, 62, "#667983")
    rect(d, 2, 64, 61, 72, "#344751")
    rect(d, 3, 64, 60, 66, "#a4b1af")
    rect(d, 4, 67, 59, 71, "#6b7d84")
    for x0, x1, y in ((18, 29, 50), (36, 44, 57), (12, 24, 65), (43, 56, 65)):
        line(d, [(x0, y), (x1, y)], "#c1c5bb")
    for x, y in ((25, 60), (48, 68), (16, 69)):
        rect(d, x, y, x + 2, y, "#4a616c")
    return image


def draw_face_stone():
    image, d = plate(24, 19)
    rect(d, 1, 0, 22, 18, "#324651")
    rect(d, 2, 1, 21, 3, "#9eaaa9")
    rect(d, 3, 4, 20, 16, "#647782")
    rect(d, 4, 5, 11, 9, "#7c8f97")
    rect(d, 12, 5, 19, 9, "#72878f")
    line(d, [(3, 10), (20, 10)], "#405763")
    line(d, [(11, 4), (11, 9)], "#465e69")
    line(d, [(7, 11), (7, 16)], "#4e6570")
    line(d, [(15, 11), (15, 16)], "#4e6570")
    rect(d, 4, 17, 19, 18, "#3c515d")
    line(d, [(5, 2), (13, 2)], "#c2c5b6")
    return image


def draw_rack(tea=False):
    image, d = plate(58, 76)
    edge = "#455755"
    metal = "#71827a"
    shine = "#a4a899"
    rect(d, 5, 8, 9, 73, edge)
    rect(d, 49, 8, 53, 73, edge)
    rect(d, 6, 10, 7, 69, metal)
    rect(d, 50, 10, 51, 69, metal)
    rect(d, 7, 7, 51, 12, edge)
    rect(d, 8, 8, 50, 9, shine)
    rect(d, 9, 11, 49, 12, "#65786f")
    rect(d, 9, 42, 49, 51, edge)
    rect(d, 10, 43, 48, 46, metal)
    rect(d, 12, 47, 46, 49, "#64766e")
    rect(d, 1, 72, 15, 75, edge)
    rect(d, 43, 72, 57, 75, edge)
    rect(d, 2, 72, 14, 72, shine)
    rect(d, 44, 72, 56, 72, shine)
    for x in (7, 50):
        rect(d, x, 17, x + 1, 19, "#aeb0a0")
        rect(d, x, 61, x + 1, 62, "#334844")
    if tea:
        rect(d, 14, 37, 44, 42, "#463d3c")
        rect(d, 15, 37, 43, 39, "#a78966")
        rect(d, 22, 32, 28, 37, "#b7ac8d")
        rect(d, 23, 31, 27, 32, "#ded2ad")
        rect(d, 34, 33, 39, 37, "#b7ac8d")
        rect(d, 35, 32, 38, 32, "#e1d3b0")
    return image


def draw_face_metal():
    image, d = plate(28, 12)
    rect(d, 0, 0, 27, 11, "#405451")
    rect(d, 1, 1, 26, 8, "#667d75")
    rect(d, 2, 2, 25, 3, "#a6b3a3")
    rect(d, 3, 5, 24, 7, "#738980")
    rect(d, 2, 9, 25, 10, "#344945")
    for x in (4, 22):
        rect(d, x, 5, x + 1, 6, "#bec0a8")
    return image


def draw_face_tray():
    image, d = plate(28, 12)
    rect(d, 0, 1, 27, 11, "#443b3b")
    rect(d, 2, 1, 25, 7, "#876f5c")
    rect(d, 3, 2, 24, 3, "#c3aa80")
    rect(d, 3, 8, 24, 9, "#665348")
    rect(d, 5, 5, 6, 6, "#d2c6a6")
    rect(d, 20, 5, 21, 6, "#d2c6a6")
    return image


def draw_bench_high():
    image, d = plate(54, 37)
    rect(d, 6, 11, 10, 35, "#493f3d")
    rect(d, 43, 11, 47, 35, "#493f3d")
    rect(d, 7, 12, 8, 33, "#9a7960")
    rect(d, 44, 12, 45, 33, "#9a7960")
    rect(d, 3, 3, 50, 16, "#534443")
    rect(d, 4, 4, 49, 13, "#97765e")
    rect(d, 5, 5, 48, 6, "#c3a07a")
    rect(d, 4, 9, 49, 10, "#72584c")
    rect(d, 2, 21, 51, 27, "#51423f")
    rect(d, 3, 22, 50, 24, "#aa8867")
    rect(d, 4, 25, 49, 26, "#816551")
    rect(d, 7, 32, 11, 36, "#493f3d")
    rect(d, 42, 32, 46, 36, "#493f3d")
    for x in (7, 45):
        rect(d, x, 9, x + 1, 10, "#dfb889")
    wood_lines(d, 5, 5, 48, 13, "#bb9873", "#705748")
    return image


def draw_face_wood():
    image, d = plate(28, 12)
    rect(d, 0, 0, 27, 11, "#493f3d")
    rect(d, 1, 1, 26, 8, "#94735b")
    rect(d, 2, 2, 25, 3, "#c4a17b")
    rect(d, 2, 5, 25, 6, "#806250")
    rect(d, 3, 9, 24, 10, "#5c4942")
    rect(d, 5, 7, 10, 7, "#ba9771")
    rect(d, 17, 4, 23, 4, "#a88568")
    for x in (3, 23):
        rect(d, x, 5, x + 1, 6, "#d0ac7e")
    return image


def draw_books_low():
    image, d = plate(24, 19)
    rect(d, 1, 14, 22, 18, "#514d4b")
    rect(d, 2, 14, 21, 16, "#a88669")
    rect(d, 3, 15, 20, 15, "#ded1ad")
    rect(d, 3, 9, 22, 13, "#4d5960")
    rect(d, 4, 10, 21, 11, "#ddd9c3")
    rect(d, 5, 12, 20, 12, "#89949a")
    rect(d, 2, 5, 19, 8, "#80645d")
    rect(d, 3, 6, 18, 7, "#eee3c8")
    rect(d, 4, 3, 17, 4, "#c8b68f")
    rect(d, 5, 2, 16, 2, "#5e514c")
    rect(d, 17, 3, 18, 6, "#b98677")
    rect(d, 7, 16, 10, 16, "#73564a")
    return image


def draw_books_tall():
    image, d = plate(28, 52)
    colors = [
        (4, 47, 23, "#b9a17d", "#e4d8b8"),
        (3, 41, 25, "#647078", "#d9d8c7"),
        (5, 35, 24, "#987e66", "#e8ddbe"),
        (2, 29, 23, "#596f75", "#c5d0c8"),
        (4, 23, 26, "#927265", "#e6d5bc"),
        (3, 17, 23, "#6f796f", "#d9d9c2"),
        (5, 11, 25, "#b19b78", "#eee0be"),
        (7, 5, 20, "#866f67", "#ded2b8"),
    ]
    for left, top, right, cover, paper in colors:
        rect(d, left, top, right, top + 5, "#414a4d")
        rect(d, left + 1, top + 1, right - 1, top + 2, cover)
        rect(d, left + 1, top + 3, right - 2, top + 4, paper)
        rect(d, right - 2, top + 1, right - 1, top + 4, cover)
    rect(d, 8, 2, 17, 4, "#e5d9bd")
    return image


def draw_books_open():
    image, d = plate(24, 19)
    polygon(d, [(1, 12), (9, 7), (13, 9), (22, 6), (23, 14), (14, 18), (10, 16), (1, 17)], "#5e5d59")
    polygon(d, [(2, 11), (9, 7), (12, 10), (12, 16), (2, 15)], "#d9d1b6")
    polygon(d, [(13, 10), (21, 7), (22, 14), (13, 17)], "#ece3ca")
    line(d, [(12, 10), (13, 17)], "#a39982")
    for y in (11, 13):
        line(d, [(4, y), (9, y - 2)], "#9e9a8b")
        line(d, [(16, y), (20, y - 1)], "#b0a998")
    return image


def draw_satchel():
    image, d = plate(32, 23)
    # Worn schoolbag: simple canvas planes and buckles, no photographic noise.
    rect(d, 11, 1, 21, 7, "#453e3d")
    rect(d, 13, 3, 19, 7, "#a48867")
    polygon(d, [(3, 9), (8, 5), (25, 5), (29, 10), (29, 20), (26, 22), (5, 22), (2, 19)], "#493f3c")
    rect(d, 5, 8, 27, 19, "#947359")
    rect(d, 6, 9, 26, 11, "#bf9a70")
    rect(d, 6, 12, 26, 17, "#785c4b")
    rect(d, 7, 17, 25, 20, "#6a5348")
    rect(d, 10, 13, 22, 17, "#a78360")
    rect(d, 14, 13, 18, 16, "#ddbb80")
    rect(d, 4, 11, 6, 18, "#534b47")
    rect(d, 26, 11, 28, 18, "#534b47")
    line(d, [(7, 19), (7, 21), (25, 21)], "#c5a078")
    rect(d, 0, 16, 2, 18, "#796453")
    rect(d, 29, 15, 31, 18, "#796453")
    return image


def draw_bucket_broom():
    image, d = plate(28, 25)
    # A fallen broom crossing a small dustpan; its silhouette stays low.
    polygon(d, [(2, 17), (13, 16), (15, 23), (1, 23)], "#435b60")
    rect(d, 3, 18, 12, 20, "#8a9b99")
    rect(d, 4, 21, 13, 22, "#61777a")
    line(d, [(8, 4), (20, 19)], "#5b4e45", 3)
    line(d, [(8, 4), (19, 18)], "#b69b79")
    polygon(d, [(17, 17), (23, 16), (27, 22), (24, 24), (19, 23)], "#584840")
    rect(d, 20, 19, 25, 22, "#a58761")
    line(d, [(18, 18), (23, 24)], "#d3b38a")
    return image


def draw_crate_low():
    image, d = plate(24, 19)
    rect(d, 2, 2, 21, 18, "#3e4545")
    rect(d, 3, 3, 20, 17, "#806d58")
    rect(d, 5, 5, 18, 15, "#a08868")
    rect(d, 5, 7, 18, 8, "#6b5c4d")
    rect(d, 5, 12, 18, 13, "#6b5c4d")
    line(d, [(5, 5), (18, 15)], "#554b41", 2)
    line(d, [(18, 5), (5, 15)], "#554b41", 2)
    line(d, [(6, 5), (18, 14)], "#c2a47a")
    rect(d, 2, 2, 5, 18, "#5a5349")
    rect(d, 18, 2, 21, 18, "#5a5349")
    for x in (3, 19):
        for y in (4, 15):
            rect(d, x, y, x, y, "#d6b17c")
    return image


def draw_football():
    image, d = plate(24, 21)
    d.ellipse((1, 0, 22, 20), fill="#454d4c")
    d.ellipse((2, 1, 21, 18), fill="#dfddd0")
    polygon(d, [(9, 6), (14, 5), (17, 9), (14, 14), (9, 13), (7, 9)], "#52615f")
    polygon(d, [(3, 4), (7, 2), (10, 5), (7, 8), (4, 8)], "#63706e")
    polygon(d, [(17, 3), (20, 5), (21, 9), (17, 8), (14, 5)], "#596664")
    polygon(d, [(4, 13), (8, 12), (10, 16), (8, 19), (4, 17)], "#616d68")
    polygon(d, [(17, 12), (21, 11), (20, 16), (16, 18), (14, 15)], "#5a6866")
    for points in ([(7, 8), (9, 6)], [(14, 5), (17, 8)], [(17, 9), (17, 12)],
                   [(14, 14), (14, 15)], [(9, 13), (8, 12)]):
        line(d, points, "#89938b")
    rect(d, 6, 3, 8, 3, "#f4f0dc")
    rect(d, 11, 15, 13, 15, "#f2edd9")
    return image


def draw_step_dais():
    image, d = plate(64, 31)
    rect(d, 9, 3, 54, 27, "#685747")
    rect(d, 10, 4, 53, 8, "#b3956e")
    rect(d, 11, 5, 52, 6, "#d1b48a")
    rect(d, 12, 9, 51, 25, "#9b7b5b")
    rect(d, 14, 11, 30, 22, "#a98a68")
    rect(d, 33, 11, 49, 22, "#a98a68")
    rect(d, 30, 10, 32, 25, "#715d4b")
    rect(d, 4, 25, 59, 30, "#6b5949")
    rect(d, 5, 25, 58, 27, "#b89a75")
    rect(d, 6, 28, 57, 28, "#897257")
    return image


def draw_bucket_mop():
    image, d = plate(28, 53)
    rect(d, 17, 3, 19, 37, "#5a4d43")
    rect(d, 17, 4, 17, 37, "#bd9d73")
    rect(d, 12, 28, 21, 39, "#526b71")
    rect(d, 13, 29, 20, 31, "#96a8a7")
    rect(d, 4, 35, 24, 50, "#3f535d")
    rect(d, 5, 34, 23, 38, "#9fb0b0")
    rect(d, 7, 39, 21, 48, "#667f85")
    rect(d, 9, 42, 10, 46, "#a4b0aa")
    rect(d, 19, 41, 20, 45, "#84999c")
    rect(d, 6, 50, 22, 52, "#334951")
    rect(d, 2, 49, 5, 52, "#3e5157")
    rect(d, 23, 49, 26, 52, "#3e5157")
    return image


def draw_awning():
    image, d = plate(54, 110)
    # A fabric school awning on two bolted posts. Its low crossbar lines up
    # with the existing slide collision, while the canopy remains decoration.
    polygon(d, [(3, 17), (11, 9), (43, 9), (51, 17), (51, 31), (3, 31)], "#344751")
    polygon(d, [(5, 18), (12, 11), (42, 11), (49, 18), (49, 27), (5, 27)], "#75827f")
    polygon(d, [(6, 18), (13, 12), (20, 12), (16, 28), (6, 28)], "#8b938a")
    polygon(d, [(28, 12), (35, 12), (41, 28), (33, 28)], "#8b938a")
    line(d, [(5, 18), (49, 18)], "#9eaaa0")
    rect(d, 3, 28, 51, 32, "#3d5159")
    rect(d, 5, 29, 49, 30, "#788c8e")
    rect(d, 7, 33, 11, 106, "#3d5157")
    rect(d, 43, 33, 47, 106, "#3d5157")
    rect(d, 8, 35, 9, 101, "#91a09b")
    rect(d, 44, 35, 45, 101, "#91a09b")
    rect(d, 11, 73, 43, 87, "#445a60")
    rect(d, 12, 74, 42, 78, "#82948d")
    rect(d, 13, 80, 41, 84, "#667a76")
    rect(d, 4, 104, 16, 109, "#3c5057")
    rect(d, 38, 104, 50, 109, "#3c5057")
    rect(d, 5, 104, 15, 105, "#90a09b")
    rect(d, 39, 104, 49, 105, "#90a09b")
    for x in (8, 44):
        rect(d, x, 45, x + 1, 46, "#b4b9ab")
        rect(d, x, 90, x + 1, 91, "#b4b9ab")
    return image


def draw_face_canvas():
    image, d = plate(28, 12)
    rect(d, 0, 0, 27, 11, "#3d5359")
    rect(d, 1, 1, 26, 9, "#71847f")
    rect(d, 2, 2, 25, 3, "#a7afa3")
    rect(d, 3, 5, 10, 8, "#849690")
    rect(d, 12, 5, 19, 8, "#647b79")
    rect(d, 21, 5, 24, 8, "#849690")
    rect(d, 1, 10, 26, 11, "#40565b")
    return image


def draw_chair_desk():
    image, d = plate(80, 55)
    # Desk sits behind the stool. The stool seat is y=39..43, matching
    # CHAIR_TOP=200 when rendered from world y=161.
    rect(d, 6, 6, 74, 12, "#5b4e44")
    rect(d, 7, 6, 73, 8, "#b79a73")
    rect(d, 8, 9, 72, 10, "#856e56")
    rect(d, 10, 12, 70, 33, "#6b594a")
    rect(d, 12, 14, 68, 28, "#95795c")
    rect(d, 14, 17, 39, 27, "#635849")
    rect(d, 16, 18, 37, 25, "#8b7c63")
    rect(d, 44, 17, 65, 26, "#635849")
    rect(d, 46, 18, 63, 24, "#8b7c63")
    rect(d, 11, 33, 17, 54, "#584b43")
    rect(d, 63, 33, 69, 54, "#584b43")
    rect(d, 12, 35, 14, 52, "#a08161")
    rect(d, 65, 35, 67, 52, "#a08161")
    rect(d, 25, 39, 55, 44, "#4f4943")
    rect(d, 26, 39, 54, 41, "#aa8968")
    rect(d, 27, 42, 53, 43, "#7a6452")
    rect(d, 30, 44, 35, 54, "#4c4742")
    rect(d, 46, 44, 51, 54, "#4c4742")
    rect(d, 31, 45, 32, 52, "#9b7d60")
    rect(d, 48, 45, 49, 52, "#9b7d60")
    line(d, [(17, 8), (37, 8)], "#dcc7a0")
    line(d, [(48, 8), (63, 8)], "#dcc7a0")
    return image


def draw_exam_desk():
    image, d = plate(94, 66)
    rect(d, 5, 10, 88, 17, "#5c4b40")
    rect(d, 6, 10, 87, 12, "#b59570")
    rect(d, 8, 13, 85, 15, "#86694f")
    rect(d, 9, 17, 85, 32, "#6d5b4b")
    rect(d, 11, 18, 83, 25, "#9e8060")
    rect(d, 16, 22, 42, 29, "#74604f")
    rect(d, 46, 22, 77, 29, "#74604f")
    rect(d, 12, 32, 18, 65, "#524640")
    rect(d, 76, 32, 82, 65, "#524640")
    rect(d, 13, 33, 15, 61, "#9a795b")
    rect(d, 78, 33, 80, 61, "#9a795b")
    rect(d, 19, 31, 75, 34, "#715c4b")
    polygon(d, [(30, 5), (50, 3), (57, 9), (32, 11)], "#645c52")
    polygon(d, [(31, 4), (49, 2), (55, 8), (33, 9)], "#e6dfc7")
    line(d, [(36, 6), (49, 5)], "#aaa28c")
    line(d, [(37, 8), (48, 7)], "#aaa28c")
    rect(d, 62, 8, 74, 9, "#615548")
    rect(d, 61, 7, 72, 7, "#be9b69")
    return image


def draw_piano():
    image, d = plate(80, 68)
    # Upright classroom piano with discrete keys and panelled wood.
    rect(d, 4, 3, 75, 62, "#3e393c")
    rect(d, 6, 5, 73, 33, "#71544b")
    rect(d, 7, 6, 72, 8, "#ae8065")
    rect(d, 10, 11, 37, 30, "#5a4642")
    rect(d, 42, 11, 69, 30, "#5a4642")
    rect(d, 12, 13, 35, 27, "#7b5c4e")
    rect(d, 44, 13, 67, 27, "#7b5c4e")
    line(d, [(15, 14), (32, 14)], "#966f58")
    line(d, [(47, 14), (64, 14)], "#966f58")
    rect(d, 8, 32, 71, 36, "#b48a66")
    rect(d, 10, 37, 69, 46, "#3b3739")
    rect(d, 11, 38, 68, 43, "#e7dec5")
    for x in range(12, 69, 5):
        rect(d, x, 38, x, 43, "#a6a093")
    for x in (15, 23, 30, 39, 47, 55, 62):
        rect(d, x, 38, x + 2, 40, "#343536")
    rect(d, 8, 47, 71, 58, "#624b45")
    rect(d, 12, 49, 67, 55, "#7a594d")
    rect(d, 10, 58, 18, 67, "#3e393c")
    rect(d, 62, 58, 70, 67, "#3e393c")
    rect(d, 11, 59, 13, 65, "#936c54")
    rect(d, 66, 59, 68, 65, "#936c54")
    rect(d, 16, 35, 65, 35, "#cfad7d")
    return image


def draw_choice_bench():
    image, d = plate(52, 53)
    rect(d, 6, 27, 10, 52, "#493f3e")
    rect(d, 41, 27, 45, 52, "#493f3e")
    rect(d, 7, 29, 8, 49, "#9d785e")
    rect(d, 42, 29, 43, 49, "#9d785e")
    rect(d, 4, 19, 47, 29, "#514440")
    rect(d, 5, 20, 46, 23, "#ab8563")
    rect(d, 5, 25, 46, 27, "#88694f")
    rect(d, 3, 33, 48, 39, "#514440")
    rect(d, 4, 34, 47, 36, "#b18d69")
    rect(d, 5, 37, 46, 38, "#80634d")
    rect(d, 6, 51, 10, 52, "#483e3b")
    rect(d, 41, 51, 45, 52, "#483e3b")
    wood_lines(d, 5, 20, 46, 27, "#c29d75", "#6f5547")
    return image


def draw_choice_umbrella():
    image, d = plate(20, 56)
    # Closed ochre umbrella held in the school rack, read from a distance.
    rect(d, 10, 2, 11, 52, "#564a40")
    rect(d, 10, 3, 10, 47, "#bb9a69")
    line(d, [(10, 3), (13, 1), (15, 3)], "#6b5948", 2)
    polygon(d, [(9, 8), (15, 10), (18, 17), (16, 31), (12, 45), (8, 31), (7, 17)], "#7b6347")
    polygon(d, [(10, 9), (14, 11), (16, 18), (14, 31), (12, 42), (10, 31)], "#c39c57")
    line(d, [(13, 12), (14, 29), (12, 41)], "#e1bd78")
    rect(d, 8, 37, 16, 39, "#51483f")
    line(d, [(11, 48), (11, 53), (14, 54), (16, 51)], "#564a40", 2)
    full = Image.new("RGBA", (30, 56), (0, 0, 0, 0))
    full.paste(image, (5, 0), image)
    return full


ART = [
    (OBSTACLES, "step_wall", (36, 136), draw_step_wall),
    (OBSTACLES, "step", (128, 182), draw_step),
    (OBSTACLES, "face_stone", (48, 38), draw_face_stone),
    (OBSTACLES, "rack", (116, 152), draw_rack),
    (OBSTACLES, "rack_tray", (116, 152), lambda: draw_rack(tea=True)),
    (OBSTACLES, "face_metal", (56, 24), draw_face_metal),
    (OBSTACLES, "face_tray", (56, 24), draw_face_tray),
    (OBSTACLES, "bench_high", (108, 74), draw_bench_high),
    (OBSTACLES, "face_wood", (56, 24), draw_face_wood),
    (OBSTACLES, "books_low", (48, 38), draw_books_low),
    (OBSTACLES, "books_tall", (56, 104), draw_books_tall),
    (OBSTACLES, "books_open", (48, 38), draw_books_open),
    (OBSTACLES, "satchel", (64, 46), draw_satchel),
    (OBSTACLES, "bucket_broom", (56, 50), draw_bucket_broom),
    (OBSTACLES, "crate_low", (48, 38), draw_crate_low),
    (OBSTACLES, "football", (48, 42), draw_football),
    (OBSTACLES, "step_dais", (128, 62), draw_step_dais),
    (OBSTACLES, "bucket_mop", (56, 106), draw_bucket_mop),
    (OBSTACLES, "awning", (108, 220), draw_awning),
    (OBSTACLES, "face_canvas", (56, 24), draw_face_canvas),
    (CHOICE, "chairDesk", (160, 110), draw_chair_desk),
    (CHOICE, "examDesk", (188, 132), draw_exam_desk),
    (CHOICE, "piano", (160, 136), draw_piano),
    (CHOICE, "bench", (104, 106), draw_choice_bench),
    (CHOICE, "umbrella", (60, 112), draw_choice_umbrella),
]


def main():
    for directory, name, dimensions, painter in ART:
        path = directory / f"{name}.png"
        source = Image.open(path)
        if source.size != dimensions or source.mode != "RGBA":
            raise ValueError(f"Unexpected source layout: {path} {source.size} {source.mode}")
        low_res = painter()
        if low_res.size != (dimensions[0] // 2, dimensions[1] // 2):
            raise ValueError(f"Painter mismatch: {path} {low_res.size}")
        low_res.resize(dimensions, NEAREST).save(path, optimize=True)
        print(path.relative_to(ROOT), dimensions)


if __name__ == "__main__":
    main()
