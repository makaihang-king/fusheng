import type { Painter } from './Painter';

/** The homework choice is the private memory inside the shared school setting. */
export type DreamHomeworkMemory = 'none' | 'own' | 'copied';

export interface DreamSceneryState {
  /** Elapsed seconds in the dream reward, whose desk act starts at 30 seconds. */
  phaseTime: number;
  clock: number;
  reducedMotion: boolean;
  homework: DreamHomeworkMemory;
}

export interface DreamTableTop {
  x: number;
  y: number;
  width: number;
}

const mix = (a: number, b: number, t: number) => a + (b - a) * t;
const clamp01 = (value: number) => Math.max(0, Math.min(1, value));
const smooth = (a: number, b: number, value: number) => {
  const t = clamp01((value - a) / (b - a));
  return t * t * (3 - 2 * t);
};
const ink = (r: number, g: number, b: number, alpha: number) =>
  `rgba(${r},${g},${b},${clamp01(alpha).toFixed(3)})`;

/** The latest relevant event wins if a replay contains more than one record. */
export function dreamHomeworkMemory(events: readonly string[]): DreamHomeworkMemory {
  for (let i = events.length - 1; i >= 0; i--) {
    if (events[i] === 'ownHomework') return 'own';
    if (events[i] === 'copyHomework') return 'copied';
  }
  return 'none';
}

/** A chalkboard slowly fills with daylight until its frame reads as a window. */
function schoolBoard(p: Painter, scale: number, opacity: number): void {
  if (opacity <= 0) return;
  const x = mix(309, 276, scale), y = mix(84, 63, scale);
  const w = mix(85, 169, scale), h = mix(55, 85, scale);
  p.rect(x + 4, y + 5, w, h, ink(52, 45, 70, .32 * opacity));
  p.rect(x - 2, y - 2, w + 4, h + 4, ink(93, 73, 89, .88 * opacity));
  p.rect(x, y, w, h, ink(205, 172, 158, .77 * opacity));
  p.rect(x + 5, y + 5, w - 10, h - 12, ink(42, 64, 70, .91 * opacity));
  p.rect(x + 2, y + 2, w - 4, 2, ink(241, 211, 193, .73 * opacity));

  const chalk = (1 - smooth(.12, .9, scale)) * opacity;
  if (chalk > 0) {
    const cx = x + 13, cy = y + 14, cw = w - 26, ch = h - 31;
    p.rect(cx + 1, cy - 5, cw * .32, 2, ink(245, 235, 215, .85 * chalk));
    p.rect(cx + cw * .42, cy - 5, cw * .18, 1, ink(245, 235, 215, .72 * chalk));
    p.line(cx, cy, cx + cw, cy, ink(226, 223, 208, .73 * chalk));
    for (let row = 1; row < 4; row++)
      p.line(cx, cy + ch * row / 4, cx + cw, cy + ch * row / 4,
        ink(225, 226, 211, .57 * chalk));
    for (let col = 1; col < 3; col++)
      p.line(cx + cw * col / 3, cy, cx + cw * col / 3, cy + ch,
        ink(225, 226, 211, .5 * chalk));
    p.line(cx + 5, cy + 5, cx + 12, cy + 4, ink(249, 236, 214, .84 * chalk));
    p.line(cx + cw / 3 + 5, cy + ch / 2 + 4, cx + cw / 3 + 14, cy + ch / 2 + 2,
      ink(249, 236, 214, .82 * chalk));
  }

  const daylight = smooth(.04, .94, scale) * opacity;
  if (daylight > 0) {
    const wx = x + 6, wy = y + 6, ww = w - 12, wh = h - 14;
    p.rect(wx, wy, ww, wh, ink(244, 225, 205, .96 * daylight));
    p.rect(wx + 3, wy + 3, ww - 6, wh * .54,
      ink(219, 207, 220, .69 * daylight));
    p.rect(wx + 3, wy + wh * .59, ww - 6, wh * .31,
      ink(174, 173, 186, .48 * daylight));
    p.circle(wx + ww * .77, wy + wh * .24, 7,
      ink(255, 247, 215, .72 * daylight));
    p.rect(wx, wy, ww, 3, ink(130, 105, 113, .91 * daylight));
    p.rect(wx, wy + wh - 3, ww, 3, ink(130, 105, 113, .91 * daylight));
    p.rect(wx, wy, 3, wh, ink(130, 105, 113, .91 * daylight));
    p.rect(wx + ww - 3, wy, 3, wh, ink(130, 105, 113, .91 * daylight));
    p.rect(wx + ww * .5 - 2, wy, 4, wh, ink(114, 96, 113, .91 * daylight));
    p.rect(wx, wy + wh * .55 - 1, ww, 3,
      ink(114, 96, 113, .91 * daylight));
    p.rect(wx + 3, wy + 3, ww * .46, 1,
      ink(255, 244, 222, .73 * daylight));
  }
  p.rect(x - 4, y + h + 1, w + 8, 3, ink(89, 72, 89, .88 * opacity));
  p.rect(x - 2, y + h + 1, w + 4, 1, ink(235, 204, 185, .79 * opacity));
}

