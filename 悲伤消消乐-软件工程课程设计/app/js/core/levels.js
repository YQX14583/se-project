/**
 * 75 个关卡的静态配置：5 章 × 15 关，主题依次为失眠 / 失落 / 委屈 / 释怀 / 告别。
 * S0、步数、章节目标均满足需求基线；每关的初盘由 seed 在运行时生成。
 */
import { R_BY_CHAPTER } from './rules.js';

export const CHAPTERS = [
  {
    id: 1, key: 'insomnia', title: '失眠', subtitle: '那些睡不着的夜', accent: '#8fa8ff',
    journal: '凌晨三点的天花板，你数过很多次。睡不着不是你的错，是今天太满了。把呼吸放慢一点，让夜色替你收好那些没说完的话。',
    quotes: [
      '夜里睡不着的时候，你不需要立刻好起来。',
      '把今天轻轻放下，明天再想。',
      '世界安静下来，你也可以慢一点。',
      '失眠不是失败，是身体还在替白天站岗。',
      '数不清的念头，会在一呼一吸里慢慢退潮。',
      '月光不催你，它只是陪着。',
      '今天已经够长了，剩下的交给夜晚。',
      '天亮之前，先允许自己躺着。',
    ],
  },
  {
    id: 2, key: 'loss', title: '失落', subtitle: '空出来的那部分', accent: '#a99bdd',
    journal: '有些东西不见了，你找过很久。失落不是空洞，是曾经认真拥有过的证明。允许自己慢半拍，风会经过，也会带走一点重量。',
    quotes: [
      '失去的形状，会慢慢变成回忆的轮廓。',
      '难过的时候，不必急着振作。',
      '空出来的地方，以后会住进新的风。',
      '你不是不够好，只是有些事没有答案。',
      '慢半拍也没关系，路不会跑掉。',
      '眼泪不是软弱，是心里在换气。',
      '有些门关上了，窗还开着。',
      '今天先走到这里，也算前进。',
    ],
  },
  {
    id: 3, key: 'grievance', title: '委屈', subtitle: '说不出口的那些', accent: '#e8a0a0',
    journal: '你把自己的感受缩得很小，小到别人看不见。可委屈不会因为不说就消失。今天，先不解释，先抱抱那个忍住没哭的自己。',
    quotes: [
      '你的感受是真的，不需要谁来批准。',
      '说不出口的委屈，可以先说给自己听。',
      '不必每次都懂事。',
      '被误解不是你的错。',
      '缩回去的那个你，也值得被抱一抱。',
      '心里下雨的时候，就撑一会儿伞。',
      '你可以拒绝，也可以先照顾自己。',
      '允许自己难过，是恢复的开始。',
    ],
  },
  {
    id: 4, key: 'release', title: '释怀', subtitle: '把重量换一只手', accent: '#7fc9b0',
    journal: '放下不是把过去删掉，是不再让它替你决定今天。你可以记得，也可以不再疼。云开的时候，光会照进来，慢一点也没关系。',
    quotes: [
      '原谅不是忘记，是不再让它压着你。',
      '放下不是丢掉，是换一只手拿。',
      '云开的时候，光会自己进来。',
      '你可以记得，也可以不再疼。',
      '和自己和解，不用一次完成。',
      '轻一点，再轻一点。',
      '过去的事，已经尽力了。',
      '慢慢来，比较快。',
    ],
  },
  {
    id: 5, key: 'farewell', title: '告别', subtitle: '把想念放好', accent: '#f0b87a',
    journal: '有些人、有些日子，只能送到这里。好好说再见，不是遗忘，是把它们放在一个更温柔的位置。然后，带着被爱过的证据，继续走。',
    quotes: [
      '好好告别，也是一种温柔的前进。',
      '有些人只能送到这里，想念可以继续。',
      '不回头，不代表没有爱过。',
      '留一盏灯，给记得的人。',
      '告别之后，日子会慢慢长出新的样子。',
      '带着被爱过的证据，继续走。',
      '最后一页写完了，故事还在。',
      '一路顺风，也一路有光。',
    ],
  },
];

const NAMES = [
  ['长夜', '数羊', '天花板', '月光', '潮汐', '呼吸', '凌晨四点', '未寄出的信', '窗', '雨声', '枕头', '梦的入口', '安静', '微光', '天亮之前'],
  ['空椅子', '旧照片', '回声', '站台', '褪色', '慢半拍', '缺口', '风经过', '无人接听', '灰', '低处', '失重', '远行', '余温', '重新开始'],
  ['说不出口', '眼泪的重量', '小小的事', '被误解', '沉默', '缩回去', '不公平', '忍住', '角落', '解释', '算了', '心里下雨', '抱抱自己', '允许', '松开'],
  ['放下', '原谅', '不是你的错', '轻一点', '旧账', '松手', '云开', '和自己和解', '停一下', '允许难过', '呼吸之间', '慢慢来', '再见一面', '祝福', '释怀'],
  ['最后一页', '站台的风', '说再见', '行李', '远方', '不回头', '留一盏灯', '信', '照片背面', '空房间', '新的早晨', '一路顺风', '目送', '记得', '告别之后'],
];

