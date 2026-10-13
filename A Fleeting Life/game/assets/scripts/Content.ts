/**
 * 《浮生》第一章《学堂》内容表。
 * 时间统一为段内秒；碰撞框、存档和推杆规则由引擎/模型负责。
 * 正式美术与音频仍待定，ART_MANIFEST 只是稳定的替换入口。
 */
export type Theme = 'dawn' | 'rain' | 'noon' | 'gray' | 'dusk' | 'night' | 'graduate';
export type ObstacleKind = 'low' | 'high' | 'tall';
/** 第一章的稳定内容键；叙事表用这些键对应跑段和抉择，不另造存档 ID。 */
export type MainSegmentId = 1 | 2 | 3 | 4 | 5 | 6 | 7;
export type BranchId = 'alley' | 'playground';
export type ChapterSceneKey = '1' | '2' | '3' | '4' | '5' | '6' | '7' | BranchId;
export type MainChoiceId = 1 | 2 | 3 | 4 | 5 | 6;
export type MicroEventId = 'hat' | 'bag' | 'paper' | 'plant' | 'bench' | 'milk' | 'wish';
export interface ObstacleDefinition {
  at: number;
  kind: ObstacleKind;
  label: string;
}
export interface MicroDefinition {
  at: number;
  event: MicroEventId;
  label: string;
}
/** 段首的具象提示；events 记录后续真实动作，不推定玩家接触了 object。 */
export interface MemoryAnchorDefinition {
  id: 'hat' | 'bag' | 'homework' | 'door' | 'bench' | 'milk' | 'wish';
  object: string;
  line: string;
  sound: string;
  events: readonly string[];
  question: string;
}
export interface SegmentDefinition {
  id: MainSegmentId;
  name: string;
  duration: number;
  theme: Theme;
  fragments: number;
  /** 相对全段比例；null 表示本段无加命。 */
  lifeAt: number | null;
  micro: MicroDefinition;
  memoryAnchor: MemoryAnchorDefinition;
  obstacles: ObstacleDefinition[];
}
export interface BranchDefinition extends Omit<SegmentDefinition, 'id' | 'micro' | 'memoryAnchor'> {
  id: BranchId;
  /** 两条支线没有额外微抉择；支线末端由专门的二次选择处理。 */
  micro: MicroDefinition | null;
}

