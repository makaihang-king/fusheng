import { director, Director, sys } from 'cc';
import type { Game } from './Game';

type Frame = { t: number; image: ImageBitmap; pins: number; inRing: boolean };
type RawMoment = { id: string; kind: string; priority: number; time: number; wallTime: number; frames: Frame[] };
type VideoMoment = { id: string; format: 'webm' | 'mp4'; kind: string; priority: number; time: number; durationMs: number; mime: string };
type LegacyMoment = { id: string; format: 'legacy-frames'; kind: string; priority: number; time: number; durationMs: number; frames: string[] };
type Moment = VideoMoment | LegacyMoment;
type EncodeControl = { recorder: MediaRecorder; started: number; pauseAt: number; timer: ReturnType<typeof setTimeout> | null; pump: () => void };

/** Cocos Web video recorder. Old JPEG candidates are kept for read-only playback. */
export class BrowserMoments {
  private readonly indexKey = 'fleeting-life-cocos-moments-v2';
  private readonly buffer = document.createElement('canvas');
  private readonly context: CanvasRenderingContext2D;
  private readonly legacy: LegacyMoment[];
  private readonly mime: string;
  private readonly ring: Frame[] = [];
  private readonly queue: RawMoment[] = [];
  private readonly urls = new Map<string, string>();
  private readonly images = new Map<string, HTMLImageElement>();
  private db: IDBDatabase | null = null;
  private videos: VideoMoment[] = [];
  private pending: RawMoment | null = null;
  private encoding = false;
  private sampling = false;
  private destroyed = false;
  private clock = 0;
  private lastWall = 0;
  private lastSample = -Infinity;
  private lastCapture = -Infinity;
  private lastPriority = 0;
  private active = false;
  private suspended = false;
  private replayToken = 0;
  private replayStart = 0;
  private replayPauseAt = -1;
  private segmentIndex = -1;
  private segmentStartedAt = -1;
  private segmentMediaStart = 0;
  private videoAttempt = 0;
  private replayResult: ((success: boolean) => void) | null = null;
  private timeline: Array<{ moment: Moment; start: number; end: number }> = [];
  private layer: HTMLDivElement | null = null;
  private video: HTMLVideoElement | null = null;
  private oldCanvas: HTMLCanvasElement | null = null;
  private encodeControl: EncodeControl | null = null;
  readonly ready: Promise<void>;
  memories: Moment[] = [];

  constructor(private readonly getGame: () => Game) {
    this.buffer.width = 480;
    this.buffer.height = 270;
    this.context = this.buffer.getContext('2d', { alpha: false })!;
    this.legacy = this.readLegacy();
    this.memories = this.legacy.slice(0, 3);
    const formats = ['video/webm;codecs=vp8', 'video/webm;codecs=vp9', 'video/webm', 'video/mp4;codecs=avc1.42E01E', 'video/mp4'];
    this.mime = typeof MediaRecorder === 'function' && typeof MediaRecorder.isTypeSupported === 'function'
      ? formats.find(format => MediaRecorder.isTypeSupported(format)) || '' : '';
    this.ready = this.load();
    director.on(Director.EVENT_AFTER_DRAW, this.afterDraw, this);
  }

  private readLegacy(): LegacyMoment[] {
    try {
      const values = JSON.parse(sys.localStorage.getItem('fleeting-life-cocos-moments') || '[]');
      if (!Array.isArray(values)) return [];
      return values.slice(0, 3).filter((value: any) => Array.isArray(value.frames) && value.frames.length > 0
        && value.frames.every((frame: unknown) => typeof frame === 'string' && frame.startsWith('data:image/jpeg')))
        .map((value: any, index: number) => ({
          id: `legacy-cocos-${index}-${Number(value.time || 0)}`, format: 'legacy-frames' as const,
          kind: String(value.kind || 'highlight'), priority: Number(value.priority) || 1,
          time: Number(value.time) || index, durationMs: Math.min(3000, value.frames.length * 167), frames: value.frames,
        }));
    } catch { return []; }
  }

