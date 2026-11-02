/** 纯规则函数：数值公式、星级、目标判定。领域层不依赖 DOM。 */
import { TILE_TYPES } from './tiles.js';

export const R_BY_CHAPTER = [1.6, 1.49, 1.38, 1.27, 1.15];
export const BONUS_GOAL_SCORE = 200;

export const ITEMS = {
  breathe: {
    key: 'breathe', name: '深呼吸', target: 'tile',
    desc: '轻轻拿走一个方块', hint: '点一个方块，让它先离开。',
  },
  hug: {
    key: 'hug', name: '拥抱', target: 'tile',
    desc: '抱走身边 3×3 的方块', hint: '点一个中心方块，抱住它周围。',
  },
  resonate: {
    key: 'resonate', name: '共鸣', target: 'color',
    desc: '让同一种颜色一起离开', hint: '点任意方块，清除同色。',
  },
  ventilate: {
    key: 'ventilate', name: '换气', target: 'none',
    desc: '重排盘面，不改变进度', hint: '深吸一口气，重新排列。',
  },
};

export const ITEM_ORDER = ['breathe', 'hug', 'resonate', 'ventilate'];

/** FR-LV-01：floor(消除数 × (1 + 0.2 × (连锁数 - 1)))，单次最小 1。 */
export function reductionFor(count, chain) {
  if (count <= 0) return 0;
  return Math.max(1, Math.floor(count * (1 + 0.2 * (chain - 1))));
}

/** FR-SD-02：10 × 消除数 × (1 + 0.5 × (连锁数 - 1))。 */
export function scoreFor(count, chain) {
  if (count <= 0) return 0;
  return Math.round(10 * count * (1 + 0.5 * (chain - 1)));
}

/**
 * FR-LV-11：1 星达标；剩余步数 ≥25% 升 2 星；
 * 剩余步数 ≥45% 且阴云为 0 升 3 星；温柔模式截断到 2 星。
 */
export function starFor({ sadness, movesLeft, moveBudget, clouds = 0, starCap = 3 }) {
  if (sadness > 0) return 0;
  const rate = moveBudget > 0 ? movesLeft / moveBudget : 0;
  let stars = 1;
  if (rate >= 0.25) stars = 2;
  if (rate >= 0.45 && clouds === 0) stars = 3;
  return Math.min(stars, starCap);
}

export function remainingRate(run) {
  return run.moveBudget > 0 ? run.movesLeft / run.moveBudget : 0;
}

export function healingProgress(run) {
  const total = run.totalS0 ?? run.s0 ?? 1;
  const healed = (run.healed ?? 0) + ((run.layerS0 ?? run.s0) - run.sadness);
  return Math.max(0, Math.min(1, healed / Math.max(1, total)));
}

export function layerS0(run) {
  return run.layerS0 ?? run.s0;
}

/** 目标进度。T1 是所有关卡的主线；T2–T5 由关卡配置追加。 */
export function evaluateGoals(level, run) {
  const healed = (run.healed ?? 0) + ((run.layerS0 ?? run.s0) - run.sadness);
  const total = run.totalS0 ?? run.s0;
  const out = [{
    type: 'T1',
    label: '疗愈达标',
    detail: run.layers > 1 ? `穿过 ${run.layers} 层情绪，让悲伤值归零` : '让悲伤值降到 0',
    current: Math.max(0, healed),
    target: total,
    display: `${Math.round((healed / Math.max(1, total)) * 100)}%`,
    done: run.sadness <= 0 && (run.layer ?? 1) >= (run.layers ?? 1),
  }];

  const bonus = level.bonus;
  if (!bonus) return out;

  if (bonus.type === 'T2') {
    const have = run.collected?.[bonus.color] ?? 0;
    const type = TILE_TYPES[bonus.color];
    out.push({
      type: 'T2', label: '共鸣收集', color: bonus.color,
      detail: `收集 ${bonus.count} 个${type.label}`,
      current: Math.min(have, bonus.count), target: bonus.count,
      display: `${Math.min(have, bonus.count)} / ${bonus.count}`,
      done: have >= bonus.count,
    });
  } else if (bonus.type === 'T3') {
    const have = run.cloudsCleared ?? 0;
    out.push({
      type: 'T3', label: '清散阴云', detail: `消散 ${bonus.count} 朵阴云`,
      current: Math.min(have, bonus.count), target: bonus.count,
      display: `${Math.min(have, bonus.count)} / ${bonus.count}`,
      done: have >= bonus.count,
    });
  } else if (bonus.type === 'T4') {
    const have = run.chainMax ?? 0;
    out.push({
      type: 'T4', label: '连锁挑战', detail: `达成 ${bonus.count} 连锁`,
      current: Math.min(have, bonus.count), target: bonus.count,
      display: `${Math.min(have, bonus.count)} / ${bonus.count}`,
      done: have >= bonus.count,
    });
  } else if (bonus.type === 'T5') {
    const rate = remainingRate(run);
    const done = run.sadness <= 0 && rate >= bonus.rate;
    out.push({
      type: 'T5', label: '精准放晴',
      detail: `放晴时剩余步数 ≥ ${Math.round(bonus.rate * 100)}%`,
      current: Math.round(rate * 100), target: Math.round(bonus.rate * 100),
      display: `${Math.round(rate * 100)}% / ${Math.round(bonus.rate * 100)}%`,
      done,
    });
  }
  return out;
}

export function allGoalsDone(goals) {
  return goals.every((goal) => goal.done);
}

export function describeGoal(level) {
  if (!level.bonus) return '让悲伤值降到 0，就可以放晴。';
  const map = {
    T2: '疗愈达标，并收集足够的同色共鸣。',
    T3: '疗愈达标，并让盘面上的阴云散开。',
    T4: '疗愈达标，并完成一次足够长的连锁。',
    T5: '早点放晴：疗愈达标时，剩余步数还要够多。',
  };
  return map[level.bonus.type] ?? '完成关卡目标。';
}
