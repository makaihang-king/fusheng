#!/usr/bin/env python3
"""Restore the seven choice plates' story locations in the clear pixel set.

All drawing is done at the game's 1280 x 270 choice-world resolution and then
enlarged exactly 2x. The original scene assets are never read or overwritten.
The base plates come from generate-clear-pixel-backgrounds.py (choice 01 uses
its dawn primitives without the two decorative school gates), so re-running
this script does not accumulate paint on an already repaired PNG.
"""

from __future__ import annotations

import importlib.util
import random
import sys
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont


ROOT = Path(__file__).resolve().parents[1]
BASE_GENERATOR = ROOT / "scripts/generate-clear-pixel-backgrounds.py"
OUT = ROOT / "assets/resources/art/pixel/scene/clear-v7/choice"
QA = ROOT / "build/qa/background-clear-v7"
W, H, FLOOR = 1280, 270, 216
IDS = ("01", "02", "03", "04", "05", "06", "alley")

spec = importlib.util.spec_from_file_location("clear_background_generator", BASE_GENERATOR)
assert spec and spec.loader
generator = importlib.util.module_from_spec(spec)
sys.modules[spec.name] = generator
spec.loader.exec_module(generator)


class Art:
    def __init__(self, image: Image.Image, seed: int) -> None:
        self.im = image.convert("RGB")
        self.d = ImageDraw.Draw(self.im)
        self.rng = random.Random(seed)

    def r(self, x1: int, y1: int, x2: int, y2: int, color: str, outline: str | None = None, width: int = 1) -> None:
        self.d.rectangle((x1, y1, x2, y2), fill=color, outline=outline, width=width)

    def l(self, points: list[tuple[int, int]], color: str, width: int = 1) -> None:
        self.d.line(points, fill=color, width=width)

    def p(self, points: list[tuple[int, int]], color: str, outline: str | None = None) -> None:
        self.d.polygon(points, fill=color, outline=outline)

    def brick(self, x1: int, x2: int, y1: int, y2: int, *, row: int, mortar: str, fleck: str) -> None:
        for y in range(y1 + row, y2, row):
            self.l([(x1, y), (x2, y)], mortar)
            for x in range(x1 + ((y // row) % 2) * 12, x2, 26):
                self.l([(x, y - row + 1), (x, y - 1)], mortar)
                if self.rng.random() < .28:
                    xx = min(x2 - 3, x + self.rng.randint(3, 14))
                    yy = y - self.rng.randint(2, max(3, row - 2))
                    self.r(xx, yy, xx + self.rng.randint(1, 3), yy, fleck)

    def plaster(self, x1: int, x2: int, y1: int, y2: int, base: str, chip: str, seed_gap: int = 26) -> None:
        self.r(x1, y1, x2, y2, base)
        for y in range(y1 + 7, y2, 9):
            for x in range(x1 + 4 + (y % 3), x2, seed_gap):
                if self.rng.random() < .34:
                    w = self.rng.randint(2, 7)
                    self.l([(x, y), (min(x2, x + w), y)], chip)

    def sign(self, x: int, y: int, w: int, h: int, text: str, *, paper: str, ink: str, edge: str) -> None:
        self.r(x - 2, y - 2, x + w + 2, y + h + 2, edge)
        self.r(x, y, x + w, y + h, paper)
        font_path = Path("C:/Windows/Fonts/simhei.ttf")
        if font_path.is_file():
            font = ImageFont.truetype(str(font_path), min(10, h - 1))
            mask = Image.new("1", (w + 1, h + 1))
            draw = ImageDraw.Draw(mask)
            bbox = draw.textbbox((0, 0), text, font=font)
            tx = max(0, (w - (bbox[2] - bbox[0])) // 2 - bbox[0])
            ty = max(0, (h - (bbox[3] - bbox[1])) // 2 - bbox[1])
            draw.text((tx, ty), text, font=font, fill=1)
            self.im.paste(ink, (x, y), mask)
        else:
            for i in range(min(4, len(text))):
                self.r(x + 5 + i * 11, y + 4, x + 12 + i * 11, y + h - 4, ink)

    def floor(self, x1: int, color: str, edge: str, line: str, *, tile: int = 38) -> None:
        self.r(x1, FLOOR, W - 1, H - 1, color)
        self.r(x1, FLOOR, W - 1, FLOOR + 2, edge)
        for y in (228, 246, 262):
            self.l([(x1, y), (W - 1, y)], line)
            off = 0 if y == 228 else tile // 2
            for x in range(x1 + off, W, tile):
                self.l([(x, y + 1), (x, min(H - 1, y + 13))], line)
        for _ in range(100):
            x = self.rng.randrange(x1 + 3, W - 3)
            y = self.rng.randrange(FLOOR + 5, H - 3)
            if self.rng.random() < .28:
                self.r(x, y, x + 1, y, edge)

    def classroom_window(self, x: int, y: int, w: int, h: int, *, light: str = "#e9d7ae") -> None:
        self.r(x - 6, y - 5, x + w + 6, y + h + 6, "#8e7763")
        self.r(x - 3, y - 3, x + w + 3, y + h + 3, "#e0c99e")
        self.r(x, y, x + w, y + h, light, "#76695e", 2)
        self.r(x + 3, y + 3, x + w - 3, y + h // 2, "#d2c7aa")
        self.r(x + 3, y + h // 2 + 2, x + w - 3, y + h - 3, "#b4bdb4")
        self.r(x + w // 2 - 2, y, x + w // 2 + 2, y + h, "#806f5f")
        self.r(x, y + h // 2 - 2, x + w, y + h // 2 + 2, "#806f5f")
        self.p([(x + 8, y + 4), (x + 17, y + 4), (x + 6, y + h // 2 - 4), (x + 4, y + h // 2 - 4)], "#f5e8cd")
        self.r(x - 7, y + h + 6, x + w + 7, y + h + 10, "#a58b71")

    def portal(self, x1: int, x2: int, *, wall: str, frame: str, inner: str, glow: str) -> None:
        # This frame bridges the outside plate and the new indoor location.
        self.r(x1, 0, x2, 59, wall)
        self.r(x1, 18, x2, 22, frame)
        self.r(x1 + 6, 30, x2 - 6, 34, frame)
        self.r(x1, 59, x2, FLOOR, wall, frame, 3)
        self.r(x1 + 7, 72, x2 - 7, FLOOR, frame)
        self.r(x1 + 12, 78, x2 - 12, FLOOR, inner)
        self.r(x1 + 16, 82, x2 - 16, 175, glow)
        self.r(x1 + 16, 176, x2 - 16, FLOOR, inner)
        self.r(x1 + 19, 85, x1 + 23, FLOOR - 2, frame)
        self.r(x2 - 24, 85, x2 - 20, FLOOR - 2, frame)
        self.r((x1 + x2) // 2 - 2, 82, (x1 + x2) // 2 + 2, FLOOR, frame)
        self.r(x1 - 7, FLOOR - 5, x2 + 7, FLOOR + 2, "#7b7167")
        self.r(x1 - 5, FLOOR - 3, x2 + 5, FLOOR - 1, "#c1ae90")


def dawn_without_extra_gates() -> Image.Image:
    """Mirror the dawn scroll's wall, omitting its x232/x1044 gate loop."""
    p = generator.Painter.make(W, "dawn", "#e8d2a8")
    generator.sky(p, "#e6c896", "#fae8ca", 151)
    generator.distant_roofs(p, 136, ("#bda58d", "#9b947e", "#807666"))
    p.rect((0, 142, W, 205), "#a37d62")
    p.rect((0, 137, W, 144), "#51493f")
    p.line([(0, 139), (W, 139)], "#c1a77e", 2)
    p.line([(0, 145), (W, 145)], "#6d5b4d", 2)
    generator.brick_courses(p, 148, 204, "#a37d62", "#795e4e", 1, 9)
    generator.brick_damage(p, 0, 146, W, 203, "#a37d62", 1)
    for x in range(18, W, 132):
        p.rect((x, 142, x + 8, 205), "#876a59", "#5e554b")
        p.line([(x + 2, 146), (x + 2, 202)], "#b59674")
        generator.window(p, x + 29, 156, 35, 30,
                         wall="#a37d62", frame="#6e5b4b", pane="#687978")
        if (x // 132) % 3 == 1:
            p.rect((x + 80, 157, x + 107, 187), "#92745b", "#5d5548", 2)
            for yy in range(162, 184, 7):
                p.line([(x + 84, yy), (x + 103, yy)], "#cfaa7e")
        else:
            p.rect((x + 82, 178, x + 92, 201), "#656e5a", "#4e5848")
            p.rect((x + 78, 174, x + 96, 181), "#78815f")
    for x, height, canopy_w in ((62, 124, 75), (171, 134, 85), (426, 123, 84),
                                (691, 137, 70), (907, 124, 88)):
        for xx in range(x, W, 1037):
            generator.tree(p, xx, 207, height, canopy_w,
                           bark="#5c493f", leaf="#637251", seed=1)
    generator.pavement(p, curb="#a9886b", walk="#c1ab87", road="#827873")
    generator.clustered_patina(p, 53, 267, 101, strength=8, density=.18)
    for x in range(47, W, 241):
        p.rect((x, 214, x + 3, 216), "#705a48")
        p.rect((x + 9, 220, x + 15, 220), "#d5b37e")
    generator.theme_accents(p)
    return p.im


def choice01(a: Art) -> None:
    # A narrow alley is visible through the school wall. The climbable low
    # wall is exactly the collision rectangle: x=504..552, y=184..216.
    a.r(472, 137, 587, 216, "#6b5d51", "#473e39", 3)
    a.r(481, 149, 579, 216, "#4e5551")
    a.r(487, 155, 572, 216, "#303f40")
    a.p([(489, 208), (567, 208), (552, 162), (507, 162)], "#566257")
    a.r(481, 143, 579, 150, "#b49b78")
    a.r(476, 151, 483, 215, "#9c8067")
    a.r(577, 151, 585, 215, "#9c8067")
    a.r(504, 184, 551, 215, "#84916f", "#4e5c4b", 2)
    a.brick(506, 550, 188, 215, row=8, mortar="#5b6b57", fleck="#aab18e")
    a.r(501, 181, 554, 185, "#d0bd91", "#6e745c")
    a.r(508, 186, 549, 187, "#b8ad88")
    a.r(504, 212, 552, 216, "#536451")
    a.r(593, 155, 637, 205, "#8b735e", "#594b42", 2)
    a.r(598, 160, 632, 199, "#a98b6b")
    a.sign(593, 144, 44, 12, "伞架", paper="#c5ac80", ink="#554a3d", edge="#5e5142")
    a.l([(575, 210), (599, 210)], "#d0b78e", 2)


def choice02(a: Art) -> None:
    # Rainy lane -> school threshold -> sunny classroom. The three live
    # chair objects later appear at world x ~528, 665 and 801.
    a.plaster(408, W - 1, 0, FLOOR, "#d7c39f", "#c6ad84")
    a.r(408, 0, W - 1, 28, "#e4d5b5")
    a.r(408, 27, W - 1, 33, "#a78b6d")
    a.r(408, 36, W - 1, 41, "#c7a981")
    a.r(408, 160, W - 1, FLOOR, "#a18c72")
    a.r(408, 158, W - 1, 162, "#785f52")
    for x in range(458, W, 134):
        a.r(x, 41, x + 4, FLOOR - 4, "#ae9677")
        a.r(x + 6, 43, x + 7, 157, "#ebd9b5")
    for x in (467, 650, 831):
        a.classroom_window(x, 56, 124, 86)
        a.r(x + 9, 147, x + 37, 153, "#9b765f")
        a.r(x + 12, 144, x + 33, 147, "#8b997c")
    a.r(1042, 58, 1241, 151, "#765d48", "#473f38", 3)
    a.r(1049, 65, 1234, 143, "#3e5d4f")
    for x, y, w in ((1062, 88, 48), (1130, 94, 31), (1181, 79, 33)):
        a.l([(x, y), (x + w, y)], "#acc0a0")
    a.r(1036, 152, 1248, 156, "#6d5748")
    a.sign(1053, 167, 73, 13, "二年级教室", paper="#e5d5ae", ink="#715744", edge="#8c755c")
    a.floor(408, "#988976", "#5b554e", "#7c7064")
    a.r(408, FLOOR + 2, W - 1, FLOOR + 5, "#b7a488")
    a.portal(328, 427, wall="#78808a", frame="#3b5362", inner="#795f52", glow="#ead5ac")
    a.sign(338, 47, 79, 13, "教室", paper="#d3be94", ink="#4c4945", edge="#485b62")
    for x in (354, 391):
        a.l([(x, 94), (x, 141)], "#d7d6c2", 2)
    a.r(322, 209, 437, 215, "#756958")


def choice03(a: Art) -> None:
    # The school corridor gives way to an exam room and an imposing
    # chalkboard. No fake exam desk is painted at the live prop location.
    # The first half is the covered school corridor from the preceding level.
    a.plaster(0, 272, 0, FLOOR, "#c8b18d", "#b69974")
    a.r(0, 0, 272, 30, "#e0c79e")
    a.r(0, 30, 272, 35, "#8c6f53")
    a.r(0, 168, 272, FLOOR, "#927b64")
    a.r(0, 166, 272, 170, "#715a48")
    for x in (4, 143, 255):
        a.r(x, 35, x + 5, FLOOR, "#ab8d6b")
    a.classroom_window(20, 58, 108, 87, light="#e9d5a7")
    a.r(150, 62, 247, 145, "#69583f", "#493d36", 2)
    a.r(156, 69, 241, 137, "#70806b")
    for x, y, w in ((163, 79, 19), (187, 74, 17), (208, 84, 25)):
        a.r(x, y, x + w, y + 29, "#e0cdaa", "#9e896d")
        a.r(x + 3, y - 2, x + 5, y + 2, "#a16e56")
    a.floor(0, "#a38e73", "#665747", "#8d785f")
    a.plaster(272, W - 1, 0, FLOOR, "#d7bc91", "#c3a776")
    a.r(272, 0, W - 1, 30, "#ead3a9")
    a.r(272, 30, W - 1, 35, "#9c7757")
    a.r(272, 169, W - 1, FLOOR, "#a78969")
    a.r(272, 167, W - 1, 170, "#73583f")
    for x in (307, 1113):
        a.classroom_window(x, 50, 116, 93, light="#f2dda9")
    a.r(458, 48, 1027, 155, "#8a6247", "#5b4535", 3)
    a.r(466, 55, 1019, 145, "#3f5945")
    a.r(470, 145, 1019, 150, "#bc9263")
    # Sparse chalk, exam timetable and pinned sheets.
    for x, y, w in ((497, 77, 79), (599, 92, 135), (754, 78, 109), (887, 99, 61)):
        a.l([(x, y), (x + w, y)], "#9aaf90")
        a.l([(x + 5, y + 7), (x + w - 19, y + 7)], "#758e77")
    for x, y in ((431, 72), (1045, 67), (1059, 101)):
        a.r(x, y, x + 20, y + 30, "#f4e5c5", "#ac8864")
        a.r(x + 8, y - 2, x + 11, y + 2, "#a16d51")
        for dy in (9, 15, 21):
            a.l([(x + 4, y + dy), (x + 16, y + dy)], "#b5aa92")
    a.r(646, 12, 668, 34, "#816b55", "#594b40", 2)
    a.r(650, 16, 664, 30, "#e9d6af")
    a.l([(657, 23), (657, 18)], "#5f5d4b")
    a.l([(657, 23), (662, 26)], "#5f5d4b")
    a.floor(272, "#978371", "#5d5248", "#7b6e5d")
    a.portal(188, 291, wall="#b18c68", frame="#654d40", inner="#8e735c", glow="#e4d2b0")
    a.sign(197, 47, 85, 13, "考场", paper="#d4bd95", ink="#584735", edge="#77583f")
    a.r(284, 207, 319, 213, "#ad9679")


def choice04(a: Art) -> None:
    # Gray academy passage -> amber practice room. The live piano remains
    # foreground at x=488..568; the backdrop only supplies room context.
    a.plaster(0, 400, 0, FLOOR, "#a2a9a3", "#828c8a")
    a.r(0, 0, 400, 35, "#757f81")
    a.r(0, 34, 400, 39, "#435963")
    a.r(0, 159, 400, FLOOR, "#71868b")
    a.r(0, 156, 400, 161, "#465e65")
    for x in (0, 136, 263, 389):
        a.r(x, 39, x + 5, FLOOR, "#687e82")
        a.r(x + 6, 45, x + 7, 152, "#c1c6bb")
    for x in (39, 202):
        a.r(x, 61, x + 56, 215, "#42545b", "#2c414b", 2)
        a.r(x + 5, 67, x + 51, 203, "#68726e")
        a.r(x + 9, 72, x + 47, 127, "#42525a")
        a.r(x + 46, 155, x + 49, 158, "#d9c58e")
    a.r(105, 78, 183, 142, "#4e6469", "#334b55", 2)
    a.r(112, 85, 176, 135, "#bac2b7")
    for yy in (95, 105, 115, 125):
        a.l([(119, yy), (169, yy)], "#7e908c")
    a.floor(0, "#65767b", "#3d535c", "#596c73")
    a.plaster(400, W - 1, 0, FLOOR, "#9c988c", "#7f837e")
    a.r(400, 0, W - 1, 32, "#777d79")
    for x in range(400, W, 92):
        a.r(x, 10, x + 6, 36, "#555f5e")
    a.r(400, 38, W - 1, 42, "#d0b487")
    a.r(400, 166, W - 1, FLOOR, "#766f64")
    a.r(400, 164, W - 1, 168, "#544e48")
    for x in (477, 706, 935):
        a.r(x - 6, 54, x + 142, 151, "#534d48", "#d7b77d", 3)
        a.r(x, 60, x + 136, 141, "#e7b270")
        a.r(x + 4, 64, x + 132, 103, "#e5c38b")
        a.r(x + 4, 104, x + 132, 137, "#aa8d72")
        a.r(x + 66, 60, x + 70, 141, "#645b50")
        a.r(x, 104, x + 136, 108, "#645b50")
        a.p([(x + 14, 65), (x + 24, 65), (x + 5, 129), (x + 5, 94)], "#f0d6a1")
        a.r(x - 12, 150, x + 149, 154, "#504940")
    for x in (655, 884, 1113):
        a.r(x, 50, x + 28, 162, "#5a605e", "#454c4b")
        for dy in (14, 31, 49, 66, 84):
            a.r(x + 5, 53 + dy, x + 22, 60 + dy, "#8e8a77")
    a.sign(1101, 174, 87, 14, "琴房", paper="#d6c4a0", ink="#514b47", edge="#5b5751")
    a.floor(400, "#715d52", "#443e3a", "#5d4d46", tile=46)
    for x in range(420, W, 94):
        a.l([(x, 220), (x + 13, 265)], "#826a58")
    a.portal(317, 416, wall="#6c7677", frame="#3e4e53", inner="#4b4a47", glow="#d6ab72")
    a.sign(329, 48, 75, 13, "琴房", paper="#c7c0a6", ink="#4a4c47", edge="#49595a")


def choice05(a: Art) -> None:
    # Dusk courtyard -> meeting corridor, with the actual collision door
    # leaf exactly x=614..658, y=122..216.
    a.plaster(389, W - 1, 0, FLOOR, "#b8a38e", "#a28d7b")
    a.r(389, 0, W - 1, 35, "#8e8179")
    a.r(389, 35, W - 1, 41, "#d0b498")
    a.r(389, 169, W - 1, FLOOR, "#877b72")
    a.r(389, 167, W - 1, 171, "#5f5853")
    for x in range(438, W, 116):
        a.r(x, 41, x + 5, FLOOR, "#8c7d70")
        a.r(x + 7, 47, x + 8, 165, "#d3baa0")
    # Noticeboard above the low bench's route.
    a.r(449, 69, 584, 138, "#65584f", "#d0b08c", 3)
    a.r(456, 76, 577, 130, "#697464")
    for x, y, w in ((467, 87, 29), (505, 83, 21), (539, 93, 28)):
        a.r(x, y, x + w, y + 26, "#dfccaa", "#9d896e")
        a.r(x + 4, y - 2, x + 6, y + 2, "#9f6550")
        for dy in (8, 13, 18):
            a.l([(x + 5, y + dy), (x + w - 5, y + dy)], "#aea38c")
    # Warm room light sits inside the frame but does not change collision.
    a.r(607, 113, 665, 216, "#504b48", "#d3ac7e", 3)
    a.r(611, 118, 661, 216, "#d1a077")
    a.r(614, 122, 657, 215, "#765346", "#4e403c", 2)
    a.r(619, 128, 652, 159, "#a77c5c", "#4e403c")
    a.r(619, 164, 652, 207, "#946e53", "#4e403c")
    a.r(624, 133, 647, 155, "#b88c67")
    a.r(624, 169, 647, 203, "#a47a5a")
    a.r(649, 171, 653, 175, "#e8ca91")
    a.r(614, 211, 658, 216, "#574b44")
    a.sign(606, 94, 61, 14, "办公室", paper="#dfc39b", ink="#55473f", edge="#5a4d47")
    for x in (739, 965, 1136):
        a.r(x - 3, 65, x + 132, 156, "#574d46", "#d0ac7d", 2)
        a.r(x + 3, 70, x + 126, 147, "#af9582")
        a.r(x + 6, 74, x + 123, 99, "#debd89")
        a.r(x + 63, 70, x + 67, 147, "#665b53")
        a.r(x + 3, 108, x + 126, 111, "#665b53")
        a.r(x - 7, 156, x + 137, 159, "#705e50")
    a.floor(389, "#79675f", "#4f4543", "#6b5b55")
    a.portal(305, 405, wall="#98705d", frame="#594646", inner="#705650", glow="#cfad85")
    a.sign(314, 48, 82, 13, "家长会", paper="#d9bc91", ink="#5d4a3b", edge="#6d5145")


def draw_day_courtyard() -> Image.Image:
    im = Image.new("RGB", (W, H), "#efe0b6")
    a = Art(im, 606)
    for y in range(0, 144):
        t = y / 144
        a.l([(0, y), (W, y)], generator.mix("#eee0b9", "#d8cca9", t))
    for x, yy, ww in ((432, 43, 72), (674, 59, 54), (917, 34, 93), (1160, 63, 81)):
        a.r(x, yy, x + ww, yy + 7, "#f9e7be")
        a.r(x + 11, yy - 4, x + ww - 20, yy + 5, "#fbebca")
    for x in range(0, W, 112):
        a.p([(x - 10, 143), (x + 55, 117), (x + 124, 143)], "#a6a997")
    a.r(0, 144, W - 1, FLOOR, "#c5baa0")
    for x in range(15, W, 118):
        a.r(x, 140, x + 10, 216, "#8b8774", "#605c54", 2)
        a.r(x + 4, 146, x + 6, 210, "#cfc8ae")
    a.r(0, 151, W - 1, 155, "#e0d5b8")
    a.r(0, 205, W - 1, 216, "#9c937e")
    for x in (482, 596, 870):
        a.r(x, 163, x + 59, 196, "#8b8e80", "#6b6c60", 2)
        a.r(x + 5, 167, x + 54, 192, "#d6d1af")
        a.r(x + 29, 167, x + 32, 192, "#8b8e80")
    # The two distinct exits make the 'fork in the road' readable.
    for x, wood, glow in ((1014, "#6d6657", "#918c7a"), (1131, "#a38160", "#e7cf9e")):
        a.r(x - 9, 145, x + 70, 215, "#777b69", "#58594d", 2)
        a.r(x, 156, x + 61, 215, wood, "#514c43", 2)
        a.r(x + 6, 163, x + 55, 204, glow)
        a.r(x + 29, 156, x + 32, 215, "#5d5a4e")
        a.r(x + 58, 177, x + 60, 180, "#f3d69c")
    a.r(0, 216, W - 1, H - 1, "#bdad93")
    a.r(0, 216, W - 1, 219, "#e2d2ae")
    for y in (231, 249, 263):
        a.l([(0, y), (W - 1, y)], "#9e937e")
        for x in range(10 + (y % 2) * 17, W, 42):
            a.l([(x, y), (x, min(H - 1, y + 13))], "#a89d84")
    a.p([(692, 269), (799, 269), (749, 217), (723, 217)], "#d5c8a9")
    a.p([(878, 269), (962, 269), (887, 217), (852, 217)], "#a39882")
    a.l([(747, 216), (799, 269)], "#f0dfb9")
    a.l([(852, 217), (878, 269)], "#777665")
    # Courtyard tree, drawn after the wall to give it a strong silhouette.
    painter = generator.Painter(a.im, ImageDraw.Draw(a.im), W, "choice06-dawn")
    generator.tree(painter, 766, 216, 147, 116,
                   bark="#655f4d", leaf="#8b936b", seed=606)
    return a.im


def choice06(a: Art) -> None:
    # The sixth level is a sleepless room, not a night-time outdoor street.
    a.plaster(0, 471, 0, FLOOR, "#343f50", "#405066")
    a.r(0, 0, 471, 34, "#212d3d")
    a.r(0, 34, 471, 38, "#657382")
    a.r(0, 161, 471, FLOOR, "#263445")
    a.r(0, 159, 471, 163, "#6d7880")
    for x in range(0, 471, 92):
        a.r(x, 42, x + 3, 159, "#3e4d5c")
    a.r(25, 53, 132, 151, "#202e3e", "#a7977f", 3)
    a.r(32, 60, 125, 144, "#253748")
    a.r(62, 75, 84, 97, "#e2d9bc")
    a.r(66, 72, 86, 90, "#e2d9bc")
    a.r(70, 70, 82, 72, "#e2d9bc")
    for x, y in ((40, 74), (109, 99), (91, 124)):
        a.r(x, y, x + 1, y + 1, "#b4b9b5")
    a.r(77, 53, 81, 151, "#a7977f")
    a.r(25, 100, 132, 104, "#a7977f")
    a.r(15, 164, 174, 211, "#414a5b", "#202c3b", 2)
    a.r(22, 169, 171, 190, "#677483")
    a.r(28, 173, 85, 188, "#a6aca8")
    a.r(19, 192, 175, 211, "#506073")
    a.r(18, 207, 178, 215, "#283445")
    a.r(183, 66, 249, 159, "#252f3d", "#82909a", 2)
    for y in (79, 96, 113, 130, 147):
        a.r(189, y, 243, y + 3, "#8a8074")
        for x in range(193, 241, 8):
            a.r(x, y - a.rng.randint(7, 11), x + 5, y - 1, a.rng.choice(("#b6a183", "#758b91", "#7e6b68")))
    a.r(266, 172, 389, 181, "#796550", "#3d3a38", 2)
    for x in (273, 373):
        a.r(x, 181, x + 5, 215, "#5e5146")
    a.r(284, 148, 319, 171, "#b1aa94", "#5a5149")
    a.r(292, 135, 309, 149, "#ddc58d", "#81654b")
    a.r(300, 116, 303, 135, "#786758")
    a.r(284, 168, 328, 171, "#caa974")
    a.r(340, 162, 361, 171, "#e3d6b5")
    a.l([(343, 166), (356, 166)], "#927d67")
    a.floor(0, "#29384b", "#1b2838", "#344254", tile=39)
    bright = draw_day_courtyard()
    # A real threshold takes Xiaoman from the sleepless room into daylight.
    # It preserves the night-to-morning narrative without a noisy dissolve.
    a.im.paste(bright.crop((438, 0, W, H)), (438, 0))
    a.im.paste(bright.crop((354, 81, 430, FLOOR)), (354, 81))
    a.d = ImageDraw.Draw(a.im)
    a.r(333, 0, 438, 64, "#313d4b")
    a.r(333, 32, 438, 37, "#667887")
    a.r(333, 64, 439, FLOOR, "#313d4b", "#1b2d3d", 3)
    a.r(344, 74, 432, FLOOR, "#857862")
    a.im.paste(bright.crop((353, 83, 425, FLOOR)), (353, 83))
    a.r(349, 79, 353, FLOOR, "#beaa81")
    a.r(425, 79, 429, FLOOR, "#beaa81")
    a.r(353, 79, 425, 83, "#d7bf8f")
    a.r(342, FLOOR - 5, 440, FLOOR + 3, "#9d9178")
    a.r(352, FLOOR - 3, 439, FLOOR, "#ddc9a2")
    a.sign(352, 51, 70, 13, "天亮了", paper="#a6a18d", ink="#343e48", edge="#263747")
    a.sign(466, 174, 54, 13, "岔路", paper="#c4b38e", ink="#57574e", edge="#777567")


def choice_alley(a: Art) -> None:
    # The last alley narrows to a break in the wall. The sill and the wall
    # below it coincide with the climb collider x=500..536, y=123..216.
    a.r(434, 22, 613, 215, "#687c81", "#354b57", 3)
    a.brick(437, 612, 29, 212, row=13, mortar="#536770", fleck="#8e9fa0")
    a.r(446, 32, 472, 215, "#50636d")
    a.r(453, 40, 466, 210, "#839193")
    a.r(566, 34, 605, 214, "#596e75")
    a.r(573, 45, 594, 205, "#819293")
    # Recessed bright opening above the actual platform.
    a.r(485, 69, 551, 130, "#344952", "#b0b7aa", 3)
    a.r(493, 76, 544, 122, "#d0c7a7")
    a.r(498, 82, 538, 117, "#e8d9b2")
    a.p([(498, 117), (538, 117), (533, 91), (505, 91)], "#bfc3ab")
    a.r(515, 83, 519, 117, "#778986")
    a.r(498, 101, 538, 104, "#778986")
    a.r(492, 118, 545, 122, "#56686d")
    a.r(500, 123, 535, 215, "#83939a", "#4a5e65", 2)
    a.brick(502, 534, 128, 213, row=11, mortar="#65777e", fleck="#aab4ae")
    a.r(497, 120, 539, 125, "#c4c6af", "#53656b")
    a.r(521, 119, 528, 121, "#606f72")  # missing stone on the sill
    a.r(500, 210, 536, 216, "#566b72")
    a.r(487, 127, 497, 215, "#4a5f68")
    a.r(539, 127, 549, 215, "#4a5f68")
    a.l([(488, 126), (478, 216)], "#3e535e", 2)
    a.l([(551, 125), (565, 216)], "#9ba9a6", 2)
    # A narrow shaft of daylight implies the route through the window.
    a.p([(548, 124), (604, 216), (670, 216), (555, 121)], "#73898b")
    for x in (633, 698, 750):
        a.r(x, 70, x + 50, 148, "#536974", "#344a56", 2)
        a.r(x + 6, 78, x + 44, 137, "#8a9896")
        a.r(x + 11, 83, x + 39, 133, "#b4b9a5")
        a.r(x + 24, 83, x + 27, 133, "#5c7278")
        a.r(x + 11, 106, x + 39, 109, "#5c7278")
    a.r(610, 205, 804, 215, "#677c80")
    a.sign(458, 51, 70, 12, "巷子尽头", paper="#a9a991", ink="#40505a", edge="#3b515d")


PAINTERS = {
    "01": choice01,
    "02": choice02,
    "03": choice03,
    "04": choice04,
    "05": choice05,
    "06": choice06,
    "alley": choice_alley,
}


def make_contact(images: dict[str, Image.Image]) -> Path:
    QA.mkdir(parents=True, exist_ok=True)
    card_w, card_h, header = 1280, 270, 24
    sheet = Image.new("RGB", (card_w * 2, (card_h + header) * 4), "#1b2025")
    d = ImageDraw.Draw(sheet)
    font = ImageFont.truetype("C:/Windows/Fonts/simhei.ttf", 16)
    labels = {
        "01": "01  上学的路 / 矮墙与巷口",
        "02": "02  雨巷 → 教室 / 三把凳子",
        "03": "03  校道 → 考场 / 那张试卷",
        "04": "04  走廊 → 琴房 / 钢琴",
        "05": "05  黄昏 → 家长会走廊 / 办公室",
        "06": "06  夜色 → 清晨岔路口",
        "alley": "巷子尽头 / 缺口与窗台",
    }
    for i, key in enumerate(IDS):
        cx, cy = (i % 2) * card_w, (i // 2) * (card_h + header)
        d.rectangle((cx, cy, cx + card_w - 1, cy + header - 1), fill="#25323a")
        d.text((cx + 12, cy + 2), labels[key], font=font, fill="#f3e8cb")
        sheet.paste(images[key], (cx, cy + header))
    path = QA / "choice-repaired-contact.png"
    sheet.save(path, optimize=True)
    return path


def make_collision_detail(images: dict[str, Image.Image]) -> Path:
    QA.mkdir(parents=True, exist_ok=True)
    specs = (
        ("01", "low wall  x504..552  y184..216", (504, 184, 552, 216), (455, 113, 652, 231)),
        ("05", "office door  x614..658  y122..216", (614, 122, 658, 216), (563, 67, 713, 231)),
        ("alley", "window wall  x500..536  y123..216", (500, 123, 536, 216), (445, 56, 640, 231)),
    )
    sheet = Image.new("RGB", (3 * 800, 736), "#25323a")
    d = ImageDraw.Draw(sheet)
    font = ImageFont.truetype("C:/Windows/Fonts/simhei.ttf", 17)
    for index, (key, label, bounds, crop) in enumerate(specs):
        cx = index * 800
        d.text((cx + 16, 8), f"{key}  {label}", font=font, fill="#f6eac9")
        region = images[key].crop(crop).resize(((crop[2] - crop[0]) * 4, (crop[3] - crop[1]) * 4), Image.Resampling.NEAREST)
        sheet.paste(region, (cx + 8, 42))
        x1, y1, x2, y2 = bounds
        x1 = cx + 8 + (x1 - crop[0]) * 4
        y1 = 42 + (y1 - crop[1]) * 4
        x2 = cx + 8 + (x2 - crop[0]) * 4
        y2 = 42 + (y2 - crop[1]) * 4
        d.rectangle((x1, y1, x2 - 1, y2 - 1), outline="#f3cc62", width=3)
    path = QA / "choice-collision-detail.png"
    sheet.save(path, optimize=True)
    return path


def main() -> None:
    OUT.mkdir(parents=True, exist_ok=True)
    images: dict[str, Image.Image] = {}
    for index, key in enumerate(IDS):
        base = dawn_without_extra_gates() if key == "01" else generator.choice_scene(key)
        art = Art(base, 1264 + index)
        PAINTERS[key](art)
        images[key] = art.im
        path = OUT / f"{key}.png"
        art.im.resize((2560, 540), Image.Resampling.NEAREST).save(path, optimize=True)
        print(f"{key}: {path}")
    print(f"contact: {make_contact(images)}")
    print(f"collision detail: {make_collision_detail(images)}")


if __name__ == "__main__":
    main()
