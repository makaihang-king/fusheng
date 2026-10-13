/**
 * 回廊记忆册的只读视图。只引用本局已走过的事件、已存的事件证据和首次结局快照，
 * 不写回存档，也不凭累计完成标志猜测玩家当时的选择。
 */
import { ENDINGS, POEMS, POEM_LOOK_BACK, SEGMENTS } from './Content';
import type { MainChoiceId } from './Content';
import { MEMORY_CARD_EVENT_RULES, SEGMENT_MEMORY_ANCHORS, SEGMENT_MEMORY_CHOICES } from './Model';
import { CHOICE_SCENES, actionResponse, endingEchoRecords, microResponse } from './Narrative';

export type MemoryBookKind = 'segment' | 'branch' | 'ending' | 'secret';
export type MemoryBookIcon = 'hat' | 'bag' | 'book' | 'door' | 'bench' | 'cup' | 'tag' | 'wall' | 'field' | 'lamp';
export type MemoryBookEchoOrigin = '本次走过' | '那次走过' | '结局快照';

export interface MemoryBookEcho {
  event: string;
  text: string;
  origin: MemoryBookEchoOrigin;
}

export interface MemoryBookCard {
  id: string;
  kind: MemoryBookKind;
  icon: MemoryBookIcon;
  unlocked: boolean;
  title: string;
  object: string;
  question: string;
  line: string;
  sound: string;
  status: readonly string[];
  echoes: readonly MemoryBookEcho[];
}

export interface MemoryBookProfile {
  progress?: {
    runs?: number;
    segments?: Record<string, { clear?: boolean; full?: boolean; noHit?: boolean; noItem?: boolean }>;
    segmentMemories?: Record<string, { runId?: number; anchorEvent?: string; choiceEvent?: string; poemSeen?: boolean }>;
    segmentAnchorEvidence?: Record<string, string>;
    cardEventEvidence?: Record<string, string>;
    endings?: Record<string, number>;
  };
  lights?: readonly string[];
  endingSnapshots?: Record<string, { events?: readonly string[] } | undefined>;
  achievements?: readonly string[];
}

export interface MemoryBookRecentRun {
  events?: readonly string[];
  finishedSegments?: readonly string[];
  ending?: string;
}

/** One completed segment's previously observed beats. This is a read-only view. */
export interface MemoryReview {
  key: string;
  title: string;
  icon: MemoryBookIcon;
  object: string;
  line: string;
  sound: string;
  anchorEvent: string;
  anchorResponse: string;
  choice: { event: string; object: string; action: string; response: string } | null;
  poem: string;
}

interface BookMeta {
  id: string;
  kind: MemoryBookKind;
  icon: MemoryBookIcon;
  title: string;
  lockedTitle: string;
  object: string;
  question: string;
  line: string;
  hint: string;
  sound?: string;
  events: readonly string[];
}

const NORMAL_ENDINGS = ['morning', 'backrow', 'outside', 'desk'] as const;
const BRANCHES: readonly BookMeta[] = [
  { id: 'branch:alley', kind: 'branch', icon: 'wall', title: '巷子', lockedTitle: '支线一 · 未走过',
    object: '墙头的缺口', question: '巷子尽头，还会回到那盏灯吗？',
    line: '墙挡住晨光，雨声从别人的屋檐落下来。', hint: '墙影里，似乎有一处亮光。',
    events: MEMORY_CARD_EVENT_RULES['branch:alley'].events },
  { id: 'branch:playground', kind: 'branch', icon: 'field', title: '操场', lockedTitle: '支线二 · 未走过',
    object: '侧门把手', question: '铃响以后，你还会回到教室吗？',
    line: '门后还有翻书声，墙外也有路。', hint: '操场边，有一道留着光的门。',
    events: MEMORY_CARD_EVENT_RULES['branch:playground'].events },
];

