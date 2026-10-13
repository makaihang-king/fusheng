/**
 * 第一章叙事内容。秒数是跑段内时间；所有 trigger.id 沿用 Model 的事件或既有结局 ID。
 * 这里不写推杆、结局条件或存档。文字和画面指令可分别交给 Game / Renderer 消费。
 */
import { SEGMENTS, BRANCHES } from './Content';
import type { ChapterSceneKey, MainChoiceId, MicroEventId } from './Content';

export type NarrativeEventId =
  | MicroEventId
  | 'umbrella' | 'alley' | 'alleyReturn' | 'pen' | 'plane'
  | 'seat1' | 'seat2' | 'seat3' | 'skipClass'
  | 'copyHomework' | 'ownHomework' | 'cheat' | 'faceExam' | 'noPen'
  | 'speak' | 'silent' | 'eraser' | 'compared'
  | 'pianoPractice' | 'pianoSmash' | 'pianoClose'
  | 'apologize' | 'slamDoor' | 'back' | 'forward'
  | 'sideReturn' | 'graffiti'
  | 'symbol1' | 'symbol2' | 'symbol3' | 'symbol4' | 'symbol5' | 'symbol6'
  | 'lifeLost' | 'hellClear' | 'hellFall' | 'dreamReward' | 'heavenReward';

export type StoryLocation = ChapterSceneKey
  | 'choice1' | 'choice2' | 'choice3' | 'choice4' | 'choice5' | 'choice6'
  | 'ending';

export interface StoryBeat {
  /** 稳定的本段临时去重键；不进入存档。 */
  id: string;
  at: number;
  /** 最多两行，供叙事字幕显示。 */
  text: string;
  /** 可观察的画面行为；正式资源未制作时也可程序绘制。 */
  visual?: string;
  when?: { all?: readonly NarrativeEventId[]; none?: readonly NarrativeEventId[] };
}

export interface StoryAction {
  trigger: { kind: 'event'; id: NarrativeEventId } | { kind: 'ending'; id: 'wall' | 'runaway' };
  object: string;
  action: string;
  response: string;
  future: { at: StoryLocation; text: string };
}

export interface SceneStory {
  /** 开头给玩家的局内目标。 */
  objective: string;
  /** 本段先让玩家看到的人或物。 */
  focus: string;
  /** 玩家动作、即时回应和日后回响构成完整的小场景。 */
  actions: readonly StoryAction[];
  /** 三个以上可观察的途中故事点；带 when 的拍点是已发生事件的回响。 */
  beats: readonly StoryBeat[];
  guide?: string;
}

/** 七个环境微抉择的文案与总案 3.4 / 5.5–5.11 对应，触发条件仍由 Game 决定。 */
export const MICRO_STORIES: Record<MicroEventId, StoryAction> = {
  hat: {
    trigger: { kind: 'event', id: 'hat' }, object: '风吹落的红帽子',
    action: '跑到帽子旁，踩踏捡起并递回同学',
    response: '他把帽子按在头上，跑远了。',
    future: { at: '2', text: '红帽晾在屋檐下，帽沿还夹着一粒沙。' },
  },
  bag: {
    trigger: { kind: 'event', id: 'bag' }, object: '屋檐下倒在水里的书包',
    action: '贴近书包，踩踏扶起',
    response: '书包自己站好了，像没人碰过。',
    future: { at: '3', text: '那只书包立在教室门边，拉链还滴着雨。' },
  },
  paper: {
    trigger: { kind: 'event', id: 'paper' }, object: '从同学手里飞出的白纸',
    action: '赶在纸滑进门缝前踩踏按住',
    response: '纸保住了。他没说谢谢，但你听见了。',
    future: { at: '4', text: '白纸夹在作业本里，折角留下你的指印。' },
  },
  plant: {
    trigger: { kind: 'event', id: 'plant' }, object: '走廊窗台上歪斜的盆栽',
    action: '经过窗台时踩踏扶正',
    response: '土撒了一点，花站直了。',
    future: { at: '5', text: '那盆花还在窗台上，叶子重新朝着光。' },
  },
  bench: {
    trigger: { kind: 'event', id: 'bench' }, object: '家长会长椅上独坐的孩子',
    action: '在他身边踩踏坐两秒',
    response: '谁也没说话。这样就挺好。',
    future: { at: '7', text: '合影队伍边的那个孩子，又给你留了半个位置。' },
  },
  milk: {
    trigger: { kind: 'event', id: 'milk' }, object: '台灯旁还温着的牛奶',
    action: '经过书桌时踩踏喝掉',
    response: '牛奶是温的。写完最后一题刚好。',
    future: { at: '7', text: '旧练习册的边上，还留着淡淡的杯印。' },
  },
  wish: {
    trigger: { kind: 'event', id: 'wish' }, object: '毕业树枝上的许愿牌',
    action: '从树下经过时踩踏摸一下',
    response: '牌子上写什么都没看。你只摸了一下。',
    future: { at: 'ending', text: '快门响前，你摸过那块晃动的许愿牌。' },
  },
};

