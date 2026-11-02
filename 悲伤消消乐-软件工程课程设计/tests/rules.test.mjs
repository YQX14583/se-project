import test from 'node:test';
import assert from 'node:assert/strict';

import { Board } from '../app/js/core/board.js';
import { Game } from '../app/js/core/game.js';
import {
  LEVELS, PLAYABLE_LEVEL_IDS, isPlayableLevel, layerS0sFor, validateLevels,
} from '../app/js/core/levels.js';
import {
  PROFILE_KEY, SaveRepository, StorageAdapter, defaultProfile,
  pureThreeStarCount, totalScore, validateRun,
} from '../app/js/core/profile.js';
import {
  ITEM_ORDER, allGoalsDone, evaluateGoals, healingProgress, reductionFor, scoreFor, starFor,
} from '../app/js/core/rules.js';

class MemoryBackend {
  constructor() { this.map = new Map(); }
  getItem(key) { return this.map.has(key) ? this.map.get(key) : null; }
  setItem(key, value) { this.map.set(key, String(value)); }
  removeItem(key) { this.map.delete(key); }
}

class BrokenBackend {
  getItem() { throw new Error('denied'); }
  setItem() { throw new Error('denied'); }
  removeItem() { throw new Error('denied'); }
}

function memoryRepo() {
  const backend = new MemoryBackend();
  return { backend, repo: new SaveRepository({ adapter: new StorageAdapter(backend) }) };
}

function newGame() {
  const { backend, repo } = memoryRepo();
  const game = new Game({ repo });
  return { game, repo, backend };
}

function autoWin(game) {
  let guard = 0;
  while (game.canAct() && guard < 240) {
    const move = game.board().findMove();
    if (!move) break;
    const result = game.swap(move.a, move.b);
    if (!result.ok) break;
    guard += 1;
  }
  return game.settle();
}

function patternedSnapshot() {
  const grid = Array.from({ length: 8 }, (_, r) => Array.from({ length: 8 }, (_, c) => ({
    id: `t${r}-${c}`,
    color: (r * 2 + c) % 6,
  })));
  return { rows: 8, cols: 8, colors: 6, nextId: 100, seed: 1, grid, clouds: [] };
}

test('悲伤值减免公式与连锁计分符合 FR-LV-01 / FR-SD-02', () => {
  assert.equal(reductionFor(0, 1), 0);
  assert.equal(reductionFor(3, 1), 3);
  assert.equal(reductionFor(3, 2), 3);
  assert.equal(reductionFor(5, 2), 6);
  assert.equal(reductionFor(1, 5), 1);
  assert.equal(reductionFor(10, 3), 14);
  assert.equal(scoreFor(0, 1), 0);
  assert.equal(scoreFor(3, 1), 30);
  assert.equal(scoreFor(3, 2), 45);
  assert.equal(scoreFor(5, 3), 100);
});

test('星级判定：25% / 45% / 阴云 / 温柔模式截断', () => {
  assert.equal(starFor({ sadness: 1, movesLeft: 10, moveBudget: 40 }), 0);
  assert.equal(starFor({ sadness: 0, movesLeft: 0, moveBudget: 40 }), 1);
  assert.equal(starFor({ sadness: 0, movesLeft: 10, moveBudget: 40 }), 2);
  assert.equal(starFor({ sadness: 0, movesLeft: 18, moveBudget: 40, clouds: 0 }), 3);
  assert.equal(starFor({ sadness: 0, movesLeft: 18, moveBudget: 40, clouds: 1 }), 2);
  assert.equal(starFor({ sadness: 0, movesLeft: 18, moveBudget: 40, clouds: 0, starCap: 2 }), 2);
});

