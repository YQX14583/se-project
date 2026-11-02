/**
 * 应用编排：一局的开始/交换/道具/结算/存档，以及奖励、解锁与个人进度。
 * 领域层不接触 DOM；UI 只消费返回的帧报告。
 */
import { Board } from './board.js';
import {
  BONUS_GOAL_SCORE, ITEM_ORDER, ITEMS, allGoalsDone, evaluateGoals, starFor,
} from './rules.js';
import {
  LEVELS, getLevel, isChapterFinal, isPlayableLevel, layerS0sFor, nextLevelId,
} from './levels.js';
import { hashString, mulberry32, randomInt, uuid } from './rng.js';
import {
  SaveRepository, clearedCount, defaultProfile, pureThreeStarCount, totalScore,
} from './profile.js';

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

export class Game {
  constructor({ repo = new SaveRepository(), levels = LEVELS, now = () => new Date().toISOString() } = {}) {
    this.repo = repo;
    this.levels = levels;
    this.levelMap = new Map(levels.map((level) => [level.id, level]));
    this.now = now;
    const loaded = this.repo.loadProfile();
    this.profile = loaded.profile;
    this.profileStatus = loaded.status;
    this.storageWarning = !this.repo.storageAvailable || loaded.status === 'storage-degraded';
    this.run = null;
    this.settlement = null;
    this.lastResolution = null;
    this.allowAllLevels = false;
  }

  get profileSummary() {
    return {
      totalScore: totalScore(this.profile),
      cleared: clearedCount(this.profile),
      pureThreeStar: pureThreeStarCount(this.profile),
      totalStars: Object.values(this.profile.levelResults)
        .reduce((sum, result) => sum + result.highestStars, 0),
      storageAvailable: this.repo.storageAvailable,
      status: this.profileStatus,
    };
  }

  level(levelId) {
    return this.levelMap.get(levelId) ?? null;
  }

  isUnlocked(levelId) {
    const playable = this.allowAllLevels || isPlayableLevel(levelId);
    return playable && this.profile.unlockedLevelIds.includes(levelId);
  }

  isPlayable(levelId) {
    return this.allowAllLevels || isPlayableLevel(levelId);
  }

  bestResult(levelId) {
    return this.profile.levelResults[levelId] ?? null;
  }

  canResume(levelId) {
    const checkpoint = this.repo.readCheckpoint();
    return checkpoint.run?.levelId === levelId;
  }

  resumeTarget() {
    const checkpoint = this.repo.readCheckpoint();
    if (checkpoint.run && this.isUnlocked(checkpoint.run.levelId)) return checkpoint.run;
    return null;
  }

  startLevel(levelId, { restore = true, seed = null } = {}) {
    const level = this.level(levelId);
    if (!level) return { ok: false, code: 'LEVEL_NOT_FOUND' };
    if (!this.isUnlocked(levelId)) return { ok: false, code: 'LEVEL_LOCKED' };

    if (restore) {
      const checkpoint = this.repo.readCheckpoint();
      if (checkpoint.run && checkpoint.run.levelId === levelId) {
        this.run = checkpoint.run;
        this.settlement = null;
        this.lastResolution = null;
        return { ok: true, run: this.run, restored: true, level };
      }
    }

    const failureStreak = this.profile.failureStreaks[levelId] ?? 0;
    const gentle = failureStreak >= 3;
    const moveBudget = level.moves + (gentle ? 10 : 0);
    const layerS0s = layerS0sFor(level);
    const runSeed = Number.isInteger(seed)
      ? seed >>> 0
      : hashString(`${levelId}:${Date.now()}:${Math.random()}`);
    const board = new Board({
      rows: 8,
      cols: 8,
      colors: level.colors,
      seed: runSeed,
      initialClouds: level.cloudEnabled ? level.initialClouds : 0,
    });

    this.run = {
      schemaVersion: 1,
      runId: uuid(),
      levelId,
      s0: level.s0,
      layers: layerS0s.length,
      layer: 1,
      layerS0s,
      layerS0: layerS0s[0],
      totalS0: layerS0s.reduce((sum, value) => sum + value, 0),
      healed: 0,
      sadness: layerS0s[0],
      moveBudget,
      movesLeft: moveBudget,
      movesUsed: 0,
      score: 0,
      chainMax: 0,
      cloudsCleared: 0,
      collected: Array(6).fill(0),
      usedItems: [],
      gentle,
      starCap: gentle ? 2 : 3,
      bonusAwarded: false,
      phase: 'playing',
      seed: runSeed,
      steps: 0,
      elapsedMs: 0,
      startedAt: this.now(),
      board: board.toSnapshot(),
    };
    this.settlement = null;
    this.lastResolution = null;
    this.repo.writeCheckpoint(this.run);
    return { ok: true, run: this.run, restored: false, level };
  }