/** An old corridor speaker is a public memory cue, not an interactive prop. */
function corridorSpeaker(p: Painter, scale: number, opacity: number): void {
  if (opacity <= 0) return;
  const x = mix(422, 427, scale), y = mix(51, 46, scale);
  const size = mix(1, 1.05, scale);
  p.rect(x + 8 * size, y - 9 * size, 3 * size, 17 * size,
    ink(76, 66, 91, .86 * opacity));
  p.rect(x + 7 * size, y - 3 * size, 6 * size, 3 * size,
    ink(217, 187, 170, .78 * opacity));
  p.rect(x + 4 * size, y + 9 * size, 10 * size, 10 * size,
    ink(73, 62, 83, .92 * opacity));
  p.poly([[x - 12 * size, y + 4 * size], [x + 7 * size, y + 10 * size],
    [x + 7 * size, y + 18 * size], [x - 12 * size, y + 25 * size]],
  ink(75, 61, 80, .96 * opacity));
  p.poly([[x - 10 * size, y + 7 * size], [x + 4 * size, y + 12 * size],
    [x + 4 * size, y + 16 * size], [x - 10 * size, y + 21 * size]],
  ink(188, 151, 151, .88 * opacity));
  p.rect(x - 15 * size, y + 4 * size, 4 * size, 21 * size,
    ink(71, 58, 80, .96 * opacity));
  p.rect(x - 14 * size, y + 7 * size, 2 * size, 15 * size,
    ink(222, 193, 178, .82 * opacity));
  p.line(x - 8 * size, y + 9 * size, x + 3 * size, y + 13 * size,
    ink(244, 218, 194, .83 * opacity));
  p.line(x - 8 * size, y + 19 * size, x + 3 * size, y + 16 * size,
    ink(100, 79, 100, .74 * opacity));
}

/** Crooked corrections and evenly repeated lines remain distinct without color. */
function homeworkMarks(p: Painter, memory: DreamHomeworkMemory,
  x: number, y: number, opacity: number): void {
  if (memory === 'own') {
    const color = ink(69, 83, 101, .88 * opacity);
    p.line(x + 7, y + 10, x + 11, y + 7, color);
    p.line(x + 11, y + 7, x + 15, y + 10, color);
    p.line(x + 17, y + 8, x + 21, y + 6, color);
    p.line(x + 21, y + 6, x + 25, y + 9, color);
    p.line(x + 9, y + 16, x + 14, y + 13, color);
    p.line(x + 14, y + 13, x + 17, y + 15, color);
    p.line(x + 20, y + 14, x + 30, y + 10, color);
    p.line(x + 26, y + 8, x + 29, y + 5, color);
  } else if (memory === 'copied') {
    const color = ink(124, 75, 78, .88 * opacity);
    p.line(x + 8, y + 9, x + 31, y + 6, color);
    p.line(x + 9, y + 13, x + 32, y + 10, color);
    p.line(x + 10, y + 17, x + 29, y + 14, color);
    p.rect(x + 34, y + 8, 3, 5, color);
  }
}

/** The same folded sheet will reappear on the actual tabletop in the next act. */
function homeworkSheet(p: Painter, memory: DreamHomeworkMemory,
  x: number, y: number, opacity: number): void {
  p.poly([[x + 1, y + 6], [x + 35, y + 1], [x + 44, y + 5],
    [x + 42, y + 22], [x + 3, y + 23]], ink(59, 56, 78, .37 * opacity));
  p.poly([[x, y + 5], [x + 34, y], [x + 43, y + 4],
    [x + 41, y + 20], [x + 2, y + 21]], ink(250, 239, 216, .94 * opacity));
  p.poly([[x + 34, y], [x + 34, y + 6], [x + 43, y + 4]],
    ink(213, 186, 177, .88 * opacity));
  p.line(x + 34, y + 6, x + 42, y + 5, ink(117, 93, 105, .62 * opacity));
  p.line(x + 2, y + 21, x + 40, y + 20,
    ink(103, 84, 100, .55 * opacity));
  homeworkMarks(p, memory, x, y, opacity);
}

/** A slow, subpixel drift lets the page hover below the board. */
function floatingHomework(p: Painter, memory: DreamHomeworkMemory,
  phaseTime: number, clock: number, reducedMotion: boolean): void {
  if (memory === 'none') return;
  const opacity = 1 - smooth(27.5, 30, phaseTime);
  if (opacity <= 0) return;
  const sway = reducedMotion ? 0 : Math.sin(clock * .47) * .45;
  homeworkSheet(p, memory, 346, 145 + sway, opacity);
}

/**
 * Add after the ordinary dream scenery, while phase==='reward'. The transition
 * spans 27.8–32.2 seconds and never flashes. Reduced motion crossfades two
 * still compositions; standard motion also enlarges the room very slowly.
 */
export function drawDreamScenery(p: Painter, state: DreamSceneryState): void {
  const t = Number.isFinite(state.phaseTime) ? state.phaseTime : 0;
  const transition = smooth(27.8, 32.2, t);
  if (state.reducedMotion) {
    schoolBoard(p, 0, 1 - transition);
    schoolBoard(p, 1, transition);
    corridorSpeaker(p, 0, 1 - transition);
    corridorSpeaker(p, 1, transition);
  } else {
    schoolBoard(p, transition, 1);
    corridorSpeaker(p, transition, 1);
  }
  floatingHomework(p, state.homework, t, state.clock, state.reducedMotion);
}

/**
 * Add immediately after drawing the reward's real table, before wrappers and
 * the player. The paper belongs to that platform and carries no collision.
 */
export function drawDreamTableHomework(p: Painter, table: DreamTableTop,
  memory: DreamHomeworkMemory): void {
  if (memory === 'none' || table.width < 47) return;
  homeworkSheet(p, memory, table.x + table.width - 47, table.y - 11, 1);
}