const ENDING_META: readonly BookMeta[] = [
  { id: 'ending:morning', kind: 'ending', icon: 'lamp', title: ENDINGS.morning.name, lockedTitle: '第一盏灯 · 未亮',
    object: '早晨的闹钟', question: '明天的铃响时，还会走进教室吗？',
    line: '又一个早晨，校服还搭在床边。', hint: '有一盏灯，等着下一个早晨。', events: [] },
  { id: 'ending:backrow', kind: 'ending', icon: 'bench', title: ENDINGS.backrow.name, lockedTitle: '第二盏灯 · 未亮',
    object: '后排的空椅', question: '座位留在后面，光还会照进来吗？',
    line: '窗边的光落下，翻书声从前面传来。', hint: '有一盏灯，照着教室的一角。', events: [] },
  { id: 'ending:outside', kind: 'ending', icon: 'door', title: ENDINGS.outside.name, lockedTitle: '第三盏灯 · 未亮',
    object: '校门外的路', question: '离开熟悉的跑道，前面仍是路吗？',
    line: '校门、巷口和街角依次退到身后。', hint: '有一盏灯，亮在校门以外。', events: [] },
  { id: 'ending:desk', kind: 'ending', icon: 'book', title: ENDINGS.desk.name, lockedTitle: '第四盏灯 · 未亮',
    object: '小一号的课桌', question: '长大一点后，还认得那张桌子吗？',
    line: '升上初中后，小满又看见那张课桌。', hint: '有一盏灯，留给一张旧课桌。', events: [] },
];

const SECRET_META: readonly BookMeta[] = [
  { id: 'secret:runaway', kind: 'secret', icon: 'field', title: ENDINGS.runaway.name, lockedTitle: '未翻开的页 · 一',
    object: '围墙边的碎砖', question: '侧门留在身后，你还会继续向外吗？',
    line: '墙外有普通的街声，脚步还没停。', hint: '铃声渐远，脚步还没有停。',
    events: MEMORY_CARD_EVENT_RULES['secret:runaway'].events },
  { id: 'secret:wall', kind: 'secret', icon: 'wall', title: ENDINGS.wall.name, lockedTitle: '未翻开的页 · 二',
    object: '墙头的一截草', question: '站上墙头，眼前会是什么？',
    line: '墙头的风，比巷子里干一点。', hint: '雨声以外，还会有什么声音？',
    events: MEMORY_CARD_EVENT_RULES['secret:wall'].events },
  { id: 'secret:secondGrade', kind: 'secret', icon: 'door', title: ENDINGS.secondGrade.name, lockedTitle: '未翻开的页 · 三',
    object: '墙缝里的光', question: '所有门都开着时，还记得最初那一步吗？',
    line: '四扇门仍在，墙后的路终于亮起来。', hint: '回廊里，还有一页空白。', events: [] },
];

const SEGMENT_ICONS: readonly MemoryBookIcon[] = ['hat', 'bag', 'book', 'door', 'bench', 'cup', 'tag'];
const SEGMENT_HINTS = [
  '门口有样东西被风吹动。', '雨棚下留下了一点水声。', '纸页上有一行还没写完。',
  '走廊里，有人把话停住了。', '长椅空着半边。', '灯没关，桌边还有余温。',
  '快门之前，有东西轻轻碰响。',
] as const;

function textEvents(events: readonly string[] | undefined): string[] {
  return Array.isArray(events) ? events.filter((event): event is string => typeof event === 'string') : [];
}

function echoFrom(events: readonly string[], eligible: readonly string[], origin: MemoryBookEchoOrigin): MemoryBookEcho[] {
  const event = eligible.find(value => events.includes(value));
  if (!event) return [];
  const authored = endingEchoRecords([event], 1)[0];
  return authored ? [{ event, text: authored.text, origin }] : [];
}

function savedEcho(profile: MemoryBookProfile, eligible: readonly string[]): MemoryBookEcho[] {
  for (const ending of NORMAL_ENDINGS) {
    const snapshot = profile.endingSnapshots?.[ending];
    const echo = echoFrom(textEvents(snapshot?.events), eligible, '结局快照');
    if (echo.length) return echo;
  }
  return [];
}