  board() {
    if (!this.run) throw new Error('NO_ACTIVE_RUN');
    return Board.fromSnapshot(this.run.board);
  }

  canAct() {
    return Boolean(this.run) && ['playing', 'afterglow'].includes(this.run.phase);
  }

  swap(a, b) {
    if (!this.canAct()) return { ok: false, code: 'RUN_NOT_ACTIVE' };
    const level = this.level(this.run.levelId);
    const board = this.board();
    if (!board.swapCells(a, b)) {
      return { ok: false, code: 'CELL_NOT_ADJACENT', message: '只能交换相邻的两个方块。' };
    }
    const matches = board.findMatches();
    if (matches.cells.length === 0) {
      board.swapCells(a, b);
      return { ok: false, code: 'SWAP_NO_MATCH', message: '这里还连不起来，换个方向试试。' };
    }

    this.run.movesLeft -= 1;
    this.run.movesUsed += 1;
    this.run.steps += 1;
    const swapBoard = board.toSnapshot();
    const result = board.resolveWaves(matches.cells, this.resolveOptions(level, board));
    const applied = this.applyResolution(board, result, 'swap');
    return { ...applied, swapBoard };
  }

  resolveOptions(level, board) {
    const forceCloudSpawn = level.bonus?.type === 'T3'
      && this.run.cloudsCleared < level.bonus.count
      && this.run.sadness <= 0;
    return {
      sadness: this.run.sadness,
      score: this.run.score,
      s0: this.run.layerS0,
      moveIndex: this.run.movesUsed,
      allowCloudSpawn: level.cloudEnabled,
      forceCloudSpawn,
      chainStart: 1,
    };
  }

  useItem(type, target = {}) {
    if (!this.canAct()) return { ok: false, code: 'RUN_NOT_ACTIVE' };
    if (!ITEM_ORDER.includes(type)) return { ok: false, code: 'ITEM_UNKNOWN' };
    const level = this.level(this.run.levelId);
    if (this.run.usedItems.length >= 2) {
      return { ok: false, code: 'ITEM_LIMIT_REACHED', message: '这一关最多用两次道具，把机会留给更需要的时刻。' };
    }
    if ((this.profile.inventory[type] ?? 0) <= 0) {
      return { ok: false, code: 'ITEM_EMPTY', message: `${ITEMS[type].name}用完了，通关后再来拿。` };
    }

    const board = this.board();
    if (type === 'resonate' && target.color === undefined) {
      if (!board.inBounds(target.r, target.c)) return { ok: false, code: 'INVALID_TARGET' };
      const tile = board.tileAt(target.r, target.c);
      if (!tile) return { ok: false, code: 'INVALID_TARGET' };
      target = { color: tile.color };
    }

    const effect = board.applyItemEffect(type, target);
    if (effect.error) return { ok: false, code: effect.error, message: '这个位置现在用不了。' };

    this.profile.inventory[type] -= 1;
    this.run.usedItems.push({ type, atStep: this.run.steps, target: clone(target) });
    this.run.steps += 1;
    this.repo.saveProfile(this.profile);

    if (effect.reshuffled) {
      this.run.board = board.toSnapshot();
      this.repo.writeCheckpoint(this.run);
      const frames = [{ chain: 0, cells: [], reduction: 0, scoreDelta: 0, sadnessAfter: this.run.sadness, scoreAfter: this.run.score, cloudHits: [], cloudsCleared: [], spawnedCloud: null, reshuffle: true, board: this.run.board }];
      this.lastResolution = { frames, phase: this.run.phase, goals: this.goals(), bonusDelta: 0, reshuffled: true };
      return { ok: true, ...this.lastResolution, run: this.run };
    }

    const result = board.resolveWaves(effect.cleared, {
      sadness: this.run.sadness,
      score: this.run.score,
      s0: this.run.layerS0,
      moveIndex: 0,
      allowCloudSpawn: false,
      forceCloudSpawn: false,
      chainStart: 1,
    });
    return this.applyResolution(board, result, 'item');
  }