export const SCENE_STORIES: Record<ChapterSceneKey, SceneStory> = {
  '1': {
    objective: '跟上报到的同学，穿过昨天还来过的幼儿园门口。',
    focus: '门框上的身高线、书包带和被风吹落的红帽。',
    actions: [MICRO_STORIES.hat],
    beats: [
      { id: 's1-gate', at: 3, text: '幼儿园门框上，还留着你去年的身高线。', visual: '晨光照出门框的旧铅笔刻痕。' },
      { id: 's1-hat', at: 15, text: '前面的孩子按着书包带跑。\n红帽被风吹向路中央。', visual: '红帽翻着边落在路面，无碰撞伤害。' },
      { id: 's1-road', at: 34, text: '小学的铃声从前面传来。\n大路的伞和巷口的墙一起入画。', visual: '伞与墙同时入镜，衔接抉择①。' },
    ],
    guide: '先跟上同学。轻点跳过书包；空中再点可二段跳。',
  },
  '2': {
    objective: '沿屋檐进教室，别误了第一节课。',
    focus: '空出一格的伞架、台阶上的笔和雨里的书包。',
    actions: [
      {
        trigger: { kind: 'event', id: 'pen' }, object: '文具店门口台阶上的笔',
        action: '踩到台阶边，把笔收进口袋',
        response: '笔帽硌了一下口袋，笔尖还没用过。',
        future: { at: 'choice3', text: '五十九分的卷子前，口袋里的笔仍在。' },
      },
      MICRO_STORIES.bag,
    ],
    beats: [
      { id: 's2-eaves', at: 3, text: '雨从伞架一格一格滴下来。\n教室的灯在屋檐尽头亮着。', visual: '空伞格、滴水的挂钩。' },
      { id: 's2-pen', at: 10, text: '文具店台阶上落了一支笔。\n笔帽被雨水冲到脚边。', visual: '笔与白线同源地标，提示可踩踏拾取。' },
      { id: 's2-umbrella', at: 21, text: '伞收在门边，布面还有一圈水光。', when: { all: ['umbrella'] }, visual: '伞靠在门边，后来可从书包旁再次看见。' },
      { id: 's2-hat-echo', at: 24.5, text: MICRO_STORIES.hat.future.text, when: { all: ['hat'] }, visual: '红帽挂在雨棚钩上。' },
      { id: 's2-bag', at: 35.5, text: '铃声近了；那只湿书包还靠着屋檐。', visual: '书包与校门同屏。' },
      { id: 's2-alley-echo', at: 38, text: '巷子里的灰水，仍沾在裤脚边。', when: { all: ['alleyReturn'] }, visual: '水渍层在裤脚留灰边。' },
    ],
    guide: '看到台阶上的笔可收下；水里的书包也能扶起。',
  },
  '3': {
    objective: '趁下课铃还没响，经过自己的桌子，把作业处理好。',
    focus: '窗台纸飞机、飞走的白纸和两种字迹的作业本。',
    actions: [
      {
        trigger: { kind: 'event', id: 'plane' }, object: '窗台滑来的纸飞机',
        action: '跳起接住纸飞机',
        response: '纸飞机停在掌心，折痕还朝着窗外。',
        future: { at: 'ending', text: '那架纸飞机的折痕，还夹在旧书里。' },
      },
      MICRO_STORIES.paper,
      {
        trigger: { kind: 'event', id: 'copyHomework' }, object: '摊开的作业本',
        action: '踩到同桌写好的那页，照着抄完',
        response: '你补上最后一行，字迹忽然像了起来。',
        future: { at: '4', text: '作业本上两种字迹，在走廊灯下挨得很近。' },
      },
      {
        trigger: { kind: 'event', id: 'ownHomework' }, object: '摊开的作业本',
        action: '绕开同桌那页，把自己的空格写完',
        response: '你没有碰同桌那页，自己的空格多了一行字。',
        future: { at: '4', text: '作业本上自己写的那行字，还没完全干。' },
      },
    ],
    beats: [
      { id: 's3-room', at: 3, text: '同桌把两本作业摊在一起。\n你那本的最后一行还空着。', visual: '桌上两本作业有不同字迹。' },
      { id: 's3-bag-echo', at: 6, text: MICRO_STORIES.bag.future.text, when: { all: ['bag'] }, visual: '门边立着刚扶起的湿书包。' },
      { id: 's3-seat1-echo', at: 9, text: '前排的同学又挪了挪书，给你留出桌角。', when: { all: ['seat1'] } },
      { id: 's3-seat2-echo', at: 9, text: '两边都有人翻书，你在中间听得清楚。', when: { all: ['seat2'] } },
      { id: 's3-seat3-echo', at: 9, text: '后排窗边那块光，正落在你的本子上。', when: { all: ['seat3'] } },
      { id: 's3-plane', at: 14, text: '一架纸飞机从窗边滑来。\n后排有人朝它伸了一下手。', visual: '纸飞机沿窗台飞来。' },
      { id: 's3-homework', at: 28, text: '同桌那页已经写满。\n你的最后一题，还在等落笔。', visual: '两种字迹可辨，作业本交互提前入画。' },
      { id: 's3-bell', at: 39, text: '上课铃盖过操场的球声。\n老师正抱着试卷进门。', visual: '试卷夹在老师臂弯，衔接抉择③。' },
    ],
    guide: '纸飞机在窗台；经过摊开的作业本时，看脚下落在哪一页。',
  },
  '4': {
    objective: '沿走廊去琴房，把刚才被冤枉的事说清楚。',
    focus: '罚站黄线、卡在喉咙里的话泡和窗台盆栽。',
    actions: [
      {
        trigger: { kind: 'event', id: 'speak' }, object: '走廊里卡住的话泡',
        action: '靠近话泡，踩踏把话说出去',
        response: '话终于说出来，办公室门缝安静了一拍。',
        future: { at: '5', text: '门里又响起大人的声音，你记得自己说过那句话。' },
      },
      {
        trigger: { kind: 'event', id: 'silent' }, object: '走廊里卡住的话泡',
        action: '从话泡旁经过，继续往琴房跑',
        response: '话没有出口，只剩鞋底踩过黄线的声音。',
        future: { at: '5', text: '门里又响起大人的声音，那句话还堵在喉咙里。' },
      },
      {
        trigger: { kind: 'event', id: 'eraser' }, object: '办公室旁的一块橡皮',
        action: '靠近橡皮，把它收进书包',
        response: '橡皮擦得掉字，擦不掉那句话。',
        future: { at: 'ending', text: '橡皮越用越短，仍留在书包夹层。' },
      },
      MICRO_STORIES.plant,
    ],
    beats: [
      { id: 's4-yellow-line', at: 3, text: '地上有一条罚站黄线。\n踩过去，只有鞋底轻轻一响。', visual: '黄线只发声，不设伤害。' },
      { id: 's4-side-echo', at: 6, text: '侧门的黄漆蹭在手心，走廊还是熟悉的。', when: { all: ['sideReturn'] }, visual: '侧门把手黄漆留在手掌。' },
      { id: 's4-paper-echo', at: 8, text: MICRO_STORIES.paper.future.text, when: { all: ['paper'] }, visual: '白纸夹在作业本里。' },
      { id: 's4-copy-echo', at: 12, text: '本子上那两种字迹，还挨在同一行。', when: { all: ['copyHomework'] } },
      { id: 's4-own-echo', at: 12, text: '你自己写的最后一行，墨还没全干。', when: { all: ['ownHomework'] } },
      { id: 's4-exam-cheat', at: 16, text: '卷背透着一小道红线，五十九分藏不住。', when: { all: ['cheat'] }, visual: '试卷背面的红笔痕。' },
      { id: 's4-exam-face', at: 16, text: '五十九分的卷子夹在本子里，没被改动。', when: { all: ['faceExam'] } },
      { id: 's4-exam-nopen', at: 16, text: '那张没改成的卷子，还压在书包最底下。', when: { all: ['noPen'] } },
      { id: 's4-voice', at: 20, text: '办公室门只开了一条缝。\n你想说的话，像气泡堵在胸口。', visual: '话泡与门缝同屏，提前看见可触范围。' },
      { id: 's4-piano', at: 44, text: '琴房里有人弹错一个音。\n门口那双鞋还在等人。', visual: '琴房门开，暖光压过走廊灰色。' },
    ],
    guide: '黄线没有伤害；到话泡旁，可踩踏说出那句话。',
  },
  '5': {
    objective: '穿过家长会的人群，到门口去，家里的饭快凉了。',
    focus: '头顶的成绩单、大人腿之间的光和独坐的孩子。',
    actions: [
      {
        trigger: { kind: 'event', id: 'compared' }, object: '飘过头顶的成绩单',
        action: '继续穿过人群，听见大人的比较',
        response: '纸上的字看不清，“你看看人家”却很近。',
        future: { at: '6', text: '那张成绩单被折小了，压在台灯下。' },
      },
      MICRO_STORIES.bench,
    ],
    beats: [
      { id: 's5-legs', at: 3, text: '大人的裤脚排成一列。\n腿间透出的光，正通向门口。', visual: '只有物件和环境碰撞，人物不伤人。' },
      { id: 's5-plant-echo', at: 5, text: MICRO_STORIES.plant.future.text, when: { all: ['plant'] }, visual: '同一走廊窗台，盆栽重新站直。' },
      { id: 's5-spoke-echo', at: 8, text: '你在走廊说过的话，还在耳边轻轻响。', when: { all: ['speak'] } },
      { id: 's5-silent-echo', at: 8, text: '走廊那句话没说出口，门里又有人开口。', when: { all: ['silent'] } },
      { id: 's5-practice-echo', at: 11, text: '“明天再练”那句话，还跟着你。', when: { all: ['pianoPractice'] } },
      { id: 's5-smash-echo', at: 11, text: '最后一声琴音还在耳边，大人忽然停了话。', when: { all: ['pianoSmash'] } },
      { id: 's5-close-echo', at: 11, text: '琴盖合上后那段安静，跟着你走到门边。', when: { all: ['pianoClose'] } },
      { id: 's5-child', at: 21, text: '长椅另一端坐着个孩子。\n他也没急着回家。', visual: '另一端的孩子只看你一眼，不作碰撞体。' },
      { id: 's5-door', at: 44, text: '门里又有人提起“第一名”。\n门外的天，已经黑了。', visual: '门和低长椅同框，衔接抉择⑤。' },
    ],
    guide: '大人之间的低横档可以滑过去；长椅边有人可坐一会儿。',
  },
  '6': {
    objective: '写完桌上的最后几题，把本子合上，去睡一会儿。',
    focus: '台灯、折起来的成绩单和还温着的牛奶。',
    actions: [MICRO_STORIES.milk],
    beats: [
      { id: 's6-desk', at: 3, text: '台灯照着最后几道题。\n闹钟滴答，家里别的灯都灭了。', visual: '桌上只留一圈灯光和翻开的练习册。' },
      { id: 's6-grade-echo', at: 8, text: '那张成绩单被折小了，压在台灯下。', when: { all: ['compared'] }, visual: '成绩单缩小后压在书边。' },
      { id: 's6-apology-echo', at: 10, text: '那句“对不起”说得很轻，家里的灯仍亮着。', when: { all: ['apologize'] } },
      { id: 's6-door-echo', at: 10, text: '门响过后，家里的灯仍为你留着。', when: { all: ['slamDoor'] } },
      { id: 's6-milk', at: 14, text: '有人把牛奶放在书边。\n杯沿还有一点热气。', visual: '牛奶杯边有缓慢的热气，不遮住地面。' },
      { id: 's6-clock', at: 32, text: '最后一页快写完了。\n闹钟的秒针，仍绕着原处走。', visual: '旧闹钟与段末熄灯形成一静一动。' },
    ],
    guide: '牛奶就在灯边；遇到书堆时，先看台灯照出的落脚处。',
  },
  '7': {
    objective: '毕业照还差你一个人，跑到校门口那棵树下站好。',
    focus: '合影架、用旧的书包和树枝上的许愿牌。',
    actions: [MICRO_STORIES.wish],
    beats: [
      { id: 's7-bag', at: 3, text: '旧书包靠着合影架。\n肩带上的线头，还和入学那天一样。', visual: '首段书包同一线头，但颜色已褪。' },
      { id: 's7-milk-echo', at: 7, text: MICRO_STORIES.milk.future.text, when: { all: ['milk'] }, visual: '相册旁的旧练习册有淡淡杯印。' },
      { id: 's7-bench-echo', at: 13, text: MICRO_STORIES.bench.future.text, when: { all: ['bench'] }, visual: '长椅上的孩子在合影队伍边挪出位置。' },
      { id: 's7-back-echo', at: 18, text: '来路的脚印已经干了，你又站到树下。', when: { all: ['back'] }, visual: '回看演出留下的脚印渐淡。' },
      { id: 's7-people', at: 27, text: '摄影师举起相机。\n同学们挪出一块刚好容你站的地方。', visual: '合影人群慢慢侧开，人物无碰撞伤害。' },
      { id: 's7-shutter', at: 46, text: '许愿牌轻轻碰响。\n摄影师说：“再往前一点。”', visual: '从夜到晨，快门前障碍仍是可读剪影。' },
    ],
    guide: '走到树下就能入镜；那块许愿牌在低枝上。',
  },
  alley: {
    objective: '顺着巷子跑，找回校门的灯；尽头有一处窗台。',
    focus: '雨棚、不会伤人的野猫和墙头下的亮窗。',
    actions: [
      {
        trigger: { kind: 'event', id: 'alleyReturn' }, object: '巷子尽头的亮窗和校门光',
        action: '没有爬上窗台，沿灯光回到校门',
        response: '裤脚带着灰水，重新走进屋檐下。',
        future: { at: '2', text: '雨小了，巷子里的灰水还留在裤脚。' },
      },
      {
        trigger: { kind: 'ending', id: 'wall' }, object: '可站立的窗台和更高的墙',
        action: '跳上窗台，踩稳后爬上墙头',
        response: '墙的另一边也有孩子在跑；你坐下看了一会儿。',
        future: { at: 'ending', text: '墙头的雨水沿着砖缝，滴在普通的路上。' },
      },
    ],
    beats: [
      { id: 'alley-rain', at: 3, text: '墙挡住了晨光。\n雨顺着别人的屋檐，落到裤脚。', visual: '水渍层从裤脚开始，野猫掠过不碰撞。' },
      { id: 'alley-window', at: 15, text: '窄窗里有人关了灯。\n校门的铃声隔着墙，听得很轻。', visual: '一盏窗灯熄灭，墙外仍有远处铃声。' },
      { id: 'alley-ledge', at: 29, text: '尽头的窗台缺了一块砖。\n踩上去，才看得到墙的另一边。', visual: '窗台与可站面同源；不上去可继续返回。' },
    ],
    guide: '巷子尽头可跳上窗台；沿原路走也会回到校门。',
  },
  playground: {
    objective: '上课铃响了。沿操场跑，看看侧门还能不能回教室。',
    focus: '空下来的跑道、温暖的侧门把手和墙外的街。',
    actions: [
      {
        trigger: { kind: 'event', id: 'sideReturn' }, object: '教学楼侧门的黄把手',
        action: '门进入视野后跳起，踩到门边窗台',
        response: '把手还暖着；门后又听见翻书声。',
        future: { at: '4', text: '侧门的黄漆蹭在手心，走廊还是熟悉的。' },
      },
      {
        trigger: { kind: 'ending', id: 'runaway' }, object: '操场尽头的围墙',
        action: '经过侧门，沿外圈继续跑',
        response: '围墙留在身后，外面只是一条普通的街。',
        future: { at: 'ending', text: '侧门曾亮过，你沿跑道一直走到街上。' },
      },
      {
        trigger: { kind: 'event', id: 'graffiti' }, object: '围墙和口袋里的笔',
        action: '有笔时靠近墙根踩踏，留下一行字',
        response: '围墙上多了一行无人署名的字。',
        future: { at: 'ending', text: '围墙上那行字，没有留下名字。' },
      },
    ],
    beats: [
      { id: 'field-empty', at: 3, text: '广播操只响了开头。\n球滚到脚边，教室的窗还亮着。', visual: '球慢滚，同学只在远景，不作碰撞体。' },
      { id: 'field-door', at: 22, text: '侧门的黄把手，在前面亮起来。\n门后能听见有人翻书。', visual: '侧门随教学楼门洞进入画面，文字在接触前约 2.5 秒出现。' },
      { id: 'field-street', at: 33, text: '门已经留在身后。\n围墙外，菜摊正在收伞。', visual: '外面的普通街道渐渐入画。' },
    ],
    guide: '靠近侧门时跳上门边窗台可回去；继续跑也有路。',
  },
};