const S0 = [
  [40, 42, 44, 46, 48, 50, 52, 54, 56, 58, 60, 62, 64, 66, 68],
  [50, 52, 54, 56, 58, 60, 62, 64, 66, 68, 70, 72, 74, 78, 82],
  [58, 60, 62, 64, 66, 68, 70, 72, 74, 76, 78, 80, 82, 86, 90],
  [66, 68, 70, 72, 74, 76, 78, 80, 82, 84, 86, 88, 90, 94, 98],
  [76, 78, 80, 82, 84, 86, 88, 90, 92, 94, 96, 98, 100, 100, 100],
];

const MOVES = [
  [40, 41, 42, 43, 44, 45, 46, 47, 48, 50, 51, 52, 53, 54, 55],
  [42, 44, 45, 46, 48, 49, 50, 52, 54, 55, 56, 57, 58, 60, 62],
  [48, 50, 52, 54, 56, 58, 60, 62, 64, 72, 66, 68, 70, 74, 78],
  [55, 58, 60, 62, 64, 66, 68, 70, 72, 78, 74, 76, 80, 82, 85],
  [60, 62, 65, 68, 70, 72, 74, 76, 78, 86, 80, 82, 88, 90, 90],
];

const COLORS = [5, 5, 6, 6, 6];

/**
 * 情绪层数：每层 S0 仍在 40–100，长关卡由 2–3 层组成。
 * 这是为同时满足“S0≤100”与“单关 40–90 步”做的实现级调和，详见实现说明。
 */
const LAYERS = [
  [2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2],
  [2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 3],
  [2, 2, 2, 2, 2, 2, 2, 2, 3, 3, 3, 3, 3, 3, 3],
  [2, 2, 2, 2, 2, 2, 3, 3, 3, 3, 3, 3, 3, 3, 3],
  [2, 2, 2, 2, 2, 2, 2, 2, 3, 3, 3, 3, 3, 3, 3],
];

/** 追加目标只在对应章节引入：T2 第 2 章、T3 第 3 章、T4 第 4 章、T5 第 5 章。 */
const BONUSES = {
  2: {
    3: { type: 'T2', color: 1, count: 14 },
    6: { type: 'T2', color: 2, count: 20 },
    9: { type: 'T2', color: 3, count: 14 },
    12: { type: 'T2', color: 4, count: 22 },
    15: { type: 'T2', color: 0, count: 22 },
  },
  3: {
    2: { type: 'T3', count: 2, initialClouds: 1 },
    5: { type: 'T3', count: 2, initialClouds: 1 },
    8: { type: 'T3', count: 3, initialClouds: 2 },
    11: { type: 'T3', count: 3, initialClouds: 2 },
    14: { type: 'T3', count: 3, initialClouds: 2 },
    15: { type: 'T3', count: 4, initialClouds: 2 },
    6: { type: 'T2', color: 2, count: 20 },
    12: { type: 'T2', color: 3, count: 22 },
  },
  4: {
    2: { type: 'T4', count: 3 },
    5: { type: 'T4', count: 3 },
    8: { type: 'T4', count: 3 },
    11: { type: 'T4', count: 4 },
    14: { type: 'T4', count: 4 },
    15: { type: 'T4', count: 4 },
    7: { type: 'T3', count: 3, initialClouds: 1 },
    12: { type: 'T2', color: 5, count: 22 },
  },
  5: {
    2: { type: 'T5', rate: 0.2 },
    5: { type: 'T5', rate: 0.22 },
    8: { type: 'T5', rate: 0.25 },
    11: { type: 'T5', rate: 0.28 },
    14: { type: 'T5', rate: 0.3 },
    15: { type: 'T5', rate: 0.3 },
    6: { type: 'T4', count: 4 },
    9: { type: 'T3', count: 4, initialClouds: 2 },
    12: { type: 'T4', count: 4 },
  },
};

/**
 * 展示版实际开放的关卡：覆盖 T1–T5、教学关与章末关。
 * 其余关卡保留 75 关设计数据，在地图上显示为「待解锁」。
 */
export const PLAYABLE_LEVEL_IDS = Object.freeze([
  'C1-L01', 'C1-L02', 'C1-L03', 'C1-L15',
  'C2-L09', 'C3-L02', 'C4-L02', 'C5-L02',
]);
const PLAYABLE = new Set(PLAYABLE_LEVEL_IDS);