  applyResolution(board, result, source) {
    const level = this.level(this.run.levelId);
    this.run.sadness = result.sadness;
    this.run.score += result.spentScore;
    this.run.chainMax = Math.max(this.run.chainMax, result.chainMax);
    this.run.cloudsCleared += result.cloudsCleared;
    for (let color = 0; color < 6; color += 1) {
      this.run.collected[color] += result.removedColors[color] ?? 0;
    }

    let reshuffled = false;
    if (!board.hasMove()) {
      reshuffled = board.reshuffle();
      if (reshuffled) {
        result.frames.push({
          chain: 0, cells: [], reduction: 0, scoreDelta: 0,
          sadnessAfter: this.run.sadness, scoreAfter: this.run.score,
          cloudHits: [], cloudsCleared: [], spawnedCloud: null,
          reshuffle: true, board: board.toSnapshot(),
        });
      }
    }
    this.run.board = board.toSnapshot();

    let bonusDelta = 0;
    let goals = evaluateGoals(level, this.run);
    const bonusGoal = goals.find((goal) => goal.type !== 'T1');
    if (bonusGoal?.done && !this.run.bonusAwarded) {
      this.run.bonusAwarded = true;
      bonusDelta = BONUS_GOAL_SCORE;
      this.run.score += BONUS_GOAL_SCORE;
    }

    let layerUp = null;
    if (this.run.sadness <= 0 && this.run.layer < this.run.layers) {
      const from = this.run.layer;
      this.run.healed += this.run.layerS0;
      this.run.layer += 1;
      this.run.layerS0 = this.run.layerS0s[this.run.layer - 1];
      this.run.sadness = this.run.layerS0;
      layerUp = { from, to: this.run.layer, layerS0: this.run.layerS0 };
    }

    let phase = 'playing';
    let reason = null;
    if (this.run.sadness <= 0) {
      goals = evaluateGoals(level, this.run);
      const precisionGoal = goals.find((goal) => goal.type === 'T5');
      if (precisionGoal && !precisionGoal.done) {
        phase = 'lost';
        reason = 'precision';
      } else if (allGoalsDone(goals)) {
        phase = 'won';
        this.run.score += 20 * this.run.movesLeft;
      } else if (this.run.movesLeft <= 0) {
        phase = 'lost';
        reason = 'goals';
      } else {
        phase = 'afterglow';
      }
    } else if (this.run.movesLeft <= 0) {
      phase = 'lost';
      reason = 'moves';
    }

    this.run.phase = phase;
    this.run.endedAt = phase === 'won' || phase === 'lost' ? this.now() : null;
    if (phase === 'won' || phase === 'lost') {
      this.repo.clearCheckpoint();
    } else {
      this.repo.writeCheckpoint(this.run);
    }

    this.lastResolution = {
      frames: result.frames,
      phase,
      reason,
      goals: evaluateGoals(level, this.run),
      bonusDelta,
      reshuffled,
      layerUp,
      source,
    };
    return { ok: true, ...this.lastResolution, run: this.run };
  }