export interface ChoiceScene {
  focus: string;
  person: string;
  stakes: string;
  preview: string;
  guide: string;
  outcomes: readonly StoryAction[];
  /** 隐藏操作仅通过画面暗示；这里不写方向或输入名称。 */
  discoveryCue?: string;
}

export const CHOICE_SCENES: Record<MainChoiceId, ChoiceScene> = {
  1: {
    focus: '大路边的伞与巷口的墙', person: '校门口点名的老师',
    stakes: '铃响前要进校门，墙后看不到出口。',
    preview: '老师已经在校门点名。远处巷口连着旧院墙。\n校门雨棚下，有把伞靠在伞架边。',
    guide: '沿大路接近伞架；跳起落上巷口矮墙会进巷子。',
    outcomes: [
      { trigger: { kind: 'event', id: 'umbrella' }, object: '门边的伞', action: '沿大路踩到伞',
        response: '伞柄还留着掌心的温度，雨先落在伞面上。',
        future: { at: '2', text: '伞收在教室门边，布面还有一圈水光。' } },
      { trigger: { kind: 'event', id: 'alley' }, object: '墙头', action: '落上矮墙进入巷子',
        response: '砖沿蹭湿了裤脚，墙里的雨声更近了。',
        future: { at: 'alley', text: '墙影挡住晨光，裤脚从此带着灰水。' } },
    ],
  },
  2: {
    focus: '先后进入画面的三把凳子', person: '把书挪开的同学',
    stakes: '铃响前要落在一把凳面上，错过也能继续跑。',
    preview: '教室那头，同学挪开书，留出三把凳子。\n铃响前坐下，才赶得上这节课。',
    guide: '凳子靠近时轻点跳起，再下滑落到凳面。',
    outcomes: [
      { trigger: { kind: 'event', id: 'seat1' }, object: '第一把凳子', action: '落到前排凳面',
        response: '前排的孩子把书挪开半寸，你坐稳了。',
        future: { at: '3', text: '前排的同学又挪了挪书，给你留出桌角。' } },
      { trigger: { kind: 'event', id: 'seat2' }, object: '第二把凳子', action: '落到中排凳面',
        response: '你坐在中间，两边的翻书声都听得到。',
        future: { at: '3', text: '两边都有人翻书，你在中间听得清楚。' } },
      { trigger: { kind: 'event', id: 'seat3' }, object: '第三把凳子', action: '落到后排凳面',
        response: '你坐到后排，窗边的光落在桌角。',
        future: { at: '3', text: '后排窗边那块光，正落在你的本子上。' } },
      { trigger: { kind: 'event', id: 'skipClass' }, object: '三把错过的凳子', action: '一直向前，没有坐下',
        response: '铃响了，三把凳子都留在身后；操场门开着。',
        future: { at: 'playground', text: '广播操只响了开头，教室的窗还亮着。' } },
    ],
  },
  3: {
    focus: '从桌边滑落的五十九分试卷与口袋里的笔', person: '正来收卷的老师',
    stakes: '试卷从桌边滑落，老师很快要收走；有没有笔会改变能做的事。',
    preview: '老师正从教室另一头来收卷。\n一张五十九分的卷子从桌边滑落；口袋里有笔吗？',
    guide: '卷面靠近时跳过会保留分数；带笔碰到可拾起改分。',
    outcomes: [
      { trigger: { kind: 'event', id: 'faceExam' }, object: '五十九分的试卷', action: '跳起越过卷面',
        response: '你从卷面上跃过去，五十九分还在原处。',
        future: { at: '4', text: '卷子夹在本子里，五十九分没被改动。' } },
      { trigger: { kind: 'event', id: 'cheat' }, object: '五十九分的试卷', action: '带笔碰到卷子，拾起改分',
        response: '你拾起卷子，用红笔在五十九分旁添了一道线。',
        future: { at: '4', text: '卷背透着一小道红线，数字藏不住。' } },
      { trigger: { kind: 'event', id: 'noPen' }, object: '五十九分的试卷', action: '没带笔时拾起卷子',
        response: '手伸进口袋，只摸到空笔盒；五十九分没动。',
        future: { at: '4', text: '那张没改成的卷子，还压在书包最底下。' } },
    ],
  },
  4: {
    focus: '练习曲最后一行与尚未合上的琴盖', person: '在门外等候的人',
    stakes: '人已经等了一阵，曲子还有一拍没收住。',
    preview: '琴房另一端，那架钢琴的琴盖还开着。\n最后一行没弹完，门外的人仍扶着门框。',
    guide: '靠近琴键时跳起再下滑；继续跑会弹完。',
    discoveryCue: '琴盖上方只有一圈很淡的光，靠近时慢慢合拢。',
    outcomes: [
      { trigger: { kind: 'event', id: 'pianoPractice' }, object: '最后一行琴键', action: '继续跑完练习曲',
        response: '你弹完最后一行。门外的人说：“明天再练一遍。”',
        future: { at: '5', text: '“明天再练”那句话，跟着你走到家长会。' } },
      { trigger: { kind: 'event', id: 'pianoSmash' }, object: '还开着的琴键', action: '跳起后急坠砸响',
        response: '最后那个音太重，门外的人停住脚步。',
        future: { at: '5', text: '最后一声琴音还在耳边，大人忽然停了话。' } },
      { trigger: { kind: 'event', id: 'pianoClose' }, object: '琴盖', action: '靠近并长按，轻轻合盖',
        response: '琴盖轻轻落下，练习曲停在未完的一拍。',
        future: { at: '5', text: '琴盖合上后那段安静，跟着你走到门边。' } },
    ],
  },
  5: {
    focus: '门与长椅下的窄路', person: '还在比较成绩的大人',
    stakes: '家里那碗饭快凉了，屋里的人还等你开口。',
    preview: '成绩单刚从头顶飘过。长椅和门在走廊前方。\n门里大人还在比较，桌上那碗饭快凉了。',
    guide: '长椅靠近时下滑会低头认错；继续跑会撞门出去。',
    outcomes: [
      { trigger: { kind: 'event', id: 'apologize' }, object: '长椅下的低路', action: '下滑，低头认错',
        response: '你从椅子下滑过去，低声说了一句对不起。',
        future: { at: '6', text: '那句“对不起”说得很轻，家里的灯仍亮着。' } },
      { trigger: { kind: 'event', id: 'slamDoor' }, object: '通向夜色的门', action: '不操作，继续跑着撞门出去',
        response: '门响了一声。回头时，屋里还亮着灯。',
        future: { at: '6', text: '门响过后，家里的灯仍为你留着。' } },
    ],
  },
  6: {
    focus: '去校门口的路', person: '等合影的同学；四灯全亮时还有旧自己',
    stakes: '摄影师正在树下等，天快亮了。',
    preview: '新校门在路的尽头，摄影师已经站好。\n今天的合影还差你一个，继续向前。',
    guide: '沿着路继续向前，到校门口站进合影。',
    discoveryCue: '四盏灯全亮时，远处的旧自己随倒序脚印渐渐走近。',
    outcomes: [
      { trigger: { kind: 'event', id: 'forward' }, object: '校门前的路', action: '继续向前',
        response: '你继续往前。风把书包带吹向身后。',
        future: { at: '7', text: '校门口的树，在晨光里越来越清楚。' } },
      { trigger: { kind: 'event', id: 'back' }, object: '四灯全亮后出现的旧自己', action: '在路口做相反方向的动作',
        response: '你回过头。旧书包的肩带和小时候的一模一样。',
        future: { at: '7', text: '来路的脚印已经干了，你又站到树下。' } },
    ],
  },
};