test('75 关配置满足范围、章节与展示版约束', () => {
  assert.deepEqual(validateLevels(), []);
  assert.equal(LEVELS.length, 75);
  assert.equal(PLAYABLE_LEVEL_IDS.length, 8);
  assert.equal(LEVELS.filter((level) => level.demo).length, 8);
  for (const level of LEVELS) {
    assert.ok(level.s0 >= 40 && level.s0 <= 100, level.id);
    assert.ok(level.moves >= 40 && level.moves <= 90, level.id);
    if (level.chapter === 1) assert.ok(level.moves <= 55, level.id);
    assert.ok(level.layers >= 1 && level.layers <= 3, level.id);
    for (const s0 of layerS0sFor(level)) assert.ok(s0 >= 40 && s0 <= 100, level.id);
  }
  for (const id of ['C1-L01', 'C1-L02', 'C1-L03', 'C1-L15', 'C2-L09', 'C3-L02', 'C4-L02', 'C5-L02']) {
    assert.ok(isPlayableLevel(id), id);
    assert.ok(LEVELS.find((level) => level.id === id).demo, id);
  }
  const types = new Set(LEVELS.map((level) => level.bonus?.type).filter(Boolean));
  assert.deepEqual([...types].sort(), ['T2', 'T3', 'T4', 'T5']);
  assert.ok(LEVELS.some((level) => level.chapter >= 3 && level.moves >= 70));
});

test('棋盘生成无初始三连、至少存在一步，并且快照可往返', () => {
  for (let seed = 1; seed <= 12; seed += 1) {
    const board = new Board({ colors: 5, seed });
    assert.equal(board.findMatches().cells.length, 0, `seed ${seed}`);
    assert.ok(board.hasMove(), `seed ${seed}`);
    const copy = Board.fromSnapshot(board.toSnapshot());
    assert.deepEqual(copy.toSnapshot(), board.toSnapshot());
  }
});

test('匹配识别不会漏掉被异色截断的连续三连', () => {
  const snapshot = patternedSnapshot();
  snapshot.grid[0] = [
    { id: 'a0', color: 0 }, { id: 'a1', color: 0 }, { id: 'a2', color: 0 },
    { id: 'a3', color: 1 }, { id: 'a4', color: 1 }, { id: 'a5', color: 1 },
    { id: 'a6', color: 2 }, { id: 'a7', color: 2 },
  ];
  const board = Board.fromSnapshot(snapshot);
  const matches = board.findMatches();
  assert.equal(matches.cells.length, 6);
  assert.ok(matches.runs.some((run) => run.length === 3));
});

test('阴云被相邻消除命中 3 次后消散并额外 +50', () => {
  const snapshot = patternedSnapshot();
  snapshot.grid[5][2] = { id: 'm1', color: 0 };
  snapshot.grid[5][3] = { id: 'm2', color: 0 };
  snapshot.grid[5][4] = { id: 'm3', color: 0 };
  snapshot.grid[4][4] = null;
  snapshot.clouds = [{ r: 4, c: 4, hits: 2 }];
  const board = Board.fromSnapshot(snapshot);
  const result = board.resolveWaves([{ r: 5, c: 2 }, { r: 5, c: 3 }, { r: 5, c: 4 }], {
    sadness: 40, score: 0, s0: 40, moveIndex: 0, allowCloudSpawn: false,
  });
  assert.equal(result.cloudsCleared, 1);
  assert.equal(result.frames[0].cloudsCleared.length, 1);
  assert.ok(result.frames[0].scoreDelta >= 80);
  assert.equal(board.clouds.length, 0);
});

test('没有可消除走法时自动重排，且不改变阴云数量', () => {
  const board = new Board({ colors: 5, seed: 7 });
  const before = board.clouds.length;
  assert.equal(board.reshuffle(), true);
  assert.equal(board.findMatches().cells.length, 0);
  assert.ok(board.hasMove());
  assert.equal(board.clouds.length, before);
});

test('展示版默认只开放 8 关，其余关卡拒绝进入', () => {
  const { game } = newGame();
  assert.equal(game.profile.unlockedLevelIds.length, 8);
  assert.equal(game.startLevel('C1-L01').ok, true);
  game.leaveRun();
  assert.equal(game.startLevel('C1-L04').code, 'LEVEL_LOCKED');
  game.unlockAllForTest();
  assert.equal(game.startLevel('C1-L04').ok, true);
});

