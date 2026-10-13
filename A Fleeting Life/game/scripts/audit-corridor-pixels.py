#!/usr/bin/env python3
"""从 Content.ts 登记的小满像素帧生成并核对回廊脱落格。"""

from __future__ import annotations

import argparse
import re
import sys
from collections import Counter
from pathlib import Path

from PIL import Image


GAME = Path(__file__).resolve().parents[1]
CONTENT = GAME / "assets/scripts/Content.ts"
ART = GAME / "assets/resources/art/pixel/character/hd"
OUTPUT = GAME / "assets/scripts/CorridorPixels.ts"
POSES = ("idle", "runStart", "run")
LOGICAL_SIZE = 48
SOURCE_SIZE = 96
CELL_SIZE = 4
GRID_SIZE = LOGICAL_SIZE // CELL_SIZE


def content_block(source: str, name: str, opener: str, closer: str) -> str:
    match = re.search(
        rf"\bconst {name}\s*=\s*{re.escape(opener)}(.*?){re.escape(closer)}\s+as const;",
        source,
        re.DOTALL,
    )
    if match is None:
        raise ValueError(f"Content.ts 中找不到 {name}")
    return match.group(1)


def manifest_spec() -> tuple[dict[str, int], list[str], list[str]]:
    source = CONTENT.read_text(encoding="utf-8")
    animations = content_block(source, "CHARACTER_ANIMATIONS", "{", "}")
    frame_counts = {
        name: int(count)
        for name, count in re.findall(r"(\w+):\s*\{\s*frames:\s*(\d+)", animations)
        if name in POSES
    }
    if tuple(frame_counts) != POSES:
        raise ValueError(f"动作帧配置与预期不符：{frame_counts}")
    skins = re.findall(r"'([^']+)'", content_block(source, "CHARACTER_SKINS", "[", "]"))
    variants = re.findall(
        r"(?:low|high):\s*'([^']+)'",
        content_block(source, "CHARACTER_VARIANTS", "{", "}"),
    )
    if not skins or not variants or len(variants) != len(set(variants)):
        raise ValueError("Content.ts 中的皮肤或属性外观配置异常")
    return frame_counts, skins, variants


def manifest_frames(
    frame_counts: dict[str, int], skins: list[str], variants: list[str]
) -> dict[Path, tuple[str, int, str]]:
    """复现 Content.ts 的 canonical、skin、variant、skin+variant 路径映射。"""
    frames: dict[Path, tuple[str, int, str]] = {}

    def add(directory: Path, pose: str, count: int, appearance: str) -> None:
        for frame in range(count):
            path = directory / pose / f"{frame:02d}.png"
            if path in frames:
                raise ValueError(f"重复路径：{path}")
            frames[path] = (pose, frame, appearance)

    for pose, count in frame_counts.items():
        add(ART, pose, count, "base")
        for skin in skins:
            add(ART / "skins" / skin, pose, count, "skin")
        if pose in ("idle", "run"):
            for variant in variants:
                add(ART / "variants" / variant, pose, count, "variant")
                for skin in skins:
                    add(
                        ART / "skins" / skin / "variants" / variant,
                        pose,
                        count,
                        "skin+variant",
                    )
    return frames


