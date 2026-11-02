#!/usr/bin/env node
/**
 * 蒙特卡洛验证脚本（AC-04 的模拟记录）：
 * 对 75 关各跑 N 局无道具机器人对局，输出通关率、平均步数、三星率与目标完成情况。
 * 运行：node scripts/simulate.mjs --runs 200
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Game } from '../app/js/core/game.js';
import { LEVELS, PLAYABLE_LEVEL_IDS } from '../app/js/core/levels.js';
import { SaveRepository, StorageAdapter } from '../app/js/core/profile.js';
import { hashString } from '../app/js/core/rng.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');
const args = process.argv.slice(2);
const runsArg = args.indexOf('--runs');
const RUNS = runsArg >= 0 ? Math.max(1, Number(args[runsArg + 1]) || 100) : 100;
const ALL = args.includes('--all');
const TARGET_LEVELS = ALL
  ? LEVELS
  : LEVELS.filter((level) => PLAYABLE_LEVEL_IDS.includes(level.id));

class MemoryBackend {
  constructor() { this.map = new Map(); }
  getItem(key) { return this.map.has(key) ? this.map.get(key) : null; }
  setItem(key, value) { this.map.set(key, String(value)); }
  removeItem(key) { this.map.delete(key); }
}

function adjacentToCloud(cell, clouds) {
  return clouds.some((cloud) => Math.abs(cloud.r - cell.r) + Math.abs(cloud.c - cell.c) === 1);
}

function chooseMove(game) {
  const board = game.board();
  const level = game.level(game.run.levelId);
  if (!level.bonus) return board.findMove();
  const moves = board.findMoves(60);
  if (!moves.length) return null;
  const bonus = level.bonus;
  const scored = moves.map((move) => {
    let score = move.count;
    if (bonus.type === 'T2') score = (move.colors[bonus.color] ?? 0) * 100 + move.count;
    if (bonus.type === 'T3') {
      const hits = move.cells.filter((cell) => adjacentToCloud(cell, board.clouds)).length;
      score = hits * 100 + move.count;
    }
    if (bonus.type === 'T4') score = move.count * 10;
    if (bonus.type === 'T5') score = move.count * 10;
    return { move, score };
  });
  scored.sort((a, b) => b.score - a.score);
  return scored[0].move;
}

function playGame(level, seed) {
  const repo = new SaveRepository({ adapter: new StorageAdapter(new MemoryBackend()) });
  const game = new Game({ repo });
  game.unlockAllForTest();
  game.profile.failureStreaks[level.id] = 0;
  const started = game.startLevel(level.id, { seed });
  if (!started.ok) return { error: started.code };

  let guard = 0;
  while (game.canAct() && guard < 300) {
    const move = chooseMove(game);
    if (!move) break;
    const result = game.swap(move.a, move.b);
    if (!result.ok) break;
    guard += 1;
  }
  const settled = game.settle();
  const settlement = settled.settlement;
  return {
    won: !settlement.lost,
    stars: settlement.stars ?? 0,
    movesUsed: game.run.movesUsed,
    moveBudget: game.run.moveBudget,
    totalS0: game.run.totalS0,
    reason: settlement.reason ?? null,
    goals: settlement.goals.map((goal) => ({ type: goal.type, current: goal.current, target: goal.target, done: goal.done })),
    score: settlement.score,
    gentle: game.run.gentle,
    layers: game.run.layers,
  };
}

function mean(values) {
  if (!values.length) return 0;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function pct(value) {
  return Math.round(value * 1000) / 10;
}

const results = [];
const startedAt = Date.now();
for (const level of TARGET_LEVELS) {
  const games = [];
  for (let i = 0; i < RUNS; i += 1) {
    const seed = hashString(`${level.id}:sim:${i}`);
    games.push(playGame(level, seed));
  }
  const wins = games.filter((game) => game.won);
  const row = {
    levelId: level.id,
    chapter: level.chapter,
    index: level.index,
    name: level.name,
    pace: level.pace,
    s0: level.s0,
    layers: level.layers,
    totalS0: games[0]?.totalS0 ?? level.s0 * level.layers,
    moves: level.moves,
    colors: level.colors,
    bonus: level.bonus,
    runs: games.length,
    wins: wins.length,
    passRate: wins.length / games.length,
    threeStar: wins.filter((game) => game.stars === 3).length,
    threeStarRate: wins.length ? wins.filter((game) => game.stars === 3).length / wins.length : 0,
    avgMoves: mean(games.map((game) => game.movesUsed)),
    avgMovesWon: mean(wins.map((game) => game.movesUsed)),
    avgScore: mean(wins.map((game) => game.score)),
    reasons: games.filter((game) => !game.won).reduce((acc, game) => {
      acc[game.reason ?? 'unknown'] = (acc[game.reason ?? 'unknown'] ?? 0) + 1;
      return acc;
    }, {}),
    goalFailures: games.filter((game) => !game.won).flatMap((game) => game.goals.filter((goal) => !goal.done).map((goal) => goal.type))
      .reduce((acc, type) => { acc[type] = (acc[type] ?? 0) + 1; return acc; }, {}),
  };
  results.push(row);
  const line = `${row.levelId} ${row.pace.padEnd(7)} runs=${row.runs} pass=${pct(row.passRate)}% 3★=${pct(row.threeStarRate)}% avg=${row.avgMoves.toFixed(1)}/${row.moves}`;
  console.log(line);
}

const byChapter = {};
for (let chapter = 1; chapter <= 5; chapter += 1) {
  const rows = results.filter((row) => row.chapter === chapter);
  const totalGames = rows.reduce((sum, row) => sum + row.runs, 0);
  const totalWins = rows.reduce((sum, row) => sum + row.wins, 0);
  byChapter[chapter] = {
    games: totalGames,
    wins: totalWins,
    passRate: totalWins / totalGames,
    threeStarRate: rows.reduce((sum, row) => sum + row.threeStar, 0) / Math.max(1, totalWins),
    avgMoves: mean(rows.map((row) => row.avgMoves)),
    levels: rows.length,
  };
}

const byPace = {};
for (const pace of ['breathe', 'steady', 'hard']) {
  const rows = results.filter((row) => row.pace === pace);
  const totalGames = rows.reduce((sum, row) => sum + row.runs, 0);
  const totalWins = rows.reduce((sum, row) => sum + row.wins, 0);
  byPace[pace] = {
    levels: rows.length,
    games: totalGames,
    passRate: totalWins / totalGames,
    threeStarRate: rows.reduce((sum, row) => sum + row.threeStar, 0) / Math.max(1, totalWins),
    avgMoves: mean(rows.map((row) => row.avgMoves)),
  };
}

const summary = {
  generatedAt: new Date().toISOString(),
  durationMs: Date.now() - startedAt,
  runsPerLevel: RUNS,
  engine: 'no-item greedy goal-aware bot / deterministic seeds',
  scope: ALL ? 'all' : 'playable',
  overall: {
    games: results.reduce((sum, row) => sum + row.runs, 0),
    wins: results.reduce((sum, row) => sum + row.wins, 0),
    passRate: results.reduce((sum, row) => sum + row.wins, 0) / results.reduce((sum, row) => sum + row.runs, 0),
    threeStarRate: results.reduce((sum, row) => sum + row.threeStar, 0) / Math.max(1, results.reduce((sum, row) => sum + row.wins, 0)),
    avgMoves: mean(results.map((row) => row.avgMoves)),
  },
  byChapter,
  byPace,
  levels: results,
};

fs.mkdirSync(path.join(root, 'evidence'), { recursive: true });
fs.writeFileSync(path.join(root, 'evidence', 'simulation.json'), JSON.stringify(summary, null, 2));

const md = [
  '# 蒙特卡洛模拟记录',
  '',
  `- 生成时间：${summary.generatedAt}`,
  `- 每关局数：${RUNS}`,
  '- 机器人：不使用道具；有追加目标时优先寻找对应颜色/阴云相邻的交换；无追加目标时取第一个合法交换。',
  `- 范围：${ALL ? '全部 75 关' : `展示版 ${TARGET_LEVELS.length} 个可玩关卡`}`,
  `- 总对局：${summary.overall.games}，总通关率：${pct(summary.overall.passRate)}%，三星率（通关局中）：${pct(summary.overall.threeStarRate)}%`,
  '',
  '## 章节汇总',
  '',
  '| 章节 | 关卡数 | 对局 | 通关率 | 三星率 | 平均步数 |',
  '| --- | --- | --- | --- | --- | --- |',
  ...Object.entries(byChapter).map(([chapter, row]) => `| ${chapter} | ${row.levels} | ${row.games} | ${pct(row.passRate)}% | ${pct(row.threeStarRate)}% | ${row.avgMoves.toFixed(1)} |`),
  '',
  '## 节奏汇总（对应 AC-03）',
  '',
  '| 节奏 | 关卡数 | 通关率 | 三星率 | 目标区间 |',
  '| --- | --- | --- | --- | --- |',
  `| 喘息关 | ${byPace.breathe.levels} | ${pct(byPace.breathe.passRate)}% | ${pct(byPace.breathe.threeStarRate)}% | 85–95% |`,
  `| 中档关 | ${byPace.steady.levels} | ${pct(byPace.steady.passRate)}% | ${pct(byPace.steady.threeStarRate)}% | 55–70% |`,
  `| 困难关 | ${byPace.hard.levels} | ${pct(byPace.hard.passRate)}% | ${pct(byPace.hard.threeStarRate)}% | 25–40% |`,
  '',
  '> 机器人为机械策略，数值只用于验证关卡可达性与趋势，不等同于真人通关率。逐关明细见 `evidence/simulation.json`。',
  '',
].join('\n');
fs.writeFileSync(path.join(root, 'evidence', 'simulation-summary.md'), md);

console.log('');
console.log('chapter', byChapter);
console.log('pace', byPace);
console.log('overall', summary.overall);
console.log(`done in ${(summary.durationMs / 1000).toFixed(1)}s`);