export const SEGMENTS: SegmentDefinition[] = [
  {
    id: 1, name: '幼儿园门口', duration: 40, theme: 'dawn', fragments: 18, lifeAt: null,
    micro: { at: 20, event: 'hat', label: '捡起风吹落的红帽子' },
    memoryAnchor: { id:'hat', object:'红帽', line:'红帽还挂在门边，风已经进来了。', sound:'memoryGate', events:['hat'], question:'风把帽子吹走时，你记得谁在前面吗？' },
    obstacles: [
      { at: 12, kind: 'low', label: '落在路上的书包' },
      { at: 18, kind: 'tall', label: '开着的车门' },
      { at: 25, kind: 'low', label: '小小的台阶' },
      { at: 31, kind: 'high', label: '滑梯的横梁' },
      { at: 35, kind: 'low', label: '第二只书包' },
    ],
  },
  {
    id: 2, name: '雨里的伞', duration: 45, theme: 'rain', fragments: 22, lifeAt: 0.6,
    micro: { at: 31.5, event: 'bag', label: '扶起倒下的书包' },
    memoryAnchor: { id:'bag', object:'湿书包', line:'伞架空了一格，书包还在滴水。', sound:'memoryRain', events:['bag'], question:'雨停以后，门边的书包会怎样？' },
    obstacles: [
      { at: 5, kind: 'low', label: '雨中的台阶' },
      { at: 10, kind: 'high', label: '屋檐下的横架' },
      { at: 17, kind: 'low', label: '倒下的自行车' },
      { at: 21, kind: 'high', label: '晾伞的横杆' },
      { at: 24, kind: 'low', label: '台阶边的旧箱子' },
      { at: 35, kind: 'high', label: '低垂的雨棚' },
      { at: 40, kind: 'low', label: '校门前的门槛' },
    ],
  },
  {
    id: 3, name: '课间十分钟', duration: 45, theme: 'noon', fragments: 24, lifeAt: null,
    micro: { at: 24.75, event: 'paper', label: '按住被风卷走的白纸' },
    memoryAnchor: { id:'homework', object:'作业本', line:'作业本最后一行，还留着空格。', sound:'memoryPaper', events:['copyHomework','ownHomework'], question:'最后一行，会是谁的字迹？' },
    obstacles: [
      { at: 4, kind: 'high', label: '窗边的横杆' },
      { at: 8, kind: 'low', label: '拖把桶' },
      { at: 12, kind: 'low', label: '讲台的台阶' },
      { at: 16, kind: 'high', label: '架起的跳绳' },
      { at: 21, kind: 'low', label: '静静的皮球' },
      { at: 27, kind: 'high', label: '晾着的抹布架' },
      { at: 35, kind: 'tall', label: '叠起的软垫' },
      { at: 39, kind: 'high', label: '器材架横梁' },
      { at: 43, kind: 'low', label: '门口的小台阶' },
    ],
  },
  {
    id: 4, name: '走廊里的冤枉', duration: 50, theme: 'gray', fragments: 28, lifeAt: 0.45,
    micro: { at: 38, event: 'plant', label: '扶正窗台的盆栽' },
    memoryAnchor: { id:'door', object:'走廊门缝', line:'门缝里有光，那句话还在喉咙里。', sound:'memoryCorridor', events:['speak','silent'], question:'那句话，会留在门里吗？' },
    obstacles: [
      // Keep the first fixed obstacle fully readable for at least two seconds
      // after the segment starts; its solid edge reaches the runner at ~2.04s.
      { at: 2.3, kind: 'low', label: '倒下的扫帚' },
      { at: 5, kind: 'high', label: '椅背的横档' },
      { at: 8, kind: 'low', label: '散落的作业本' },
      { at: 11, kind: 'high', label: '公告栏下的横架' },
      { at: 14, kind: 'tall', label: '一摞高高的作业本' },
      { at: 17, kind: 'low', label: '倒下的椅子' },
      { at: 20, kind: 'high', label: '走廊的低横梁' },
      { at: 28, kind: 'low', label: '扫帚与簸箕' },
      { at: 35, kind: 'high', label: '半开的储物柜门' },
      { at: 39.8, kind: 'tall', label: '办公桌旁的纸箱' },
      { at: 44, kind: 'high', label: '琴房门前的横栏' },
      { at: 47, kind: 'low', label: '门前的旧台阶' },
    ],
  },
  {
    id: 5, name: '家长会', duration: 50, theme: 'dusk', fragments: 30, lifeAt: null,
    micro: { at: 25, event: 'bench', label: '在另一个孩子身旁坐一会儿' },
    memoryAnchor: { id:'bench', object:'长椅', line:'长椅空出半边，声音从门里传来。', sound:'memoryBench', events:['bench'], question:'那空出的半边，曾有人坐过吗？' },
    // 本段可以全程只滑铲通过，让「一次都没跳」有可读、可练习的路线。
    // 家长与孩子只作为背景；所有碰撞都来自场景物件。
    obstacles: [
      { at: 3, kind: 'high', label: '摆高的长椅' },
      { at: 7, kind: 'high', label: '茶盘架的横档' },
      { at: 11, kind: 'high', label: '长椅背板' },
      { at: 15, kind: 'high', label: '垂下的成绩单架' },
      { at: 19, kind: 'high', label: '折叠椅的横档' },
      { at: 22, kind: 'high', label: '横着的茶水托盘' },
      { at: 28, kind: 'high', label: '走廊里的长椅' },
      { at: 32, kind: 'high', label: '奖状展示架' },
      { at: 36, kind: 'high', label: '第二排椅背' },
      { at: 39.5, kind: 'high', label: '茶杯架的横档' },
      { at: 44, kind: 'high', label: '横着的告示牌' },
      { at: 47, kind: 'high', label: '教学楼的低横梁' },
    ],
  },
  {
    id: 6, name: '深夜的台灯', duration: 45, theme: 'night', fragments: 32, lifeAt: 0.35,
    micro: { at: 18, event: 'milk', label: '喝掉台灯边温着的牛奶' },
    memoryAnchor: { id:'milk', object:'牛奶杯', line:'台灯边那杯牛奶，还冒着一点热气。', sound:'memoryLamp', events:['milk'], question:'夜深了，谁把杯子放在这里？' },
    obstacles: [
      { at: 3, kind: 'low', label: '第一摞书' },
      { at: 6, kind: 'high', label: '伸出的台灯支架' },
      { at: 9, kind: 'tall', label: '高高的参考书' },
      { at: 12, kind: 'low', label: '摊开的字典' },
      { at: 21, kind: 'high', label: '书架的隔板' },
      { at: 24, kind: 'tall', label: '写完的练习册' },
      { at: 28, kind: 'low', label: '合上的字典' },
      { at: 32, kind: 'high', label: '台灯的横臂' },
      { at: 35.5, kind: 'low', label: '床前的书堆' },
      { at: 40, kind: 'low', label: '最后一本练习册' },
    ],
  },
  {
    id: 7, name: '毕业照·校门口那棵树', duration: 55, theme: 'graduate', fragments: 42, lifeAt: 0.4,
    micro: { at: 33, event: 'wish', label: '摸一摸树上的许愿牌' },
    memoryAnchor: { id:'wish', object:'许愿牌', line:'树上的木牌晃了一下，快门还没响。', sound:'memoryPhoto', events:['wish'], question:'快门响前，手心记住了什么？' },
    obstacles: [
      { at: 3, kind: 'high', label: '合影架的横杆' },
      { at: 6.5, kind: 'low', label: '旧书包' },
      { at: 10, kind: 'tall', label: '合影的高台' },
      { at: 13.5, kind: 'high', label: '横挂的纪念册' },
      { at: 17, kind: 'low', label: '台阶边的纸箱' },
      { at: 19.5, kind: 'high', label: '照相架的横档' },
      { at: 25, kind: 'tall', label: '收起的课桌' },
      { at: 28, kind: 'high', label: '毕业横幅的支架' },
      { at: 30.8, kind: 'low', label: '一叠旧练习册' },
      { at: 36, kind: 'high', label: '校门的横栏' },
      { at: 38.8, kind: 'tall', label: '装着旧书的箱子' },
      { at: 41.6, kind: 'low', label: '树下的相册' },
      { at: 44.4, kind: 'high', label: '合影架的最后一道横杆' },
      { at: 47.2, kind: 'tall', label: '校门边的旧木箱' },
      { at: 50, kind: 'high', label: '低下来的纪念横幅' },
      { at: 52.8, kind: 'low', label: '熟悉的门槛' },
    ],
  },
];

