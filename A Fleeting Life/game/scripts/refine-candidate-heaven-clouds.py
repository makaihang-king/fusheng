"""Give the clear-v7 heaven reward an actual pixel cloud sea and light shafts.

The supplied background bypasses Renderer.ts's procedural heaven fallback, so
these details must live in the scrolling plates.  Keep the bottom 18 logical
rows textured: SceneGround.ts reuses those rows as the game's contact plane.
"""

from __future__ import annotations

import runpy
from pathlib import Path
from random import Random

from PIL import Image, ImageChops, ImageDraw, ImageStat


ROOT = Path(__file__).resolve().parents[1]
SCENE = ROOT / "assets/resources/art/pixel/scene"
CANDIDATE = SCENE / "clear-v7"
QA = ROOT / "build/qa/background-clear-v7"
TILE_WIDTH = 1024
TILE_STRIDE = 960
COUNT = 5
WIDTH = TILE_WIDTH + (COUNT - 1) * TILE_STRIDE
NEAREST = Image.Resampling.NEAREST
BEAMS = (210, 585, 1030, 1430, 1835, 2280, 2720, 3155, 3595, 4070, 4590)


def render_base() -> Image.Image:
    module = runpy.run_path(str(ROOT / "scripts/generate-clear-pixel-backgrounds.py"))
    image = module["heaven_scene"](WIDTH)
    module["theme_accents"](module["Painter"](image, ImageDraw.Draw(image), WIDTH, "heaven"))
    return image


def cloud_shape(cx: int, top: int, half: int, base: int) -> list[tuple[int, int]]:
    """Uneven stepped silhouette, deliberately resolved on the 480px pixel grid."""
    return [
        (cx - half, base), (cx - half, top + 22),
        (cx - half + 7, top + 22), (cx - half + 7, top + 15),
        (cx - half + 18, top + 15), (cx - half + 18, top + 9),
        (cx - half + 33, top + 9), (cx - half + 33, top + 5),
        (cx - 17, top + 5), (cx - 17, top + 1),
        (cx + 8, top + 1), (cx + 8, top + 4),
        (cx + half - 38, top + 4), (cx + half - 38, top + 10),
        (cx + half - 19, top + 10), (cx + half - 19, top + 16),
        (cx + half - 5, top + 16), (cx + half - 5, top + 22),
        (cx + half, top + 22), (cx + half, base),
    ]


def cloud_band(width: int, *, seed: int, base: int, top: int, pitch: int,
               color: tuple[int, int, int], shade: tuple[int, int, int],
               alpha: int) -> Image.Image:
    layer = Image.new("RGBA", (width, 270), (0, 0, 0, 0))
    d = ImageDraw.Draw(layer)
    rng = Random(seed)
    d.rectangle((0, base, width, 205), fill=(*color, alpha))
    centers: list[tuple[int, int, int]] = []
    for cx in range(-80, width + 110, pitch):
        center = cx + rng.randrange(-24, 25)
        cloud_top = top + rng.randrange(-8, 9)
        half = rng.randrange(53, 77)
        centers.append((center, cloud_top, half))
        d.polygon(cloud_shape(center, cloud_top, half, base), fill=(*color, alpha))
        # Little bright pixel terraces give scale without a blurred gradient.
        d.rectangle((center - 20, cloud_top + 3, center + 11, cloud_top + 5),
                    fill=(250, 249, 227, min(235, alpha + 12)))
        d.rectangle((center - half + 20, cloud_top + 12, center - half + 42, cloud_top + 13),
                    fill=(248, 246, 224, min(220, alpha + 8)))
    for cx, cloud_top, half in centers:
        d.rectangle((cx - half + 5, base - 4, cx + half - 5, base - 2),
                    fill=(*shade, max(35, alpha - 85)))
    return layer