test('一局完整流程：交换、结算、记录、解锁与幂等', () => {
  const { game, repo } = newGame();
  const started = game.startLevel('C1-L01', { seed: 1234 });
  assert.equal(started.ok, true);
  const beforeMoves = game.run.movesLeft;
  const move = game.board().findMove();
  const moved = game.swap(move.a, move.b);
  assert.equal(moved.ok, true);
  assert.equal(game.run.movesLeft, beforeMoves - 1);
  assert.ok(game.run.score > 0);
  assert.equal(repo.readCheckpoint().status, 'ok');

  const settlement = autoWin(game).settlement;
  assert.equal(settlement.lost, false);
  assert.ok(settlement.stars >= 1 && settlement.stars <= 3);
  assert.ok(settlement.score >= 0);
  assert.equal(game.profile.levelResults['C1-L01'].clearCount, 1);
  assert.ok(game.profile.unlockedLevelIds.includes('C1-L02'));
  assert.equal(repo.readCheckpoint().status, 'empty');

  const again = game.settle();
  assert.equal(again.duplicate, true);
  assert.equal(game.profile.levelResults['C1-L01'].clearCount, 1);
});

test('未结算的一局可从存档恢复，牌面与数值完全一致', () => {
  const { game, repo } = newGame();
  game.startLevel('C1-L01', { seed: 321 });
  const move = game.board().findMove();
  game.swap(move.a, move.b);
  const snapshot = JSON.parse(JSON.stringify(game.run));
  const second = new Game({ repo });
  const restored = second.startLevel('C1-L01', { restore: true });
  assert.equal(restored.restored, true);
  assert.equal(second.run.runId, snapshot.runId);
  assert.equal(second.run.sadness, snapshot.sadness);
  assert.equal(second.run.movesLeft, snapshot.movesLeft);
  assert.deepEqual(second.run.board, snapshot.board);
});

test('连续失败 3 次后开启温柔模式：+10 步、星级上限 2', () => {
  const { game } = newGame();
  game.profile.failureStreaks['C1-L01'] = 3;
  const started = game.startLevel('C1-L01', { seed: 99 });
  assert.equal(started.run.gentle, true);
  assert.equal(started.run.moveBudget, LEVELS.find((level) => level.id === 'C1-L01').moves + 10);
  assert.equal(started.run.starCap, 2);
  autoWin(game);
  assert.ok(game.settlement.stars <= 2);
});

test('六分钟硬上限触发结算，并记一次失败', () => {
  const { game } = newGame();
  game.startLevel('C1-L01', { seed: 55 });
  const out = game.addElapsed(360000);
  assert.equal(out.phase, 'lost');
  assert.equal(game.run.phase, 'lost');
  const settlement = game.settle().settlement;
  assert.equal(settlement.reason, 'timeout');
  assert.equal(settlement.lost, true);
  assert.equal(settlement.failureStreak, 1);
});

test('存档损坏会隔离坏档并从新档案开始', () => {
  const { backend, repo } = memoryRepo();
  backend.setItem(PROFILE_KEY, '{"schemaVersion":1,');
  const loaded = repo.loadProfile();
  assert.equal(loaded.status, 'recovered');
  assert.equal(loaded.profile.levelResults && Object.keys(loaded.profile.levelResults).length, 0);
  assert.ok(backend.getItem('sadmatch.corrupt.v1'));
});

test('localStorage 不可用时可内存降级继续游玩', () => {
  const adapter = new StorageAdapter(new BrokenBackend());
  assert.equal(adapter.available, false);
  const repo = new SaveRepository({ adapter });
  const loaded = repo.loadProfile();
  assert.equal(loaded.status, 'storage-degraded');
  const game = new Game({ repo });
  assert.equal(game.startLevel('C1-L01', { seed: 1 }).ok, true);
  const move = game.board().findMove();
  assert.equal(game.swap(move.a, move.b).ok, true);
  assert.ok(game.run.score > 0);
});