export const BRANCHES: Record<BranchId, BranchDefinition> = {
  alley: {
    id: 'alley', name: '巷子', duration: 35, theme: 'gray', fragments: 16, lifeAt: null, micro: null,
    obstacles: [
      { at: 5, kind: 'low', label: '巷口的杂物' },
      { at: 9, kind: 'high', label: '屋檐下的晾衣杆' },
      { at: 13, kind: 'low', label: '空木箱' },
      { at: 17, kind: 'low', label: '垫在地上的砖' },
      { at: 21, kind: 'high', label: '低矮的雨棚' },
      { at: 25, kind: 'low', label: '墙根的杂物堆' },
      { at: 29, kind: 'high', label: '窗边的横架' },
    ],
  },
  playground: {
    id: 'playground', name: '操场', duration: 40, theme: 'noon', fragments: 20, lifeAt: null, micro: null,
    obstacles: [
      { at: 4, kind: 'low', label: '静止的足球' },
      { at: 7.5, kind: 'high', label: '器材架的横杆' },
      { at: 11, kind: 'low', label: '第一道跨栏' },
      { at: 13.5, kind: 'high', label: '低垂的跳绳' },
      { at: 17, kind: 'low', label: '第二道跨栏' },
      { at: 22, kind: 'high', label: '架起的体操垫' },
      { at: 30, kind: 'low', label: '围墙下的旧球' },
      { at: 33.5, kind: 'high', label: '围墙边的横杆' },
      { at: 37, kind: 'low', label: '跑道外的门槛' },
    ],
  },
};

/** 文字版叙事走廊；录音入口独立，当前没有正式配音。 */
export const POEMS: string[] = [
  '有人把伞留在门口。\n雨里的事，只有雨知道。',
  '教室很大，椅子很多。\n你只坐得下一把。',
  '分数是别人写的。\n往后的路，是自己跑的。',
  '有些声音停下来，\n才听见别的。',
  '饭凉了可以再热。\n话凉了，就说不出口了。',
  '带上他走吧。\n他就是你。',
];
export const POEM_LOOK_BACK = '你把他留在了那里。\n他记得你回头看过。';

export interface EndingDefinition { name: string; line: string; duration: number; color: string }
export const ENDINGS: Record<'morning' | 'backrow' | 'outside' | 'desk' | 'secondGrade' | 'runaway' | 'wall', EndingDefinition> = {
  morning: {
    name: '明天的早自习', line: '闹钟响了，你还是穿上了校服。\n什么都没改变，也什么都还在。',
    duration: 14, color: '#f4ecd3',
  },
  backrow: {
    name: '教室后排', line: '你成了那个不说话的人。\n窗外很亮，桌子有点凉。',
    duration: 14, color: '#b5c0c6',
  },
  outside: {
    name: '跑道之外', line: '你提前走出了校门。\n不是逃离，是换了一条路走。',
    duration: 14, color: '#efc574',
  },
  desk: {
    name: '小一号的课桌', line: '升上初中以后，你回了一次小学。\n那张课桌比你记得的小得多。',
    duration: 14, color: '#dc9976',
  },
  secondGrade: {
    name: '回到二年级', line: '某个下午，所有的门都还开着，\n你还没有做过任何一个选择。',
    duration: 14, color: '#d4badb',
  },
  runaway: {
    name: '跑出去', line: '围墙塌了。你一直跑，画面变白。\n围墙外面，也只是普通的街。',
    duration: 14, color: '#eedbb2',
  },
  wall: {
    name: '墙的另一边', line: '你爬到墙头，看见另一边。\n墙的那边，也只是路。',
    duration: 14, color: '#a7bec5',
  },
};

export const CHAPTERS = [
  { id: 1, name: '学堂', season: '小满', available: true },
  { id: 2, name: '第二章 · 待定', season: '芒种', available: false },
  { id: 3, name: '第三章 · 待定', season: '白露', available: false },
  { id: 4, name: '第四章 · 待定', season: '霜降', available: false },
  { id: 5, name: '终章 · 待定', season: '冬至', available: false },
];