def occupied_cells(path: Path) -> tuple[set[int], int, int]:
    with Image.open(path) as image:
        if image.size != (SOURCE_SIZE, SOURCE_SIZE):
            raise ValueError(f"不是 96×96 源帧：{path} ({image.size})")
        alpha = image.getchannel("A")
        bounds = alpha.getbbox()
        pixels = alpha.tobytes()
    if bounds is None:
        raise ValueError(f"完全透明的角色帧：{path}")
    cells: set[int] = set()
    source_cell_size = CELL_SIZE * SOURCE_SIZE // LOGICAL_SIZE
    for index, value in enumerate(pixels):
        if value:
            source_y, source_x = divmod(index, SOURCE_SIZE)
            cells.add((source_y // source_cell_size) * GRID_SIZE + source_x // source_cell_size)
    return cells, bounds[1], bounds[3]


def analyze() -> tuple[
    dict[str, list[set[int]]], set[int], Counter[str], int,
    dict[str, list[float]], float, float, int,
]:
    frame_counts, skins, variants = manifest_spec()
    paths = manifest_frames(frame_counts, skins, variants)
    missing = [path for path in paths if not path.is_file()]
    if missing:
        sample = "\n".join(str(path) for path in missing[:5])
        raise FileNotFoundError(f"缺少 {len(missing)} 张 Content.ts 帧：\n{sample}")

    pose_cells = {pose: [set() for _ in range(frame_counts[pose])] for pose in POSES}
    frame_bottoms = {pose: [set() for _ in range(frame_counts[pose])] for pose in POSES}
    base_cells: dict[tuple[str, int], set[int]] = {}
    base_bottoms: dict[tuple[str, int], int] = {}
    differences: Counter[str] = Counter()
    images: list[tuple[str, int, str, set[int], int]] = []
    all_tops: list[int] = []
    for path, (pose, frame, appearance) in paths.items():
        cells, top, bottom = occupied_cells(path)
        images.append((pose, frame, appearance, cells, bottom))
        pose_cells[pose][frame].update(cells)
        frame_bottoms[pose][frame].add(bottom)
        all_tops.append(top)
        if appearance == "base":
            base_cells[(pose, frame)] = cells
            base_bottoms[(pose, frame)] = bottom
    bottom_differences = 0
    for pose, frame, appearance, cells, bottom in images:
        if cells != base_cells[(pose, frame)]:
            differences[appearance] += 1
        if bottom != base_bottoms[(pose, frame)]:
            bottom_differences += 1
    all_cells = set().union(*(cells for frames in pose_cells.values() for cells in frames))
    pose_bottoms = {
        pose: [max(bottoms) / 2 for bottoms in frame_bottoms[pose]]
        for pose in POSES
    }
    source_bottom = max(bottom for values in pose_bottoms.values() for bottom in values)
    return (
        pose_cells, all_cells, differences, len(paths), pose_bottoms,
        min(all_tops) / 2, source_bottom, bottom_differences,
    )


def packed_rows(cells: set[int]) -> str:
    rows = [0] * GRID_SIZE
    for cell in cells:
        rows[cell // GRID_SIZE] |= 1 << (cell % GRID_SIZE)
    return "".join(f"{row:03x}" for row in rows)


def module_text(
    pose_cells: dict[str, list[set[int]]], all_cells: set[int],
    pose_bottoms: dict[str, list[float]], source_bottom: float,
) -> str:
    by_y = {y: [] for y in range(0, LOGICAL_SIZE, CELL_SIZE)}
    for cell in sorted(all_cells):
        x = (cell % GRID_SIZE) * CELL_SIZE
        y = (cell // GRID_SIZE) * CELL_SIZE
        by_y[y].append(f"[{x}, {y}]")
    cell_lines = ["  " + ", ".join(by_y[y]) + "," for y in by_y if by_y[y]]
    mask_lines = []
    for pose in POSES:
        mask_lines.append(f"  {pose}: [")
        for frame, cells in enumerate(pose_cells[pose]):
            mask_lines.append(f"    '{packed_rows(cells)}', // {frame:02d}")
        mask_lines.append("  ],")
    bottom_lines = [
        f"  {pose}: [{', '.join(f'{value:g}' for value in pose_bottoms[pose])}],"
        for pose in POSES
    ]
    return "\n".join(
        [
            "/**",
            " * 现有小满 idle / runStart / run 动画的 alpha 格并集。",
            " * 源图 96×96 对应 48×48 逻辑画幅；每格 4×4 逻辑像素。",
            " * 此文件由 scripts/audit-corridor-pixels.py 从 Content.ts 登记的外观帧生成。",
            " */",
            "export const CORRIDOR_PIXEL_CELLS: readonly (readonly [number, number])[] = [",
            *cell_lines,
            "] as const;",
            "",
            "export type CorridorPose = 'idle' | 'runStart' | 'run';",
            "",
            "/** 所有帧最深的 alpha 边界（逻辑像素）；用于裁切末端格，逐帧贴地请用 corridorPoseBottom。 */",
            f"export const CORRIDOR_SOURCE_BOTTOM = {source_bottom:g};",
            "const FRAME_BOTTOMS: Record<CorridorPose, readonly number[]> = {",
            *bottom_lines,
            "};",
            "",
            "/** 当前动画帧的实际 alpha 底边（逻辑像素）；各外观同帧一致。 */",
            "export function corridorPoseBottom(pose: CorridorPose, frame: number): number {",
            "  return FRAME_BOTTOMS[pose]?.[frame] ?? CORRIDOR_SOURCE_BOTTOM;",
            "}",
            "",
            "// 每帧 12 行，每行 12 位；从左到右对应逻辑 x=0,4,...,44。",
            "const FRAME_MASKS: Record<CorridorPose, readonly string[]> = {",
            *mask_lines,
            "};",
            "",
            "/** 当前姿态的源区域内只要有一个非透明 4px 格，就允许该碎片留下像素。 */",
            "export function corridorCellOccupied(",
            "  pose: CorridorPose, frame: number, sourceX: number, sourceY: number, size: number,",
            "): boolean {",
            "  if (!Number.isInteger(frame) || !Number.isInteger(sourceX) || !Number.isInteger(sourceY)",
            "    || (size !== 4 && size !== 8) || sourceX % 4 !== 0 || sourceY % 4 !== 0",
            "    || sourceX < 0 || sourceY < 0 || sourceX + size > 48 || sourceY + size > 48) return false;",
            "  const packed = FRAME_MASKS[pose]?.[frame];",
            "  if (!packed) return false;",
            "  const width = size / 4;",
            "  const columnMask = ((1 << width) - 1) << (sourceX / 4);",
            "  for (let row = sourceY / 4; row < (sourceY + size) / 4; row++) {",
            "    if ((parseInt(packed.slice(row * 3, row * 3 + 3), 16) & columnMask) !== 0) return true;",
            "  }",
            "  return false;",
            "}",
            "",
        ]
    )


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    action = parser.add_mutually_exclusive_group(required=True)
    action.add_argument("--write", action="store_true", help="重生成 CorridorPixels.ts")
    action.add_argument("--check", action="store_true", help="核对生成文件与现有 PNG")
    args = parser.parse_args()
    (
        pose_cells, all_cells, differences, image_count, pose_bottoms,
        source_top, source_bottom, bottom_differences,
    ) = analyze()
    generated = module_text(pose_cells, all_cells, pose_bottoms, source_bottom)
    cells_8 = {
        ((cell % GRID_SIZE) * CELL_SIZE // 8, (cell // GRID_SIZE) * CELL_SIZE // 8)
        for cell in all_cells
    }
    print(
        f"{image_count} 张贴图；4px 并集 {len(all_cells)} 格；"
        f"8px 从 (0,0) 去重 {len(cells_8)} 格。"
    )
    print(f"alpha 全局边界：顶边 {source_top:g}，底边 {source_bottom:g} 逻辑像素。")
    if differences:
        print("与同帧基础外观 alpha 格不同的贴图：" + ", ".join(
            f"{appearance} {count}" for appearance, count in sorted(differences.items())
        ))
    else:
        print("全部外观的同帧 alpha 格一致。")
    if bottom_differences:
        print(f"同帧外观底边与基础外观不同的贴图：{bottom_differences} 张。")
    else:
        print("全部外观的同帧 alpha 底边一致。")
    if args.write:
        OUTPUT.write_text(generated, encoding="utf-8", newline="\n")
        print(f"已写入 {OUTPUT}")
        return 0
    if not OUTPUT.is_file() or OUTPUT.read_text(encoding="utf-8") != generated:
        print(f"{OUTPUT} 与现有贴图不一致；运行 --write 更新。", file=sys.stderr)
        return 1
    print("CorridorPixels.ts 与现有贴图一致。")
    return 0


if __name__ == "__main__":
    try:
        sys.exit(main())
    except (FileNotFoundError, ValueError, OSError) as error:
        print(error, file=sys.stderr)
        sys.exit(1)
