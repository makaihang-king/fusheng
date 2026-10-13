#!/usr/bin/env python3
"""Draw legible 1:1 pixel scenery at the game's 480x270 logical density.

The source scroll strips are kept untouched. A whole scene is drawn before its
1024x270 overlapping strips are cut, so the 64 logical-pixel overlaps stay exact.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import math
import random
from dataclasses import dataclass
from pathlib import Path

from PIL import Image, ImageChops, ImageDraw, ImageFont


ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / "assets/resources/art/pixel/scene"
DEST = SOURCE / "clear-v7"
QA = ROOT / "build/qa/background-clear-v7"
FLOOR = 216
TILE_W = 1024
TILE_STRIDE = 960
SCROLL_COUNTS = {
    "dawn": 4, "rain": 4, "noon": 4, "gray": 5, "dusk": 5,
    "night": 4, "graduate": 5, "alley": 4, "playground": 4,
    "dream": 7, "heaven": 5, "hell": 5,
}


def shade(c: str, delta: int) -> str:
    c = c.lstrip("#")
    rgb = [max(0, min(255, int(c[i:i + 2], 16) + delta)) for i in (0, 2, 4)]
    return "#" + "".join(f"{v:02x}" for v in rgb)


def mix(a: str, b: str, t: float) -> str:
    a, b = a.lstrip("#"), b.lstrip("#")
    vals = [round((1 - t) * int(a[i:i + 2], 16) + t * int(b[i:i + 2], 16)) for i in (0, 2, 4)]
    return "#" + "".join(f"{v:02x}" for v in vals)


def rng_for(*parts: object) -> random.Random:
    h = hashlib.sha256("/".join(map(str, parts)).encode("utf-8")).digest()
    return random.Random(int.from_bytes(h[:8], "little"))


@dataclass
class Painter:
    im: Image.Image
    d: ImageDraw.ImageDraw
    width: int
    theme: str

    @classmethod
    def make(cls, width: int, theme: str, color: str) -> "Painter":
        im = Image.new("RGB", (width, 270), color)
        return cls(im, ImageDraw.Draw(im), width, theme)

    def rect(self, xy: tuple[int, int, int, int], fill: str, outline: str | None = None, line: int = 1) -> None:
        self.d.rectangle(xy, fill=fill, outline=outline, width=line)

    def line(self, xy: list[tuple[int, int]], fill: str, width: int = 1) -> None:
        self.d.line(xy, fill=fill, width=width)

    def poly(self, xy: list[tuple[int, int]], fill: str, outline: str | None = None) -> None:
        self.d.polygon(xy, fill=fill, outline=outline)


def sky(p: Painter, top: str, horizon: str, bottom: int, seed: int = 0) -> None:
    for y in range(bottom):
        t = (y / max(1, bottom - 1)) ** 0.8
        p.line([(0, y), (p.width, y)], mix(top, horizon, t))
    r = rng_for(p.theme, "sky", seed)
    for x in range(-90, p.width + 130, 125):
        xx = x + r.randint(-28, 28)
        yy = r.randint(24, max(26, bottom - 36))
        w = r.randint(35, 95)
        if yy + 15 >= bottom:
            continue
        cloud = mix(top, "#fff6e3", .5)
        shadow = mix(horizon, "#9e9ea0", .16)
        p.rect((xx + 8, yy + 7, xx + w - 2, yy + 13), shadow)
        p.rect((xx + 6, yy + 3, xx + w - 4, yy + 10), cloud)
        p.rect((xx + 11, yy, xx + w // 2, yy + 9), shade(cloud, 5))
        p.rect((xx + w // 2 - 3, yy + 2, xx + w - 16, yy + 10), cloud)


def distant_roofs(p: Painter, top: int, palette: tuple[str, str, str], seed: int = 0) -> None:
    wall, roof, edge = palette
    r = rng_for(p.theme, "far", seed)
    x = -35
    while x < p.width:
        w = r.randint(70, 155)
        h = r.randint(17, 43)
        yy = top + r.randint(-6, 10)
        p.rect((x, yy, x + w, yy + h), wall)
        p.poly([(x - 4, yy + 1), (x + w // 2, yy - 15), (x + w + 4, yy + 1)], roof, edge)
        for wx in range(x + 14, x + w - 10, 24):
            p.rect((wx, yy + 12, wx + 7, yy + 24), shade(wall, -18), shade(wall, -25))
            p.line([(wx + 3, yy + 13), (wx + 3, yy + 24)], shade(wall, 8))
        x += w + r.randint(2, 17)


def mottled_wall(p: Painter, y1: int, y2: int, base: str, seed: int, *, step: int = 9, density: float = .35) -> None:
    """Broad, sparse masonry marks; one or two pixel chips, never all-over AI grain."""
    r = rng_for(p.theme, "masonry", seed)
    for y in range(y1 + 3, y2 - 2, step):
        offset = 4 if y // step % 2 else 0
        for x in range(offset, p.width, 18):
            if r.random() > density:
                continue
            xx = x + r.randint(-3, 4)
            p.line([(xx, y), (xx + r.randint(3, 10), y)], shade(base, -13))
            if r.random() < .58:
                p.rect((xx + 1, y + 1, xx + 3, y + 1), shade(base, 8))


def clustered_patina(p: Painter, y1: int, y2: int, seed: int, *, strength: int = 11, density: float = .22) -> None:
    """Chip highlights into flat fills without obscuring edge silhouettes."""
    r = rng_for(p.theme, "patina", seed)
    px = p.im.load()
    for y in range(y1, min(y2, 268), 4):
        for x in range(2, p.width - 5, 5):
            if r.random() > density:
                continue
            c = px[x, y]
            if px[x + 3, y] != c or px[x, y + 2] != c or px[x + 3, y + 2] != c:
                continue
            delta = r.choice((-strength, -strength // 2, strength // 2, strength))
            ink = "#" + "".join(f"{max(0, min(255, v + delta)):02x}" for v in c)
            ww = r.choice((2, 3, 4))
            p.rect((x, y, x + ww, y + r.choice((0, 1, 1, 2))), ink)


def brick_damage(p: Painter, x1: int, y1: int, x2: int, y2: int, wall: str, seed: int) -> None:
    r = rng_for(p.theme, "brick-wear", seed, x1, y1)
    for _ in range(max(6, (x2 - x1) * (y2 - y1) // 700)):
        x = r.randint(x1, x2 - 5)
        y = r.randint(y1, y2 - 3)
        w = r.randint(2, 6)
        p.rect((x, y, x + w, y + 1), shade(wall, r.choice((-24, -15, 14, 23))))
        if r.random() < .3:
            p.line([(x + w, y + 1), (x + w + 1, y + 3)], shade(wall, -20))


def brick_courses(p: Painter, y1: int, y2: int, wall: str, mortar: str, seed: int, pitch: int = 8) -> None:
    r = rng_for(p.theme, "bricks", seed)
    for y in range(y1 + pitch, y2, pitch):
        for line_x in range(0, p.width, 30):
            length = r.randint(12, 29)
            p.line([(line_x, y), (line_x + length, y)], mortar)
        offset = 13 if (y // pitch) % 2 else 0
        for x in range(offset, p.width, 26):
            p.line([(x, y - pitch + 1), (x, y - 1)], mortar)
            if r.random() < .68:
                p.rect((x + 2, y - pitch + 2, x + r.randint(10, 20), y - pitch + r.randint(3, 5)),
                       shade(wall, r.choice((-14, -8, 9, 16))))
            if r.random() < .22:
                p.line([(x + 4, y - 2), (x + 12, y - 2)], shade(wall, 18))


def window(p: Painter, x: int, y: int, w: int, h: int, *, wall: str, frame: str, pane: str, glow: bool = False) -> None:
    p.rect((x - 4, y - 4, x + w + 4, y + h + 5), shade(frame, -13))
    p.rect((x - 2, y - 2, x + w + 2, y + h + 2), shade(wall, 16))
    p.rect((x, y, x + w, y + h), pane, shade(frame, -23), 2)
    p.rect((x + 4, y + 4, x + w - 4, y + h - 4), shade(pane, -18))
    if glow:
        p.rect((x + 5, y + 5, x + w - 5, y + h - 5), shade(pane, 16))
    mid = x + w // 2
    p.rect((mid - 1, y + 1, mid + 1, y + h - 1), frame)
    p.rect((x + 1, y + h // 2 - 1, x + w - 1, y + h // 2 + 1), frame)
    p.line([(x + 3, y + 3), (x + 3, y + h - 3)], shade(frame, 23))
    p.line([(x + 3, y + 3), (x + w - 3, y + 3)], shade(frame, 17))
    # Reflected light and a half-lowered curtain make the aperture read as glass.
    p.poly([(x + w - 11, y + 4), (x + w - 5, y + 4),
            (x + w - 12, y + h // 2), (x + w - 16, y + h // 2)], shade(pane, 23))
    p.rect((x + 5, y + h - 12, x + 10, y + h - 7), shade(pane, 12))
    p.rect((x + w - 12, y + h - 8, x + w - 7, y + h - 5), shade(pane, 13))
    p.line([(x - 6, y + h + 6), (x + w + 6, y + h + 6)], shade(wall, -24), 2)
    p.line([(x - 4, y + h + 4), (x + w + 4, y + h + 4)], shade(wall, 26))
    p.rect((x - 3, y + h + 8, x + 1, y + h + 8), shade(wall, 28))
    p.rect((x + w - 2, y + h + 7, x + w + 3, y + h + 7), shade(wall, -19))


def door(p: Painter, x: int, y: int, w: int, h: int, *, wall: str, wood: str, frame: str, double: bool = False) -> None:
    p.rect((x - 5, y - 6, x + w + 5, y + h + 1), shade(wall, -22))
    p.rect((x - 3, y - 4, x + w + 3, y + h + 1), shade(wall, 25), shade(frame, -20), 2)
    p.rect((x, y, x + w, y + h), wood, shade(frame, -25), 2)
    p.line([(x + 3, y + 2), (x + 3, y + h - 1)], shade(wood, 22))
    if double:
        p.line([(x + w // 2, y + 1), (x + w // 2, y + h)], shade(frame, -28), 2)
    for bx in (x + 5, x + w // 2 + 4) if double else (x + 5,):
        bw = w // 2 - 9 if double else w - 10
        p.rect((bx, y + 8, bx + bw, y + h // 2 - 5), shade(wood, -12), shade(wood, 13))
        p.rect((bx, y + h // 2 + 3, bx + bw, y + h - 8), shade(wood, -9), shade(wood, 16))
    p.rect((x + (w // 2 - 6 if double else w - 8), y + h // 2 + 1,
            x + (w // 2 - 4 if double else w - 6), y + h // 2 + 3), "#c9aa72")
    r = rng_for(p.theme, "door-wear", x, y)
    for _ in range(max(7, w * h // 230)):
        xx = r.randint(x + 3, x + w - 4)
        yy = r.randint(y + 3, y + h - 4)
        p.line([(xx, yy), (xx + r.randint(1, 4), yy)], shade(wood, r.choice((-22, 20))))
    p.rect((x - 4, y + h - 2, x + w + 4, y + h + 2), shade(frame, -10))
    p.line([(x - 2, y + h + 1), (x + w + 2, y + h + 1)], shade(wall, 25))


def tree(p: Painter, x: int, foot: int, height: int, canopy_w: int, *, bark: str, leaf: str, seed: int, pale: bool = False) -> None:
    r = rng_for(p.theme, "tree", seed, x)
    top = foot - height
    trunk_w = max(5, canopy_w // 14)
    dark = shade(bark, -24)
    p.poly([(x - trunk_w - 2, foot), (x - trunk_w // 2, top + 22), (x + trunk_w // 2, top + 20),
            (x + trunk_w + 2, foot)], bark, dark)
    p.line([(x - 1, foot - 7), (x - 1, top + 22)], shade(bark, 19), 2)
    for side in (-1, 1):
        p.line([(x, top + 43), (x + side * canopy_w // 3, top + 26),
                (x + side * canopy_w // 2, top + 21)], bark, 3)
    base = shade(leaf, -25)
    p.poly([(x - canopy_w // 2, top + 26), (x - canopy_w // 3, top + 10),
            (x - canopy_w // 6, top + 8), (x, top), (x + canopy_w // 4, top + 6),
            (x + canopy_w // 2, top + 16), (x + canopy_w // 2 + 2, top + 33),
            (x + canopy_w // 4, top + 43), (x - canopy_w // 4, top + 42),
            (x - canopy_w // 2 - 2, top + 33)], base)
    for layer, col in ((0, leaf), (1, shade(leaf, 18)), (2, shade(leaf, -9))):
        count = 65 if not pale else 43
        for _ in range(count):
            xx = x + r.randint(-canopy_w // 2 + 5, canopy_w // 2 - 5)
            yy = top + r.randint(6, 39)
            if ((xx - x) / (canopy_w / 2)) ** 2 + ((yy - top - 23) / 25) ** 2 > 1.05:
                continue
            ww = r.randint(2, 7); hh = r.randint(1, 3)
            if layer == 1 and yy > top + 27:
                continue
            p.rect((xx, yy, xx + ww, yy + hh), col)
    p.rect((x - trunk_w - 4, foot - 2, x + trunk_w + 4, foot), shade(bark, -14))


def drain_pipe(p: Painter, x: int, y1: int, y2: int, *, dark: str) -> None:
    p.rect((x, y1, x + 3, y2), shade(dark, 13), dark)
    p.line([(x + 1, y1 + 1), (x + 1, y2 - 1)], shade(dark, 26))
    for yy in range(y1 + 12, y2, 37):
        p.rect((x - 2, yy, x + 5, yy + 2), shade(dark, -5))


def pavement(p: Painter, *, curb: str, walk: str, road: str, wet: bool = False, track: bool = False) -> None:
    # All authored scenes use the same top-of-floor and source stride as SceneGround.
    p.rect((0, 205, p.width, FLOOR - 1), shade(curb, -21))
    p.rect((0, 205, p.width, 207), shade(curb, 28))
    p.rect((0, 208, p.width, 211), curb)
    p.rect((0, 212, p.width, FLOOR - 1), shade(curb, -25))
    p.rect((0, FLOOR, p.width, 231), walk)
    p.line([(0, 217), (p.width, 217)], shade(walk, 24))
    p.line([(0, 231), (p.width, 231)], shade(walk, -24), 2)
    p.rect((0, 233, p.width, 269), road)
    if track:
        for y in (235, 244, 254, 265):
            p.line([(0, y), (p.width, y)], shade(road, 20), 2)
        for x in range(0, p.width, 95):
            p.line([(x, 233), (x + 18, 269)], shade(road, -9))
        return
    for x in range(12, p.width, 56):
        p.line([(x, 218), (x, 230)], shade(walk, -12))
        p.line([(x + 1, 219), (x + 1, 229)], shade(walk, 9))
    for x in range(17, p.width, 103):
        p.line([(x, 246), (x + 33, 246)], shade(road, 9))
        p.line([(x + 18, 264), (x + 42, 264)], shade(road, -8))
    if wet:
        r = rng_for(p.theme, "puddles")
        for x in range(21, p.width, 137):
            xx = x + r.randint(-14, 15)
            p.line([(xx, 241), (xx + r.randint(35, 78), 241)], shade(road, 20), 2)
            p.line([(xx + 8, 243), (xx + r.randint(20, 45), 243)], shade(road, 10))


def interior_floor(p: Painter, *, base: str, joint: str, light: str, wood: bool = False) -> None:
    """A real interior walking plane, including the bottom strip reused by SceneGround."""
    p.rect((0, 199, p.width, 204), shade(base, -22))
    p.line([(0, 200), (p.width, 200)], shade(light, -8), 2)
    p.line([(0, 204), (p.width, 204)], shade(joint, -10), 2)
    p.rect((0, 205, p.width, 269), base)
    p.line([(0, 207), (p.width, 207)], light)
    pitch = 18 if wood else 20
    rng = rng_for(p.theme, "interior-floor")
    for row, y in enumerate(range(209, 270, pitch)):
        p.line([(0, y), (p.width, y)], joint)
        p.line([(0, y + 1), (p.width, y + 1)], light)
        offset = (row * 29 + (17 if wood else 11)) % (82 if wood else 62)
        gap = 82 if wood else 62
        for x in range(offset, p.width, gap):
            p.line([(x, y + 3), (x, min(269, y + pitch - 2))], shade(joint, 4))
            if x + 15 < p.width:
                p.line([(x + 9, y + pitch // 2), (x + 24, y + pitch // 2)], shade(base, 8))
    # This region is copied repeatedly at run time. Keep its marks sparse and
    # small so the strip reads as material, rather than repeated lane markings.
    for x in range(7, p.width, 37):
        xx = x + rng.randint(-4, 5)
        yy = 252 + rng.randint(2, 16)
        p.line([(xx, yy), (xx + rng.randint(2, 8), yy)], shade(base, rng.choice((-13, 11))))


def dawn_scene(width: int) -> Image.Image:
    p = Painter.make(width, "dawn", "#e8d2a8")
    sky(p, "#e6c896", "#fae8ca", 151)
    distant_roofs(p, 136, ("#bda58d", "#9b947e", "#807666"))
    p.rect((0, 142, width, 205), "#a37d62")
    p.rect((0, 137, width, 144), "#51493f")
    p.line([(0, 139), (width, 139)], "#c1a77e", 2)
    p.line([(0, 145), (width, 145)], "#6d5b4d", 2)
    brick_courses(p, 148, 204, "#a37d62", "#795e4e", 1, 9)
    brick_damage(p, 0, 146, width, 203, "#a37d62", 1)
    for x in range(18, width, 132):
        p.rect((x, 142, x + 8, 205), "#876a59", "#5e554b")
        p.line([(x + 2, 146), (x + 2, 202)], "#b59674")
        window(p, x + 29, 156, 35, 30, wall="#a37d62", frame="#6e5b4b", pane="#687978")
        if (x // 132) % 3 == 1:
            p.rect((x + 80, 157, x + 107, 187), "#92745b", "#5d5548", 2)
            for yy in range(162, 184, 7):
                p.line([(x + 84, yy), (x + 103, yy)], "#cfaa7e")
        else:
            p.rect((x + 82, 178, x + 92, 201), "#656e5a", "#4e5848")
            p.rect((x + 78, 174, x + 96, 181), "#78815f")
    for gx in range(232, width, 812):
        p.rect((gx - 9, 132, gx + 76, 205), "#655547", "#3d3d3a", 2)
        p.rect((gx - 5, 137, gx + 72, 153), "#a98a67", "#473f3a", 2)
        p.rect((gx + 1, 159, gx + 66, 205), "#273334", "#ceae82", 2)
        for bar in range(gx + 7, gx + 65, 10):
            p.line([(bar, 159), (bar, 204)], "#6e6250", 2)
        p.rect((gx + 2, 167, gx + 65, 170), "#8d765e")
        p.rect((gx - 9, 132, gx + 76, 136), "#cfb080")
        p.rect((gx + 23, 137, gx + 47, 149), "#624d3d", "#e2ca9a")
        for dx in (gx - 25, gx + 85):
            p.rect((dx, 151, dx + 5, 205), "#4f5552")
            p.rect((dx - 3, 150, dx + 8, 153), "#c7a873")
        p.line([(gx - 75, 128), (gx - 4, 135), (gx + 80, 132), (gx + 150, 127)], "#5a5a52")
        for bird_x in (gx - 65, gx + 138):
            p.line([(bird_x, 126), (bird_x + 3, 124), (bird_x + 6, 126)], "#675b4a")
    for x, h, w in [(62, 124, 75), (171, 134, 85), (426, 123, 84), (691, 137, 70), (907, 124, 88)]:
        for xx in range(x, width, 1037):
            tree(p, xx, 207, h, w, bark="#5c493f", leaf="#637251", seed=1)
    pavement(p, curb="#a9886b", walk="#c1ab87", road="#827873")
    clustered_patina(p, 53, 267, 101, strength=8, density=.18)
    for x in range(47, width, 241):
        p.rect((x, 214, x + 3, 216), "#705a48")
        p.rect((x + 9, 220, x + 15, 220), "#d5b37e")
    return p.im


def rain_scene(width: int) -> Image.Image:
    p = Painter.make(width, "rain", "#33485b")
    p.rect((0, 0, width, 204), "#40546a")
    p.rect((0, 0, width, 30), "#263d54")
    p.rect((0, 32, width, 52), "#53677b")
    p.rect((0, 55, width, 66), "#293f54")
    p.rect((0, 68, width, 76), "#58687a")
    for y in (8, 18, 30, 54, 64, 76, 80):
        p.line([(0, y), (width, y)], "#142b40" if y < 55 else "#24374b", 2)
        p.line([(0, y + 2), (width, y + 2)], "#8290a0")
    for x in range(0, width, 31):
        p.line([(x, 4), (x + 14, 4)], "#435b73")
        p.line([(x + 12, 16), (x + 29, 16)], "#354e65")
        p.line([(x + 2, 38), (x + 24, 38)], "#718297")
        p.rect((x + 7, 44, x + 13, 45), "#253b52")
    for x in range(15, width, 117):
        p.rect((x, 52, x + 7, 56), "#30465a")
        p.line([(x + 1, 55), (x + 8, 55)], "#8794a0")
    mottled_wall(p, 79, 205, "#40546a", 2, step=10, density=.42)
    section_rng = rng_for("rain", "sections")
    x = -19
    module = 0
    while x < width:
        span = section_rng.choice((151, 164, 177, 188))
        p.rect((x, 90, x + span - 5, 201), "#435568", "#213648", 2)
        p.rect((x + 4, 94, x + span - 9, 100), "#748397")
        p.rect((x + 11, 103, x + 68, 192), "#3b414b", "#1c2d3b", 2)
        p.rect((x + 17, 110, x + 62, 179), "#6c5147" if module % 3 else "#685047", "#2c2b34", 2)
        for panel_y in (114, 142, 171):
            p.rect((x + 20, panel_y, x + 59, panel_y + 20), "#513f3d", "#80665b")
        if module % 4 == 2:
            p.rect((x + 88, 111, x + span - 25, 179), "#3d4550", "#213445", 2)
            for yy in range(117, 178, 9):
                p.line([(x + 93, yy), (x + span - 30, yy)], "#76818a", 2)
                p.line([(x + 93, yy + 2), (x + span - 30, yy + 2)], "#2b3a47")
        else:
            window(p, x + 86, 107, min(55, span - 109), 69, wall="#40546a", frame="#293641", pane="#34434d", glow=module % 5 == 1)
            p.rect((x + 102, 163, x + 119, 175), "#655142", "#2c3844")
            p.rect((x + 107, 159, x + 114, 165), "#768168")
        p.rect((x + 72, 185, x + span - 13, 190), "#72645d", "#263b50")
        p.line([(x + 80, 190), (x + 80, 204)], "#38495a", 3)
        p.line([(x + span - 20, 190), (x + span - 20, 204)], "#38495a", 3)
        drain_pipe(p, x + span - 6, 78, 204, dark="#213246")
        p.rect((x + 7, 84, x + span - 9, 89), "#26384b")
        for wx in range(x + 14, x + span - 13, 14):
            p.line([(wx, 85), (wx + 7, 89)], "#65798c")
        if module % 3 == 0:
            p.rect((x + 21, 98, x + 48, 104), "#263a42")
            p.line([(x + 23, 100), (x + 45, 100)], "#9ea29b")
        x += span
        module += 1
    for x in range(39, width, 430):
        for i in range(49):
            rr = rng_for(x, i)
            xx = x + rr.randint(-16, 28)
            yy = 82 + rr.randint(0, 35)
            p.rect((xx, yy, xx + rr.randint(2, 6), yy + rr.randint(1, 3)),
                   rr.choice(("#395953", "#55736b", "#203f48")))
        for dx in (x - 8, x + 13, x + 28):
            p.line([(dx, 101), (dx + 3, 128)], "#314c4c")
    pavement(p, curb="#5d6875", walk="#566d7f", road="#314457", wet=True)
    # Long broken reflections sit on the road, subordinate to the actual obstacle silhouettes.
    for x in range(31, width, 164):
        p.poly([(x + 3, 233), (x + 44, 233), (x + 54, 235), (x + 13, 236)], "#51697b")
        p.line([(x + 10, 241), (x + 41, 241)], "#8c9291")
        p.line([(x + 16, 250), (x + 60, 250)], "#445f73", 2)
        p.line([(x + 27, 255), (x + 48, 255)], "#728694")
    clustered_patina(p, 5, 266, 202, strength=10, density=.21)
    return p.im


def gray_scene(width: int) -> Image.Image:
    p = Painter.make(width, "gray", "#bfc4bf")
    # The unjust accusation takes place in a closed teaching corridor: no sky,
    # external roof line, or road is visible above or below the runner.
    p.rect((0, 0, width, 51), "#c9cac1")
    p.rect((0, 52, width, 163), "#b9bab0")
    p.rect((0, 164, width, 204), "#687e83")
    p.rect((0, 47, width, 53), "#67767a")
    p.line([(0, 53), (width, 53)], "#e0dac6", 2)
    p.line([(0, 161), (width, 161)], "#52696d", 3)
    p.line([(0, 165), (width, 165)], "#b0b9aa", 2)
    mottled_wall(p, 57, 160, "#b9bab0", 3, step=9, density=.30)
    mottled_wall(p, 166, 200, "#687e83", 4, step=8, density=.31)
    layout = rng_for("gray", "corridor-bays")
    x, bay = -24, 0
    while x < width:
        span = layout.choice((438, 467, 493))
        p.rect((x, 51, x + 5, 204), "#8b9690", "#596b6f")
        p.line([(x + 2, 56), (x + 2, 199)], "#d4d5c6")
        # Fluorescent lights and a wired bell make the roof unmistakably indoor.
        p.rect((x + 103, 26, x + 251, 33), "#5f6a68", "#3f5358", 2)
        p.rect((x + 111, 28, x + 243, 30), "#eee9d3")
        p.line([(x + 105, 12), (x + 105, 25)], "#7c8580")
        p.line([(x + 249, 12), (x + 249, 25)], "#7c8580")
        p.rect((x + 354, 62, x + 365, 69), "#677571", "#4e5f61")
        p.rect((x + 359, 69, x + 361, 81), "#697b79")
        # Interior classroom panes and an office door, both ending at the
        # back-wall skirting rather than projecting into the running lane.
        window(p, x + 29, 81, 66, 69, wall="#b9bab0", frame="#586b6e", pane="#64777b")
        p.rect((x + 39, 96, x + 84, 102), "#bdc3b8")
        p.rect((x + 45, 127, x + 72, 132), "#909d9a")
        door(p, x + 121, 93, 53, 111, wall="#b9bab0", wood="#505958", frame="#536164")
        p.rect((x + 127, 66, x + 169, 78), "#738079", "#556164", 2)
        p.rect((x + 133, 70, x + 162, 74), "#ded7c3")
        p.rect((x + 186, 96, x + 195, 112), "#9a9d92", "#5a696b")
        p.line([(x + 191, 111), (x + 191, 160)], "#6f7e7d", 2)
        # Rotating wall displays keep a long run from reading as a copied tile.
        if bay % 3 == 1:
            p.rect((x + 215, 83, x + 319, 150), "#686f68", "#46555a", 3)
            for n in range(4):
                xx = x + 224 + n * 23
                p.rect((xx, 93 + n % 2 * 8, xx + 17, 123 + n % 2 * 8), "#d3cbb8", "#948e81")
                p.line([(xx + 3, 102 + n % 2 * 8), (xx + 14, 102 + n % 2 * 8)], "#9c9f97")
                p.rect((xx + 7, 90 + n % 2 * 8, xx + 9, 93 + n % 2 * 8), "#b17a62")
        else:
            window(p, x + 218, 84, 88, 66, wall="#b9bab0", frame="#5d6c6e", pane="#697c7e")
            p.line([(x + 230, 121), (x + 290, 121)], "#86958e")
        p.rect((x + 339, 114, x + 414, 204), "#657477", "#3f565e", 2)
        p.rect((x + 345, 121, x + 408, 199), "#81908a", "#536368", 2)
        for shelf_y in (143, 169):
            p.line([(x + 350, shelf_y), (x + 403, shelf_y)], "#42575c", 3)
            for book_x in range(x + 353, x + 400, 8):
                p.rect((book_x, shelf_y - 17, book_x + 4, shelf_y - 2),
                       "#9e9c8d" if book_x % 3 else "#697a77")
        p.rect((x + 53, 189, x + 110, 195), "#5b6e70", "#465a60")
        for leg in (x + 61, x + 102):
            p.line([(leg, 195), (leg, 204)], "#53666b", 2)
        x += span
        bay += 1
    interior_floor(p, base="#798587", joint="#5d6a6c", light="#aeb5ae")
    clustered_patina(p, 52, 269, 303, strength=10, density=.20)
    return p.im


def bench(p: Painter, x: int, y: int, wood: str, metal: str, w: int = 52) -> None:
    p.rect((x, y, x + w, y + 5), wood, shade(wood, -27), 2)
    p.line([(x + 3, y + 2), (x + w - 3, y + 2)], shade(wood, 23))
    p.rect((x + 4, y - 13, x + w - 4, y - 7), wood, shade(wood, -27))
    p.line([(x + 6, y - 11), (x + w - 6, y - 11)], shade(wood, 17))
    for leg_x in (x + 7, x + w - 8):
        p.line([(leg_x, y + 5), (leg_x - 3, y + 20)], metal, 3)


def streetlamp(p: Painter, x: int, foot: int, top: int, *, stem: str, light: str) -> None:
    p.rect((x - 2, top + 10, x + 2, foot), stem, shade(stem, -24))
    p.rect((x - 7, top + 3, x + 7, top + 13), light, shade(stem, -21), 2)
    p.rect((x - 10, top, x + 10, top + 3), shade(stem, 11), shade(stem, -20))
    p.rect((x - 5, top + 6, x + 5, top + 9), shade(light, 18))
    p.rect((x - 6, foot - 3, x + 6, foot), shade(stem, -15))


def fence(p: Painter, y: int, *, dark: str, light: str, gap: int = 18, height: int = 29) -> None:
    p.line([(0, y), (p.width, y)], dark, 3)
    p.line([(0, y - height // 2), (p.width, y - height // 2)], light, 2)
    for x in range(0, p.width + 1, gap):
        p.line([(x, y - height), (x, y + 2)], dark, 2)
        p.rect((x - 2, y - height - 2, x + 2, y - height + 1), light)


def noon_scene(width: int) -> Image.Image:
    p = Painter.make(width, "noon", "#d6bb93")
    # Midday is a classroom that opens onto a teaching corridor, with windows
    # containing the sky instead of an outdoor street beneath the desks.
    p.rect((0, 0, width, 45), "#dec8a2")
    p.rect((0, 46, width, 163), "#d4b790")
    p.rect((0, 164, width, 204), "#ad896a")
    p.rect((0, 42, width, 47), "#9c7e61")
    p.line([(0, 46), (width, 46)], "#f0d7aa", 2)
    p.line([(0, 161), (width, 161)], "#896c56", 3)
    p.line([(0, 166), (width, 166)], "#cfad81", 2)
    mottled_wall(p, 51, 160, "#d4b790", 8, step=10, density=.28)
    layout = rng_for("noon", "classroom-bays")
    x, bay = -18, 0
    while x < width:
        span = layout.choice((457, 484, 512))
        p.rect((x, 45, x + 6, 204), "#b99270", "#7f6654", 2)
        p.line([(x + 3, 50), (x + 3, 199)], "#e8c99b")
        p.rect((x + 80, 19, x + 196, 27), "#ac9272", "#826b56", 2)
        p.rect((x + 88, 21, x + 188, 24), "#f5e8c6")
        p.line([(x + 82, 5), (x + 82, 18)], "#ad9275")
        p.line([(x + 194, 5), (x + 194, 18)], "#ad9275")
        for wx in (x + 18, x + 112):
            window(p, wx, 62, 73, 91, wall="#d4b790", frame="#8c6d53", pane="#adc8c2", glow=True)
            p.rect((wx + 7, 68, wx + 66, 80), "#d4e5d5")
            p.rect((wx + 7, 111, wx + 66, 119), "#8ca59b")
            p.line([(wx + 15, 121), (wx + 61, 121)], "#809a8c", 2)
            p.rect((wx + 6, 76, wx + 12, 147), "#efdbb3")
            p.rect((wx + 61, 76, wx + 67, 147), "#efdbb3")
        if bay % 3 == 1:
            p.rect((x + 222, 75, x + 394, 152), "#9c7856", "#765e4a", 3)
            p.rect((x + 229, 82, x + 387, 144), "#c8b99a")
            for n in range(5):
                xx = x + 237 + n * 29
                p.rect((xx, 91 + n % 2 * 9, xx + 20, 122 + n % 2 * 9),
                       "#ece0bd" if n % 2 else "#e2cfaa", "#b6a383")
                p.line([(xx + 3, 99 + n % 2 * 9), (xx + 16, 99 + n % 2 * 9)], "#a0a289")
            p.rect((x + 412, 119, x + 450, 203), "#9e7857", "#745d48", 2)
            for yy in (141, 170):
                p.line([(x + 416, yy), (x + 445, yy)], "#735e48", 3)
                for bx in range(x + 420, x + 441, 7):
                    p.rect((bx, yy - 14, bx + 4, yy - 2), "#c9ae83")
        elif bay % 3 == 2:
            p.rect((x + 211, 72, x + 397, 203), "#927456", "#695744", 3)
            p.rect((x + 218, 80, x + 390, 195), "#b6a58a", "#6f624f", 2)
            p.line([(x + 304, 81), (x + 304, 195)], "#715d49", 3)
            for shelf_y in (117, 158):
                p.line([(x + 221, shelf_y), (x + 387, shelf_y)], "#756049", 3)
            for n in range(4):
                xx = x + 229 + n * 34
                p.rect((xx, 91, xx + 17, 114), "#80917a" if n % 2 else "#c1aa83", "#746950")
                p.rect((xx + 5, 137, xx + 21, 154), "#826c58" if n % 2 else "#6c8172")
            p.rect((x + 416, 87, x + 452, 149), "#5b695d", "#76644c", 2)
            p.line([(x + 421, 96), (x + 446, 96)], "#c2b895")
            p.line([(x + 421, 106), (x + 441, 106)], "#c2b895")
        else:
            p.rect((x + 211, 68, x + 405, 153), "#9d7958", "#725d4b", 3)
            p.rect((x + 219, 76, x + 397, 143), "#395b50", "#314d46", 2)
            for n in range(4):
                yy = 91 + n * 12
                p.line([(x + 234, yy), (x + 282 + n % 2 * 18, yy)], "#b6c1a3", 2)
                p.line([(x + 318, yy), (x + 353 + n % 2 * 16, yy)], "#b6c1a3")
            p.rect((x + 370, 116, x + 385, 137), "#ddd0a8")
            p.rect((x + 414, 75, x + 443, 151), "#af9372", "#78644f", 2)
            for yy in (90, 114, 137):
                p.line([(x + 420, yy), (x + 438, yy)], "#755d49", 2)
        # Rear-row desks and stools stay behind the 205px skirting; obstacle
        # props occupy the foreground contact plane at y=216.
        for dx in (18, 105, 196, 302, 405):
            xx = x + dx
            p.rect((xx, 178, xx + 47, 183), "#886747", "#594c3d", 2)
            p.line([(xx + 4, 181), (xx + 43, 181)], "#c29a6d")
            for leg in (xx + 5, xx + 42):
                p.line([(leg, 184), (leg - 2, 203)], "#695342", 2)
            p.rect((xx + 14, 193, xx + 31, 197), "#8e785b", "#695645")
            p.line([(xx + 18, 198), (xx + 18, 203)], "#6a5848", 2)
        x += span
        bay += 1
    interior_floor(p, base="#b59b78", joint="#846c55", light="#d6bb91")
    clustered_patina(p, 50, 269, 404, strength=9, density=.19)
    return p.im


def dusk_scene(width: int) -> Image.Image:
    p = Painter.make(width, "dusk", "#8c7070")
    # Parents wait in the school corridor while the last sunset stays outside
    # the glass. Benches, notices and tea service belong to the back wall.
    p.rect((0, 0, width, 51), "#6f5c68")
    p.rect((0, 52, width, 163), "#c2937a")
    p.rect((0, 164, width, 204), "#856b66")
    p.rect((0, 47, width, 53), "#4f4a55")
    p.line([(0, 52), (width, 52)], "#e0b38b", 2)
    p.line([(0, 161), (width, 161)], "#785a57", 3)
    p.line([(0, 166), (width, 166)], "#bd8e73", 2)
    mottled_wall(p, 57, 160, "#c2937a", 12, step=11, density=.28)
    layout = rng_for("dusk", "parents-corridor-bays")
    x, bay = -21, 0
    while x < width:
        span = layout.choice((492, 521, 549))
        p.rect((x, 53, x + 6, 204), "#986f67", "#665257", 2)
        p.line([(x + 2, 58), (x + 2, 199)], "#e9b793")
        p.rect((x + 118, 24, x + 190, 32), "#5a5058", "#443f48", 2)
        p.rect((x + 127, 26, x + 181, 29), "#f0d2a0")
        p.line([(x + 122, 10), (x + 122, 23)], "#8d7471")
        p.line([(x + 187, 10), (x + 187, 23)], "#8d7471")
        for wx in (x + 22, x + 113):
            window(p, wx, 66, 69, 70, wall="#c2937a", frame="#694f50", pane="#bc816f", glow=True)
            p.rect((wx + 6, 72, wx + 62, 83), "#f1b481")
            p.rect((wx + 8, 109, wx + 61, 122), "#8e6c68")
            p.line([(wx + 9, 117), (wx + 60, 117)], "#715760", 2)
            p.rect((wx + 4, 74, wx + 10, 132), "#c9a087")
            p.rect((wx + 59, 74, wx + 64, 132), "#c9a087")
            p.poly([(wx + 8, 142), (wx + 61, 142), (wx + 96, 201), (wx + 39, 201)], "#b18b73")
        if bay % 2 == 0:
            door(p, x + 222, 86, 59, 118, wall="#c2937a", wood="#654b4a", frame="#604b4d", double=True)
            p.rect((x + 221, 63, x + 285, 76), "#87645b", "#6c5152", 2)
            p.rect((x + 229, 67, x + 277, 72), "#ddba96")
        else:
            p.rect((x + 215, 75, x + 294, 165), "#755b57", "#5a464a", 3)
            p.rect((x + 224, 84, x + 285, 155), "#c1a58a")
            for row in range(3):
                yy = 92 + row * 20
                p.rect((x + 230, yy, x + 250, yy + 14), "#ead5ad", "#a99278")
                p.rect((x + 257, yy + row % 2 * 2, x + 277, yy + 13), "#dbbe9b", "#a99278")
        p.rect((x + 327, 79, x + 460, 159), "#765b55", "#55494b", 3)
        p.rect((x + 335, 87, x + 452, 150), "#b18a70")
        for n in range(5):
            xx = x + 342 + n * 21
            p.rect((xx, 98 + n % 2 * 10, xx + 14, 123 + n % 2 * 10),
                   "#e7d0a6" if n % 2 else "#d9bc99", "#937e6f")
            p.line([(xx + 2, 105 + n % 2 * 10), (xx + 12, 105 + n % 2 * 10)], "#aa9a80")
        # Empty rear seating keeps the emotional beat, while the physical
        # bench hazards still sit visibly closer to the player's feet.
        bench(p, x + 57, 181, "#795d54", "#594f52", 72)
        if bay % 3 == 0:
            p.rect((x + 387, 172, x + 422, 179), "#6c5651", "#54494a")
            for leg in (x + 392, x + 417):
                p.line([(leg, 180), (leg, 202)], "#5b4b4b", 3)
            p.rect((x + 399, 159, x + 410, 170), "#a27b66", "#694f4d")
            p.rect((x + 402, 155, x + 407, 158), "#d8b69a")
            p.line([(x + 412, 162), (x + 423, 165)], "#d1b49b", 2)
        x += span
        bay += 1
    interior_floor(p, base="#977b70", joint="#715d5d", light="#c09b82")
    clustered_patina(p, 54, 269, 505, strength=9, density=.19)
    return p.im


def night_scene(width: int) -> Image.Image:
    p = Painter.make(width, "night", "#22303a")
    # Books and lamp arms now belong to a late-night study room rather than a
    # street. A few stars exist only behind the dark window glass.
    p.rect((0, 0, width, 51), "#172432")
    p.rect((0, 52, width, 162), "#34454a")
    p.rect((0, 163, width, 204), "#29363d")
    p.rect((0, 47, width, 53), "#4b4c4d")
    p.line([(0, 52), (width, 52)], "#856f5e", 2)
    p.line([(0, 161), (width, 161)], "#172932", 3)
    p.line([(0, 166), (width, 166)], "#5c6561", 2)
    mottled_wall(p, 56, 160, "#34454a", 14, step=10, density=.29)
    layout = rng_for("night", "study-bays")
    x, bay = -25, 0
    while x < width:
        span = layout.choice((484, 517, 546))
        p.rect((x, 50, x + 7, 204), "#25343c", "#152631", 2)
        p.line([(x + 3, 55), (x + 3, 200)], "#57605b")
        p.rect((x + 112, 24, x + 228, 32), "#393d42", "#1e2e37", 2)
        p.rect((x + 121, 26, x + 219, 29), "#a38d70")
        p.line([(x + 115, 9), (x + 115, 23)], "#54565a")
        p.line([(x + 225, 9), (x + 225, 23)], "#54565a")
        # Night outside is framed by a real interior sash and curtains.
        wx = x + 26
        p.rect((wx - 6, 69, wx + 104, 151), "#755d50", "#253139", 3)
        p.rect((wx, 76, wx + 98, 143), "#19283d", "#99806a", 2)
        for sx, sy in ((14, 13), (52, 22), (81, 10), (74, 39), (28, 49)):
            p.rect((wx + sx + bay % 3, 78 + sy, wx + sx + bay % 3 + 1, 79 + sy), "#b8aa8d")
        p.rect((wx + 48, 77, wx + 51, 143), "#6c655c")
        p.rect((wx + 2, 107, wx + 96, 109), "#6c655c")
        p.rect((wx + 2, 77, wx + 12, 139), "#53616a")
        p.rect((wx + 86, 77, wx + 96, 139), "#53616a")
        p.line([(wx - 9, 149), (wx + 107, 149)], "#98826c", 3)
        if bay % 3 == 2:
            # An occasional bed makes this a lived-in room, not an endless
            # library aisle. It remains behind the active 205px floor line.
            p.rect((x + 167, 83, x + 289, 130), "#5b564e", "#29343a", 3)
            p.rect((x + 173, 89, x + 283, 122), "#89958d")
            p.rect((x + 184, 97, x + 225, 114), "#c3b598")
            p.line([(x + 229, 101), (x + 271, 101)], "#b4a98e", 2)
            p.rect((x + 162, 142, x + 194, 203), "#66544a", "#31343a", 2)
            p.rect((x + 193, 172, x + 320, 200), "#797366", "#383f42", 3)
            p.rect((x + 200, 176, x + 314, 189), "#b9b09a")
            p.rect((x + 225, 178, x + 315, 195), "#5c7274")
            p.rect((x + 201, 176, x + 229, 187), "#d9c9ab")
            p.line([(x + 212, 193), (x + 307, 193)], "#394e56", 2)
        else:
            # Broad shelves have different paper and cloth spines in every bay.
            shelf_x, shelf_w = x + 160, 145
            p.rect((shelf_x, 67, shelf_x + shelf_w, 204), "#5e4f45", "#27343b", 3)
            p.rect((shelf_x + 5, 73, shelf_x + shelf_w - 5, 199), "#22343e")
            books = rng_for("night", "shelf", bay)
            for row, yy in enumerate((109, 144, 178)):
                p.rect((shelf_x + 4, yy, shelf_x + shelf_w - 4, yy + 5), "#755d4c", "#332f31")
                xx = shelf_x + 10
                while xx < shelf_x + shelf_w - 14:
                    bw = books.randint(3, 7)
                    hh = books.randint(16, 29)
                    col = books.choice(("#ad9275", "#b3a584", "#73817c", "#8a7161", "#606c71"))
                    p.rect((xx, yy - hh, xx + bw, yy - 2), col, shade(col, -26))
                    if books.random() < .7:
                        p.line([(xx + 1, yy - hh + 3), (xx + bw - 1, yy - hh + 3)], shade(col, 22))
                    xx += bw + books.randint(1, 3)
            p.rect((shelf_x + 10, 181, shelf_x + 44, 196), "#586966")
            p.rect((shelf_x + 17, 182, shelf_x + 31, 192), "#b7a27e")
        # Two rear desks and their lamps hint at long hours of study. The
        # lamp cones end at the back-wall skirting above the active floor.
        for dx in ((350,) if bay % 3 == 2 else (337, 440)):
            xx = x + dx
            p.poly([(xx + 17, 131), (xx + 31, 135), (xx + 70, 190), (xx - 15, 190)], "#4c4b45")
            p.rect((xx - 9, 174, xx + 81, 181), "#80654f", "#3c3e3b", 2)
            p.line([(xx - 2, 178), (xx + 75, 178)], "#ae8f6c")
            for leg in (xx + 1, xx + 73):
                p.line([(leg, 182), (leg - 2, 203)], "#5f5147", 3)
            p.line([(xx + 17, 172), (xx + 23, 139), (xx + 34, 129)], "#7b8276", 3)
            p.poly([(xx + 29, 127), (xx + 45, 135), (xx + 40, 141), (xx + 24, 136)], "#c9ad7d", "#655849")
            p.rect((xx + 7, 170, xx + 35, 173), "#d4c3a0", "#86715d")
            p.rect((xx + 50, 168, xx + 59, 173), "#9c826b", "#5d5350")
        if bay % 3 == 1:
            p.rect((x + 314, 76, x + 326, 101), "#a18a69", "#413d3d", 2)
            p.line([(x + 320, 83), (x + 320, 92)], "#49433e")
            p.line([(x + 320, 92), (x + 325, 88)], "#49433e")
        x += span
        bay += 1
    interior_floor(p, base="#62554d", joint="#403e3b", light="#8c7763", wood=True)
    clustered_patina(p, 53, 269, 606, strength=8, density=.20)
    return p.im


def graduate_scene(width: int) -> Image.Image:
    p = Painter.make(width, "graduate", "#8cc5d8")
    sky(p, "#84c3dc", "#d4e9d4", 143)
    distant_roofs(p, 127, ("#c8c0a3", "#958c77", "#7f8171"))
    p.rect((0, 149, width, 205), "#b18465")
    p.rect((0, 137, width, 149), "#806655")
    p.line([(0, 141), (width, 141)], "#e3bf90", 2)
    brick_courses(p, 151, 205, "#b18465", "#7f6251", 19)
    for x in range(7, width, 113):
        p.rect((x, 139, x + 7, 205), "#9b765d", "#695448")
        p.rect((x - 3, 136, x + 10, 141), "#d2af80", "#7a5d48")
    for gx in range(148, width, 746):
        p.rect((gx - 13, 112, gx + 112, 205), "#775d4b", "#493d36", 2)
        p.rect((gx - 9, 116, gx + 108, 133), "#b8946d", "#4b4139", 2)
        p.rect((gx - 1, 139, gx + 100, 205), "#303d3d", "#d1b78d", 2)
        for xx in range(gx + 5, gx + 99, 12):
            p.rect((xx, 140, xx + 2, 204), "#887866")
        p.rect((gx + 33, 119, gx + 67, 129), "#664e3e", "#d5c19a")
        p.line([(gx + 46, 140), (gx + 46, 205)], "#475150", 2)
    for x in range(62, width, 227):
        tree(p, x, 207, 159, 101, bark="#5d4a3c", leaf="#607452", seed=18)
    pavement(p, curb="#a18c71", walk="#b9ae91", road="#777b73")
    clustered_patina(p, 53, 267, 707, strength=9, density=.17)
    return p.im


def alley_scene(width: int) -> Image.Image:
    p = Painter.make(width, "alley", "#34485c")
    p.rect((0, 0, width, 205), "#3b4d5d")
    for y, c in ((11, "#2b4053"), (30, "#475a6b"), (54, "#263a4e"),
                 (77, "#526376"), (92, "#2e4052")):
        p.rect((0, y, width, y + 3), c)
    brick_courses(p, 94, 204, "#3b4d5d", "#314657", 22, 12)
    for x in range(2, width, 185):
        p.rect((x, 33, x + 5, 205), "#253a4a", "#1f3140")
        p.rect((x + 6, 66, x + 168, 73), "#617485", "#293b4b")
        window(p, x + 35, 95, 52, 61, wall="#3b4d5d", frame="#253b4c", pane="#536273")
        if (x // 185) % 3 == 0:
            door(p, x + 111, 119, 44, 86, wall="#3b4d5d", wood="#373e46", frame="#253845")
        else:
            window(p, x + 111, 102, 44, 51, wall="#3b4d5d", frame="#253b4c", pane="#566373")
        drain_pipe(p, x + 174, 14, 204, dark="#263c4d")
        p.rect((x + 12, 184, x + 27, 203), "#455153", "#293941")
        p.rect((x + 14, 180, x + 25, 185), "#546156")
    for x in range(0, width, 407):
        p.line([(x, 38), (x + 212, 52), (x + 390, 42)], "#1b2f40", 2)
        p.rect((x + 204, 49, x + 220, 53), "#646c69")
    pavement(p, curb="#65727a", walk="#536a7b", road="#344659", wet=True)
    clustered_patina(p, 5, 268, 808, strength=10, density=.25)
    return p.im


def playground_scene(width: int) -> Image.Image:
    p = Painter.make(width, "playground", "#a1d9e0")
    sky(p, "#86cddc", "#e2e9d1", 160)
    distant_roofs(p, 142, ("#c7baa0", "#a28872", "#908c7a"))
    p.rect((0, 154, width, 207), "#9bae8c")
    for x in range(13, width, 182):
        p.rect((x, 121, x + 146, 192), "#ddd0ac", "#9b9982", 2)
        p.poly([(x - 3, 121), (x + 28, 107), (x + 144, 111), (x + 150, 122)], "#9e7f6d", "#716e62")
        for wx in range(x + 13, x + 139, 28):
            window(p, wx, 136, 18, 25, wall="#ddd0ac", frame="#918676", pane="#8ea3a2")
        p.rect((x + 56, 168, x + 83, 191), "#8f8d76", "#726f66")
    for x in range(101, width, 211):
        tree(p, x, 210, 86, 70, bark="#6b6c58", leaf="#68936a", seed=13)
    fence(p, 208, dark="#5b7667", light="#8ca58a", gap=17, height=24)
    pavement(p, curb="#b6a073", walk="#bb926b", road="#b45e50", track=True)
    clustered_patina(p, 99, 268, 909, strength=8, density=.15)
    return p.im


def dream_scene(width: int) -> Image.Image:
    p = Painter.make(width, "dream", "#c6b9e5")
    sky(p, "#baa8df", "#eee1db", 153)
    p.rect((0, 146, width, 205), "#e0c6af")
    p.rect((0, 136, width, 148), "#c5a49e")
    p.line([(0, 139), (width, 139)], "#eee0c2", 2)
    for x in range(10, width, 106):
        p.rect((x, 139, x + 7, 205), "#cda99c", "#ad938e")
        window(p, x + 23, 157, 35, 35, wall="#e0c6af", frame="#a38f8c", pane="#b4abae", glow=True)
        if (x // 106) % 3 == 1:
            door(p, x + 70, 154, 23, 51, wall="#e0c6af", wood="#ae9b96", frame="#a18a83")
    for x in range(127, width, 289):
        tree(p, x, 207, 93, 53, bark="#767079", leaf="#858294", seed=5, pale=True)
    pavement(p, curb="#b5a1ad", walk="#a996ad", road="#8c819a")
    clustered_patina(p, 97, 267, 1001, strength=7, density=.13)
    return p.im


def heaven_scene(width: int) -> Image.Image:
    p = Painter.make(width, "heaven", "#f1e3c1")
    sky(p, "#bcdadd", "#fff0c9", 169)
    distant_roofs(p, 151, ("#d3bfa1", "#a89580", "#b6a38a"))
    p.rect((0, 175, width, 205), "#b8ad86")
    for x in range(60, width, 196):
        tree(p, x, 202, 89, 68, bark="#8c7459", leaf="#aa9d73", seed=3, pale=True)
    fence(p, 207, dark="#92876c", light="#d1be99", gap=22, height=23)
    pavement(p, curb="#c9b68b", walk="#e8d8aa", road="#d8c5a0")
    for x in range(30, width, 147):
        p.line([(x, 254), (x + 33, 254)], "#f7e6bd", 2)
    clustered_patina(p, 118, 267, 1102, strength=7, density=.12)
    return p.im


def dead_tree(p: Painter, x: int, foot: int, top: int, seed: int) -> None:
    r = rng_for("hell", "tree", seed)
    p.poly([(x - 7, foot), (x - 3, top + 19), (x + 2, top + 12), (x + 7, foot)], "#362d2d", "#211e23")
    for side in (-1, 1):
        for i in range(3):
            start_y = top + 32 + i * 16
            end_x = x + side * r.randint(20, 39)
            end_y = top + 7 + i * 11
            p.line([(x, start_y), (end_x, end_y), (end_x + side * 6, end_y - 10)], "#332b2c", 3 - i // 2)


def hell_scene(width: int) -> Image.Image:
    p = Painter.make(width, "hell", "#24272e")
    sky(p, "#1e242d", "#51433f", 139)
    p.rect((0, 131, width, 205), "#514542")
    p.rect((0, 124, width, 134), "#2b2c30")
    brick_courses(p, 136, 204, "#514542", "#3b3434", 25, 11)
    for x in range(17, width, 165):
        p.rect((x, 137, x + 45, 172), "#302f32", "#231f24", 2)
        p.line([(x + 7, 145), (x + 38, 164)], "#6b5146", 2)
        p.line([(x + 38, 145), (x + 8, 164)], "#3c3a3b", 2)
        p.poly([(x + 90, 198), (x + 105, 183), (x + 132, 199), (x + 150, 205), (x + 88, 205)], "#372e2d")
        for xx in range(x + 92, x + 139, 12):
            p.line([(xx, 194), (xx + 5, 198)], "#7c5646")
    for x in range(90, width, 243):
        dead_tree(p, x, 205, 60 + (x // 243) % 3 * 7, x)
    pavement(p, curb="#544a46", walk="#5a4d49", road="#393638")
    r = rng_for("hell", "embers")
    for _ in range(width // 35):
        x = r.randrange(width); y = r.randrange(50, 191)
        p.rect((x, y, x + 1, y + 1), r.choice(("#97705c", "#b7835b", "#5e5150")))
    clustered_patina(p, 127, 268, 1203, strength=10, density=.16)
    return p.im


SCENE_DRAWERS = {
    "dawn": dawn_scene, "rain": rain_scene, "noon": noon_scene, "gray": gray_scene,
    "dusk": dusk_scene, "night": night_scene, "graduate": graduate_scene,
    "alley": alley_scene, "playground": playground_scene, "dream": dream_scene,
    "heaven": heaven_scene, "hell": hell_scene,
}


def theme_accents(p: Painter) -> None:
    """Small non-colliding story traces; placement is continuous across cuts."""
    r = rng_for(p.theme, "accents")
    for index, x in enumerate(range(83, p.width - 35, 326)):
        xx = x + r.randint(-20, 20)
        if p.theme == "dawn":
            p.rect((xx, 164, xx + 22, 181), "#806449", "#4f4b42", 2)
            p.rect((xx + 3, 167, xx + 19, 176), "#c7af82")
            p.line([(xx + 5, 171), (xx + 16, 171)], "#857a62")
            p.line([(xx + 5, 174), (xx + 13, 174)], "#857a62")
        elif p.theme == "rain":
            p.rect((xx, 87, xx + 56, 101), "#26394a", "#73818c", 2)
            p.line([(xx + 6, 93), (xx + 48, 93)], "#9f8a75", 2)
            p.line([(xx + 9, 97), (xx + 28, 97)], "#657682")
            p.rect((xx + 14, 76, xx + 17, 86), "#37495b")
            p.rect((xx + 45, 76, xx + 48, 86), "#37495b")
            if index % 2 == 0:
                p.poly([(xx + 60, 101), (xx + 101, 101), (xx + 109, 115), (xx + 52, 115)], "#526477", "#293e50")
                for stripe in range(xx + 57, xx + 108, 12):
                    p.line([(stripe, 103), (stripe - 2, 114)], "#8793a0")
        elif p.theme == "noon":
            p.rect((xx, 89, xx + 30, 111), "#765b46", "#e4c390", 2)
            p.rect((xx + 4, 93, xx + 25, 105), "#415852")
            p.line([(xx + 6, 98), (xx + 17, 98)], "#b5bb99")
            p.line([(xx + 7, 102), (xx + 22, 102)], "#b5bb99")
        elif p.theme == "gray":
            p.rect((xx, 88, xx + 25, 119), "#8c8f86", "#596265", 2)
            p.rect((xx + 3, 91, xx + 22, 114), "#d0c9b1")
            p.line([(xx + 6, 96), (xx + 19, 96)], "#8d948b")
            p.line([(xx + 6, 102), (xx + 17, 102)], "#8d948b")
            p.line([(xx + 6, 108), (xx + 20, 108)], "#8d948b")
        elif p.theme == "dusk":
            p.rect((xx, 154, xx + 20, 168), "#8a695b", "#644a46")
            p.rect((xx + 2, 157, xx + 17, 162), "#c69c73")
            p.line([(xx - 5, 144), (xx + 25, 146)], "#6a5351")
            for peg in (xx, xx + 12, xx + 24):
                p.rect((peg, 146, peg + 2, 149), "#9b775a")
        elif p.theme == "night":
            p.rect((xx, 134, xx + 17, 144), "#59605d", "#202d36")
            p.line([(xx + 4, 139), (xx + 13, 139)], "#aaa17c")
            p.rect((xx + 2, 176, xx + 28, 178), "#2b393d")
        elif p.theme == "graduate":
            p.line([(xx - 20, 117), (xx + 65, 123)], "#836d57")
            for dx in range(0, 70, 15):
                col = "#c8a878" if (dx // 15) % 2 else "#8d9a81"
                p.poly([(xx + dx, 120), (xx + dx + 10, 121),
                        (xx + dx + 5, 131)], col)
            p.rect((xx - 11, 171, xx + 13, 183), "#9d775f", "#6f574b")
        elif p.theme == "alley":
            p.rect((xx, 115, xx + 22, 143), "#64717a", "#293c4d", 2)
            p.rect((xx + 3, 119, xx + 18, 139), "#bdafa0")
            p.line([(xx + 5, 123), (xx + 16, 123)], "#667678")
            p.line([(xx + 5, 128), (xx + 14, 128)], "#667678")
            p.rect((xx + 42, 176, xx + 66, 198), "#4b5659", "#273c4d")
            p.rect((xx + 40, 173, xx + 68, 177), "#687171")
        elif p.theme == "playground":
            p.rect((xx, 169, xx + 3, 207), "#667c70")
            p.poly([(xx + 3, 170), (xx + 21, 174), (xx + 3, 180)], "#d8b083")
            p.line([(xx + 35, 247), (xx + 66, 247)], "#d8a487", 2)
        elif p.theme == "dream":
            for dx, dy in ((0, 90), (18, 74), (41, 105)):
                p.rect((xx + dx, dy, xx + dx + 1, dy + 5), "#f2e5d3")
                p.rect((xx + dx - 2, dy + 2, xx + dx + 3, dy + 3), "#f2e5d3")
        elif p.theme == "heaven":
            p.line([(xx, 87), (xx + 4, 84), (xx + 8, 87)], "#a89e8b")
            p.line([(xx + 16, 75), (xx + 20, 73), (xx + 24, 75)], "#a89e8b")
            p.line([(xx - 10, 227), (xx + 34, 227)], "#f6e8c3")
        elif p.theme == "hell":
            p.line([(xx, 189), (xx + 9, 193), (xx + 17, 189), (xx + 27, 197)], "#251f23", 2)
            p.line([(xx + 9, 193), (xx + 8, 203)], "#76504a")
            p.rect((xx + 35, 161, xx + 40, 166), "#a16952")


def save_scroll(theme: str, count: int) -> list[Path]:
    width = TILE_W + (count - 1) * TILE_STRIDE
    im = SCENE_DRAWERS[theme](width)
    theme_accents(Painter(im, ImageDraw.Draw(im), width, theme))
    paths: list[Path] = []
    for i in range(count):
        crop = im.crop((i * TILE_STRIDE, 0, i * TILE_STRIDE + TILE_W, 270))
        path = DEST / "scroll" / theme / f"{i:02d}.png"
        path.parent.mkdir(parents=True, exist_ok=True)
        crop.resize((2048, 540), Image.Resampling.NEAREST).save(path, optimize=True)
        paths.append(path)
    return paths


CHOICE_THEMES = {
    "01": "dawn", "02": "rain", "03": "noon", "04": "gray",
    "05": "dusk", "06": "night", "alley": "alley",
}


def choice_scene(choice: str) -> Image.Image:
    theme = CHOICE_THEMES[choice]
    im = SCENE_DRAWERS[theme](1280)
    p = Painter(im, ImageDraw.Draw(im), 1280, theme)
    theme_accents(p)
    if choice == "01":
        # School gateway, low enough to leave the runner and exit legible.
        p.rect((968, 120, 1105, 154), "#a78261", "#59493d", 3)
        p.rect((982, 129, 1093, 147), "#624b3c", "#dec39b", 2)
        for x in range(990, 1090, 16):
            p.rect((x, 151, x + 4, 205), "#71634e")
        p.line([(959, 150), (1113, 150)], "#d5ae75", 2)
        p.rect((965, 204, 1110, 208), "#6d6051")
    elif choice == "02":
        p.rect((870, 87, 1027, 205), "#a7987a", "#4b5361", 3)
        p.rect((881, 103, 1016, 205), "#d7c6a4", "#5d5c59", 3)
        door(p, 913, 121, 67, 84, wall="#d7c6a4", wood="#86694d", frame="#5e5851", double=True)
        p.rect((882, 84, 1014, 93), "#d6bc92", "#5c6470")
        for x in range(887, 1012, 19):
            p.line([(x, 96), (x - 5, 111)], "#75899a")
        streetlamp(p, 842, 207, 120, stem="#455263", light="#d6b687")
    elif choice == "03":
        p.rect((870, 111, 1009, 177), "#775941", "#e4c69a", 3)
        p.rect((878, 119, 1001, 169), "#64705a")
        for i in range(5):
            x = 884 + 22 * i
            p.rect((x, 125 + i % 2 * 4, x + 15, 145 + i % 3 * 5),
                   "#e8d6ad" if i % 2 else "#d6b888", "#aa9475")
            p.rect((x + 6, 124 + i % 2 * 4, x + 7, 127 + i % 2 * 4), "#9a5943")
        bench(p, 1044, 185, "#795a3e", "#574d43", 67)
    elif choice == "04":
        p.rect((861, 75, 1019, 204), "#969e98", "#626f72", 3)
        p.rect((869, 83, 1011, 101), "#d2c8b5", "#5e6668", 2)
        door(p, 901, 110, 72, 95, wall="#aeb4ab", wood="#575c59", frame="#425256", double=True)
        p.rect((877, 115, 895, 137), "#8b907f", "#5b6969")
        p.line([(880, 121), (891, 121)], "#d0cabb")
        p.line([(880, 126), (891, 126)], "#d0cabb")
    elif choice == "05":
        p.rect((835, 128, 1050, 205), "#9a705a", "#614a47", 3)
        p.poly([(825, 133), (926, 104), (1047, 130), (1056, 138)], "#5e4a4c", "#d1a076")
        p.rect((872, 147, 1009, 203), "#b68868", "#6d524b", 2)
        door(p, 914, 153, 51, 52, wall="#b68868", wood="#5f4945", frame="#534648", double=True)
        streetlamp(p, 1087, 208, 125, stem="#594844", light="#e7ad70")
    elif choice == "06":
        p.rect((872, 118, 1045, 205), "#324048", "#182833", 3)
        p.rect((894, 135, 1022, 205), "#59605c", "#28343a", 2)
        door(p, 925, 143, 61, 62, wall="#59605c", wood="#30343b", frame="#2b3238", double=True)
        for x in (884, 1034):
            streetlamp(p, x, 207, 137, stem="#28373f", light="#d0a56d")
    else:
        p.rect((785, 91, 927, 205), "#314758", "#1e3443", 3)
        door(p, 828, 117, 56, 88, wall="#314758", wood="#3e484c", frame="#263846")
        p.rect((794, 98, 915, 104), "#75818d", "#25394a", 2)
        streetlamp(p, 972, 206, 114, stem="#263c49", light="#b9aaa0")
    return im


def save_choice() -> list[Path]:
    paths = []
    for choice in CHOICE_THEMES:
        path = DEST / "choice" / f"{choice}.png"
        path.parent.mkdir(parents=True, exist_ok=True)
        choice_scene(choice).resize((2560, 540), Image.Resampling.NEAREST).save(path, optimize=True)
        paths.append(path)
    return paths


def corridor_scene() -> Image.Image:
    p = Painter.make(480, "corridor", "#ede9d9")
    p.rect((0, 0, 479, 42), "#eae5d2")
    p.rect((0, 43, 479, 205), "#e4dfc9")
    p.rect((0, 159, 479, 205), "#aab9a7")
    p.rect((0, 40, 479, 43), "#b5a77f")
    p.rect((0, 44, 479, 48), "#d7c69a")
    p.rect((0, 157, 479, 160), "#7f947d")
    p.rect((0, 202, 479, 207), "#798d7c")
    for x in (0, 77, 151, 225, 299, 373, 451):
        p.rect((x, 48, x + 4, 205), "#d0cbb5", "#b7b29d")
        p.line([(x + 2, 53), (x + 2, 152)], "#f1e9d1")
        p.rect((x - 3, 49, x + 7, 53), "#d1c3a2")
    for x in (67, 141, 215, 289, 363):
        p.rect((x - 10, 77, x + 10, 84), "#9b815e", "#685846", 2)
        p.rect((x - 6, 79, x + 6, 81), "#edd8a9")
        p.line([(x, 71), (x, 76)], "#8b775b", 2)
    for x in (6, 80, 154, 228, 302, 376, 450):
        p.rect((x, 168, x + 7, 197), "#9ba991")
        p.line([(x + 1, 171), (x + 1, 194)], "#cfdbb8")
    p.rect((0, 208, 479, 269), "#c6bfa8")
    p.line([(0, 208), (479, 208)], "#797d69", 2)
    p.line([(0, 213), (479, 213)], "#e3d8b8", 2)
    for y in (227, 246, 267):
        p.line([(0, y), (479, y)], "#a79f88", 2)
    for row, y in enumerate((214, 228, 247)):
        for x in range(-40 + (row % 2) * 28, 480, 60):
            p.line([(x, y), (x + 12, min(269, y + 18))], "#a89e88")
    clustered_patina(p, 49, 266, 1304, strength=6, density=.16)
    return p.im


def save_standbys() -> list[Path]:
    paths = []
    for theme in SCROLL_COUNTS:
        source_size = Image.open(SOURCE / f"{theme}.png").size
        tile = Image.open(DEST / "scroll" / theme / "00.png").convert("RGB")
        logical = tile.resize((1024, 270), Image.Resampling.NEAREST).crop((0, 0, 480, 270))
        path = DEST / f"{theme}.png"
        logical.resize(source_size, Image.Resampling.NEAREST).save(path, optimize=True)
        paths.append(path)
    corridor = corridor_scene()
    for name in ("corridor-detail-v3.png", "corridor.png"):
        size = Image.open(SOURCE / name).size
        path = DEST / name
        corridor.resize(size, Image.Resampling.NEAREST).save(path, optimize=True)
        paths.append(path)
    return paths


def contact_sheet(themes: list[str], suffix: str) -> Path:
    QA.mkdir(parents=True, exist_ok=True)
    font = ImageFont.truetype("C:/Windows/Fonts/msyh.ttc", 16)
    sheet = Image.new("RGB", (1020, len(themes) * 300 + 20), "#e6e3d8")
    d = ImageDraw.Draw(sheet)
    for i, theme in enumerate(themes):
        before = Image.open(SOURCE / "scroll" / theme / "00.png").convert("RGB")
        after = Image.open(DEST / "scroll" / theme / "00.png").convert("RGB")
        for col, (label, image) in enumerate((("before", before), ("after", after))):
            x = 10 + col * 500
            y = 28 + i * 300
            sheet.paste(image.crop((0, 0, 960, 540)).resize((480, 270), Image.Resampling.NEAREST), (x, y))
            d.text((x, y - 22), f"{theme} {label}", font=font, fill="#263b3b")
    path = QA / suffix
    sheet.save(path)
    return path


def all_contact(paths: list[Path]) -> list[Path]:
    QA.mkdir(parents=True, exist_ok=True)
    font = ImageFont.truetype("C:/Windows/Fonts/msyh.ttc", 13)
    results = []
    for page in range((len(paths) + 39) // 40):
        subset = paths[page * 40:(page + 1) * 40]
        rows = (len(subset) + 7) // 8
        sheet = Image.new("RGB", (8 * 250, rows * 172 + 8), "#e8e3d7")
        d = ImageDraw.Draw(sheet)
        for i, path in enumerate(subset):
            im = Image.open(path).convert("RGB")
            crop = im.crop((0, 0, min(im.width, im.height * 16 // 9), im.height))
            crop = crop.resize((240, 135), Image.Resampling.NEAREST)
            x = (i % 8) * 250 + 5
            y = (i // 8) * 172 + 27
            sheet.paste(crop, (x, y))
            label = str(path.relative_to(DEST)).replace("\\", "/")
            d.text((x, y - 19), label[-30:], font=font, fill="#243c38")
        out = QA / f"all-77-contact-{page + 1}.png"
        sheet.save(out)
        results.append(out)
    return results


def verify_outputs(paths: list[Path]) -> dict[str, object]:
    expected = {
        *(f"scroll/{theme}/{i:02d}.png" for theme, n in SCROLL_COUNTS.items() for i in range(n)),
        *(f"choice/{id}.png" for id in CHOICE_THEMES),
        *(f"{theme}.png" for theme in SCROLL_COUNTS),
        "corridor-detail-v3.png", "corridor.png",
    }
    actual = {str(p.relative_to(DEST)).replace("\\", "/") for p in paths}
    assert len(expected) == 77, len(expected)
    assert actual == expected, {"missing": sorted(expected - actual), "extra": sorted(actual - expected)}
    sizes = {}
    grid_ok = True
    for path in paths:
        relative = path.relative_to(DEST)
        source = SOURCE / relative
        with Image.open(source) as before, Image.open(path) as after:
            assert after.size == before.size, (relative, after.size, before.size)
            assert after.mode == "RGB", (relative, after.mode)
            sizes[str(relative).replace("\\", "/")] = after.size
            if relative.parts[0] in ("scroll", "choice"):
                half = after.resize((after.width // 2, after.height // 2), Image.Resampling.NEAREST)
                restored = half.resize(after.size, Image.Resampling.NEAREST)
                grid_ok = grid_ok and ImageChops.difference(after, restored).getbbox() is None
    assert grid_ok, "one of the 2x pixel images does not stay on its authored grid"
    joins = []
    for theme, count in SCROLL_COUNTS.items():
        for index in range(count - 1):
            a = Image.open(DEST / "scroll" / theme / f"{index:02d}.png")
            b = Image.open(DEST / "scroll" / theme / f"{index + 1:02d}.png")
            diff = ImageChops.difference(a.crop((1920, 0, 2048, 540)), b.crop((0, 0, 128, 540)))
            assert diff.getbbox() is None, (theme, index)
            joins.append(f"{theme}:{index:02d}-{index + 1:02d}")
    report = {
        "schema": "fusheng.background-clear-v7.qa.v1",
        "generatedCount": len(paths), "expectedCount": 77,
        "scrollCount": sum(SCROLL_COUNTS.values()), "choiceCount": len(CHOICE_THEMES),
        "singleCount": len(SCROLL_COUNTS) + 2,
        "sourceDimensionsIdentical": True, "nearestPixelGrid": grid_ok,
        "floorTopLogicalY": FLOOR, "seamOverlapSourcePixels": 128,
        "seamsChecked": len(joins), "seamsExact": True,
        "seamPairs": joins, "dimensions": sizes,
    }
    QA.mkdir(parents=True, exist_ok=True)
    (QA / "asset-qa.json").write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding="utf-8")
    return report


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--sample", action="store_true", help="Only dawn/rain/gray prototype")
    args = parser.parse_args()
    themes = ["dawn", "rain", "gray"] if args.sample else list(SCENE_DRAWERS)
    paths = []
    for theme in themes:
        group = save_scroll(theme, SCROLL_COUNTS[theme])
        paths.extend(group)
        print(f"{theme}: {len(group)} strips -> {group[0].parent}")
    if args.sample:
        print(contact_sheet(themes, "prototype-three-themes.png"))
    else:
        paths.extend(save_choice())
        paths.extend(save_standbys())
        print(verify_outputs(paths))
        print(*all_contact(paths), sep="\n")
        print(contact_sheet(themes, "before-after-12-themes.png"))


if __name__ == "__main__":
    main()