export interface ArtManifestEntry {
  key: string;
  kind: 'sprite' | 'background' | 'audio';
  description: string;
  /** 相对 assets/resources 的路径；空串使用程序占位，不会请求文件。 */
  path: string;
}
/** 每个逻辑像素对应 2×2 个显示像素；角色仍占 48×48 逻辑框，脚底位于逻辑 y=44。 */
export const ART_PIXEL_DENSITY = 2;
export const CHARACTER_ANIMATIONS = {
  idle: { frames: 8, fps: 12 },
  runStart: { frames: 6, fps: 60 },
  run: { frames: 16, fps: 36 },
  jump: { frames: 16, fps: 16 / (460 / 600) },
  doubleJump: { frames: 16, fps: 16 / (460 / 600) },
  dive: { frames: 6, fps: 60 },
  slide: { frames: 20, fps: 25 },
  slideRecovery: { frames: 8, fps: 32 },
  land: { frames: 6, fps: 24 },
  hurt: { frames: 8, fps: 24 },
  sit: { frames: 8, fps: 12 },
  climb: { frames: 16, fps: 24 },
  break: { frames: 10, fps: 25 },
  sleep: { frames: 8, fps: 12 },
  celebrate: { frames: 16, fps: 24 },
} as const;
/** 与 scripts/xiaoman_rig.py / xiaoman-model.json 相同的固定物理与画幅。 */
export const XIAOMAN_MOTION = {
  slideSeconds: .8, slideEntrySeconds: .12, slideRecoverySeconds: .25,
  slideRecoveryLowSeconds: .15, standingCollisionHeight: 40, slidingCollisionHeight: 18,
  runSpeed: 72, jumpVelocity: 230, gravity: 600, diveVelocity: -500,
  canvas: 48, anchorX: 24, anchorY: 44, visibleStandingHeight: 40,
} as const;
/** 支撑脚的后蹬距离与世界位移一致；步频随真实跑速变化。 */
export const XIAOMAN_GAIT = {
  cycleTravel: 32, stanceFraction: .5, ankleY: 42.8, halfSpan: 8,
  hipY: 30.8, hipBob: .6, swingLift: 8,
} as const;
export type CharacterAnimation = keyof typeof CHARACTER_ANIMATIONS;
const LEGACY_CHARACTER_ANIMATIONS = {
  idle: { frames: 4 }, run: { frames: 10 }, jump: { frames: 6 },
  doubleJump: { frames: 6 }, dive: { frames: 4 }, slide: { frames: 6 },
  land: { frames: 4 }, hurt: { frames: 4 }, sit: { frames: 4 },
} as const;
const SCENE_ART_NAMES = ['corridor', 'dawn', 'rain', 'noon', 'gray', 'dusk', 'night',
  'graduate', 'alley', 'playground', 'dream', 'heaven', 'hell'] as const;
export const SCENE_SCROLL_CHUNK_COUNTS = {
  dawn: 4, rain: 4, noon: 4, gray: 5, dusk: 5, night: 4, graduate: 5,
  alley: 4, playground: 4, dream: 7, heaven: 5, hell: 5,
} as const;
export const SCENE_SCROLL_TILE_WIDTH = 1024;
export const SCENE_SCROLL_TILE_STRIDE = 960;
const CHARACTER_FRAME_ART: ArtManifestEntry[] = Object.entries(LEGACY_CHARACTER_ANIMATIONS).flatMap(([action, spec]) =>
  Array.from({ length: spec.frames }, (_, frame) => {
    const name = String(frame).padStart(2, '0');
    return { key: `character.${action}.${name}`, kind: 'sprite',
      description: `小满 ${action} 第 ${name} 帧`, path: `art/character/${action}/${name}.png` };
  }));
const CHARACTER_HD_ART: ArtManifestEntry[] = Object.entries(LEGACY_CHARACTER_ANIMATIONS).flatMap(([action, spec]) =>
  Array.from({ length: spec.frames }, (_, frame) => {
    const name = String(frame).padStart(2, '0');
    return { key: `character.hd.${action}.${name}`, kind: 'sprite',
      description: `固定模型兼容小满 ${action} 第 ${name} 帧`,
      path: `art/character/hd/${action}/${name}.png` };
  }));
/** 细腻像素版角色帧；同一固定模型与逻辑画幅，运行时优先使用。 */
const CHARACTER_PIXEL_ART: ArtManifestEntry[] = Object.entries(CHARACTER_ANIMATIONS).flatMap(([action, spec]) =>
  Array.from({ length: spec.frames }, (_, frame) => {
    const name = String(frame).padStart(2, '0');
    return { key: `character.pixel.${action}.${name}`, kind: 'sprite' as const,
      description: `像素小满 ${action} 第 ${name} 帧`,
      path: `art/pixel/character/hd/${action}/${name}.png` };
  }));
const PIXEL_ACTOR_ATLAS_ART: ArtManifestEntry[] = [
  'break', 'climb', 'dive', 'double_jump', 'hurt', 'idle', 'jump_air', 'jump_start',
  'land', 'run_contact', 'run_flight', 'run_pass', 'run_push', 'sit', 'slide',
].map(name => ({ key: `character.pixel.atlas.${name}`, kind: 'sprite' as const,
  description: `小满像素动作源图集 ${name}`, path: `art/pixel/character/hd/${name}.png` }));