def paint_cloud_sea(image: Image.Image) -> Image.Image:
    scene = image.convert("RGBA")
    for spec in (
        dict(seed=510, base=149, top=105, pitch=122, color=(181, 210, 205),
             shade=(157, 190, 190), alpha=142),
        dict(seed=910, base=180, top=130, pitch=146, color=(216, 226, 211),
             shade=(188, 208, 198), alpha=199),
        dict(seed=1310, base=205, top=163, pitch=118, color=(238, 234, 212),
             shade=(213, 216, 199), alpha=225),
    ):
        scene = Image.alpha_composite(scene, cloud_band(WIDTH, **spec))
    # Broken off-clouds below the sky retain depth above the broad sea.
    high = Image.new("RGBA", (WIDTH, 270), (0, 0, 0, 0))
    d = ImageDraw.Draw(high)
    rng = Random(4714)
    for cx in range(74, WIDTH, 260):
        x = cx + rng.randrange(-29, 30)
        y = 68 + rng.randrange(0, 23)
        d.polygon(cloud_shape(x, y, rng.randrange(38, 53), y + 21),
                  fill=(239, 245, 229, 81))
        d.rectangle((x - 16, y + 3, x + 8, y + 4), fill=(253, 250, 232, 97))
    return Image.alpha_composite(scene, high)