function savedCardEvidence(profile: MemoryBookProfile, meta: BookMeta): MemoryBookEcho[] {
  const rule = MEMORY_CARD_EVENT_RULES[meta.id];
  const event = profile.progress?.cardEventEvidence?.[meta.id];
  if (!rule || !event || !rule.events.includes(event) ||
      profile.progress?.segments?.[rule.entrySegment]?.clear !== true ||
      profile.progress?.segments?.[rule.branch]?.clear !== true) return [];
  if (meta.kind === 'secret') {
    const count = profile.progress?.endings?.[meta.id.slice('secret:'.length)];
    if (!Number.isSafeInteger(count) || (count || 0) <= 0) return [];
  }
  return echoFrom([event], meta.events, '那次走过');
}

function validSegmentMemory(profile: MemoryBookProfile, key: string, anchorEvents: readonly string[]) {
  const stored = profile.progress?.segmentMemories?.[key];
  const choiceEvents = SEGMENT_MEMORY_CHOICES[key] || [];
  if (!stored || !Number.isSafeInteger(stored.runId) || (stored.runId || 0) <= 0 ||
      (stored.runId || 0) > 999999999 ||
      typeof stored.anchorEvent !== 'string' ||
      (stored.anchorEvent !== '' && !anchorEvents.includes(stored.anchorEvent)) ||
      typeof stored.choiceEvent !== 'string' ||
      (key === '7' ? stored.choiceEvent !== '' : !choiceEvents.includes(stored.choiceEvent)) ||
      typeof stored.poemSeen !== 'boolean' || (key === '7' && stored.poemSeen) ||
      (key === '2' && stored.choiceEvent === 'skipClass' && stored.poemSeen)) return undefined;
  return stored;
}

/** Keep a segment's anchor event and main choice together when both were actually recorded. */
function segmentEchoes(profile: MemoryBookProfile, recent: MemoryBookRecentRun | undefined,
  key: string, anchorEvents: readonly string[]): MemoryBookEcho[] {
  const choiceEvents = SEGMENT_MEMORY_CHOICES[key] || [];
  if (recent?.finishedSegments?.includes(key)) {
    const events = textEvents(recent.events);
    return [
      ...echoFrom(events, anchorEvents, '本次走过'),
      ...echoFrom(events, choiceEvents, '本次走过'),
    ];
  }
  const stored = validSegmentMemory(profile, key, anchorEvents);
  if (stored) {
    return [
      ...echoFrom([stored.anchorEvent!], anchorEvents, '那次走过'),
      ...echoFrom([stored.choiceEvent!], choiceEvents, '那次走过'),
    ];
  }
  for (const ending of NORMAL_ENDINGS) {
    const events = textEvents(profile.endingSnapshots?.[ending]?.events);
    if (!events.includes('segment:' + key + ':noHit') && !events.includes('segment:' + key + ':hurt')) continue;
    return [
      ...echoFrom(events, anchorEvents, '结局快照'),
      ...echoFrom(events, choiceEvents, '结局快照'),
    ];
  }
  return [];
}

function segmentCompleted(profile: MemoryBookProfile, key: string): boolean {
  if (profile.progress?.segments?.[key]?.clear === true) return true;
  return NORMAL_ENDINGS.some(ending => textEvents(profile.endingSnapshots?.[ending]?.events)
    .some(event => event === 'segment:' + key + ':noHit' || event === 'segment:' + key + ':hurt'));
}