const SCENE_PIXEL_ART: ArtManifestEntry[] = SCENE_ART_NAMES.map(name => ({
  key: `scene.pixel.${name}`, kind: 'background' as const,
  description: name==='corridor'?'回廊 · 旧学堂生活细节':`旧版像素场景备用图 ${name}`,
  path: name==='corridor'?'art/pixel/scene/corridor-detail-v3.png':`art/pixel/scene/${name}.png`,
}));
const SCENE_SCROLL_ART: ArtManifestEntry[] = Object.entries(SCENE_SCROLL_CHUNK_COUNTS).flatMap(([name, count]) =>
  Array.from({ length: count }, (_, index) => {
    const frame = String(index).padStart(2, '0');
    return { key: `scene.scroll.${name}.${frame}`, kind: 'background' as const,
      description: `像素横卷场景 ${name} 第 ${frame} 段`,
      path: `art/pixel/scene/scroll/${name}/${frame}.png` };
  }));
/** Approved Qwen choice plates. Each 2560×540 image spans 1280×270 world units. */
const SCENE_CHOICE_ART: ArtManifestEntry[] = ['01', '02', '03', '04', '05', '06', 'alley'].map(id => ({
  key: `scene.choice.${id}`, kind: 'background' as const,
  description: `Qwen 选择节点 ${id} 的连续横卷场景`,
  path: `art/pixel/scene/choice/${id}.png`,
}));
const CHOICE_PROP_ART: ArtManifestEntry[] = [
  { key: 'props.choice.chairDesk', kind: 'sprite', description: 'Qwen 教室课桌与凳子，座面 y=200',
    path: 'art/pixel/props/choice/chairDesk.png' },
  { key: 'props.choice.umbrella', kind: 'sprite', description: 'Qwen 校门固定架里的伞',
    path: 'art/pixel/props/choice/umbrella.png' },
  { key: 'props.choice.examDesk', kind: 'sprite', description: 'Qwen 考场木桌，桌面仅留原试卷一角',
    path: 'art/pixel/props/choice/examDesk.png' },
  { key: 'props.choice.examPaper', kind: 'sprite', description: 'Qwen 桌脚旁的五十九分试卷',
    path: 'art/pixel/props/choice/examPaper.png' },
  { key: 'props.choice.piano', kind: 'sprite', description: 'Qwen 琴房里的立式钢琴',
    path: 'art/pixel/props/choice/piano.png' },
  { key: 'props.choice.bench', kind: 'sprite', description: 'Qwen 家长会走廊木长椅',
    path: 'art/pixel/props/choice/bench.png' },
];
export const CHARACTER_SKINS = ['waistJacket', 'raincoat', 'namelessNotebook'] as const;
export const CHARACTER_VARIANTS = {
  personality: { low: 'obedient', high: 'rebel' },
  relationship: { low: 'cheerful', high: 'closed' },
  will: { low: 'givingup', high: 'persistent' },
  appearance: { low: 'neat', high: 'messy' },
} as const;
export const CHARACTER_WET_LEVELS = [0, 15, 40, 70, 100] as const;
/** 游戏全部动作与结局由同一固定模型生成；脸/发型/骨长不会逐帧更换。 */
export const XIAOMAN_IDENTITY = {
  characterId: 'xiaoman',
  revision: 'fixed-rig-v3',
  canonicalHash: '012cf2ba5718ac099386ef8d39fe15830195b8993e0ebd6567ec7e8db40d4966',
  visualAge: 11, referenceHeightCm: 142, referenceMassKg: 34,
  headHeight: 8, headWidth: 7.8, torsoLength: 14,
  upperLeg: 7, lowerLeg: 7, upperArm: 6.1, lowerArm: 5.6,
  palette: { skin: '#ddb58b', hair: '#302e2b', shirt: '#eee6cf', scarf: '#a95347',
    trousers: '#36596c', shoe: '#e5dfce', bag: '#334d60' },
  source: 'scripts/xiaoman_rig.py',
  pixelStyleReferenceIsNotAModel: true,
} as const;
const CHARACTER_PIXEL_SKIN_ART: ArtManifestEntry[] = CHARACTER_SKINS.flatMap(skin =>
  Object.entries(CHARACTER_ANIMATIONS).flatMap(([action, spec]) =>
    Array.from({ length: spec.frames }, (_, frame) => {
      const name = String(frame).padStart(2, '0');
      return { key: `character.pixel.skin.${skin}.${action}.${name}`, kind: 'sprite' as const,
        description: `固定小满 ${skin} ${action} 第 ${name} 帧`,
        path: `art/pixel/character/hd/skins/${skin}/${action}/${name}.png` };
    })));
const CHARACTER_PIXEL_VARIANT_ART: ArtManifestEntry[] = Object.values(CHARACTER_VARIANTS).flatMap(pair =>
  Object.values(pair).flatMap(variant => (['idle', 'run'] as const).flatMap(action =>
    Array.from({ length: CHARACTER_ANIMATIONS[action].frames }, (_, frame) => {
      const name = String(frame).padStart(2, '0');
      return { key: `character.pixel.variant.${variant}.${action}.${name}`, kind: 'sprite' as const,
        description: `固定小满 ${variant} ${action} 第 ${name} 帧`,
        path: `art/pixel/character/hd/variants/${variant}/${action}/${name}.png` };
    }))));