const CHOICE_IDS: readonly MainChoiceId[] = [1, 2, 3, 4, 5, 6];
/** 保留原先数组导出，Game 可直接按抉择号取默认预告和操作引导。 */
export const CHOICE_STORIES: string[] = ['', ...CHOICE_IDS.map(id => CHOICE_SCENES[id].preview)];
export const CHOICE_GUIDES: string[] = ['', ...CHOICE_IDS.map(id => CHOICE_SCENES[id].guide)];
export const CHOICE_AFTER: Record<string, string> = {};
for (const id of CHOICE_IDS) {
  for (const outcome of CHOICE_SCENES[id].outcomes) CHOICE_AFTER[outcome.trigger.id] = outcome.response;
}

/** 需要道具或四盏灯的场合，用实际局内状态替换默认预告。 */
export function choicePreview(id: MainChoiceId, state: { items?: readonly string[]; allLit?: boolean } = {}): string {
  if (id === 3 && state.items) {
    return state.items.includes('pen')
      ? '老师正从教室另一头来收卷。\n前方的卷子是五十九分，口袋里的笔还在。'
      : '老师正从教室另一头来收卷。\n前方的卷子是五十九分，口袋里却没有笔。';
  }
  if (id === 6 && state.allLit) {
    return '路的尽头是等合影的同学。远处有个背旧书包的身影。\n摄影师在树下等，天就快亮了。';
  }
  return CHOICE_SCENES[id].preview;
}