  goals() {
    if (!this.run) return [];
    return evaluateGoals(this.level(this.run.levelId), this.run);
  }

  settle() {
    if (!this.run) return { ok: false, code: 'NO_RUN' };
    if (this.settlement && this.settlement.runId === this.run.runId) {
      return { ok: true, settlement: this.settlement, duplicate: true };
    }
    if (!['won', 'lost'].includes(this.run.phase)) {
      return { ok: false, code: 'RUN_NOT_SETTLABLE' };
    }

    const level = this.level(this.run.levelId);
    const now = this.now();
    if (this.run.phase === 'lost') {
      const streak = (this.profile.failureStreaks[level.id] ?? 0) + 1;
      this.profile.failureStreaks[level.id] = streak;
      this.repo.saveProfile(this.profile);
      this.settlement = {
        runId: this.run.runId, levelId: level.id, chapter: level.chapter, levelName: level.name,
        lost: true, reason: this.lastResolution?.reason ?? 'moves',
        score: this.run.score, sadness: this.run.sadness, movesLeft: this.run.movesLeft,
        moveBudget: this.run.moveBudget, gentleNext: streak >= 3,
        failureStreak: streak, goals: this.goals(), saved: this.repo.storageAvailable,
        at: now,
      };
      this.repo.clearCheckpoint();
      return { ok: true, settlement: this.settlement };
    }

    const stars = starFor({
      sadness: this.run.sadness,
      movesLeft: this.run.movesLeft,
      moveBudget: this.run.moveBudget,
      clouds: this.run.board.clouds.length,
      starCap: this.run.starCap,
    });
    const firstClear = !this.profile.levelResults[level.id];
    const pure = this.run.usedItems.length === 0;
    const rng = mulberry32(hashString(this.run.runId));
    const rewards = [];
    const addRandom = (reason) => {
      const type = ITEM_ORDER[randomInt(rng, 0, ITEM_ORDER.length - 1)];
      const before = this.profile.inventory[type];
      const after = Math.min(5, before + 1);
      this.profile.inventory[type] = after;
      rewards.push({ type, reason, before, after, amount: after - before, capped: after === before });
    };

    if (firstClear) addRandom('首次通关');
    if (stars === 3) addRandom('三星通关');
    if (pure) addRandom('纯净通关');

    if (isChapterFinal(level.id)) {
      for (const type of ITEM_ORDER) {
        const before = this.profile.inventory[type];
        const after = Math.min(5, before + 2);
        this.profile.inventory[type] = after;
        rewards.push({ type, reason: '章末通关', before, after, amount: after - before, capped: after === before });
      }
    }

    const previous = this.profile.levelResults[level.id];
    const bestScore = Math.max(previous?.bestScore ?? 0, this.run.score);
    const bestStars = Math.max(previous?.highestStars ?? 0, stars);
    const bestRemainingMoves = Math.max(previous?.bestRemainingMoves ?? 0, this.run.movesLeft);
    const cloudsNow = this.run.board.clouds.length;
    const bestCloudsRemaining = previous
      ? Math.min(previous.bestCloudsRemaining ?? 3, cloudsNow)
      : cloudsNow;
    const record = {
      levelId: level.id,
      highestStars: bestStars,
      bestScore,
      bestRemainingMoves,
      bestCloudsRemaining,
      bestChain: Math.max(previous?.bestChain ?? 0, this.run.chainMax),
      pureThreeStar: Boolean(previous?.pureThreeStar) || (stars === 3 && pure),
      clearCount: (previous?.clearCount ?? 0) + 1,
      firstClearedAt: previous?.firstClearedAt ?? now,
      lastPlayedAt: now,
    };
    this.profile.levelResults[level.id] = record;

    const next = nextLevelId(level.id);
    if (next && (this.allowAllLevels || isPlayableLevel(next)) && !this.profile.unlockedLevelIds.includes(next)) {
      this.profile.unlockedLevelIds.push(next);
    }
    if (isChapterFinal(level.id) && !this.profile.journalsUnlocked.includes(level.chapter)) {
      this.profile.journalsUnlocked.push(level.chapter);
    }
    this.profile.failureStreaks[level.id] = 0;

    const saved = this.repo.saveProfile(this.profile);
    this.settlement = {
      runId: this.run.runId,
      levelId: level.id,
      chapter: level.chapter,
      chapterTitle: level.chapterTitle,
      levelName: level.name,
      lost: false,
      stars,
      score: this.run.score,
      movesLeft: this.run.movesLeft,
      moveBudget: this.run.moveBudget,
      clouds: cloudsNow,
      totalS0: this.run.totalS0,
      chainMax: this.run.chainMax,
      sadness: 0,
      pure,
      gentle: this.run.gentle,
      firstClear,
      rewards,
      goals: this.goals(),
      bonus: level.bonus,
      bestScore,
      previousBest: previous?.bestScore ?? null,
      newBest: !previous || this.run.score > previous.bestScore,
      totalScore: totalScore(this.profile),
      unlockedNext: next && this.isUnlocked(next) ? next : null,
      journalUnlocked: isChapterFinal(level.id),
      saved: saved.ok,
      at: now,
    };
    this.repo.clearCheckpoint();
    return { ok: true, settlement: this.settlement };
  }

