/**
 * 现有小满 idle / runStart / run 动画的 alpha 格并集。
 * 源图 96×96 对应 48×48 逻辑画幅；每格 4×4 逻辑像素。
 * 此文件由 scripts/audit-corridor-pixels.py 从 Content.ts 登记的外观帧生成。
 */
export const CORRIDOR_PIXEL_CELLS: readonly (readonly [number, number])[] = [
  [20, 4], [24, 4], [28, 4],
  [20, 8], [24, 8], [28, 8],
  [16, 12], [20, 12], [24, 12], [28, 12],
  [16, 16], [20, 16], [24, 16], [28, 16], [32, 16],
  [16, 20], [20, 20], [24, 20], [28, 20], [32, 20],
  [16, 24], [20, 24], [24, 24], [28, 24], [32, 24],
  [16, 28], [20, 28], [24, 28], [28, 28], [32, 28],
  [16, 32], [20, 32], [24, 32], [28, 32], [32, 32],
  [12, 36], [16, 36], [20, 36], [24, 36], [28, 36], [32, 36],
  [12, 40], [16, 40], [20, 40], [24, 40], [28, 40], [32, 40], [36, 40],
  [12, 44], [16, 44], [20, 44], [24, 44], [28, 44], [32, 44],
] as const;

export type CorridorPose = 'idle' | 'runStart' | 'run';

/** 所有帧最深的 alpha 边界（逻辑像素）；用于裁切末端格，逐帧贴地请用 corridorPoseBottom。 */
export const CORRIDOR_SOURCE_BOTTOM = 45;
const FRAME_BOTTOMS: Record<CorridorPose, readonly number[]> = {
  idle: [44, 44, 44, 44, 44, 44, 44, 44],
  runStart: [44, 44.5, 44.5, 44.5, 45, 45],
  run: [45, 45, 45, 45, 45, 45, 45, 45, 45, 45, 45, 45, 45, 45, 45, 45],
};

/** 当前动画帧的实际 alpha 底边（逻辑像素）；各外观同帧一致。 */
export function corridorPoseBottom(pose: CorridorPose, frame: number): number {
  return FRAME_BOTTOMS[pose]?.[frame] ?? CORRIDOR_SOURCE_BOTTOM;
}

// 每帧 12 行，每行 12 位；从左到右对应逻辑 x=0,4,...,44。
const FRAME_MASKS: Record<CorridorPose, readonly string[]> = {
  idle: [
    '0000e00e00700700700f00600e00600e0000', // 00
    '0000e00e00700700700f00600e00e00e0000', // 01
    '0000e00e00700700700f00600e00e00e0000', // 02
    '0000e00e00700700700f00600e00e00e0000', // 03
    '0000e00e00700700700f00600e00600e0000', // 04
    '0000e00e00700700700f00600600600e0000', // 05
    '0000e00e00700700700f00600600600e0000', // 06
    '0000e00e00700700700f00600600600e0000', // 07
  ],
  runStart: [
    '0000e00e00700700700f00600e00600e0000', // 00
    '0000e00e00600700700700f00e00e00e0020', // 01
    '0000e00e00e00f00f00701f01e00e00f0020', // 02
    '0000e00e00e00f00f00f01f01e01e01b0030', // 03
    '0000e00e00e01f01f00f01f01e01f01b0030', // 04
    '0000c00e00e01f01f00f00f01e01f01b8030', // 05
  ],
  run: [
    '0000400e00e00e01f01f00700f01f01b8198', // 00
    '0000400e00e00f01f01f00700e00f81b8180', // 01
    '0000c00e00e00f01f01f00700f00f80c00c0', // 02
    '0000c00e00e00f00f00f00700f00f00c00c0', // 03
    '0000e00e00e00f00f00f01f01e00e0060060', // 04
    '0000c00e00e00f01f01f01f00e00e0060060', // 05
    '0000c00e00e01f01f00f01f01e01e0070030', // 06
    '0000400e00e01f01f00f01f01e01e03f0030', // 07
    '0000400e00e01f01f01f00700f01f01b8198', // 08
    '0000400e00e01f01f01f00700e00f81b8180', // 09
    '0000c00e00e01f01f00f00700f00f80c00c0', // 10
    '0000c00e00e01f01f00f00700f00f00c00c0', // 11
    '0000e00e00e00f00f00f01f01e00e0060060', // 12
    '0000c00e00e00f00f01f01f00e00e0060060', // 13
    '0000c00e00e00f00f00f01f01e01e0070030', // 14
    '0000400e00e00f01f01f01f01e01e03f0030', // 15
  ],
};

/** 当前姿态的源区域内只要有一个非透明 4px 格，就允许该碎片留下像素。 */
export function corridorCellOccupied(
  pose: CorridorPose, frame: number, sourceX: number, sourceY: number, size: number,
): boolean {
  if (!Number.isInteger(frame) || !Number.isInteger(sourceX) || !Number.isInteger(sourceY)
    || (size !== 4 && size !== 8) || sourceX % 4 !== 0 || sourceY % 4 !== 0
    || sourceX < 0 || sourceY < 0 || sourceX + size > 48 || sourceY + size > 48) return false;
  const packed = FRAME_MASKS[pose]?.[frame];
  if (!packed) return false;
  const width = size / 4;
  const columnMask = ((1 << width) - 1) << (sourceX / 4);
  for (let row = sourceY / 4; row < (sourceY + size) / 4; row++) {
    if ((parseInt(packed.slice(row * 3, row * 3 + 3), 16) & columnMask) !== 0) return true;
  }
  return false;
}