export function isPlayableLevel(levelId) {
  return PLAYABLE.has(levelId);
}

function pad(n) {
  return String(n).padStart(2, '0');
}

export function buildLevels() {
  const levels = [];
  for (let chapter = 1; chapter <= 5; chapter += 1) {
    for (let index = 1; index <= 15; index += 1) {
      const bonus = BONUSES[chapter]?.[index] ?? null;
      const tutorial = chapter === 1 && index <= 3;
      const initialClouds = bonus?.initialClouds
        ?? (chapter >= 4 && index >= 14 ? 1 : 0);
      levels.push({
        id: `C${chapter}-L${pad(index)}`,
        chapter,
        index,
        chapterTitle: CHAPTERS[chapter - 1].title,
        accent: CHAPTERS[chapter - 1].accent,
        name: NAMES[chapter - 1][index - 1],
        s0: S0[chapter - 1][index - 1],
        moves: MOVES[chapter - 1][index - 1],
        colors: COLORS[chapter - 1],
        layers: LAYERS[chapter - 1][index - 1],
        initialClouds,
        cloudEnabled: !tutorial,
        tutorial,
        pace: index <= 7 ? 'breathe' : index <= 13 ? 'steady' : 'hard',
        r: R_BY_CHAPTER[chapter - 1],
        demo: PLAYABLE.has(`C${chapter}-L${pad(index)}`),
        bonus,
        goalTypes: bonus ? ['T1', bonus.type] : ['T1'],
        star2RemainRate: 0.25,
        star3RemainRate: 0.45,
      });
    }
  }
  return levels;
}

export const LEVELS = buildLevels();
export const LEVEL_BY_ID = new Map(LEVELS.map((level) => [level.id, level]));

export function getLevel(levelId) {
  return LEVEL_BY_ID.get(levelId) ?? null;
}

export function chapterLevels(chapter) {
  return LEVELS.filter((level) => level.chapter === chapter);
}

export function nextLevelId(levelId) {
  const level = getLevel(levelId);
  if (!level) return null;
  return LEVELS[LEVELS.indexOf(level) + 1]?.id ?? null;
}

export function previousLevelId(levelId) {
  const level = getLevel(levelId);
  if (!level) return null;
  return LEVELS[LEVELS.indexOf(level) - 1]?.id ?? null;
}

export function isChapterFinal(levelId) {
  return getLevel(levelId)?.index === 15;
}

export function layerS0sFor(level) {
  return Array.from({ length: level.layers }, (_, index) => Math.min(100, level.s0 + index * 3));
}

export function validateLevels(levels = LEVELS) {
  const problems = [];
  if (levels.length !== 75) problems.push(`关卡数应为 75，实际 ${levels.length}`);
  const ids = new Set();
  const chapters = new Map();
  let longFromChapter3 = 0;
  for (const level of levels) {
    if (ids.has(level.id)) problems.push(`重复关卡 ID：${level.id}`);
    ids.add(level.id);
    chapters.set(level.chapter, (chapters.get(level.chapter) ?? 0) + 1);
    if (level.s0 < 40 || level.s0 > 100) problems.push(`${level.id} 悲伤值越界`);
    if (level.moves < 40 || level.moves > 90) problems.push(`${level.id} 步数越界`);
    if (level.chapter === 1 && level.moves > 55) problems.push(`${level.id} 第 1 章步数超过 55`);
    if (level.chapter >= 3 && level.moves >= 70) longFromChapter3 += 1;
    if (!Number.isInteger(level.layers) || level.layers < 1 || level.layers > 3) {
      problems.push(`${level.id} 情绪层数非法`);
    }
    for (const layerS0 of layerS0sFor(level)) {
      if (layerS0 < 40 || layerS0 > 100) problems.push(`${level.id} 情绪层 S0 越界`);
    }
    if (!['T1', 'T2', 'T3', 'T4', 'T5'].includes(level.goalTypes.at(-1))) problems.push(`${level.id} 目标类型非法`);
    if (level.bonus?.type === 'T2' && (!Number.isInteger(level.bonus.color) || level.bonus.count <= 0)) {
      problems.push(`${level.id} T2 配置非法`);
    }
    if (level.bonus?.type === 'T3' && (level.initialClouds > 3 || level.bonus.count <= 0)) {
      problems.push(`${level.id} T3 配置非法`);
    }
  }
  for (let chapter = 1; chapter <= 5; chapter += 1) {
    if (chapters.get(chapter) !== 15) problems.push(`第 ${chapter} 章关卡数应为 15`);
  }
  if (longFromChapter3 < 3) problems.push('第 3 章起缺少 70–90 步的长关卡');
  return problems;
}