  addElapsed(ms) {
    if (!this.canAct()) return { ok: false, code: 'RUN_NOT_ACTIVE' };
    this.run.elapsedMs = Math.min(360000, (this.run.elapsedMs ?? 0) + Math.max(0, ms));
    if (this.run.elapsedMs >= 360000) return this.timeout();
    return { ok: true, elapsedMs: this.run.elapsedMs };
  }

  saveCheckpoint() {
    if (this.canAct()) this.repo.writeCheckpoint(this.run);
  }

  timeout() {
    if (!this.canAct()) return { ok: false, code: 'RUN_NOT_ACTIVE' };
    const level = this.level(this.run.levelId);
    const goals = evaluateGoals(level, this.run);
    let phase = 'lost';
    let reason = 'timeout';
    if (this.run.sadness <= 0 && allGoalsDone(goals)) {
      phase = 'won';
      reason = null;
      this.run.score += 20 * this.run.movesLeft;
    }
    this.run.phase = phase;
    this.run.endedAt = this.now();
    this.repo.clearCheckpoint();
    this.lastResolution = { frames: [], phase, reason, goals, bonusDelta: 0, reshuffled: false, layerUp: null };
    return { ok: true, phase, reason, goals, run: this.run };
  }

  restart() {
    if (!this.run) return { ok: false, code: 'NO_RUN' };
    return this.startLevel(this.run.levelId, { restore: false });
  }

  nextLevel() {
    if (!this.run) return null;
    return nextLevelId(this.run.levelId);
  }

  leaveRun() {
    this.run = null;
    this.settlement = null;
    this.lastResolution = null;
    this.allowAllLevels = false;
  }

  updateSettings(partial) {
    for (const key of Object.keys(this.profile.settings)) {
      if (typeof partial[key] === 'boolean') this.profile.settings[key] = partial[key];
    }
    this.repo.saveProfile(this.profile);
    return { ...this.profile.settings };
  }

  resetProgress() {
    this.profile = defaultProfile(this.now());
    this.run = null;
    this.settlement = null;
    this.repo.clearCheckpoint();
    this.repo.saveProfile(this.profile);
    return this.profile;
  }

  unlockAllForTest() {
    this.allowAllLevels = true;
    this.profile.unlockedLevelIds = this.levels.map((level) => level.id);
    this.profile.journalsUnlocked = [1, 2, 3, 4, 5];
    this.repo.saveProfile(this.profile);
  }

  summary() {
    return {
      ...this.profileSummary,
      unlocked: this.profile.unlockedLevelIds.length,
      journals: [...this.profile.journalsUnlocked],
      inventory: { ...this.profile.inventory },
      settings: { ...this.profile.settings },
    };
  }
}
