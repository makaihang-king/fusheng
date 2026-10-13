export type SubtitleLane = 'heading' | 'story' | 'tutorial';
export type SubtitleSource = 'segment' | 'narrator' | 'character' | 'choice' | 'system';

export type SubtitleOptions = {
  lane?: SubtitleLane;
  source?: SubtitleSource;
  priority?: number;
  seconds?: number;
  /** Timed scene cues may wait this long to begin; stale queued cues are discarded. */
  maxQueueDelay?: number;
  /** A fresh scene cue may replace an equally important older one. */
  interruptSamePriority?: boolean;
};

export type SubtitleView = {
  text: string;
  source: SubtitleSource;
  alpha: number;
};

type Cue = {
  text: string;
  source: SubtitleSource;
  priority: number;
  duration: number;
  elapsed: number;
  latestStart: number;
};

type LaneState = { current: Cue | null; leaving: Cue | null; queue: Cue[] };

const FADE_IN = .55;
const FADE_OUT = .25;
const CROSSFADE = .2;
const MAX_LINE = 25;
const MAX_QUEUE = 4;
const LANES: SubtitleLane[] = ['heading', 'story', 'tutorial'];

function wrapLine(line: string): string[] {
  let chars = Array.from(line.trim());
  const result: string[] = [];
  while (chars.length > MAX_LINE) {
    let end = MAX_LINE;
    for (let i = MAX_LINE - 1; i >= Math.floor(MAX_LINE * .55); i--) {
      if (/[，。；、！？,.!?：: ]/.test(chars[i])) { end = i + 1; break; }
    }
    result.push(chars.slice(0, end).join('').trim());
    chars = chars.slice(end);
  }
  if (chars.length) result.push(chars.join('').trim());
  return result;
}

/** Every displayed card is at most two short lines; longer copy becomes later beats. */
export function subtitlePages(text: string): string[] {
  const lines = text.replace(/\r/g, '').split('\n').flatMap(wrapLine).filter(Boolean);
  const pages: string[] = [];
  for (let i = 0; i < lines.length; i += 2) pages.push(lines.slice(i, i + 2).join('\n'));
  return pages;
}

export class SubtitleManager {
  private time = 0;
  private lanes: Record<SubtitleLane, LaneState> = {
    heading: { current: null, leaving: null, queue: [] },
    story: { current: null, leaving: null, queue: [] },
    tutorial: { current: null, leaving: null, queue: [] },
  };

  show(text: string, options: SubtitleOptions = {}): void {
    const pages = subtitlePages(text);
    if (!pages.length) return;
    const lane = options.lane || 'story';
    const state = this.lanes[lane];
    const priority = options.priority ?? 1;
    const source = options.source || 'narrator';
    const seconds = options.seconds ?? 4;
    const maxQueueDelay = options.maxQueueDelay;
    const latestStart = typeof maxQueueDelay === 'number' && Number.isFinite(maxQueueDelay)
      ? this.time + Math.max(0, maxQueueDelay) : Infinity;
    if (pages.length === 1 && state.current?.text === pages[0] && state.current.source === source) return;
    const cues = pages.map(page => {
      const chars = Array.from(page.replace(/\n/g, '')).length;
      return {
        text: page,
        source,
        priority,
        duration: Math.max(seconds / pages.length, 3.2, .8 + chars / 9),
        elapsed: 0,
        latestStart,
      };
    });
    if (!state.current) {
      state.current = cues.shift()!;
    } else if (priority > state.current.priority ||
        (options.interruptSamePriority === true && priority === state.current.priority)) {
      state.leaving = state.current;
      state.leaving.elapsed = 0;
      state.current = cues.shift()!;
    }
    for (const cue of cues) this.enqueue(state, cue);
  }

  private enqueue(state: LaneState, cue: Cue): void {
    state.queue = state.queue.filter(item => item.latestStart >= this.time);
    if (cue.latestStart < this.time) return;
    if (state.queue.some(item => item.text === cue.text && item.source === cue.source)) return;
    const index = state.queue.findIndex(item => item.priority < cue.priority);
    if (index < 0) state.queue.push(cue);
    else state.queue.splice(index, 0, cue);
    if (state.queue.length > MAX_QUEUE) state.queue.length = MAX_QUEUE;
  }

  update(dt: number): void {
    if (dt <= 0) return;
    this.time += dt;
    for (const lane of LANES) {
      const state = this.lanes[lane];
      state.queue = state.queue.filter(cue => cue.latestStart >= this.time);
      if (state.leaving) {
        state.leaving.elapsed += dt;
        if (state.leaving.elapsed >= CROSSFADE) state.leaving = null;
      }
      if (!state.current) continue;
      state.current.elapsed += dt;
      if (state.current.elapsed >= state.current.duration) state.current = state.queue.shift() || null;
    }
  }

  views(lane: SubtitleLane): SubtitleView[] {
    const state = this.lanes[lane];
    const views: SubtitleView[] = [];
    if (state.leaving) views.push({ text: state.leaving.text, source: state.leaving.source,
      alpha: Math.max(0, 1 - state.leaving.elapsed / CROSSFADE) });
    if (state.current) {
      const cue = state.current;
      views.push({ text: cue.text, source: cue.source,
        alpha: Math.max(0, Math.min(1, cue.elapsed / FADE_IN, (cue.duration - cue.elapsed) / FADE_OUT)) });
    }
    return views;
  }

  clear(lane?: SubtitleLane): void {
    for (const key of lane ? [lane] : LANES) this.lanes[key] = { current: null, leaving: null, queue: [] };
  }
}