const CHARACTER_PIXEL_SKIN_VARIANT_ART: ArtManifestEntry[] = CHARACTER_SKINS.flatMap(skin =>
  Object.values(CHARACTER_VARIANTS).flatMap(pair => Object.values(pair).flatMap(variant =>
    (['idle', 'run'] as const).flatMap(action =>
      Array.from({ length: CHARACTER_ANIMATIONS[action].frames }, (_, frame) => {
        const name = String(frame).padStart(2, '0');
        return { key: `character.pixel.skin.${skin}.variant.${variant}.${action}.${name}`, kind: 'sprite' as const,
          description: `固定小满 ${skin} ${variant} ${action} 第 ${name} 帧`,
          path: `art/pixel/character/hd/skins/${skin}/variants/${variant}/${action}/${name}.png` };
      })))));
/** 统一人物 rig 制作的完整 12 秒结局电影；随后显示 2 秒结局字卡。 */
export const ENDING_MEDIA_SECONDS = 12;
export const ENDING_MEDIA_CARD_SECONDS = 2;
export const ENDING_MEDIA = Object.fromEntries(
  (['morning', 'backrow', 'outside', 'desk', 'secondGrade', 'runaway', 'wall'] as const).map(name => [
    `ending.video.${name}`,
    { id: name, resourcePath: `video/endings/${name}`, path: `video/endings/${name}.mp4`, seconds: ENDING_MEDIA_SECONDS,
      skins:Object.fromEntries(CHARACTER_SKINS.map(skin=>[skin,{resourcePath:`video/endings/skins/${skin}/${name}`,path:`video/endings/skins/${skin}/${name}.mp4`}])),
    },
  ]),
) as Record<string, { id: string; resourcePath: string; path: string; seconds: number;
  skins:Record<string,{resourcePath:string;path:string}> }>;
const CHARACTER_SKIN_ART: ArtManifestEntry[] = CHARACTER_SKINS.flatMap(skin =>
  Object.entries(LEGACY_CHARACTER_ANIMATIONS).flatMap(([action, spec]) =>
    Array.from({ length: spec.frames }, (_, frame) => {
      const name = String(frame).padStart(2, '0');
      return { key: `character.skin.${skin}.${action}.${name}`, kind: 'sprite',
        description: `小满 ${skin} ${action} 第 ${name} 帧`, path: `art/character/skins/${skin}/${action}/${name}.png` };
    })));
const CHARACTER_WET_ART: ArtManifestEntry[] = CHARACTER_WET_LEVELS.flatMap(level =>
  Object.entries(LEGACY_CHARACTER_ANIMATIONS).flatMap(([action, spec]) =>
    Array.from({ length: spec.frames }, (_, frame) => {
      const name = String(frame).padStart(2, '0');
      return { key: `character.wet.${level}.${action}.${name}`, kind: 'sprite',
        description: `小满水渍 ${level} ${action} 第 ${name} 帧`, path: `art/character/wet/${level}/${action}/${name}.png` };
    })));
const CHARACTER_VARIANT_ART: ArtManifestEntry[] = Object.values(CHARACTER_VARIANTS).flatMap(pair =>
  Object.values(pair).flatMap(variant => [
    { key: `character.variant.${variant}.idle.00`, kind: 'sprite' as const,
      description: `小满 ${variant} 静止姿态`, path: `art/character/variants/${variant}/idle.png` },
    ...Array.from({ length: LEGACY_CHARACTER_ANIMATIONS.run.frames }, (_, frame) => {
      const name = String(frame).padStart(2, '0');
      return { key: `character.variant.${variant}.run.${name}`, kind: 'sprite' as const,
        description: `小满 ${variant} 跑步第 ${name} 帧`, path: `art/character/variants/${variant}/run/${name}.png` };
    }),
  ]));
const CHARACTER_SKIN_VARIANT_ART: ArtManifestEntry[] = CHARACTER_SKINS.flatMap(skin =>
  Object.values(CHARACTER_VARIANTS).flatMap(pair =>
    Object.values(pair).flatMap(variant => [
      { key: `character.skin.${skin}.variant.${variant}.idle.00`, kind: 'sprite' as const,
        description: `小满 ${skin} ${variant} 静止姿态`, path: `art/character/skins/${skin}/variants/${variant}/idle/00.png` },
      ...Array.from({ length: LEGACY_CHARACTER_ANIMATIONS.run.frames }, (_, frame) => {
        const name = String(frame).padStart(2, '0');
        return { key: `character.skin.${skin}.variant.${variant}.run.${name}`, kind: 'sprite' as const,
          description: `小满 ${skin} ${variant} 跑步第 ${name} 帧`, path: `art/character/skins/${skin}/variants/${variant}/run/${name}.png` };
      }),
    ])));
export const MICRO_ANCHOR_ART = {
  hat: 'redhat', bag: 'wetbag', homework: 'homework', door: 'officecrack',
  bench: 'bench', milk: 'milk', wish: 'wishtag',
} as const;
const MICRO_ANCHOR_FRAMES: ArtManifestEntry[] = Object.values(MICRO_ANCHOR_ART).flatMap(name =>
  (['normal', 'active'] as const).map(state => ({
    key: `props.micro.${name}.${state}`, kind: 'sprite' as const,
    description: `记忆锚点 ${name} ${state}`, path: `art/props/micro/${name}_${state}.png`,
  })));
