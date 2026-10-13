/** Scene BGM selection and crossfade control. This module has no Cocos/browser imports. */

export const SCENE_MUSIC_IDS = [
  'morning', 'rain', 'corridor', 'classroom', 'playground', 'injustice', 'piano', 'dusk',
  'night', 'crossroads', 'graduation', 'alley', 'dream1', 'dream2', 'heaven', 'hell',
  'ending_morning', 'ending_backrow', 'ending_outside', 'ending_desk', 'ending_wall',
  'ending_runaway', 'ending_secondGrade', 'finale',
] as const;

export type SceneMusicId = typeof SCENE_MUSIC_IDS[number];

export interface SceneMusicState {
  screen?: string;
  phase?: string;
  segment?: number;
  choice?: number;
  branch?: string;
  reward?: string;
  ending?: string;
  memoryReplay?: { segment?: number; stage?: string } | null;
  phaseTime?: number;
  openingMusicDelay?: number;
  endingMediaActive?: boolean;
  paused?: boolean;
  settings?: { muted?: boolean };
}

export interface MusicVoice {
  readonly id: SceneMusicId;
  setVolume(volume: number): void;
  play(loop: boolean): void | Promise<void>;
  pause?(): void;
  resume?(): void | Promise<void>;
  stop(): void;
}

export interface SceneMusicBackend {
  load(id: SceneMusicId): Promise<MusicVoice>;
  unlock?(): void;
}

export interface SceneMusicControllerOptions {
  initialFadeMs?: number;
  crossfadeMs?: number;
  corridorFadeMs?: number;
  pausedVolume?: number;
  masterVolume?: number;
}

const SEGMENT_MUSIC: Record<number, SceneMusicId> = {
  1: 'morning', 2: 'rain', 3: 'playground', 4: 'injustice', 5: 'dusk', 6: 'night', 7: 'graduation',
};

export const SCENE_MUSIC_GAINS: Partial<Record<SceneMusicId, number>> = {
  night: .32, crossroads: .55, piano: .65, classroom: .7,
  injustice: .7, corridor: .75, hell: .8,
};

const ENDING_MUSIC: Record<string, SceneMusicId> = {
  morning: 'ending_morning', backrow: 'ending_backrow', outside: 'ending_outside', desk: 'ending_desk',
  wall: 'ending_wall', runaway: 'ending_runaway', secondGrade: 'ending_secondGrade',
};

/** Resolve one stable logical track from the live Game fields. */
export function selectSceneMusic(state: SceneMusicState | null | undefined): SceneMusicId | null {
  if (!state) return null;
  if (state.phase === 'finale') return 'finale';
  // Painter marks the video surface active once its audio/video is ready. Keep
  // the ending cue for the fallback/loading state, then yield completely to a
  // cinematic that carries its own audio track.
  if (state.phase === 'ending') return state.endingMediaActive ? null : (ENDING_MUSIC[state.ending || ''] || null);
  if (state.endingMediaActive) return null;
  // The title/corridor screen owns the quiet corridor cue; the morning cue
  // starts once the first playable segment begins.
  if (state.screen === 'hall') return 'corridor';

  const memory = state.memoryReplay;
  if (state.screen === 'memory' && memory) {
    if (memory.stage === 'poem') return 'corridor';
    if (memory.stage === 'choice' && (memory.segment === 2 || memory.segment === 3)) return 'classroom';
    if (memory.stage === 'choice' && memory.segment === 4) return 'piano';
    if (memory.stage === 'choice' && memory.segment === 6) return 'crossroads';
    if (memory.segment && SEGMENT_MUSIC[memory.segment]) return SEGMENT_MUSIC[memory.segment];
    return 'corridor';
  }
  if (state.phase === 'corridorTransition') return 'corridor';
  if (state.phase === 'poem') return 'corridor';
  if (state.phase === 'hell') return 'hell';
  // Give the handle, dry hinges and the first view beyond the door their own
  // space. This one-shot delay belongs to Game's opening, never to a retry.
  if (state.phase === 'intro' || Number(state.openingMusicDelay || 0) > 0) return null;
  if (state.phase === 'reverse') return 'crossroads';
  if (state.phase === 'reward') {
    if (state.reward === 'dream') return Number(state.phaseTime || 0) < 30 ? 'dream1' : 'dream2';
    return 'heaven';
  }
  if (state.phase === 'alleyExit' || state.branch === 'alley') return 'alley';
  if (state.branch === 'playground') return 'playground';
  if (state.phase === 'piano' || (state.phase === 'choice' && state.segment === 4 && state.choice === 4)) return 'piano';
  if (state.phase === 'choice') {
    if (state.choice === 2 || state.choice === 3) return 'classroom';
    if (state.choice === 6) return 'crossroads';
    return SEGMENT_MUSIC[state.segment || 1] || 'corridor';
  }
  if (state.phase === 'seat') return 'classroom';
  return SEGMENT_MUSIC[state.segment || 1] || 'morning';
}