export function choiceGuide(id: MainChoiceId, state: { items?: readonly string[] } = {}): string {
  if (id === 3 && state.items && !state.items.includes('pen')) {
    return '口袋没笔。卷面靠近时踩上去只会摸口袋；跳起可越过。';
  }
  return CHOICE_SCENES[id].guide;
}

export function sceneStory(key: ChapterSceneKey | number): SceneStory | undefined {
  const normalized = String(key) as ChapterSceneKey;
  return Object.prototype.hasOwnProperty.call(SCENE_STORIES, normalized) ? SCENE_STORIES[normalized] : undefined;
}

/** A quiet reminder at the next scene entrance. Only an event from this run may select a line. */
const OPENING_ECHOES: Partial<Record<ChapterSceneKey, readonly { event: string; text: string }[]>> = {
  '2': [
    {event:'hat',text:'屋檐下，红帽还在晃。'},
    {event:'umbrella',text:'伞沿的雨水跟进了教室。'},
    {event:'alleyReturn',text:'裤脚还沾着巷子的灰水。'},
  ],
  '3': [
    {event:'pen',text:'口袋里那支笔还没用过。'},
    {event:'bag',text:'湿书包已经站在门边。'},
  ],
  '4': [
    {event:'copyHomework',text:'两种字迹挨在一起。'},
    {event:'ownHomework',text:'自己写的那行字还没干。'},
    {event:'cheat',text:'改过的分数透在纸背。'},
    {event:'faceExam',text:'五十九分留在了卷上。'},
    {event:'noPen',text:'口袋空着，卷面也没变。'},
  ],
  '5': [
    {event:'speak',text:'那句话已经说出了门。'},
    {event:'silent',text:'门缝替你收住了话。'},
    {event:'pianoPractice',text:'练习曲最后一拍还在耳边。'},
    {event:'pianoSmash',text:'太重的那个音还在响。'},
    {event:'pianoClose',text:'琴盖落下后，走廊更安静。'},
  ],
  '6': [
    {event:'bench',text:'长椅边还留着半个位置。'},
    {event:'apologize',text:'那句对不起还在耳边。'},
    {event:'slamDoor',text:'门响过，屋里的灯还亮着。'},
  ],
  '7': [
    {event:'milk',text:'练习册边还留着杯印。'},
    {event:'back',text:'路口的你，曾回头看过。'},
    {event:'forward',text:'路口的风吹起书包带。'},
  ],
  alley: [{event:'alley',text:'墙影挡住了刚才的晨光。'}],
  playground: [{event:'skipClass',text:'铃声在身后，球还在滚。'}],
};