const EXTRA_PROP_GROUPS = {
  achievements: ['beam', 'brick', 'cloud', 'empty_pocket', 'fifth_lamp', 'fragment_jar',
    'full_exam', 'giant_pencil', 'little_stool', 'mini_door', 'old_photo', 'piano_scratch',
    'red_pen', 'umbrella', 'wall_grass', 'worn_trousers'],
  micro: ['cat', 'plant'],
  obstacles: ['adultlegs', 'ball', 'bicycle', 'cardoor', 'football', 'hurdle', 'mopbucket',
    'pole', 'puddle', 'satchel', 'stackbooks', 'step', 'teacup', 'umbrella_rib', 'wall'],
  story: ['chair1', 'chair2', 'chair3', 'door', 'eraser', 'exam', 'oldself', 'paperplane',
    'pen', 'piano', 'umbrella'],
  symbols: ['alarmclock', 'award', 'birdcage', 'fragment', 'kite', 'noticeboard', 'oldclock'],
} as const;
const EXTRA_PROP_ART: ArtManifestEntry[] = Object.entries(EXTRA_PROP_GROUPS).flatMap(([group, names]) =>
  names.flatMap(name => (['normal', 'active'] as const).map(state => ({
    key: `props.${group}.${name}.${state}`, kind: 'sprite' as const,
    description: `${group} 美术 ${name} ${state}`, path: `art/props/${group}/${name}_${state}.png`,
  }))));
const BIRDCAGE_DETAIL_ART: ArtManifestEntry[] = (['normal', 'active'] as const).map(state => ({
  key: `props.symbols.birdcageDetail.${state}`, kind: 'sprite',
  description: `鸟笼精细像素结构 ${state}`, path: `art/props/symbols/birdcage-detail-v6-${state}.png`,
}));
export const UI_ICON_IDS = ['heart', 'fragment', 'wrapper', 'lamp_morning', 'lamp_backrow',
  'lamp_outside', 'lamp_desk', 'pause', 'exit', 'play', 'achievement', 'book', 'shop',
  'wardrobe', 'chapter', 'settings', 'shield', 'magnet', 'eraser'] as const;
const UI_ICON_FRAMES: ArtManifestEntry[] = UI_ICON_IDS.flatMap(id =>
  (['normal', 'active'] as const).map(state => ({
    key: `ui.icon.${id}.${state}`, kind: 'sprite' as const,
    description: `界面图标 ${id} ${state}`, path: `art/ui/icons/${id}_${state}.png`,
  })));
const EXTRA_UI_ICON_FRAMES: ArtManifestEntry[] = ['check', 'feather', 'lock', 'motion', 'rewind', 'sound']
  .flatMap(id => (['normal', 'active'] as const).map(state => ({
    key: `ui.icon.${id}.${state}`, kind: 'sprite' as const,
    description: `界面图标 ${id} ${state}`, path: `art/ui/icons/${id}_${state}.png`,
  })));
const UI_COMPONENT_ART: ArtManifestEntry[] = [
  { key: 'ui.button.disabled', kind: 'sprite', description: '禁用按钮底图', path: 'art/ui/button_disabled.png' },
  { key: 'ui.button.primary', kind: 'sprite', description: '主按钮底图', path: 'art/ui/button_primary.png' },
  { key: 'ui.button.secondary', kind: 'sprite', description: '次按钮底图', path: 'art/ui/button_secondary.png' },
  { key: 'ui.card.memory', kind: 'sprite', description: '记忆卡片底图', path: 'art/ui/card_memory.png' },
  { key: 'ui.panel.paper', kind: 'sprite', description: '纸面面板底图', path: 'art/ui/panel_paper.png' },
];
const UI_HD_ART: ArtManifestEntry[] = [
  'main_menu', 'run_hud', 'memory_book', 'shop', 'wardrobe', 'pause', 'ending_card',
].map(name => ({ key: `ui.hd.${name}`, kind: 'sprite' as const,
  description: `Qwen 高清界面底板 ${name}`, path: `art/ui/hd/${name}.png` }));
/** 无法解码视频时使用同一成片的剧情关键帧，不换人物或随机补画。 */
export const ENDING_SEQUENCE_FRAMES = 24;
const ENDING_SEQUENCE_ART: ArtManifestEntry[] = Object.values(ENDING_MEDIA).flatMap(media =>
  ['base',...CHARACTER_SKINS].flatMap(skin=>Array.from({length:ENDING_SEQUENCE_FRAMES},(_,frame)=>({
    key:`ending.sequence.${media.id}.${skin}.${String(frame).padStart(2,'0')}`,kind:'sprite' as const,
    description:`${ENDINGS[media.id as keyof typeof ENDINGS].name} ${skin} 成片备用第 ${frame} 帧`,
    path:skin==='base'?`art/endings/cinematic/${media.id}/${String(frame).padStart(2,'0')}.png`:
      `art/endings/cinematic/skins/${skin}/${media.id}/${String(frame).padStart(2,'0')}.png`,
  }))));