function clamp(value: number, min = 0, max = 1): number { return Math.max(min, Math.min(max, value)); }

type Fade = { from: number; to: number; startedAt: number; duration: number };
type ActiveVoice = Fade & { voice: MusicVoice };
function smoothStep(progress: number): number { const p = clamp(progress); return p * p * (3 - 2 * p); }
function busGain(fade: Fade, now: number): number {
  const p = fade.duration <= 0 ? 1 : smoothStep((now - fade.startedAt) / fade.duration);
  return fade.from + (fade.to - fade.from) * p;
}
function voiceGain(item: ActiveVoice, now: number): number {
  const p = item.duration <= 0 ? 1 : smoothStep((now - item.startedAt) / item.duration);
  // Equal-power interpolation in squared gain keeps a normal two-track fade full.
  return Math.sqrt(Math.max(0, item.from * item.from * (1 - p) + item.to * item.to * p));
}

/** Pending loads are tokenized; overlapping outgoing voices finish their own fade. */
export class SceneMusicController {
  private readonly initialFadeMs: number;
  private readonly crossfadeMs: number;
  private readonly corridorFadeMs: number;
  private readonly pausedVolume: number;
  private readonly masterVolume: number;
  private voices: ActiveVoice[] = [];
  private active: ActiveVoice | null = null;
  private desired: SceneMusicId | null = null;
  private loadingTarget: SceneMusicId | null = null;
  private retryAt = 0;
  private requestToken = 0;
  private lastNow = 0;
  private muted = false;
  private paused = false;
  private suspended = false;
  private suspendedAt = 0;
  private destroyed = false;
  private duck: Fade = { from: 1, to: 1, startedAt: 0, duration: 0 };

  constructor(private readonly backend: SceneMusicBackend, options: SceneMusicControllerOptions = {}) {
    this.initialFadeMs = Math.max(0, options.initialFadeMs ?? 1500);
    this.crossfadeMs = Math.max(0, options.crossfadeMs ?? 2000);
    this.corridorFadeMs = Math.max(0, options.corridorFadeMs ?? 2500);
    this.pausedVolume = clamp(options.pausedVolume ?? .18);
    this.masterVolume = clamp(options.masterVolume ?? .72);
  }

  get currentId(): SceneMusicId | null { return this.active?.voice.id || null; }
  get targetId(): SceneMusicId | null { return this.desired; }
  get isSuspended(): boolean { return this.suspended; }

  update(state: SceneMusicState, nowMs = Date.now()): void {
    if (this.destroyed) return;
    const target = selectSceneMusic(state);
    this.setMuted(!!state.settings?.muted);
    if (this.suspended) return;
    this.lastNow = Number.isFinite(nowMs) ? nowMs : Date.now();
    this.paused = !!state.paused;
    const sceneDuck = state.phase === 'poem' || state.memoryReplay?.stage === 'poem' ? .55
      : state.phase === 'choice' || state.memoryReplay?.stage === 'choice' ? .7 : 1;
    this.changeDuck(this.paused ? this.pausedVolume : sceneDuck);
    if (target !== this.desired || (target && this.active?.voice.id !== target && !this.loadingTarget && this.lastNow >= this.retryAt)) {
      this.transitionTo(target, state.phase === 'intro' ? 220 : undefined);
    }
    this.tick();
  }

  unlock(): void { if (!this.destroyed) this.backend.unlock?.(); }

  setMuted(value: boolean): void {
    this.muted = value;
    if (value) for (const item of this.voices) item.voice.setVolume(0);
  }

  setPaused(value: boolean): void {
    this.paused = value;
    this.changeDuck(value ? this.pausedVolume : 1);
  }