export function sceneOpeningEcho(key: ChapterSceneKey | number, events: readonly string[] = []):
    {event:string;text:string}|undefined {
  const entries=OPENING_ECHOES[String(key) as ChapterSceneKey];
  if(!entries)return undefined;
  for(let i=events.length-1;i>=0;i--){
    const match=entries.find(entry=>entry.event===events[i]);
    if(match)return match;
  }
  return undefined;
}

/** Game 在时间跨过 at 时调用一次；when 只读取本局已记录的事件。 */
export function storyBeatsBetween(
  key: ChapterSceneKey | number, previousTime: number, currentTime: number,
  events: readonly string[] = [],
): StoryBeat[] {
  const story = sceneStory(key);
  if (!story || !Number.isFinite(previousTime) || !Number.isFinite(currentTime) || currentTime <= previousTime) return [];
  const occurred = new Set(events);
  return story.beats.filter(beat =>
    previousTime < beat.at && beat.at <= currentTime &&
    (!beat.when?.all || beat.when.all.every(event => occurred.has(event))) &&
    (!beat.when?.none || beat.when.none.every(event => !occurred.has(event)))
  ).sort((a, b) => a.at - b.at);
}

export function microResponse(id: string): string {
  return Object.prototype.hasOwnProperty.call(MICRO_STORIES, id)
    ? MICRO_STORIES[id as MicroEventId].response : '';
}

export function actionResponse(id: string): string {
  if (Object.prototype.hasOwnProperty.call(CHOICE_AFTER, id)) return CHOICE_AFTER[id];
  for (const scene of Object.values(SCENE_STORIES)) {
    const action = scene.actions.find(candidate => candidate.trigger.id === id);
    if (action) return action.response;
  }
  return '';
}

export interface FragmentMemory {
  id: string;
  group: 1 | 2 | 3;
  object: string;
  text: string;
  visual: string;
  /** 放在侧边短提示，不占用剧情字幕，也不逐枚弹出。 */
  display: 'corner';
}