/**
 * 美术与声音接入清单：key 为稳定接口，替换资源只填 path，保持动作和碰撞逻辑。
 * 图像建议以 480×270 逻辑画布校准；尺寸/像素风只是当前占位选择，不是正式定稿。
 * 音频须由项目方提供可用的录音或授权文件；空路径无正式音频。
 */
export const ART_MANIFEST: ArtManifestEntry[] = [
  ...ENDING_SEQUENCE_ART,
  { key: 'character.base', kind: 'sprite', description: '小满基础动作图集：跑、单跳、二段跳、急坠、滑铲、攀爬、击碎', path: '' },
  ...CHARACTER_PIXEL_ART,
  ...CHARACTER_PIXEL_SKIN_ART,
  ...CHARACTER_PIXEL_VARIANT_ART,
  ...CHARACTER_PIXEL_SKIN_VARIANT_ART,
  ...PIXEL_ACTOR_ATLAS_ART,
  ...CHARACTER_HD_ART,
  ...CHARACTER_FRAME_ART,
  ...CHARACTER_SKIN_ART,
  ...CHARACTER_WET_ART,
  ...CHARACTER_VARIANT_ART,
  ...CHARACTER_SKIN_VARIANT_ART,
  ...SCENE_PIXEL_ART,
  { key: 'scene.pixel.corridor.legacy', kind: 'background', description: '回廊背景兼容底图', path: 'art/pixel/scene/corridor.png' },
  ...SCENE_SCROLL_ART,
  ...SCENE_CHOICE_ART,
  ...CHOICE_PROP_ART,
  ...MICRO_ANCHOR_FRAMES,
  // 本轮实际 Qwen 障碍；旧资源留档，不作为本轮重新生成证据。
  ...['vehicle.body','vehicle.door','cabinet.body','cabinet.door','banner.frame','banner.cloth',
    'ball','football','bicycle','satchel','step','step.dais','bucket.mop','bucket.broom',
    'books.low','books.tall','books.open','cushions','crate.low','crate.tall','crate.paper',
    'crate.folded','brick','bench.high','bench.low','lamp','rack','rack.rope',
    'rack.shelving','rack.slide','rack.cloth','rack.tray','rack.hurdle','rack.mat','awning',
    'rubble.high','rubble.low','face.wood','face.metal','face.lamp','face.rope','face.pad',
    'face.burnt','face.canvas','face.tray','step.wall','face.stone'].map(id => ({
      key: `props.obstacles.v2.${id}`, kind: 'sprite' as const, description: `Qwen 障碍部件 ${id}`,
      path: `art/props/obstacles/qwen-v2/${id.replace(/\./g, '_')}.png`,
    })),
  ...EXTRA_PROP_ART,
  ...BIRDCAGE_DETAIL_ART,
  ...UI_ICON_FRAMES,
  ...EXTRA_UI_ICON_FRAMES,
  ...UI_HD_ART,
  ...UI_COMPONENT_ART,
  { key: 'ui.logo', kind: 'sprite', description: '回廊标题 · 等比像素字标', path: 'art/ui/logo-detail-v3.png' },
  { key: 'ui.logo.legacy', kind: 'sprite', description: '回廊标题兼容字标', path: 'art/ui/logo.png' },
  { key: 'character.personality', kind: 'sprite', description: '性格低/中/高三档姿态或配饰层', path: '' },
  { key: 'character.relationship', kind: 'sprite', description: '关系低/中/高三档表情层', path: '' },
  { key: 'character.will', kind: 'sprite', description: '意志低/中/高三档步态层', path: '' },
  { key: 'character.appearance', kind: 'sprite', description: '外貌低/中/高三档衣物层', path: '' },
  { key: 'character.wet', kind: 'sprite', description: '0–100 水渍蒙层，与状态色温关联', path: '' },
  ...SCENE_ART_NAMES.map(name => ({ key: `scene.${name}`, kind: 'background' as const,
    description: `由横卷像素场景或程序底图绘制 ${name}`, path: '' })),
  { key: 'props.story', kind: 'sprite', description: '伞、笔、橡皮、纸飞机、三把凳子、试卷、琴盖、门、旧自己', path: '' },
  { key: 'props.micro', kind: 'sprite', description: '红帽子、书包、白纸、盆栽、长椅、牛奶、许愿牌', path: '' },
  { key: 'props.obstacles', kind: 'sprite', description: '场景障碍；替换图像后保留独立碰撞框', path: '' },
  { key: 'props.symbols', kind: 'sprite', description: '鸟笼、旧钟、风筝、公告栏、奖状、闹钟及碎片', path: '' },
  { key: 'ui.icons', kind: 'sprite', description: '生命、碎片、糖纸、道具、成就与四盏灯', path: '' },
  { key: 'audio.bgm', kind: 'audio', description: '各场景氛围音乐；需自行提供正式文件与授权', path: '' },
  { key: 'audio.effects', kind: 'audio', description: '脚步、跳跃、滑铲、纸页、雨、琴、快门与门铃', path: '' },
  { key: 'audio.poems', kind: 'audio', description: '六条叙事走廊配音，第六条含向前/回头两个版本', path: '' },
];
