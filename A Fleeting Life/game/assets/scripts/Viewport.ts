/** The authored 480×270 play area stays centered as the scenery fills the screen. */
export const CORE_WIDTH = 480;
export const CORE_HEIGHT = 270;

export interface FramePixels { width: number; height: number }
export interface BottomLeftPixel { x: number; y: number }

export function coreViewport(frame: FramePixels) {
  const width = Math.max(1, frame.width), height = Math.max(1, frame.height);
  const scale = Math.min(width / CORE_WIDTH, height / CORE_HEIGHT);
  return {
    logicalWidth: width / scale,
    logicalHeight: height / scale,
    coreLeft: (width - CORE_WIDTH * scale) / 2,
    coreTop: (height - CORE_HEIGHT * scale) / 2,
    scale,
  };
}

/** Cocos touch locations start at the lower left; game coordinates start at the upper left. */
export function pointInCore(location: BottomLeftPixel, frame: FramePixels): [number, number] {
  const layout = coreViewport(frame);
  return [
    (location.x - layout.coreLeft) / layout.scale,
    (Math.max(1, frame.height) - location.y - layout.coreTop) / layout.scale,
  ];
}