function anchorStatusForSegment(profile: MemoryBookProfile, recent: MemoryBookRecentRun | undefined,
  key: string, object: string, anchorEvents: readonly string[]): string {
  const stored = validSegmentMemory(profile, key, anchorEvents);
  const witnessed = key === '4' ? '曾在走廊门前做过选择' : '曾碰过' + object;
  if (anchorEvents.includes(profile.progress?.segmentAnchorEvidence?.[key] || '')) return witnessed;
  if (stored?.anchorEvent) return witnessed;
  if (recent?.finishedSegments?.includes(key) &&
      anchorEvents.filter(event => textEvents(recent.events).includes(event)).length === 1)
    return witnessed;
  for (const ending of NORMAL_ENDINGS) {
    const events = textEvents(profile.endingSnapshots?.[ending]?.events);
    if (!events.includes('segment:' + key + ':noHit') &&
        !events.includes('segment:' + key + ':hurt')) continue;
    const anchors = anchorEvents.filter(event => events.includes(event));
    if (anchors.length === 1)
      return witnessed;
  }
  if (key === '4') return stored ? '下次可在走廊门前做选择' : '走廊门前的选择未记录';
  return stored ? '下次可碰' + object : object + '未记录';
}

function statusForSegment(profile: MemoryBookProfile, key: string,
  anchor?: { object: string; events: readonly string[] }, recent?: MemoryBookRecentRun): string[] {
  if (!segmentCompleted(profile, key)) return ['尚未走过'];
  const state = profile.progress?.segments?.[key];
  const status = ['曾走过'];
  if (anchor) status.push(anchorStatusForSegment(profile, recent, key, anchor.object, anchor.events));
  if (state?.full === true) status.push('曾收齐碎片');
  if (state?.noHit === true) status.push('曾无伤');
  if (state?.noItem === true) status.push('曾无伤且没用回廊道具');
  else if (state?.full !== true) status.push('下次可收齐碎片');
  else if (state?.noHit !== true) status.push('下次可试试无伤');
  else status.push('下次可无伤且不用道具');
  return status;
}

function displayed(meta: BookMeta, unlocked: boolean, status: readonly string[], echoes: readonly MemoryBookEcho[]): MemoryBookCard {
  return {
    id: meta.id, kind: meta.kind, icon: !unlocked && meta.kind === 'secret' ? 'lamp' : meta.icon, unlocked,
    title: unlocked ? meta.title : meta.lockedTitle,
    object: unlocked ? meta.object : '尚未看清的物件',
    question: unlocked ? meta.question : '',
    line: unlocked ? meta.line : meta.hint,
    sound: unlocked ? meta.sound || '' : '',
    status, echoes: unlocked ? echoes : [],
  };
}

/** 运行时和冷启动使用同一套派生规则；不向 Profile 写任何字段。 */
export function memoryBookCards(profile: MemoryBookProfile, recent?: MemoryBookRecentRun): MemoryBookCard[] {
  const cards: MemoryBookCard[] = [];
  for (const [index, segment] of SEGMENTS.entries()) {
    const key = String(segment.id), anchor = segment.memoryAnchor;
    const meta: BookMeta = { id: 'segment:' + key, kind: 'segment', icon: SEGMENT_ICONS[index],
      title: segment.name, lockedTitle: '第' + segment.id + '段 · 未走过', object: anchor.object,
      question: anchor.question, line: anchor.line, hint: SEGMENT_HINTS[index],
      sound: anchor.sound, events: anchor.events };
    const unlocked = segmentCompleted(profile, key);
    const echoes = segmentEchoes(profile, recent, key, meta.events);
    cards.push(displayed(meta, unlocked, statusForSegment(profile, key, anchor, recent), echoes));
  }
  for (const meta of BRANCHES) {
    const key = meta.id.slice('branch:'.length), unlocked = segmentCompleted(profile, key);
    const recentCompleted = recent?.finishedSegments?.includes(key) === true;
    const evidence = savedCardEvidence(profile, meta);
    const echoes = recentCompleted ? echoFrom(textEvents(recent?.events), meta.events, '本次走过')
      : evidence.length ? evidence : savedEcho(profile, meta.events);
    cards.push(displayed(meta, unlocked, statusForSegment(profile, key), echoes));
  }
  for (const [index, ending] of NORMAL_ENDINGS.entries()) {
    const meta = ENDING_META[index], snapshot = profile.endingSnapshots?.[ending];
    const unlocked = profile.lights?.includes(ending) === true ||
      (profile.progress?.endings?.[ending] || 0) > 0 || !!snapshot;
    const echoes = textEvents(snapshot?.events).length
      ? endingEchoRecords(textEvents(snapshot?.events), 2).map(echo => ({ ...echo, origin: '结局快照' as const })) : [];
    cards.push(displayed(meta, unlocked, [unlocked ? '灯已亮' : '灯未亮'], echoes));
  }
  const allLit = NORMAL_ENDINGS.every(ending => profile.lights?.includes(ending) === true);
  for (const meta of SECRET_META) {
    const ending = meta.id.slice('secret:'.length);
    const discovered = (profile.progress?.endings?.[ending] || 0) > 0 || profile.achievements?.includes(ending) === true;
    const echoes = discovered && recent?.ending === ending
      ? echoFrom(textEvents(recent.events), meta.events, '本次走过')
      : discovered ? savedCardEvidence(profile, meta) : [];
    const visibleMeta = ending === 'secondGrade' && allLit && !discovered
      ? { ...meta, hint: '四盏灯照到墙边，有一道缝亮了。' } : meta;
    const status = discovered ? '已经发现' : ending === 'secondGrade' && allLit ? '有一道新路' : '尚未发现';
    cards.push(displayed(visibleMeta, discovered, [status], echoes));
  }
  return cards;
}