/** 每段碎片价值分三组形成一张小记忆；普通碎片的数值与稳定拾取 ID 不变。 */
export const FRAGMENT_MEMORIES: Record<ChapterSceneKey, readonly FragmentMemory[]> = {
  '1': [
    { id: 's1-door', group: 1, object: '幼儿园门框', text: '拼出门框上的身高线。', visual: '门框铅笔刻痕亮一格', display: 'corner' },
    { id: 's1-hat', group: 2, object: '红帽', text: '拼出风里翻滚的红帽。', visual: '红帽影子亮一格', display: 'corner' },
    { id: 's1-bell', group: 3, object: '小学铃', text: '拼出身后最后一声铃。', visual: '旧校门铃完整亮起', display: 'corner' },
  ],
  '2': [
    { id: 's2-eaves', group: 1, object: '伞架', text: '拼出滴水的伞架。', visual: '空伞格亮一格', display: 'corner' },
    { id: 's2-pen', group: 2, object: '文具店台阶', text: '拼出台阶边的笔帽。', visual: '台阶白线亮一格', display: 'corner' },
    { id: 's2-zip', group: 3, object: '湿书包', text: '拼出滴水的书包拉链。', visual: '书包拉链完整亮起', display: 'corner' },
  ],
  '3': [
    { id: 's3-plane', group: 1, object: '纸飞机', text: '拼出窗边的折痕。', visual: '纸飞机折痕亮一格', display: 'corner' },
    { id: 's3-paper', group: 2, object: '白纸', text: '拼出纸角的指印。', visual: '白纸角亮一格', display: 'corner' },
    { id: 's3-book', group: 3, object: '作业本', text: '拼出本子最后一行。', visual: '最后一行字完整亮起', display: 'corner' },
  ],
  '4': [
    { id: 's4-line', group: 1, object: '罚站黄线', text: '拼出走廊那道黄线。', visual: '黄线亮一格', display: 'corner' },
    { id: 's4-voice', group: 2, object: '话泡', text: '拼出门缝前的一口气。', visual: '话泡亮一格', display: 'corner' },
    { id: 's4-pot', group: 3, object: '窗台盆栽', text: '拼出窗台上的叶影。', visual: '盆栽叶影完整亮起', display: 'corner' },
  ],
  '5': [
    { id: 's5-cup', group: 1, object: '茶杯架', text: '拼出杯沿的一圈水。', visual: '杯沿亮一格', display: 'corner' },
    { id: 's5-bench', group: 2, object: '长椅', text: '拼出长椅空出的半边。', visual: '长椅半边亮一格', display: 'corner' },
    { id: 's5-grade', group: 3, object: '成绩单', text: '拼出折小的成绩单。', visual: '折起的成绩单完整亮起', display: 'corner' },
  ],
  '6': [
    { id: 's6-lamp', group: 1, object: '台灯', text: '拼出台灯照出的圆圈。', visual: '台灯光圈亮一格', display: 'corner' },
    { id: 's6-milk', group: 2, object: '牛奶杯', text: '拼出杯口的一点热气。', visual: '杯口热气亮一格', display: 'corner' },
    { id: 's6-clock', group: 3, object: '闹钟', text: '拼出闹钟的最后一格。', visual: '钟面完整亮起', display: 'corner' },
  ],
  '7': [
    { id: 's7-bag', group: 1, object: '旧书包', text: '拼出书包带的线头。', visual: '旧书包带亮一格', display: 'corner' },
    { id: 's7-card', group: 2, object: '许愿牌', text: '拼出树枝上的木牌。', visual: '木牌亮一格', display: 'corner' },
    { id: 's7-photo', group: 3, object: '毕业照', text: '拼出合影里空着的位置。', visual: '合影框完整亮起', display: 'corner' },
  ],
  alley: [
    { id: 'alley-eaves', group: 1, object: '巷子屋檐', text: '拼出屋檐下的雨线。', visual: '檐水亮一格', display: 'corner' },
    { id: 'alley-cat', group: 2, object: '野猫', text: '拼出墙头掠过的猫影。', visual: '猫影亮一格', display: 'corner' },
    { id: 'alley-ledge', group: 3, object: '窗台缺口', text: '拼出缺了一块的窗台。', visual: '窗台缺口完整亮起', display: 'corner' },
  ],
  playground: [
    { id: 'field-ball', group: 1, object: '慢滚的球', text: '拼出球上的旧白线。', visual: '球面白线亮一格', display: 'corner' },
    { id: 'field-door', group: 2, object: '教学楼侧门', text: '拼出侧门发亮的把手。', visual: '侧门把手亮一格', display: 'corner' },
    { id: 'field-street', group: 3, object: '墙外的街', text: '拼出墙外收摊的伞。', visual: '街边收起的伞完整亮起', display: 'corner' },
  ],
};

function sceneFragmentTotal(key: ChapterSceneKey): number {
  if (key === 'alley' || key === 'playground') return BRANCHES[key].fragments;
  return SEGMENTS[Number(key) - 1].fragments;
}

/** 传入本段拾取前后价值；只有越过 1/3、2/3、满罐三道门槛才返回短提示。 */
export function fragmentMemoryCues(
  key: ChapterSceneKey | number, previousValue: number, currentValue: number,
): FragmentMemory[] {
  const normalized = String(key) as ChapterSceneKey;
  if (!Object.prototype.hasOwnProperty.call(FRAGMENT_MEMORIES, normalized) ||
      !Number.isFinite(previousValue) || !Number.isFinite(currentValue) ||
      currentValue <= previousValue) return [];
  const total = sceneFragmentTotal(normalized);
  return FRAGMENT_MEMORIES[normalized].filter(memory => {
    const threshold = Math.ceil(total * memory.group / 3);
    return previousValue < threshold && currentValue >= threshold;
  });
}

export interface EndingEcho {
  event: string;
  group: string;
  text: string;
}