  suspend(nowMs = this.lastNow): void {
    if (this.destroyed || this.suspended) return;
    this.lastNow = Number.isFinite(nowMs) ? nowMs : this.lastNow;
    this.tick();
    this.suspended = true; this.suspendedAt = this.lastNow;
    this.requestToken++; this.loadingTarget = null;
    for (const item of this.voices) { item.voice.setVolume(0); item.voice.pause?.(); }
  }

  resume(nowMs = Date.now()): void {
    if (this.destroyed || !this.suspended) return;
    const gap = Math.max(0, nowMs - this.suspendedAt);
    for (const item of this.voices) item.startedAt += gap;
    this.duck.startedAt += gap;
    if (this.retryAt) this.retryAt += gap;
    this.suspended = false; this.lastNow = nowMs;
    this.backend.unlock?.();
    for (const item of this.voices) {
      try { void Promise.resolve(item.voice.resume?.()).catch(() => this.removeVoice(item)); }
      catch { this.removeVoice(item); }
    }
    if (this.desired && this.active?.voice.id !== this.desired && !this.loadingTarget && nowMs >= this.retryAt) this.transitionTo(this.desired);
    this.tick();
  }

  stop(): void {
    this.requestToken++; this.desired = this.loadingTarget = null; this.retryAt = 0;
    for (const item of this.voices) item.voice.stop();
    this.voices = []; this.active = null;
  }

  destroy(): void { if (this.destroyed) return; this.destroyed = true; this.stop(); }

  private changeDuck(target: number): void {
    if (target === this.duck.to) return;
    const from = busGain(this.duck, this.lastNow);
    this.duck = { from, to: target, startedAt: this.lastNow, duration: target < from ? 250 : 400 };
  }

  private transitionTo(target: SceneMusicId | null, silenceFadeMs = this.crossfadeMs): void {
    this.desired = target; const token = ++this.requestToken;
    this.loadingTarget = null; this.retryAt = 0;
    if (!target) {
      for (const item of this.voices) this.retarget(item, 0, silenceFadeMs);
      this.active = null;
      return;
    }
    const existing = this.voices.find(item => item.voice.id === target);
    if (existing) {
      const duration = this.fadeDuration(target);
      for (const item of this.voices) this.retarget(item, item === existing ? 1 : 0, duration);
      this.active = existing;
      return;
    }
    this.loadingTarget = target;
    let loading: Promise<MusicVoice>;
    try { loading = this.backend.load(target); }
    catch { this.loadFailed(token); return; }
    void loading.then(voice => {
      if (this.destroyed || this.suspended || token !== this.requestToken || this.desired !== target) { voice.stop(); return; }
      this.loadingTarget = null;
      const duration = this.fadeDuration(target);
      const item: ActiveVoice = { voice, from: 0, to: 1, startedAt: this.lastNow, duration };
      voice.setVolume(0);
      for (const old of this.voices) this.retarget(old, 0, duration);
      this.voices.push(item); this.active = item;
      try {
        void Promise.resolve(voice.play(true)).catch(() => { this.removeVoice(item); this.loadFailed(token); });
      } catch { this.removeVoice(item); this.loadFailed(token); }
      this.tick();
    }).catch(() => this.loadFailed(token));
  }

  private loadFailed(token: number): void {
    if (token !== this.requestToken || this.destroyed) return;
    this.loadingTarget = null; this.retryAt = this.lastNow + 1000;
  }

  private fadeDuration(target: SceneMusicId): number {
    if (!this.voices.length) return this.initialFadeMs;
    return target === 'corridor' || this.voices.some(item => item.voice.id === 'corridor') ? this.corridorFadeMs : this.crossfadeMs;
  }

  private retarget(item: ActiveVoice, target: number, duration: number): void {
    item.from = voiceGain(item, this.lastNow); item.to = target;
    item.startedAt = this.lastNow; item.duration = duration;
  }

  private removeVoice(item: ActiveVoice): void {
    item.voice.stop(); this.voices = this.voices.filter(voice => voice !== item);
    if (this.active === item) this.active = null;
  }

  private tick(): void {
    if (this.suspended) return;
    const duck = busGain(this.duck, this.lastNow);
    for (const item of this.voices.slice()) {
      const gain = voiceGain(item, this.lastNow);
      const relative = SCENE_MUSIC_GAINS[item.voice.id] ?? 1;
      item.voice.setVolume(this.muted ? 0 : this.masterVolume * relative * gain * duck);
      if (item.to === 0 && (item.duration <= 0 || this.lastNow - item.startedAt >= item.duration)) this.removeVoice(item);
    }
  }
}