def paint_light(image: Image.Image) -> Image.Image:
    # Rays cross all three cloud strata and visibly meet the upper street edge.
    outer = Image.new("RGBA", (WIDTH, 270), (0, 0, 0, 0))
    d = ImageDraw.Draw(outer)
    for i, base_x in enumerate(BEAMS):
        top_x = base_x + (-35 if i % 3 == 0 else 18 if i % 3 == 1 else -11)
        spread = 57 + (i % 3) * 9
        d.polygon([(top_x - 5, 8), (top_x + 6, 8),
                   (base_x + spread, 205), (base_x - spread, 205)],
                  fill=(255, 250, 218, 35))
        d.polygon([(top_x - 2, 26), (top_x + 3, 26),
                   (base_x + spread // 2, 205), (base_x - spread // 2, 205)],
                  fill=(255, 251, 226, 65))
        d.polygon([(top_x, 67), (top_x + 2, 67),
                   (base_x + 12, 205), (base_x - 12, 205)],
                  fill=(255, 252, 234, 83))
        # Small offset glints read as soft scattered light, not solid pillars.
        d.rectangle((base_x - 38, 191, base_x + 37, 193), fill=(255, 249, 215, 65))
        d.rectangle((base_x - 26, 198, base_x + 27, 200), fill=(255, 251, 226, 91))
        d.rectangle((base_x - 17, 203, base_x + 18, 204), fill=(255, 253, 233, 100))
    scene = Image.alpha_composite(image, outer)

    # SceneGround repeatedly samples y=252..269. Very light localized tint
    # preserves the pavement texture while extending the glow into those bands.
    ground = Image.new("RGBA", (WIDTH, 270), (0, 0, 0, 0))
    gd = ImageDraw.Draw(ground)
    for base_x in BEAMS:
        gd.rectangle((base_x - 59, 252, base_x + 59, 269), fill=(255, 246, 214, 28))
        gd.rectangle((base_x - 32, 252, base_x + 32, 269), fill=(255, 250, 223, 52))
        gd.rectangle((base_x - 13, 252, base_x + 13, 269), fill=(255, 252, 234, 76))
    return Image.alpha_composite(scene, ground)


def simulate_runtime_floor(image: Image.Image, camera: int) -> Image.Image:
    """Approximate SceneGround.imageRegion for visual QA at a fixed camera."""
    frame = image.crop((camera, 0, camera + 480, 270)).copy()
    for band, y in enumerate(range(205, 270, 18)):
        h = min(18, 270 - y)
        offset = min(WIDTH - 480, camera + band * 29)
        frame.paste(image.crop((offset, 252, offset + 480, 252 + h)), (0, y))
    border = Image.new("RGBA", (480, 270), (0, 0, 0, 0))
    bd = ImageDraw.Draw(border)
    bd.rectangle((0, 205, 479, 206), fill=(32, 37, 33, 48))
    bd.rectangle((0, 207, 479, 207), fill=(246, 230, 191, 33))
    return Image.alpha_composite(frame.convert("RGBA"), border).convert("RGB")


def reward_legibility_preview(image: Image.Image) -> Image.Image:
    camera = 680
    frame = simulate_runtime_floor(image, camera).convert("RGBA")
    glows = Image.new("RGBA", (480, 270), (0, 0, 0, 0))
    d = ImageDraw.Draw(glows)
    reward_time = camera / 72
    for i in range(18):
        x = round(96 + (3 + i * 3 - reward_time) * 72)
        if not 0 <= x <= 480:
            continue
        h = 18 + (i % 3) * 27
        cy = 216 - h
        d.ellipse((x - 10, cy - 10, x + 10, cy + 10), fill=(255, 241, 210, 122))
        d.polygon([(x - 5, cy - 3), (x + 5, cy - 3),
                   (x + 5, cy + 5), (x - 5, cy + 5)], fill=(237, 217, 162, 255))
    frame = Image.alpha_composite(frame, glows)
    actor_path = ROOT / "assets/resources/art/pixel/character/hd/run/00.png"
    actor = Image.open(actor_path).convert("RGBA").resize((48, 48), NEAREST)
    frame.alpha_composite(actor, (72, 172))
    return frame.convert("RGB")


def save_images(original: Image.Image, final: Image.Image) -> None:
    base = CANDIDATE / "scroll/heaven"
    QA.mkdir(parents=True, exist_ok=True)
    contact = Image.new("RGB", (2048, COUNT * 270), "#efe6d4")
    d = ImageDraw.Draw(contact)
    for i in range(COUNT):
        box = (i * TILE_STRIDE, 0, i * TILE_STRIDE + TILE_WIDTH, 270)
        old = original.crop(box)
        new = final.crop(box)
        contact.paste(old, (0, i * 270))
        contact.paste(new, (1024, i * 270))
        d.rectangle((0, i * 270, 110, i * 270 + 15), fill="#514f49")
        d.rectangle((1024, i * 270, 1134, i * 270 + 15), fill="#514f49")
        d.text((4, i * 270 + 3), f"HEAVEN {i:02} BEFORE", fill="#fff7e2")
        d.text((1028, i * 270 + 3), f"HEAVEN {i:02} AFTER", fill="#fff7e2")
        new.resize((2048, 540), NEAREST).save(base / f"{i:02d}.png", optimize=True)
    contact.save(QA / "heaven-cloud-sea-contact.png", optimize=True)

    standby_size = Image.open(SCENE / "heaven.png").size
    final.crop((0, 0, 480, 270)).resize(standby_size, NEAREST).save(
        CANDIDATE / "heaven.png", optimize=True)
    runtime = Image.new("RGB", (960, 1620), "#ede5d5")
    for row, camera in enumerate((0, 680, 1860)):
        runtime.paste(simulate_runtime_floor(final, camera).resize((960, 540), NEAREST),
                      (0, row * 540))
    runtime.save(QA / "heaven-ground-runtime-simulation.png", optimize=True)
    reward_legibility_preview(final).resize((960, 540), NEAREST).save(
        QA / "heaven-reward-legibility.png", optimize=True)

    tiles = [Image.open(base / f"{i:02d}.png").convert("RGB") for i in range(COUNT)]
    for i in range(COUNT - 1):
        assert ImageChops.difference(tiles[i].crop((1920, 0, 2048, 540)),
                                     tiles[i + 1].crop((0, 0, 128, 540))).getbbox() is None
    standby = Image.open(CANDIDATE / "heaven.png").convert("RGB")
    assert standby.size == standby_size
    assert ImageChops.difference(standby.resize((480, 270), NEAREST),
                                 final.crop((0, 0, 480, 270))).getbbox() is None

    old_strip = original.crop((0, 252, WIDTH, 270))
    new_strip = final.crop((0, 252, WIDTH, 270))
    mean_delta = sum(ImageStat.Stat(ImageChops.difference(old_strip, new_strip)).mean) / 3
    assert mean_delta < 5, f"ground material changed too far: {mean_delta:.2f}"
    print(f"heaven: 5 plates, 4/4 seams exact, standby {standby_size}, "
          f"bottom-strip mean RGB delta {mean_delta:.2f}")


def main() -> None:
    base = render_base()
    final = paint_light(paint_cloud_sea(base).convert("RGBA")).convert("RGB")
    save_images(base, final)


if __name__ == "__main__":
    main()
