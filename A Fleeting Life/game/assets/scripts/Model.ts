/** Pure S1 rules. Rendering, clocks, input and recording belong to the scene layer. */
export type Stats = { personality: number; relationship: number; will: number; appearance: number };
export type DamageResult = 'ignored' | 'hit' | 'rewind' | 'feather' | 'hell' | 'restart';
export type NormalEnding = 'morning' | 'backrow' | 'outside' | 'desk';
export interface SegmentResult { clear: boolean; full: boolean; noHit: boolean; noItem: boolean }
export type StoryLines = Record<'academic'|'family'|'social'|'items'|'self'|'risk'|'life'|'dream', string[]>;
export type EquippedSlots = { skin: string; charm: string; frame: string };
export interface EndingSnapshot { stats: Stats; items: string[]; events: string[]; wet: number; readonly lines: StoryLines }
export interface SegmentMemory { runId: number; anchorEvent: string; choiceEvent: string; poemSeen: boolean }
/** The playable restart point is the segment entrance, never the current video frame. */
export interface RunCheckpoint {
  version: 1; segment: string; startAt: number; run: Omit<Run,'lines'>;
  available: Record<string, number>; baseEvents: string[]; score?: SegmentResult;
}
export interface Profile {
  version: number; fragments: number; wrappers: number;
  inventory: Record<string, number>; lights: string[];
  endingSnapshots: Record<string, EndingSnapshot>; achievements: string[];
  progress: {
    runs: number; retries: number; seats: string[]; seatRuns: number[];
    endings: Record<string, number>; segments: Record<string, SegmentResult>;
    segmentMemories: Record<string, SegmentMemory>;
    /** One validated anchor event per completed segment, kept across later runs. */
    segmentAnchorEvidence: Record<string, string>;
    /** One witnessed choice echo per completed branch or hidden ending. */
    cardEventEvidence: Record<string, string>;
    noHitWithoutItems: boolean; illusion: boolean; chalk: boolean; introSeen: boolean;
  };
  cosmetics: string[]; equipped: string; equippedSlots: EquippedSlots;
  settings: { muted: boolean; reducedMotion: boolean };
  rewardHistory: { last: '' | 'dream' | 'heaven'; count: number };
  finalePlayed: boolean;
  recordings: Array<{ id: string; kind: string; score: number; frames?: unknown[] }>;
  checkpoint: RunCheckpoint | null;
}
export interface Run {
  id: number; active: boolean; stats: Stats; items: string[]; events: string[]; readonly lines: StoryLines;
  lives: number; lifeStock: number; wet: number; invincible: number; segment: string;
  jumps: number; segmentHits: number; usedItems: string[]; segmentUsedItems: string[];
  hellUsed: boolean; inHell: boolean; shield: boolean; magnet: boolean;
  light: boolean; candy: boolean; candyActive: boolean; reward: '' | 'dream' | 'heaven';
  rewardScene: boolean; ending: string; collected: string[]; segmentFragments: number;
  fragments: number; drops: number; umbrellaSegments: number; everItems: string[];
  finishedSegments: string[];
}
export const NORMAL_ENDINGS: NormalEnding[] = ['morning', 'backrow', 'outside', 'desk'];
export const SEGMENT_MEMORY_ANCHORS: Readonly<Record<string, readonly string[]>> = {
  '1': ['hat'], '2': ['bag'], '3': ['copyHomework', 'ownHomework'], '4': ['speak', 'silent'],
  '5': ['bench'], '6': ['milk'], '7': ['wish']
};
export const SEGMENT_MEMORY_CHOICES: Readonly<Record<string, readonly string[]>> = {
  '1': ['umbrella', 'alley'], '2': ['seat1', 'seat2', 'seat3', 'skipClass'],
  '3': ['cheat', 'faceExam', 'noPen'], '4': ['pianoPractice', 'pianoSmash', 'pianoClose'],
  '5': ['apologize', 'slamDoor'], '6': ['forward', 'back'], '7': []
};
/** A card may retain only an authored event from its completed route. */
export const MEMORY_CARD_EVENT_RULES: Readonly<Record<string,
  { branch: string; entrySegment: string; events: readonly string[] }>> = {
  'branch:alley': { branch: 'alley', entrySegment: '1', events: ['alleyReturn', 'alley'] },
  'branch:playground': { branch: 'playground', entrySegment: '2', events: ['sideReturn', 'graffiti', 'skipClass'] },
  'secret:wall': { branch: 'alley', entrySegment: '1', events: ['alley'] },
  'secret:runaway': { branch: 'playground', entrySegment: '2', events: ['skipClass'] },
};
const BRANCH_ENTRY_EVENT: Readonly<Record<string, string>> = { alley: 'alley', playground: 'skipClass' };
export const ITEM_PRICES: Record<string, number> = { rewind: 120, feather: 100, shield: 60, magnet: 45, eraser: 35 };
export const COSMETICS = [
  { id: 'whiteShirt', name: '白衬衫', price: 0, kind: 'skin' },
  { id: 'waistJacket', name: '校服外套系腰', price: 60, kind: 'skin' },
  { id: 'raincoat', name: '雨衣', price: 80, kind: 'skin' },
  { id: 'namelessNotebook', name: '没写名字的作业本', price: -1, kind: 'skin' },
  ...['morning', 'noon', 'dusk', 'night'].map((n, i) => ({ id: 'frame-' + n, name: ['晨光', '正午', '黄昏', '深夜'][i] + '头像框', price: 25, kind: 'frame' })),
  ...['plane', 'star', 'umbrella', 'chalk', 'scarf', 'stool'].map((n, i) => ({ id: 'charm-' + n, name: ['纸飞机', '糖纸星', '微缩伞', '粉笔头', '红领巾书签', '小板凳'][i], price: 30, kind: 'charm' }))
];
export const ACHIEVEMENTS = [
  { id: 'noHit', name: '一次都没撞', condition: '一段内没有实际掉命；另记无伤·无道具档。', object: '满分卷子' },
  { id: 'collector', name: '捡了一路', condition: '一段内收集该段碎片上限的至少 90%。', object: '碎片罐头' },
  { id: 'perfectScore', name: '一分不差', condition: '用笔改分数，且这一段全程无伤。', object: '红笔' },
  { id: 'sharpEyes', name: '眼睛真好', condition: '琴房里，试着让声音轻轻停下来。', object: '琴盖划痕' },
  { id: 'threeSeats', name: '三把凳子', condition: '在三局中分别坐过第一、第二、第三把凳子。', object: '小板凳' },
  { id: 'umbrellaKeeper', name: '伞不离手', condition: '拾取伞并带着它跑完三段。', object: '那把伞' },
  { id: 'floated', name: '天上飘过', condition: '梦的第一幕全程没有触底。', object: '一朵云' },
  { id: 'bigDesk', name: '桌子真大', condition: '在梦的第二幕踩上巨大的桌沿。', object: '巨型铅笔' },
  { id: 'lookBack', name: '回头看看', condition: '四盏灯都亮后，岔路口也许记得你的来路。', object: '旧照片' },
  { id: 'heldUp', name: '被托住的人', condition: '在天堂不断开连锁地点亮 12 个障碍。', object: '一束光' },
  { id: 'emptyPockets', name: '无伞无笔', condition: '不拾取任何剧情随身物到达任意结局；半截粉笔除外。', object: '空口袋' },
  { id: 'noJump', name: '一次都没跳', condition: '完整通过一段，一次跳跃也没有。', object: '磨破的裤脚' },
  { id: 'lampKeeper', name: '回廊点灯人', condition: '四个正常结局各达成一次。', object: '第五盏灯的灯座' },
  { id: 'secondGrade', name: '回到二年级', condition: '看完墙后的彩蛋结局。', object: '迷你门' },
  { id: 'runaway', name: '跑出去', condition: '从操场一路向外。', object: '碎砖' },
  { id: 'wall', name: '墙的另一边', condition: '在巷子尽头爬上墙头。', object: '墙头草' }
];
const PUSH: Record<string, number[]> = {
  umbrella: [0,0,0,0], alley: [0,0,0,8], seat1: [0,-12,0,0], seat2: [0,4,0,0], seat3: [0,30,0,0],
  skipClass: [20,0,0,6], cheat: [0,0,-8,0], faceExam: [0,0,8,0], noPen: [0,0,0,0],
  copyHomework: [0,0,-10,0], ownHomework: [0,0,8,0], speak: [15,0,6,0], silent: [0,8,-6,0],
  pianoPractice: [0,0,6,0], pianoSmash: [25,0,-15,4], pianoClose: [8,0,0,0],
  pen: [0,0,0,0], eraser: [0,5,0,0], plane: [0,-6,0,0],
  apologize: [-12,0,0,0], slamDoor: [30,0,0,5], back: [0,0,0,0], forward: [0,0,0,0],
  alleyReturn: [0,0,10,0], sideReturn: [-10,0,0,0], graffiti: [4,0,0,2],
  hat: [0,-4,0,0], bag: [0,-3,0,0], paper: [0,-4,0,0], plant: [0,0,0,-2],
  bench: [0,4,0,0], milk: [0,0,3,0], wish: [0,0,0,0], compared: [0,0,0,0]
};
const GROUPS = [
  ['umbrella','alley'], ['seat1','seat2','seat3','skipClass'], ['cheat','faceExam','noPen'],
  ['copyHomework','ownHomework'], ['speak','silent'], ['pianoPractice','pianoSmash','pianoClose'],
  ['apologize','slamDoor'], ['back','forward']
];
const STORY_ITEMS = ['umbrella', 'pen', 'eraser', 'plane'];
const ENDINGS = [...NORMAL_ENDINGS, 'secondGrade', 'runaway', 'wall'];
const clamp = (n: number, max = 100) => Math.max(0, Math.min(max, n));
const num = (n: unknown, max = 999999999) => typeof n === 'number' && Number.isFinite(n) ? Math.floor(clamp(n, max)) : 0;
const strings = (value: unknown, max = 1000): string[] => Array.isArray(value) ? Array.from(new Set(value.filter(v => typeof v === 'string' && v.length < 160))).slice(0, max) as string[] : [];
const copy = <T>(value: T): T => JSON.parse(JSON.stringify(value));
const obj = (v: unknown): Record<string, any> => v && typeof v === 'object' && !Array.isArray(v) ? v as Record<string, any> : {};
function stats(v?: unknown): Stats {
  const a = obj(v);
  return { personality: v ? num(a.personality,100) : 50, relationship: v ? num(a.relationship,100) : 50,
    will: v ? num(a.will,100) : 50, appearance: v ? num(a.appearance,100) : 50 };
}
/** The eight local fishbones are views of the event log, never independent decision state. */
export function deriveLines(events: string[]): StoryLines {
  const belongs: Record<keyof StoryLines, string[]> = {
    academic:['cheat','faceExam','noPen','copyHomework','ownHomework'],
    family:['compared','apologize','slamDoor'],
    social:['seat1','seat2','seat3','speak','silent','hat','bag','paper','bench'],
    items:['umbrella','alley','pen','eraser','plane','noPen','graffiti'],
    self:['speak','silent','pianoPractice','pianoSmash','pianoClose','alleyReturn','back','forward'],
    risk:['skipClass','speak','pianoPractice','sideReturn'],
    life:['lifeLost','hellClear','hellFall'],
    dream:['dreamReward','heavenReward']
  };
  const result = {} as StoryLines;
  (Object.keys(belongs) as (keyof StoryLines)[]).forEach(key => {
    result[key]=events.filter(event => belongs[key].includes(event) || (key === 'life' && /^segment:[a-zA-Z0-9_-]+:(noHit|hurt)$/.test(event)));
  });
  return result;
}
function endingSnapshot(value: Omit<EndingSnapshot, 'lines'>): EndingSnapshot {
  const result = copy(value) as EndingSnapshot;
  // Keep only events on disk; recompute lines after load or when a replay reads them.
  Object.defineProperty(result,'lines',{get:()=>deriveLines(result.events),enumerable:false});
  return result;
}
function blankProfile(): Profile {
  return { version: 2, fragments: 0, wrappers: 0, inventory: {rewind:0,feather:0,shield:0,magnet:0,eraser:0},
    lights: [], endingSnapshots: {}, achievements: [],
    progress: { runs:0,retries:0,seats:[],seatRuns:[],endings:{},segments:{},segmentMemories:{},segmentAnchorEvidence:{},cardEventEvidence:{},
      noHitWithoutItems:false,illusion:false,chalk:false,introSeen:false },
    cosmetics: ['whiteShirt'], equipped: 'whiteShirt', equippedSlots:{skin:'whiteShirt',charm:'',frame:''},
    settings:{muted:false,reducedMotion:false}, rewardHistory: {last:'',count:0}, finalePlayed:false, recordings:[],checkpoint:null };
}
function loadProfile(serialized?: string): Profile {
  const p = blankProfile();
  if (!serialized) return p;
  let a: Record<string, any>;
  try { a = obj(JSON.parse(serialized)); } catch { return p; }
  p.fragments = num(a.fragments); p.wrappers = num(a.wrappers);
  for (const id of Object.keys(ITEM_PRICES)) p.inventory[id] = num(obj(a.inventory)[id], 9999);
  p.lights = strings(a.lights).filter(x => NORMAL_ENDINGS.includes(x as NormalEnding));
  p.achievements = strings(a.achievements).filter(x => ACHIEVEMENTS.some(y => y.id === x));
  const cosmetics = strings(a.cosmetics).filter(x => COSMETICS.some(y => y.id === x));
  p.cosmetics = Array.from(new Set(['whiteShirt', ...cosmetics]));
  const legacy=COSMETICS.find(c=>c.id === a.equipped && p.cosmetics.includes(c.id));
  if(legacy) p.equippedSlots[legacy.kind as keyof EquippedSlots]=legacy.id;
  for(const kind of ['skin','charm','frame'] as const) {
    const id=obj(a.equippedSlots)[kind];
    if(COSMETICS.some(c=>c.id === id && c.kind === kind) && p.cosmetics.includes(id)) p.equippedSlots[kind]=id;
  }
  p.equipped=p.equippedSlots.skin;
  p.settings={muted:obj(a.settings).muted === true,reducedMotion:obj(a.settings).reducedMotion === true};
  const q = obj(a.progress);
  p.progress.runs = num(q.runs); p.progress.retries = num(q.retries);
  p.progress.seats = strings(q.seats).filter(x => ['seat1','seat2','seat3'].includes(x));
  p.progress.seatRuns = Array.isArray(q.seatRuns) ? Array.from(new Set(q.seatRuns.map((x: unknown) => num(x)))).slice(-1000) as number[] : [];
  p.progress.noHitWithoutItems = q.noHitWithoutItems === true;
  p.progress.illusion = q.illusion === true; p.progress.chalk = q.chalk === true; p.progress.introSeen = q.introSeen === true;
  for (const id of ENDINGS) { const count = num(obj(q.endings)[id]); if (count) p.progress.endings[id] = count; }
  for (const [key, val] of Object.entries(obj(q.segments)).slice(0,100)) {
    if (!/^[a-zA-Z0-9_-]{1,40}$/.test(key)) continue;
    const s = obj(val);
    Object.defineProperty(p.progress.segments, key, { enumerable:true,writable:true,configurable:true,value:{
      clear:s.clear === true,full:s.full === true,noHit:s.noHit === true,noItem:s.noItem === true
    }});
  }
  const memories = obj(q.segmentMemories);
  for (const key of Object.keys(SEGMENT_MEMORY_ANCHORS)) {
    if (p.progress.segments[key]?.clear !== true) continue;
    const memory = obj(memories[key]);
    if (!Number.isSafeInteger(memory.runId) || memory.runId < 1 || memory.runId > 999999999) continue;
    if (typeof memory.anchorEvent !== 'string' ||
        (memory.anchorEvent !== '' && !SEGMENT_MEMORY_ANCHORS[key].includes(memory.anchorEvent))) continue;
    if (typeof memory.choiceEvent !== 'string' ||
        (key === '7' ? memory.choiceEvent !== '' : !SEGMENT_MEMORY_CHOICES[key].includes(memory.choiceEvent))) continue;
    if (typeof memory.poemSeen !== 'boolean' || (key === '7' && memory.poemSeen) ||
        (key === '2' && memory.choiceEvent === 'skipClass' && memory.poemSeen)) continue;
    p.progress.segmentMemories[key] = {runId:memory.runId,anchorEvent:memory.anchorEvent,
      choiceEvent:memory.choiceEvent,poemSeen:memory.poemSeen};
  }
  for (const id of NORMAL_ENDINGS) {
    const s = obj(obj(a.endingSnapshots)[id]);
    if (s.stats) p.endingSnapshots[id] = endingSnapshot({stats:stats(s.stats),items:strings(s.items).filter(x => STORY_ITEMS.includes(x)),events:strings(s.events),wet:num(s.wet,100)});
  }
  const savedAnchorEvidence = obj(q.segmentAnchorEvidence);
  for (const key of Object.keys(SEGMENT_MEMORY_ANCHORS)) {
    const allowed = SEGMENT_MEMORY_ANCHORS[key];
    const savedEvent = savedAnchorEvidence[key];
    if (p.progress.segments[key]?.clear === true && allowed.includes(savedEvent)) {
      p.progress.segmentAnchorEvidence[key] = savedEvent;
      continue;
    }
    const recentEvent = p.progress.segmentMemories[key]?.anchorEvent;
    if (recentEvent) {
      p.progress.segmentAnchorEvidence[key] = recentEvent;
      continue;
    }
    for (const ending of NORMAL_ENDINGS) {
      const events = p.endingSnapshots[ending]?.events || [];
      if (!events.includes('segment:' + key + ':noHit') && !events.includes('segment:' + key + ':hurt')) continue;
      const witnessed = allowed.filter(event => events.includes(event));
      if (witnessed.length === 1) {
        p.progress.segmentAnchorEvidence[key] = witnessed[0];
        break;
      }
    }
  }
  const savedCardEvidence = obj(q.cardEventEvidence);
  for (const [key, rule] of Object.entries(MEMORY_CARD_EVENT_RULES)) {
    const event = savedCardEvidence[key];
    if (p.progress.segments[rule.entrySegment]?.clear !== true ||
        p.progress.segments[rule.branch]?.clear !== true || !rule.events.includes(event)) continue;
    if (key.startsWith('secret:') && !(p.progress.endings[key.slice('secret:'.length)] > 0)) continue;
    p.progress.cardEventEvidence[key] = event;
  }
  const h = obj(a.rewardHistory);
  p.rewardHistory = {last:h.last === 'dream' || h.last === 'heaven' ? h.last : '',count:num(h.count,3)};
  p.finalePlayed = a.finalePlayed === true;
  // Media frame storage is validated by the recorder; cap total candidates here.
  p.recordings = Array.isArray(a.recordings) ? a.recordings.slice(0,3).filter((x: unknown) => typeof obj(x).id === 'string').map((x: any) => ({
    id:x.id.slice(0,160),kind:typeof x.kind === 'string' ? x.kind.slice(0,30) : 'highlight',score:num(x.score),
    frames:Array.isArray(x.frames) ? x.frames.slice(0,90) : []
  })) : [];
  p.checkpoint = loadCheckpoint(a.checkpoint,p.progress.runs);
  return p;
}
function blankRun(id: number): Run {
  return { id,active:false,stats:stats(),items:[],events:[],get lines() { return deriveLines(this.events); },lives:3,lifeStock:0,wet:0,invincible:0,segment:'',
    jumps:0,segmentHits:0,usedItems:[],segmentUsedItems:[],hellUsed:false,inHell:false,
    shield:false,magnet:false,light:false,candy:false,candyActive:false,reward:'',rewardScene:false,
    ending:'',collected:[],segmentFragments:0,fragments:0,drops:0,umbrellaSegments:0,everItems:[],finishedSegments:[] };
}
type Snapshot = Pick<Run,'stats'|'items'|'events'|'lives'|'wet'|'light'|'candy'|'candyActive'>;
const CHECKPOINT_SEGMENTS = ['1','2','3','4','5','6','7','alley','playground'];
function checkpointRun(run:Run):Omit<Run,'lines'>{
  const {lines,...persistent}=run;return copy(persistent);
}
function loadCheckpoint(value: unknown, runs: number): RunCheckpoint | null {
  const a=obj(value),raw=obj(a.run);
  if(a.version!==1||!CHECKPOINT_SEGMENTS.includes(a.segment)||raw.segment!==a.segment||
    !Number.isSafeInteger(raw.id)||raw.id<1||raw.id>runs||raw.active!==true||raw.ending!==''||
    typeof a.startAt!=='number'||!Number.isFinite(a.startAt)||a.startAt<0||a.startAt>60||
    !Array.isArray(raw.events)||!Array.isArray(raw.items)||!raw.stats||!Array.isArray(a.baseEvents))return null;
  const run=blankRun(raw.id);
  // Copy only authored fields; malformed profiles cannot inject executable state.
  for(const key of Object.keys(run) as (keyof Run)[]){
    if(key==='lines'||key==='stats')continue;
    const initial=run[key],current=raw[key];
    if(Array.isArray(initial))(run as any)[key]=strings(current);
    else if(typeof initial==='number')(run as any)[key]=typeof current==='number'&&Number.isFinite(current)?clamp(current,999999999):initial;
    else if(typeof initial==='boolean')(run as any)[key]=current===true;
    else if(typeof initial==='string')(run as any)[key]=typeof current==='string'?current.slice(0,160):initial;
  }
  run.stats=stats(raw.stats);run.items=run.items.filter(id=>STORY_ITEMS.includes(id));
  run.everItems=run.everItems.filter(id=>STORY_ITEMS.includes(id));
  run.usedItems=run.usedItems.filter(id=>Object.prototype.hasOwnProperty.call(ITEM_PRICES,id));
  run.segmentUsedItems=run.segmentUsedItems.filter(id=>run.usedItems.includes(id));
  run.finishedSegments=run.finishedSegments.filter(key=>CHECKPOINT_SEGMENTS.includes(key));
  run.lives=Math.max(1,num(run.lives,3));run.lifeStock=num(run.lifeStock,2);run.wet=clamp(run.wet,100);
  run.invincible=clamp(run.invincible,3);run.reward=run.reward==='dream'||run.reward==='heaven'?run.reward:'';
  run.inHell=false;run.rewardScene=false;run.ending='';
  const available:Record<string,number>={};
  for(const id of Object.keys(ITEM_PRICES))available[id]=num(obj(a.available)[id],9999);
  const score=obj(a.score);
  return {version:1,segment:a.segment,startAt:a.startAt,run:checkpointRun(run),available,baseEvents:strings(a.baseEvents),
    ...(score.clear===true?{score:{clear:true,full:score.full===true,noHit:score.noHit===true,noItem:score.noItem===true}}:{})};
}
export class GameModel {
  profile: Profile; run: Run;
  private writer?: (json: string) => void;
  private snapshot?: Snapshot;
  private available: Record<string, number> = {};
  private segmentBaseEvents: string[] = [];
  private segmentScore?: SegmentResult;
  private settledEnding = '';
  lastSaveError = false;
  constructor(readProfile?: string, save?: (json: string) => void) {
    this.profile = loadProfile(readProfile); this.writer = save; this.run = blankRun(0);
  }
  save(): boolean {
    this.updateCheckpointCarry();
    try { if (this.writer) this.writer(JSON.stringify(this.profile)); this.lastSaveError=false; }
    catch { this.lastSaveError=true; }
    return !this.lastSaveError;
  }
  beginRun(): void {
    this.profile.progress.runs = num(this.profile.progress.runs + 1);
    this.run = blankRun(this.profile.progress.runs); this.run.active=true;
    this.available = copy(this.profile.inventory); this.snapshot=undefined; this.segmentScore=undefined; this.settledEnding='';
    this.profile.checkpoint=null;
    this.save();
  }
  /** Keep permanent pickups and expenditure when restarting the saved entrance. */
  private updateCheckpointCarry(): void {
    const checkpoint=this.profile.checkpoint;
    if(!checkpoint||!this.run.active||checkpoint.run.id!==this.run.id||checkpoint.segment!==this.run.segment)return;
    for(const key of ['collected','usedItems','segmentUsedItems','everItems','finishedSegments'] as const)checkpoint.run[key]=[...this.run[key]];
    for(const key of ['fragments','segmentFragments','jumps','segmentHits','drops','umbrellaSegments','lifeStock'] as const)checkpoint.run[key]=this.run[key];
    checkpoint.run.hellUsed=this.run.hellUsed;checkpoint.run.reward=this.run.reward;
    checkpoint.run.light=checkpoint.run.light&&this.run.light;
    checkpoint.run.candyActive=checkpoint.run.candyActive&&this.run.candyActive;
    checkpoint.run.invincible=Math.min(checkpoint.run.invincible,this.run.invincible);
    for(const event of this.run.events.filter(event=>event.startsWith('segment:'+checkpoint.segment+':'))){
      if(!checkpoint.run.events.includes(event))checkpoint.run.events.push(event);
    }
    checkpoint.available=copy(this.available);checkpoint.score=this.segmentScore?copy(this.segmentScore):undefined;
  }
  resumeCheckpoint(): {segment:string;startAt:number} | null {
    const checkpoint=loadCheckpoint(this.profile.checkpoint,this.profile.progress.runs);
    if(!checkpoint)return null;
    this.run=Object.assign(blankRun(checkpoint.run.id),copy(checkpoint.run));
    // A stock life or protective effect already spent after the entrance stays spent.
    this.run.light=checkpoint.run.light;this.run.shield=false;this.run.magnet=false;
    this.available=copy(checkpoint.available);
    for(const id of Object.keys(ITEM_PRICES))this.available[id]=Math.min(this.available[id],this.profile.inventory[id]);
    this.snapshot=copy({stats:this.run.stats,items:this.run.items,events:this.run.events,lives:this.run.lives,
      wet:this.run.wet,light:this.run.light,candy:this.run.candy,candyActive:this.run.candyActive});
    this.segmentBaseEvents=[...checkpoint.baseEvents];this.segmentScore=checkpoint.score?copy(checkpoint.score):undefined;this.settledEnding='';
    return {segment:checkpoint.segment,startAt:checkpoint.startAt};
  }
  allLit(): boolean { return NORMAL_ENDINGS.every(id => this.profile.lights.includes(id)); }
  determineEnding(): NormalEnding {
    const s = this.run.stats;
    if (s.personality >= 85) return 'outside';
    if (s.relationship >= 75) return 'backrow';
    if (s.personality <= 40 && [s.relationship,s.will,s.appearance].every(n => n >= 30 && n < 70)) return 'morning';
    return 'desk';
  }
  private unlock(id: string): void {
    if (!this.profile.achievements.includes(id)) this.profile.achievements.push(id);
  }
  private rememberCompletedBranch(): void {
    const branch = this.run.segment, rule = MEMORY_CARD_EVENT_RULES['branch:' + branch];
    if (!this.run.active || !rule || !this.run.finishedSegments.includes(rule.entrySegment) ||
        !this.run.finishedSegments.includes(branch) ||
        this.profile.progress.segments[branch]?.clear !== true) return;
    const entry = BRANCH_ENTRY_EVENT[branch];
    const event = rule.events.find(value => this.run.events.includes(value) &&
      (value === entry ? this.segmentBaseEvents.includes(value) : !this.segmentBaseEvents.includes(value)));
    if (event) this.profile.progress.cardEventEvidence['branch:' + branch] = event;
  }
  event(id: string): boolean {
    if (!this.run.active || this.run.ending || this.run.events.includes(id)) return false;
    if (id === 'back' && !this.allLit()) return false;
    if (id === 'cheat' && !this.run.items.includes('pen')) return this.event('noPen');
    if (id === 'graffiti' && !this.run.items.includes('pen')) return false;
    const group = GROUPS.find(g => g.includes(id));
    if (group && group.some(v => this.run.events.includes(v))) return false;
    const special = ['dreamReward','heavenReward','dreamNoGround','tableEdge','heavenChain12','illusion','chalk'];
    if (!PUSH[id] && !special.includes(id) && !/^symbol[1-6]$/.test(id)) return false;
    this.run.events.push(id);
    const d = PUSH[id] || [0,0,0,0];
    (['personality','relationship','will','appearance'] as const).forEach((key,i) => this.run.stats[key]=clamp(this.run.stats[key]+d[i]));
    if (this.run.events.includes('skipClass')) this.run.stats.relationship=Math.min(65,this.run.stats.relationship);
    if (id === 'alley') this.run.wet=70;
    if (STORY_ITEMS.includes(id)) {
      this.run.items.push(id);
      if (!this.run.everItems.includes(id)) this.run.everItems.push(id);
    }
    if (['seat1','seat2','seat3'].includes(id) && !this.profile.progress.seatRuns.includes(this.run.id)) {
      this.profile.progress.seatRuns.push(this.run.id);
      if (!this.profile.progress.seats.includes(id)) this.profile.progress.seats.push(id);
      if (this.profile.progress.seats.length === 3) this.unlock('threeSeats');
    }
    if (id === 'pianoClose') this.unlock('sharpEyes');
    if (id === 'back') this.unlock('lookBack');
    if (id === 'dreamReward') { this.run.candy=true; this.run.rewardScene=false; }
    if (id === 'heavenReward') { this.run.light=true; this.run.rewardScene=false; }
    if (id === 'dreamNoGround') this.unlock('floated');
    if (id === 'tableEdge') this.unlock('bigDesk');
    if (id === 'heavenChain12') this.unlock('heldUp');
    if (id === 'illusion') this.profile.progress.illusion=true;
    if (MEMORY_CARD_EVENT_RULES['branch:' + this.run.segment]?.events.includes(id)) this.rememberCompletedBranch();
    this.save(); return true;
  }
  enterSegment(key: string,startAt=0): void {
    if (this.run.segment === key && this.snapshot) return;
    this.run.segment=key; this.run.segmentHits=0; this.run.jumps=0;
    this.run.segmentFragments=0; this.run.segmentUsedItems=[]; this.segmentScore=undefined;
    this.run.shield=false; this.run.magnet=false; this.run.candyActive=false;
    this.run.wet=Math.max(0,this.run.wet-30);
    if (['7','s7','segment7','graduation'].includes(key) && this.run.candy) {
      this.run.candy=false; this.run.candyActive=true; this.run.invincible=Math.max(3,this.run.invincible);
    }
    this.segmentBaseEvents=[...this.run.events];
    this.snapshot=copy({stats:this.run.stats,items:this.run.items,events:this.run.events,lives:this.run.lives,wet:this.run.wet,
      light:this.run.light,candy:this.run.candy,candyActive:this.run.candyActive});
    if(this.run.active&&CHECKPOINT_SEGMENTS.includes(key)&&!this.run.ending){
      this.profile.checkpoint={version:1,segment:key,startAt,run:checkpointRun(this.run),available:copy(this.available),baseEvents:[...this.segmentBaseEvents]};
      this.save();
    }
  }
  /** Save only the events newly accepted for a completed numeric segment in this run. */
  recordSegmentMemory(key: string): boolean {
    if (!this.run.active || this.run.ending || this.run.segment !== key ||
        !Object.prototype.hasOwnProperty.call(SEGMENT_MEMORY_ANCHORS,key) ||
        !this.run.finishedSegments.includes(key) || this.profile.progress.segments[key]?.clear !== true) return false;
    const events = this.run.events.filter(event => !this.segmentBaseEvents.includes(event));
    const anchors = SEGMENT_MEMORY_ANCHORS[key].filter(event => events.includes(event));
    const choices = SEGMENT_MEMORY_CHOICES[key].filter(event => events.includes(event));
    if (anchors.length > 1 || choices.length !== (key === '7' ? 0 : 1)) return false;
    const anchorEvent = anchors[0] || '', choiceEvent = choices[0] || '';
    const previous = this.profile.progress.segmentMemories[key];
    const duplicate = previous?.runId === this.run.id && previous.anchorEvent === anchorEvent &&
      previous.choiceEvent === choiceEvent;
    const firstAnchorEvidence = !!anchorEvent && !this.profile.progress.segmentAnchorEvidence[key];
    if (duplicate && !firstAnchorEvidence) return false;
    if (firstAnchorEvidence) this.profile.progress.segmentAnchorEvidence[key] = anchorEvent;
    if (!duplicate) this.profile.progress.segmentMemories[key] = {runId:this.run.id,anchorEvent,choiceEvent,poemSeen:false};
    this.save(); return true;
  }
  /** Called only when the authored poem page is actually entered. */
  markSegmentPoem(index: number): boolean {
    if (!Number.isInteger(index) || index < 0 || index > 5 || !this.run.active || this.run.ending) return false;
    const key = String(index + 1), memory = this.profile.progress.segmentMemories[key];
    if (!memory || memory.runId !== this.run.id || memory.poemSeen ||
        !SEGMENT_MEMORY_CHOICES[key].includes(memory.choiceEvent) ||
        !this.run.finishedSegments.includes(key) || !this.run.events.includes(memory.choiceEvent)) return false;
    if (index === 1 && memory.choiceEvent === 'skipClass') return false;
    if (index === 0 && memory.choiceEvent === 'alley') {
      if (this.run.segment !== 'alley' || !this.run.events.includes('alleyReturn')) return false;
    } else if (this.run.segment !== key) return false;
    memory.poemSeen = true; this.save(); return true;
  }
  private consume(id: string): boolean {
    if (!(num(this.available[id]) > 0) || !(num(this.profile.inventory[id]) > 0) || this.run.usedItems.includes(id)) return false;
    this.available[id]--; this.profile.inventory[id]--;
    this.run.usedItems.push(id); this.run.segmentUsedItems.push(id); return true;
  }
  private restore(rewind: boolean): void {
    if (this.snapshot) {
      this.run.stats=copy(this.snapshot.stats); this.run.items=[...this.snapshot.items]; this.run.events=[...this.snapshot.events];
      this.run.wet=this.snapshot.wet; this.run.light=this.snapshot.light;
      this.run.candy=this.snapshot.candy;
    }
    this.run.candyActive=!!this.snapshot?.candyActive;
    this.run.lives=rewind && this.snapshot ? Math.max(1,this.snapshot.lives) : 1;
    this.run.invincible=this.run.candyActive ? 3 : 0.8;
    this.run.inHell=false; this.run.shield=false; this.run.magnet=false;
    this.profile.progress.retries=num(this.profile.progress.retries+1);
  }
  damage(): DamageResult {
    if (!this.run.active || this.run.ending || this.run.rewardScene || this.run.invincible > 0 || this.run.inHell) return 'ignored';
    if (this.run.light) { this.run.light=false; this.run.invincible=0.8; return 'ignored'; }
    if (this.run.shield) { this.run.shield=false; this.run.invincible=0.8; return 'ignored'; }
    this.run.lives=Math.max(0,this.run.lives-1); this.run.segmentHits++; this.run.drops++;
    if(!this.run.events.includes('lifeLost')) this.run.events.push('lifeLost');
    if (this.run.drops <= 5) this.run.stats.appearance=clamp(this.run.stats.appearance+1);
    this.run.invincible=0.8;
    if (this.run.lifeStock > 0) { this.run.lifeStock--; this.run.lives=Math.min(3,this.run.lives+1); }
    if (this.run.lives > 0) return 'hit';
    if (this.consume('rewind')) { this.restore(true); this.save(); return 'rewind'; }
    if (this.consume('feather')) { this.run.lives=3; this.run.invincible=3; this.save(); return 'feather'; }
    if (!this.run.hellUsed) { this.run.hellUsed=true; this.run.inHell=true; this.save(); return 'hell'; }
    this.restore(false); this.save(); return 'restart';
  }
  hellResult(success: boolean): void {
    if (!this.run.inHell) return;
    this.run.inHell=false;
    if (success) {
      this.run.lives=3; this.run.invincible=3; this.run.stats.appearance=clamp(this.run.stats.appearance+8);
      this.run.events.push('hellClear'); this.profile.fragments=num(this.profile.fragments+15);
    } else { this.restore(false); this.run.events.push('hellFall'); }
    this.save();
  }
  collectFragment(id: string, value = 1): boolean {
    if (!this.run.active || this.run.ending || !id || this.run.collected.includes(id)) return false;
    const amount=num(value,100);
    if (!amount) return false;
    this.run.collected.push(id); this.run.fragments+=amount; this.run.segmentFragments+=amount;
    this.profile.fragments=num(this.profile.fragments+amount); this.save(); return true;
  }
  collectLife(id=''): void {
    if (!this.run.active || this.run.ending || this.run.inHell || id&&this.run.collected.includes('life:'+id)) return;
    if(id)this.run.collected.push('life:'+id);
    if (this.run.lives < 3) this.run.lives++; else this.run.lifeStock=Math.min(2,this.run.lifeStock+1);
    if(id)this.save();
  }
  collectWrapper(id: string, value=1): boolean {
    if (!this.run.active || !this.run.rewardScene || this.run.collected.includes('wrapper:'+id)) return false;
    this.run.collected.push('wrapper:'+id); this.profile.wrappers=num(this.profile.wrappers+num(value,20)); this.save(); return true;
  }
  finishSegment(total: number): SegmentResult {
    if (this.segmentScore) return copy(this.segmentScore);
    const amount=num(total,10000);
    const result = {clear:true,full:amount>0 && this.run.segmentFragments>=amount,
      noHit:this.run.segmentHits === 0,noItem:this.run.segmentHits === 0 && this.run.segmentUsedItems.length === 0};
    this.segmentScore=result;
    if (!this.run.active || this.run.finishedSegments.includes(this.run.segment)) return copy(result);
    this.run.finishedSegments.push(this.run.segment);
    this.run.events.push('segment:'+this.run.segment+':'+(result.noHit ? 'noHit' : 'hurt'));
    const previous=this.profile.progress.segments[this.run.segment];
    this.profile.progress.segments[this.run.segment] = previous ? {
      clear:true,full:previous.full || result.full,noHit:previous.noHit || result.noHit,noItem:previous.noItem || result.noItem
    } : copy(result);
    if (result.full) this.profile.fragments=num(this.profile.fragments+8);
    if (result.noHit) this.unlock('noHit');
    if (result.noItem) this.profile.progress.noHitWithoutItems=true;
    if (amount>0 && this.run.segmentFragments>=amount*0.9) this.unlock('collector');
    if (result.noHit && this.run.events.includes('cheat') && !this.segmentBaseEvents.includes('cheat')) this.unlock('perfectScore');
    if (this.run.jumps === 0) this.unlock('noJump');
    if (this.run.items.includes('umbrella')) { this.run.umbrellaSegments++; if (this.run.umbrellaSegments>=3) this.unlock('umbrellaKeeper'); }
    this.rememberCompletedBranch();
    this.save(); return copy(result);
  }
  enterEnding(id: string): boolean {
    if (!ENDINGS.includes(id) || (id === 'secondGrade' && !this.allLit())) return false;
    if (this.run.active && this.run.ending && this.run.ending !== id) return false;
    this.run.ending=id; this.run.inHell=false; this.run.rewardScene=false; return true;
  }
  finishEnding(id: string): boolean {
    if(this.settledEnding === id) return false;
    if (!ENDINGS.includes(id) || (id === 'secondGrade' && !this.allLit())) return false;
    if (this.run.active && this.run.ending && this.run.ending !== id) return false;
    if (!this.run.active && id !== 'secondGrade') return false;
    if (!this.enterEnding(id)) return false;
    const first=!(this.profile.progress.endings[id]>0);
    this.profile.progress.endings[id]=num((this.profile.progress.endings[id] || 0)+1);
    if (NORMAL_ENDINGS.includes(id as NormalEnding)) {
      if (!this.profile.lights.includes(id)) this.profile.lights.push(id);
      if (!this.profile.endingSnapshots[id]) this.profile.endingSnapshots[id]=endingSnapshot({
        stats:this.run.stats,items:this.run.items,events:this.run.events,wet:this.run.wet
      });
      if (this.allLit()) this.unlock('lampKeeper');
    }
    if (id === 'secondGrade') {
      this.unlock('secondGrade'); this.profile.progress.chalk=true;
      if (!this.profile.cosmetics.includes('namelessNotebook')) this.profile.cosmetics.push('namelessNotebook');
    }
    const rule = MEMORY_CARD_EVENT_RULES['secret:' + id];
    if (rule && this.run.active && this.run.segment === rule.branch &&
        this.run.finishedSegments.includes(rule.entrySegment) && this.run.finishedSegments.includes(rule.branch) &&
        this.profile.progress.segments[rule.branch]?.clear === true) {
      const event = rule.events.find(value => this.segmentBaseEvents.includes(value) && this.run.events.includes(value));
      if (event) this.profile.progress.cardEventEvidence['secret:' + id] = event;
    }
    if (id === 'runaway' || id === 'wall') this.unlock(id);
    if (id !== 'secondGrade' && this.run.active && this.run.everItems.length === 0) this.unlock('emptyPockets');
    this.settledEnding=id;
    // Visiting the unlocked wall ending from the hall must keep an unfinished run.
    if(this.run.active&&this.profile.checkpoint?.run.id===this.run.id)this.profile.checkpoint=null;
    this.run.active=false; this.save(); return first;
  }
  chooseReward(random: number = Math.random()): 'dream' | 'heaven' {
    if (this.run.reward) { this.run.rewardScene=true; return this.run.reward; }
    const h=this.profile.rewardHistory;
    let chosen: 'dream' | 'heaven' = Number.isFinite(random) && random < 0.5 ? 'dream' : 'heaven';
    if (h.count>=3 && h.last) chosen=h.last === 'dream' ? 'heaven' : 'dream';
    h.count=chosen === h.last ? Math.min(3,h.count+1) : 1; h.last=chosen;
    this.run.reward=chosen; this.run.rewardScene=true; this.save(); return chosen;
  }
  useItem(id: string): boolean {
    if (!this.run.active || this.run.ending || this.run.inHell || this.run.rewardScene || !['shield','magnet','eraser'].includes(id)) return false;
    if (!this.consume(id)) return false;
    if (id === 'shield') this.run.shield=true;
    if (id === 'magnet') this.run.magnet=true;
    this.save(); return true;
  }
  buy(id: string): boolean {
    if (this.run.active) return false;
    if (Object.prototype.hasOwnProperty.call(ITEM_PRICES,id)) {
      const price=ITEM_PRICES[id];
      if (num(this.profile.fragments)<price || num(this.profile.inventory[id],9999)>=9999) return false;
      this.profile.fragments=num(this.profile.fragments)-price;
      this.profile.inventory[id]=num(this.profile.inventory[id],9999)+1; this.save(); return true;
    }
    const c=COSMETICS.find(x => x.id === id);
    if (!c || c.price<0 || this.profile.cosmetics.includes(id) || num(this.profile.wrappers)<c.price) return false;
    this.profile.wrappers=num(this.profile.wrappers)-c.price; this.profile.cosmetics.push(id); this.save(); return true;
  }
  equip(id: string): boolean {
    if (this.run.active || !this.profile.cosmetics.includes(id)) return false;
    const cosmetic=COSMETICS.find(c=>c.id === id);
    if(!cosmetic) return false;
    this.profile.equippedSlots[cosmetic.kind as keyof EquippedSlots]=id;
    this.profile.equipped=this.profile.equippedSlots.skin; this.save(); return true;
  }
}