/** A review shows only an actual saved event. A clear flag alone proves no choice or poem. */
export function memoryReviewForSegment(profile: MemoryBookProfile, key: string): MemoryReview | null {
  const index = Number(key) - 1;
  if (!Number.isInteger(index) || index < 0 || index >= SEGMENTS.length || String(index + 1) !== key ||
      !segmentCompleted(profile, key)) return null;
  const segment = SEGMENTS[index];
  const anchorIds = SEGMENT_MEMORY_ANCHORS[key] || [];
  const choiceIds = SEGMENT_MEMORY_CHOICES[key] || [];
  const stored = validSegmentMemory(profile, key, anchorIds);
  let anchorEvent = '';
  let choiceEvent = '';
  let poemSeen = false;
  if (stored) {
    anchorEvent = stored.anchorEvent || '';
    choiceEvent = stored.choiceEvent || '';
    poemSeen = stored.poemSeen === true;
  } else {
    // First normal-ending snapshots can prove an older choice, but cannot prove which poem was shown.
    for (const ending of NORMAL_ENDINGS) {
      const events = textEvents(profile.endingSnapshots?.[ending]?.events);
      if (!events.includes('segment:' + key + ':noHit') && !events.includes('segment:' + key + ':hurt')) continue;
      const actualAnchors = anchorIds.filter(event => events.includes(event));
      const actualChoices = choiceIds.filter(event => events.includes(event));
      if (actualAnchors.length > 1 || actualChoices.length !== (key === '7' ? 0 : 1)) continue;
      anchorEvent = actualAnchors[0] || '';
      choiceEvent = actualChoices[0] || '';
      break;
    }
  }
  const outcome = index < 6
    ? CHOICE_SCENES[segment.id as MainChoiceId].outcomes.find(candidate => candidate.trigger.id === choiceEvent)
    : undefined;
  const choice = outcome ? { event: choiceEvent, object: outcome.object,
    action: outcome.action, response: actionResponse(choiceEvent) || outcome.response } : null;
  return {
    key, title: segment.name, icon: SEGMENT_ICONS[index], object: segment.memoryAnchor.object,
    line: segment.memoryAnchor.line, sound: segment.memoryAnchor.sound,
    anchorEvent, anchorResponse: anchorEvent ? microResponse(anchorEvent) || actionResponse(anchorEvent) : '',
    choice,
    poem: choice && poemSeen ? choiceEvent === 'back' ? POEM_LOOK_BACK : POEMS[index] || '' : '',
  };
}

export const MEMORY_BOOK_PAGE_SIZE = 4;
export function memoryBookPageCount(cards: readonly MemoryBookCard[]): number {
  return Math.max(1, Math.ceil(cards.length / MEMORY_BOOK_PAGE_SIZE));
}