/** 只回收本局发生过的事件；事件是记忆材料，不参与结局判定。 */
const EVENT_ECHOES: Partial<Record<NarrativeEventId, Omit<EndingEcho, 'event'>>> = {
  hat: { group: 'hat', text: '风吹走红帽时，你把它递回给同学。' },
  umbrella: { group: 'road', text: '校门口那把伞，后来一直靠在书包边。' },
  alley: { group: 'road', text: '巷子的墙影，曾把晨光挡在身后。' },
  alleyReturn: { group: 'alley', text: '从巷子回来时，裤脚还沾着灰水。' },
  pen: { group: 'pen', text: '文具店台阶上的那支笔，留在口袋里。' },
  bag: { group: 'bag', text: '雨里扶起的书包，在教室门边滴着水。' },
  seat1: { group: 'seat', text: '前排的孩子，给你挪过半寸桌角。' },
  seat2: { group: 'seat', text: '坐在中间时，两边的翻书声都听得见。' },
  seat3: { group: 'seat', text: '后排的那块阳光，曾落在你的本子上。' },
  skipClass: { group: 'seat', text: '三把凳子错过后，操场的门开着。' },
  plane: { group: 'paper', text: '窗台那架纸飞机，折痕朝着窗外。' },
  paper: { group: 'paper', text: '你按住过那张快被风卷走的白纸。' },
  copyHomework: { group: 'homework', text: '作业本最后一行，像起了同桌的字。' },
  ownHomework: { group: 'homework', text: '自己的作业本上，添过最后一行字。' },
  cheat: { group: 'exam', text: '改过的五十九分，红笔透在纸背。' },
  faceExam: { group: 'exam', text: '五十九分还在卷面上，你从它上方跃过。' },
  noPen: { group: 'exam', text: '口袋里没有笔，五十九分没有变。' },
  speak: { group: 'corridor', text: '走廊里那句话，你曾说出口。' },
  silent: { group: 'corridor', text: '走廊里那句话，停在门缝前。' },
  plant: { group: 'plant', text: '你扶正过窗台的盆栽，土撒了一点。' },
  eraser: { group: 'eraser', text: '那块橡皮越用越短，仍在书包夹层。' },
  pianoPractice: { group: 'piano', text: '琴房最后一行弹完，有人说“明天再练”。' },
  pianoSmash: { group: 'piano', text: '最后那个琴音太重，门外的人停了脚。' },
  pianoClose: { group: 'piano', text: '琴盖轻轻落下，曲子停在未完的一拍。' },
  compared: { group: 'family', text: '成绩单从头顶飘过，“你看看人家”很近。' },
  bench: { group: 'bench', text: '家长会长椅上，曾有人与你并排坐着。' },
  apologize: { group: 'door', text: '门边那句“对不起”，声音很轻。' },
  slamDoor: { group: 'door', text: '门响过以后，屋里的灯还亮着。' },
  milk: { group: 'milk', text: '台灯旁那杯牛奶，放到手边时还是温的。' },
  back: { group: 'self', text: '岔路口那张旧脸，你曾回头看过。' },
  forward: { group: 'self', text: '岔路口的风，把书包带吹向身后。' },
  wish: { group: 'tree', text: '快门响前，你摸过那块晃动的许愿牌。' },
  sideReturn: { group: 'sideDoor', text: '侧门把手的黄漆，蹭在手心里。' },
  graffiti: { group: 'field', text: '围墙上那行字，没有留下名字。' },
  symbol1: { group: 'symbol', text: '幼儿园的鸟笼开着，纸鸟飞了出去。' },
  symbol2: { group: 'symbol', text: '校门的旧钟碎了，钟摆还在晃。' },
  symbol3: { group: 'symbol', text: '断线风筝的碎片，随风转了一圈。' },
  symbol4: { group: 'symbol', text: '公告栏里的满分，曾在眼前碎开。' },
  symbol5: { group: 'symbol', text: '墙上别人的奖状，曾落下一小角。' },
  symbol6: { group: 'symbol', text: '闹钟安静了一秒，滴答声又回来。' },
  lifeLost: { group: 'life', text: '有一次撞疼了，你还是从本段走出去。' },
  hellClear: { group: 'life', text: '余烬里那盏灯，曾把你领回原路。' },
  hellFall: { group: 'life', text: '余烬里跌过一次，你又从段首跑起。' },
  dreamReward: { group: 'reward', text: '梦里的糖纸，落进过你的手心。' },
  heavenReward: { group: 'reward', text: '云海里的那束光，曾托住你的脚步。' },
};

function segmentEcho(event: string): EndingEcho | undefined {
  const match = /^segment:(1|2|3|4|5|6|7|alley|playground):(noHit|hurt)$/.exec(event);
  if (!match) return undefined;
  const key = match[1] as ChapterSceneKey;
  const location = key === 'alley' ? '巷子' : key === 'playground' ? '操场' : SEGMENTS[Number(key) - 1].name;
  return {
    event, group: 'segment:' + key,
    text: match[2] === 'noHit'
      ? '你跑过' + location + '，这一段没有撞疼。'
      : '在' + location + '撞疼过，你仍到了尽头。',
  };
}

/** 首尾相隔的两条真实记录优先；若记录太少，用已完成段的真实评价补足。 */
export function endingEchoRecords(events: readonly string[] = [], limit = 2): EndingEcho[] {
  const wanted = Math.max(0, Math.floor(limit));
  if (!wanted) return [];
  const named: Array<EndingEcho & { index: number }> = [];
  const segment: Array<EndingEcho & { index: number }> = [];
  events.forEach((event, index) => {
    const known = EVENT_ECHOES[event as NarrativeEventId];
    if (known) named.push({ event, ...known, index });
    else {
      const marker = segmentEcho(event);
      if (marker) segment.push({ ...marker, index });
    }
  });
  const selected: Array<EndingEcho & { index: number }> = [];
  const earlyGroups=new Set(['seat','homework','exam']);
  const laterGroups=new Set(['corridor','piano','door','self']);
  const choiceGroups=new Set([...earlyGroups,...laterGroups]);
  const choices=named.filter(entry=>choiceGroups.has(entry.group)&&entry.event!=='forward');
  const available=(pool: Array<EndingEcho & { index: number }>,fromEnd=false)=>{
    const ordered=fromEnd?[...pool].reverse():pool;
    return ordered.find(candidate=>!selected.some(entry=>entry.event===candidate.event)&&
      !selected.some(entry=>entry.group===candidate.group)) ||
      ordered.find(candidate=>!selected.some(entry=>entry.event===candidate.event));
  };
  const add=(entry: (EndingEcho & {index:number})|undefined)=>{if(entry&&selected.length<wanted)selected.push(entry);};
  // The first and last deliberate choices make the ending respond to this run,
  // while micro events and segment scores remain honest fallbacks for short routes.
  add(available(choices.filter(entry=>earlyGroups.has(entry.group)))||available(choices)||available(named));
  add(available(choices.filter(entry=>laterGroups.has(entry.group)),true)||available(choices,true)||available(named,true));
  while(selected.length<wanted){const next=available(named,true)||available(segment,true);if(!next)break;add(next);}
  return selected.sort((a, b) => a.index - b.index).map(({ event, group, text }) => ({ event, group, text }));
}

/** 旧接口保留给只需要文字的渲染器；不会凭空补一条泛用格言。 */
export function endingEchoes(events: readonly string[] = []): string[] {
  return endingEchoRecords(events, 2).map(record => record.text);
}