  private rank(items: VideoMoment[]): VideoMoment[] { return items.sort((a, b) => b.priority - a.priority || b.time - a.time).slice(0, 3); }
  private selectReplayMoments(): Moment[] {
    const selected: Moment[] = [...this.videos, ...this.legacy]
      .sort((a, b) => b.priority - a.priority || b.time - a.time).slice(0, 3);
    if (this.videos.length && !selected.some(moment => moment.format !== 'legacy-frames')) {
      if (selected.length === 3) selected.pop();
      selected.push(this.rank(this.videos.slice())[0]);
    }
    return selected.sort((a, b) => a.time - b.time);
  }
  private refresh(): void { this.memories = [...this.videos, ...this.legacy]; }

  private openDb(): Promise<IDBDatabase> {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open('fleeting-life-video-moments', 1);
      request.onupgradeneeded = () => { if (!request.result.objectStoreNames.contains('clips')) request.result.createObjectStore('clips'); };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error || Error('IndexedDB open failed'));
    });
  }
  private blob(id: string): Promise<Blob | null> {
    return new Promise((resolve, reject) => {
      const request = this.db!.transaction('clips', 'readonly').objectStore('clips').get(id);
      request.onsuccess = () => resolve(request.result instanceof Blob ? request.result : null);
      request.onerror = () => reject(request.error || Error('Video read failed'));
    });
  }
  private put(id: string, blob: Blob): Promise<void> {
    return new Promise((resolve, reject) => {
      const tx = this.db!.transaction('clips', 'readwrite'); tx.objectStore('clips').put(blob, id);
      tx.oncomplete = () => resolve(); tx.onerror = () => reject(tx.error || Error('Video write failed'));
      tx.onabort = () => reject(tx.error || Error('Video write aborted'));
    });
  }
  private remove(id: string): Promise<void> {
    return new Promise((resolve, reject) => {
      const tx = this.db!.transaction('clips', 'readwrite'); tx.objectStore('clips').delete(id);
      tx.oncomplete = () => resolve(); tx.onerror = () => reject(tx.error || Error('Video delete failed'));
      tx.onabort = () => reject(tx.error || Error('Video delete aborted'));
    });
  }
  private writeIndex(videos: VideoMoment[]): void {
    sys.localStorage.setItem(this.indexKey, JSON.stringify({ version: 2, candidates: videos }));
  }
  private async load(): Promise<void> {
    if (typeof indexedDB === 'undefined') return;
    let saved: any = {};
    try { saved = JSON.parse(sys.localStorage.getItem(this.indexKey) || '{}') || {}; } catch {}
    try {
      this.db = await this.openDb();
      const checked: VideoMoment[] = [];
      for (const value of Array.isArray(saved.candidates) ? saved.candidates.slice(0, 3) : []) {
        if (!value || typeof value.id !== 'string' || !/^cocos-\d+-[a-z0-9]+$/.test(value.id)
          || !['webm', 'mp4'].includes(value.format)) continue;
        const blob = await this.blob(value.id);
        if (!blob || blob.size < 100) continue;
        checked.push({ id: value.id, format: value.format, kind: String(value.kind || 'highlight'),
          priority: Number(value.priority) || 1, time: Number(value.time) || 0,
          durationMs: Math.max(100, Math.min(10000, Number(value.durationMs) || 3000)), mime: blob.type || value.mime || 'video/webm' });
      }
      this.videos = checked; this.refresh();
      if (checked.length !== (Array.isArray(saved.candidates) ? saved.candidates.length : 0)) this.writeIndex(checked);
    } catch (error) { console.warn('Moment video storage unavailable', error); this.db = null; this.refresh(); }
  }

  private pin(frame: Frame): Frame { frame.pins++; return frame; }
  private release(frame: Frame): void { frame.pins--; if (!frame.inRing && frame.pins === 0) frame.image.close(); }
  private dropOld(): void {
    while (this.ring.length && this.ring[0].t < this.clock - 3000) {
      const frame = this.ring.shift()!; frame.inRing = false; if (frame.pins === 0) frame.image.close();
    }
  }
  capture(kind: string): void {
    if (!this.mime || !this.buffer.captureStream || this.getGame().screen !== 'play') return;
    const priority = kind === 'hidden' ? 3 : kind === 'death' ? 2 : 1;
    if (this.pending) {
      if (priority <= this.pending.priority) return;
      for (const frame of this.pending.frames) this.release(frame);
      this.pending = null;
    }
    if (this.clock - this.lastCapture < 1100 && priority <= this.lastPriority) return;
    if (this.queue.length >= 3) {
      let weakest = -1;
      for (let i = 0; i < this.queue.length; i++)
        if (this.queue[i].priority < priority && (weakest < 0 || this.queue[i].priority < this.queue[weakest].priority)) weakest = i;
      if (weakest < 0) return;
      for (const frame of this.queue.splice(weakest, 1)[0].frames) this.release(frame);
    }
    this.lastCapture = this.clock; this.lastPriority = priority;
    this.pending = { id: `cocos-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`,
      kind, priority,
      time: this.clock, wallTime: Date.now(), frames: this.ring.filter(frame => frame.t >= this.clock - 2000).map(frame => this.pin(frame)) };
  }
  private afterDraw(): void {
    const source = document.getElementById('GameCanvas') as HTMLCanvasElement | null;
    if (!source || this.destroyed) return;
    const now = performance.now();
    if (!this.lastWall) this.lastWall = now;
    const dt = Math.max(0, Math.min(50, now - this.lastWall)); this.lastWall = now;
    if (this.active) { this.position(source); this.drawReplay(now); }
    const game = this.getGame();
    if (this.active || this.suspended || game.screen !== 'play' || game.paused) return;
    this.clock += dt;
    if (!this.mime || !this.buffer.captureStream || this.sampling || this.clock - this.lastSample < 1000 / 15) return;
    this.lastSample = this.clock; this.sampling = true;
    const at = this.clock;
    try {
      const scale = Math.min(source.width / 480, source.height / 270);
      const width = 480 * scale, height = 270 * scale;
      this.context.drawImage(source, (source.width - width) / 2, (source.height - height) / 2, width, height, 0, 0, 480, 270);
      void createImageBitmap(this.buffer).then(image => {
        if (this.destroyed) { image.close(); return; }
        const frame: Frame = { t: at, image, pins: 0, inRing: true };
        this.ring.push(frame); this.dropOld();
        const pending = this.pending;
        if (pending && at > pending.time && at <= pending.time + 1100) pending.frames.push(this.pin(frame));
        if (pending && at >= pending.time + 1000) {
          this.pending = null;
          if (pending.frames.length >= 2) { this.queue.push(pending); void this.drain(); }
          else for (const pinned of pending.frames) this.release(pinned);
        }
      }).catch(error => console.warn('Moment frame capture failed', error)).finally(() => { this.sampling = false; });
    } catch (error) { this.sampling = false; console.warn('Moment canvas copy failed', error); }
  }
  private async drain(): Promise<void> {
    if (this.encoding) return;
    this.encoding = true;
    try {
      while (this.queue.length) {
        const raw = this.queue.shift()!;
        try {
          await this.ready; if (!this.db || this.destroyed) continue;
          const possible = this.rank([...this.videos, { id: raw.id, format: 'webm', kind: raw.kind,
            priority: raw.priority, time: raw.wallTime, durationMs: 3000, mime: this.mime }]);
          if (!possible.some(value => value.id === raw.id)) continue;
          const encoded = await this.encode(raw.frames); await this.commit(raw, encoded);
        } catch (error) { console.warn('Moment video encoding failed', error); }
        finally { for (const frame of raw.frames) this.release(frame); }
      }
    } finally { this.encoding = false; }
  }
  private encode(frames: Frame[]): Promise<{ blob: Blob; durationMs: number; mime: string }> {
    return new Promise((resolve, reject) => {
      const out = document.createElement('canvas'); out.width = 480; out.height = 270;
      const context = out.getContext('2d', { alpha: false });
      if (!context) { reject(Error('Canvas context unavailable')); return; }
      let stream = out.captureStream(0);
      let track = stream.getVideoTracks()[0] as CanvasCaptureMediaStreamTrack;
      const manual = typeof track?.requestFrame === 'function';
      if (!manual) { stream.getTracks().forEach(value => value.stop()); stream = out.captureStream(15); track = stream.getVideoTracks()[0] as CanvasCaptureMediaStreamTrack; }
      let recorder: MediaRecorder;
      try { recorder = new MediaRecorder(stream, { mimeType: this.mime, videoBitsPerSecond: 850000 }); }
      catch (error) { stream.getTracks().forEach(value => value.stop()); reject(error); return; }
      const durationMs = Math.max(250, Math.min(3100, frames[frames.length - 1].t - frames[0].t + 1000 / 15));
      const chunks: Blob[] = [];
      let finished = false, frameIndex = 0, tick = 0;
      const control: EncodeControl = { recorder, started: 0, pauseAt: 0, timer: null, pump: () => {} };
      this.encodeControl = control;
      const cleanup = (): void => {
        if (control.timer) clearTimeout(control.timer);
        stream.getTracks().forEach(value => value.stop());
        if (this.encodeControl === control) this.encodeControl = null;
      };
      const fail = (error: unknown): void => {
        if (finished) return; finished = true;
        try { if (recorder.state !== 'inactive') recorder.stop(); } catch {}
        cleanup(); reject(error);
      };
      const drawAt = (elapsed: number): void => {
        while (frameIndex + 1 < frames.length && frames[frameIndex + 1].t - frames[0].t <= elapsed) frameIndex++;
        context.drawImage(frames[frameIndex].image, 0, 0, 480, 270);
        if (manual) track.requestFrame();
      };
      control.pump = (): void => {
        if (finished || control.pauseAt) return;
        const elapsed = performance.now() - control.started;
        if (tick * 1000 / 15 <= elapsed + 4 && tick * 1000 / 15 <= durationMs) { drawAt(tick * 1000 / 15); tick++; }
        if (elapsed >= durationMs + 50) { try { recorder.stop(); } catch (error) { fail(error); } return; }
        control.timer = setTimeout(control.pump, Math.max(4, Math.min(24, control.started + tick * 1000 / 15 - performance.now())));
      };
      recorder.ondataavailable = event => { if (event.data?.size) chunks.push(event.data); };
      recorder.onerror = event => fail((event as any).error || Error('MediaRecorder error'));
      recorder.onstop = () => {
        if (finished) return; finished = true; cleanup();
        const blob = new Blob(chunks, { type: recorder.mimeType || this.mime });
        if (blob.size < 100) { reject(Error('Empty recorded video')); return; }
        resolve({ blob, durationMs, mime: blob.type });
      };
      recorder.onstart = () => {};
      try {
        recorder.start(); control.started = performance.now();
        if (this.suspended) { control.pauseAt = control.started; recorder.pause(); }
        else control.pump();
      } catch (error) { fail(error); }
    });
  }
  private async commit(raw: RawMoment, encoded: { blob: Blob; durationMs: number; mime: string }): Promise<void> {
    const candidate: VideoMoment = { id: raw.id, format: encoded.mime.includes('mp4') ? 'mp4' : 'webm',
      kind: raw.kind, priority: raw.priority, time: raw.wallTime, durationMs: encoded.durationMs, mime: encoded.mime };
    const keep = this.rank([...this.videos, candidate]);
    if (!keep.some(value => value.id === candidate.id)) return;
    await this.put(candidate.id, encoded.blob);
    const nextVideos = keep;
    try { this.writeIndex(nextVideos); }
    catch (error) { await this.remove(candidate.id).catch(() => {}); throw error; }
    const evicted = this.videos.filter(value => !nextVideos.some(next => next.id === value.id));
    this.videos = nextVideos; this.refresh();
    for (const old of evicted) {
      const url = this.urls.get(old.id); if (url) URL.revokeObjectURL(url);
      this.urls.delete(old.id); await this.remove(old.id).catch(() => {});
    }
  }
  private overlay(): void {
    if (this.layer) return;
    const layer = document.createElement('div');
    layer.style.cssText = 'position:fixed;z-index:999;pointer-events:none;overflow:hidden;display:none;background:#111923';
    const video = document.createElement('video'); video.muted = true; video.playsInline = true; video.preload = 'auto';
    video.style.cssText = 'display:none;width:100%;height:100%;object-fit:fill;image-rendering:pixelated';
    const oldCanvas = document.createElement('canvas'); oldCanvas.width = 480; oldCanvas.height = 270;
    oldCanvas.style.cssText = 'display:none;width:100%;height:100%;image-rendering:pixelated';
    const tint = document.createElement('div');
    tint.style.cssText = 'position:absolute;inset:0;background:repeating-linear-gradient(0deg,transparent 0px,transparent 3px,rgba(8,16,24,.11) 4px),rgba(11,17,23,.19)';
    const title = document.createElement('div'); title.textContent = '那时，你这样走过。';
    title.style.cssText = 'position:absolute;left:0;right:0;bottom:7%;text-align:center;color:#ebdfc8;font:12px sans-serif;text-shadow:1px 1px #111923';
    layer.append(video, oldCanvas, tint, title); document.body.appendChild(layer);
    this.layer = layer; this.video = video; this.oldCanvas = oldCanvas;
  }
  private position(source: HTMLCanvasElement): void {
    if (!this.layer) return;
    const rect = source.getBoundingClientRect(), scale = Math.min(rect.width / 480, rect.height / 270);
    Object.assign(this.layer.style, { left: rect.left + (rect.width - 480 * scale) / 2 + 'px',
      top: rect.top + (rect.height - 270 * scale) / 2 + 'px', width: 480 * scale + 'px', height: 270 * scale + 'px' });
  }
  replay(active: boolean, onResult?: (success: boolean) => void): void {
    if (!active) { this.stopReplay(false); return; }
    if (this.active) this.stopReplay(false);
    this.active = true; this.replayResult = onResult || null;
    this.replayStart = performance.now();
    this.replayPauseAt = this.suspended || this.getGame().paused ? this.replayStart : -1;
    this.timeline = []; this.segmentIndex = -1;
    const token = ++this.replayToken;
    void (async () => {
      await this.ready;
      if (!this.active || token !== this.replayToken) return;
      const selected = this.selectReplayMoments();
      if (!selected.length) { this.stopReplay(false); return; }
      this.overlay();
      for (const moment of selected) if (moment.format !== 'legacy-frames' && !this.urls.has(moment.id)) {
        const blob = this.db ? await this.blob(moment.id).catch(() => null) : null;
        if (!this.active || token !== this.replayToken) return;
        if (!blob) { this.stopReplay(false); return; }
        this.urls.set(moment.id, URL.createObjectURL(blob));
      }
      if (!this.active || token !== this.replayToken) return;
      this.timeline = []; let start = 0;
      for (let i = 0; i < 3; i++) {
        const moment = selected[i % selected.length], length = Math.min(3000, Math.max(250, moment.durationMs || 3000));
        this.timeline.push({ moment, start, end: start + length }); start += length;
      }
      this.layer!.style.display = 'block'; this.drawReplay(performance.now());
    })().catch(error => {
      if (!this.active || token !== this.replayToken) return;
      console.warn('Moment playback failed', error); this.stopReplay(false);
    });
  }
  private stopReplay(success = false): void {
    if (!this.active) return;
    const playedVideo = this.timeline.some(part => part.moment.format !== 'legacy-frames');
    const onResult = this.replayResult; this.replayResult = null;
    this.active = false; this.replayToken++; this.videoAttempt++; this.segmentIndex = -1;
    this.segmentStartedAt = -1; this.replayPauseAt = -1; this.timeline = [];
    if (this.video) { this.video.pause(); this.video.style.display = 'none'; this.video.removeAttribute('src'); this.video.load(); }
    if (this.layer) this.layer.style.display = 'none';
    try { onResult?.(success && playedVideo); } catch (error) { console.warn('Moment playback result failed', error); }
  }
  private playVideo(index: number): void {
    const token = this.replayToken, attempt = ++this.videoAttempt;
    try {
      void this.video!.play().catch(error => {
        if (!this.active || token !== this.replayToken || index !== this.segmentIndex || attempt !== this.videoAttempt) return;
        console.warn('Moment video play failed', error); this.stopReplay(false);
      });
    } catch (error) {
      if (this.active && token === this.replayToken && index === this.segmentIndex) {
        console.warn('Moment video play failed', error); this.stopReplay(false);
      }
    }
  }
  private startSegment(index: number): void {
    this.segmentIndex = index; this.segmentStartedAt = -1; this.segmentMediaStart = 0;
    this.videoAttempt++; this.video!.pause();
    const moment = this.timeline[index].moment;
    if (moment.format === 'legacy-frames') {
      this.video!.style.display = 'none'; this.oldCanvas!.style.display = 'block';
      return;
    }
    const url = this.urls.get(moment.id);
    if (!url) { this.stopReplay(false); return; }
    this.oldCanvas!.style.display = 'none'; this.video!.style.display = 'block';
    this.video!.src = url; this.video!.load(); this.segmentMediaStart = this.video!.currentTime;
    this.playVideo(index);
  }
  private advanceSegment(): void {
    if (this.segmentIndex + 1 === this.timeline.length) this.stopReplay(true);
    else this.startSegment(this.segmentIndex + 1);
  }
  private drawReplay(now: number): void {
    if (!this.active) return;
    if (this.suspended || this.getGame().paused) {
      if (this.replayPauseAt < 0) this.replayPauseAt = now;
      this.videoAttempt++; this.video?.pause(); if (this.layer) this.layer.style.display = 'none'; return;
    }
    if (this.replayPauseAt >= 0) {
      const pauseMs = now - this.replayPauseAt;
      this.replayStart += pauseMs;
      if (this.segmentStartedAt >= 0) this.segmentStartedAt += pauseMs;
      this.replayPauseAt = -1;
      if (this.layer) this.layer.style.display = 'block';
      if (this.video && this.segmentIndex >= 0 && this.video.style.display !== 'none') this.playVideo(this.segmentIndex);
    }
    if (now - this.replayStart >= 20000) { this.stopReplay(false); return; }
    if (!this.timeline.length || !this.layer || !this.video || !this.oldCanvas) return;
    if (this.segmentIndex < 0) this.startSegment(0);
    if (!this.active) return;
    const part = this.timeline[this.segmentIndex], moment = part.moment;
    const lengthMs = part.end - part.start;
    if (moment.format !== 'legacy-frames') {
      if (this.video.error) { this.stopReplay(false); return; }
      if (this.video.readyState < 2 || this.video.videoWidth <= 0) return;
      const advanced = this.video.currentTime - this.segmentMediaStart;
      if (!Number.isFinite(advanced) || advanced < -0.1) { this.stopReplay(false); return; }
      if (this.segmentStartedAt < 0) { this.segmentStartedAt = now; return; }
      const duration = moment.durationMs / 1000;
      const minimum = Math.max(0.15, duration - Math.min(0.12, Math.max(0.03, duration * 0.04)));
      if (this.video.ended && advanced >= minimum) this.advanceSegment();
      return;
    }
    if (!moment.frames.length) { this.stopReplay(false); return; }
    const local = this.segmentStartedAt < 0 ? 0 : now - this.segmentStartedAt;
    const frame = Math.min(moment.frames.length - 1, Math.floor(local / lengthMs * moment.frames.length));
    const src = moment.frames[frame]; let image = this.images.get(src);
    if (!image) { image = new Image(); image.src = src; this.images.set(src, image); }
    if (!image.complete || !image.naturalWidth) return;
    try { this.oldCanvas.getContext('2d')!.drawImage(image, 0, 0, 480, 270); }
    catch (error) { console.warn('Moment frame playback failed', error); this.stopReplay(false); return; }
    if (this.segmentStartedAt < 0) this.segmentStartedAt = now;
    if (now - this.segmentStartedAt >= lengthMs) this.advanceSegment();
  }
  pause(): void {
    this.suspended = true; const now = performance.now();
    if (this.active && this.replayPauseAt < 0) { this.replayPauseAt = now; this.videoAttempt++; this.video?.pause(); }
    if (this.active && this.layer) this.layer.style.display = 'none';
    const control = this.encodeControl;
    if (control && !control.pauseAt) {
      control.pauseAt = now; if (control.timer) clearTimeout(control.timer);
      if (control.recorder.state === 'recording') control.recorder.pause();
    }
  }
  resume(): void {
    const now = performance.now(); this.suspended = false; this.lastWall = now;
    const control = this.encodeControl;
    if (control && control.pauseAt) {
      if (control.started) control.started += now - control.pauseAt;
      control.pauseAt = 0;
      if (control.recorder.state === 'paused') control.recorder.resume();
      if (control.started) control.pump();
    }
  }
  destroy(): void {
    this.destroyed = true; director.off(Director.EVENT_AFTER_DRAW, this.afterDraw, this); this.stopReplay();
    this.layer?.remove();
    for (const url of this.urls.values()) URL.revokeObjectURL(url);
    this.urls.clear();
    for (const frame of this.ring) { frame.inRing = false; if (frame.pins === 0) frame.image.close(); }
    this.ring.length = 0;
    this.db?.close();
  }
}