test('坏掉的运行快照被拒绝，不会恢复半个棋盘', () => {
  const { game } = newGame();
  game.startLevel('C1-L01', { seed: 8 });
  const bad = JSON.parse(JSON.stringify(game.run));
  bad.board.grid[0][0].color = 99;
  assert.throws(() => validateRun(bad), /BOARD_SNAPSHOT_INVALID|RUN/);
  const { repo } = memoryRepo();
  const game2 = new Game({ repo });
  repo.adapter.writeRaw('sadmatch.run.v1', JSON.stringify(bad));
  assert.equal(repo.readCheckpoint().status, 'corrupt');
  assert.equal(repo.readCheckpoint().run, null);
});

test('追加目标判定：T2 / T3 / T4 / T5', () => {
  const t2 = LEVELS.find((level) => level.id === 'C2-L09');
  const run2 = {
    s0: 66, sadness: 30, layer: 1, layers: 2, layerS0: 66, totalS0: 135,
    healed: 0, collected: { 3: 14 }, cloudsCleared: 0, chainMax: 0,
    movesLeft: 40, moveBudget: 54,
  };
  const goals2 = evaluateGoals(t2, run2);
  assert.equal(goals2.find((goal) => goal.type === 'T2').done, true);
  assert.equal(allGoalsDone(goals2), false);

  const t3 = LEVELS.find((level) => level.id === 'C3-L02');
  const run3 = {
    s0: 60, sadness: 0, layer: 2, layers: 2, layerS0: 63, totalS0: 123,
    healed: 60, collected: {}, cloudsCleared: 2, chainMax: 2,
    movesLeft: 12, moveBudget: 50,
  };
  assert.equal(evaluateGoals(t3, run3).find((goal) => goal.type === 'T3').done, true);

  const t4 = LEVELS.find((level) => level.id === 'C4-L02');
  const run4 = { ...run3, chainMax: 3, cloudsCleared: 0, layer: 2, layers: 2, sadness: 0 };
  assert.equal(evaluateGoals(t4, run4).find((goal) => goal.type === 'T4').done, true);

  const t5 = LEVELS.find((level) => level.id === 'C5-L02');
  const run5 = { ...run3, cloudCleared: 0, chainMax: 1, sadness: 0, movesLeft: 14, moveBudget: 62 };
  assert.equal(evaluateGoals(t5, run5).find((goal) => goal.type === 'T5').done, true);
  assert.equal(healingProgress(run5), 1);
});

test('道具库存上限 5、单关最多 2 次', () => {
  const { game } = newGame();
  for (const type of ITEM_ORDER) game.profile.inventory[type] = 5;
  game.startLevel('C1-L01', { seed: 4 });
  const tile = game.board().findMove();
  const first = game.useItem('breathe', tile.a);
  assert.equal(first.ok, true);
  assert.equal(game.run.usedItems.length, 1);
  const second = game.useItem('breathe', tile.b);
  assert.equal(second.ok, true);
  assert.equal(game.run.usedItems.length, 2);
  const third = game.useItem('breathe', tile.a);
  assert.equal(third.ok, false);
  assert.equal(third.code, 'ITEM_LIMIT_REACHED');

  for (const type of ITEM_ORDER) game.profile.inventory[type] = 5;
  game.repo.saveProfile(game.profile);
  const loaded = game.repo.loadProfile().profile;
  for (const type of ITEM_ORDER) assert.equal(loaded.inventory[type], 5);
});

test('个人总分只累加各关历史最高分', () => {
  const profile = defaultProfile('2026-01-01T00:00:00.000Z');
  profile.levelResults = {
    'C1-L01': { bestScore: 1200, highestStars: 3, pureThreeStar: true },
    'C1-L02': { bestScore: 800, highestStars: 2, pureThreeStar: false },
  };
  assert.equal(totalScore(profile), 2000);
  assert.equal(pureThreeStarCount(profile), 1);
});
