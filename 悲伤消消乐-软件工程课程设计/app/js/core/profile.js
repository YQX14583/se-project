/**
 * 存档与档案：localStorage 单键写入、schema 校验、坏档隔离、内存降级。
 * 所有规则数值由引擎写入，本模块只负责持久化与结构校验。
 */
import { Board } from './board.js';
import { ITEM_ORDER } from './rules.js';
import { LEVEL_BY_ID, PLAYABLE_LEVEL_IDS, layerS0sFor } from './levels.js';

export const PROFILE_KEY = 'sadmatch.profile.v1';
export const RUN_KEY = 'sadmatch.run.v1';
export const DIAG_KEY = 'sadmatch.diag.v1';
export const CORRUPT_KEY = 'sadmatch.corrupt.v1';
export const SCHEMA_VERSION = 1;

export const DEFAULT_SETTINGS = Object.freeze({
  sfx: true,
  music: true,
  reducedColorMode: false,
});

export function defaultProfile(now = new Date().toISOString()) {
  return {
    schemaVersion: SCHEMA_VERSION,
    createdAt: now,
    unlockedLevelIds: [...PLAYABLE_LEVEL_IDS],
    levelResults: {},
    inventory: { breathe: 1, hug: 1, resonate: 1, ventilate: 1 },
    failureStreaks: {},
    settings: { ...DEFAULT_SETTINGS },
    journalsUnlocked: [],
  };
}

function detectBackend() {
  try {
    return globalThis.localStorage ?? null;
  } catch {
    return null;
  }
}

function probeBackend(backend) {
  if (!backend) return false;
  try {
    const probe = '__sadmatch_probe__';
    backend.setItem(probe, '1');
    backend.removeItem(probe);
    return true;
  } catch {
    return false;
  }
}

export class StorageAdapter {
  constructor(backend = undefined) {
    this.backend = backend === undefined ? detectBackend() : backend;
    this.memory = new Map();
    this.available = probeBackend(this.backend);
    this.degraded = !this.available;
    this.lastError = null;
  }

  readRaw(key) {
    if (this.available) {
      try {
        return this.backend.getItem(key);
      } catch (error) {
        this.available = false;
        this.degraded = true;
        this.lastError = error;
      }
    }
    return this.memory.get(key) ?? null;
  }

  writeRaw(key, value) {
    this.memory.set(key, value);
    if (this.available) {
      try {
        this.backend.setItem(key, value);
        return true;
      } catch (error) {
        this.available = false;
        this.degraded = true;
        this.lastError = error;
      }
    }
    return false;
  }

  removeRaw(key) {
    this.memory.delete(key);
    if (this.available) {
      try {
        this.backend.removeItem(key);
      } catch (error) {
        this.available = false;
        this.degraded = true;
        this.lastError = error;
      }
    }
  }
}

function parseJson(raw) {
  if (typeof raw !== 'string') throw new Error('NOT_JSON');
  return JSON.parse(raw);
}

function isPlainObject(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function clampInt(value, min, max, fallback) {
  if (!Number.isFinite(value)) return fallback;
  return Math.min(max, Math.max(min, Math.round(value)));
}

export function validateProfile(raw) {
  if (!isPlainObject(raw)) throw new Error('PROFILE_INVALID');
  if (raw.schemaVersion !== SCHEMA_VERSION) throw new Error('PROFILE_VERSION');

  const profile = defaultProfile(raw.createdAt || new Date().toISOString());
  const unlocked = new Set(
    Array.isArray(raw.unlockedLevelIds)
      ? raw.unlockedLevelIds.filter((id) => LEVEL_BY_ID.has(id))
      : [],
  );
  for (const id of PLAYABLE_LEVEL_IDS) unlocked.add(id);
  profile.unlockedLevelIds = [...unlocked];

  if (isPlainObject(raw.levelResults)) {
    for (const [levelId, result] of Object.entries(raw.levelResults)) {
      if (!LEVEL_BY_ID.has(levelId) || !isPlainObject(result)) continue;
      const level = LEVEL_BY_ID.get(levelId);
      profile.levelResults[levelId] = {
        levelId,
        highestStars: clampInt(result.highestStars, 0, 3, 0),
        bestScore: Math.max(0, Math.round(Number(result.bestScore) || 0)),
        bestRemainingMoves: clampInt(result.bestRemainingMoves, 0, 100, 0),
        bestCloudsRemaining: clampInt(result.bestCloudsRemaining, 0, 3, 0),
        bestChain: clampInt(result.bestChain, 0, 60, 0),
        pureThreeStar: Boolean(result.pureThreeStar),
        clearCount: clampInt(result.clearCount, 0, 9999, 0),
        firstClearedAt: typeof result.firstClearedAt === 'string' ? result.firstClearedAt : null,
        lastPlayedAt: typeof result.lastPlayedAt === 'string' ? result.lastPlayedAt : null,
      };
    }
  }

  if (isPlainObject(raw.inventory)) {
    for (const key of ITEM_ORDER) {
      profile.inventory[key] = clampInt(raw.inventory[key], 0, 5, profile.inventory[key]);
    }
  }

  if (isPlainObject(raw.failureStreaks)) {
    for (const [levelId, value] of Object.entries(raw.failureStreaks)) {
      if (LEVEL_BY_ID.has(levelId)) {
        profile.failureStreaks[levelId] = clampInt(value, 0, 999, 0);
      }
    }
  }

  if (isPlainObject(raw.settings)) {
    for (const key of Object.keys(DEFAULT_SETTINGS)) {
      if (typeof raw.settings[key] === 'boolean') profile.settings[key] = raw.settings[key];
    }
  }

  if (Array.isArray(raw.journalsUnlocked)) {
    const chapters = new Set(raw.journalsUnlocked.filter((id) => Number.isInteger(id) && id >= 1 && id <= 5));
    profile.journalsUnlocked = [...chapters];
  }

  return profile;
}

export function validateRun(raw) {
  if (!isPlainObject(raw)) throw new Error('RUN_INVALID');
  if (raw.schemaVersion !== SCHEMA_VERSION) throw new Error('RUN_VERSION');
  const level = LEVEL_BY_ID.get(raw.levelId);
  if (!level) throw new Error('RUN_LEVEL');
  if (typeof raw.runId !== 'string' || raw.runId.length < 4) throw new Error('RUN_ID');
  if (!['playing', 'afterglow'].includes(raw.phase)) throw new Error('RUN_PHASE');
  const fallbackLayers = layerS0sFor(level);
  const layers = clampInt(raw.layers, 1, 3, fallbackLayers.length);
  let layerS0s = Array.isArray(raw.layerS0s)
    ? raw.layerS0s.slice(0, layers).map((value, index) => clampInt(value, 40, 100, fallbackLayers[index] ?? level.s0))
    : fallbackLayers.slice(0, layers);
  if (layerS0s.length !== layers) layerS0s = fallbackLayers.slice(0, layers);
  const layer = clampInt(raw.layer, 1, layers, 1);
  const layerS0 = layerS0s[layer - 1];
  const totalS0 = layerS0s.reduce((sum, value) => sum + value, 0);
  const healed = layerS0s.slice(0, layer - 1).reduce((sum, value) => sum + value, 0);
  if (raw.phase === 'afterglow' && layer < layers) throw new Error('RUN_PHASE');
  const moveBudget = clampInt(raw.moveBudget, 40, 100, level.moves);
  const run = {
    schemaVersion: SCHEMA_VERSION,
    runId: raw.runId,
    levelId: level.id,
    s0: layerS0s[0],
    layers,
    layer,
    layerS0s,
    layerS0,
    totalS0,
    healed,
    sadness: clampInt(raw.sadness, 0, layerS0, layerS0),
    moveBudget,
    movesLeft: clampInt(raw.movesLeft, 0, moveBudget, moveBudget),
    movesUsed: clampInt(raw.movesUsed, 0, 200, 0),
    score: Math.max(0, Math.round(Number(raw.score) || 0)),
    chainMax: clampInt(raw.chainMax, 0, 60, 0),
    cloudsCleared: clampInt(raw.cloudsCleared, 0, 99, 0),
    collected: {},
    usedItems: [],
    gentle: Boolean(raw.gentle),
    starCap: raw.gentle ? 2 : 3,
    bonusAwarded: Boolean(raw.bonusAwarded),
    phase: raw.phase,
    seed: clampInt(raw.seed, 0, 4294967295, 1),
    steps: clampInt(raw.steps, 0, 9999, 0),
    elapsedMs: clampInt(raw.elapsedMs, 0, 360000, 0),
    startedAt: typeof raw.startedAt === 'string' ? raw.startedAt : new Date().toISOString(),
    board: null,
  };
  if (isPlainObject(raw.collected)) {
    for (let color = 0; color < 6; color += 1) {
      run.collected[color] = clampInt(raw.collected[color], 0, 9999, 0);
    }
  }
  if (Array.isArray(raw.usedItems) && raw.usedItems.length <= 2) {
    run.usedItems = raw.usedItems
      .filter((item) => isPlainObject(item) && ITEM_ORDER.includes(item.type))
      .slice(0, 2)
      .map((item) => ({ type: item.type, atStep: clampInt(item.atStep, 0, 9999, 0), target: item.target ?? null }));
  }
  const board = Board.fromSnapshot(raw.board);
  if (board.colors !== level.colors) throw new Error('RUN_BOARD');
  run.board = board.toSnapshot();
  return run;
}

export class SaveRepository {
  constructor({ adapter = new StorageAdapter(), now = () => new Date().toISOString() } = {}) {
    this.adapter = adapter;
    this.now = now;
  }

  get storageAvailable() {
    return this.adapter.available;
  }

  backupCorrupt(raw) {
    if (raw == null) return;
    try {
      this.adapter.writeRaw(CORRUPT_KEY, JSON.stringify({
        at: this.now(),
        raw: String(raw).slice(0, 120000),
      }));
    } catch {
      // 坏档备份本身失败不阻断进入游戏。
    }
  }

  loadProfile() {
    const now = this.now();
    const raw = this.adapter.readRaw(PROFILE_KEY);
    if (raw == null) {
      return { profile: defaultProfile(now), status: this.adapter.available ? 'new' : 'storage-degraded' };
    }
    try {
      return { profile: validateProfile(parseJson(raw)), status: 'ok' };
    } catch {
      this.backupCorrupt(raw);
      return { profile: defaultProfile(now), status: 'recovered' };
    }
  }

  saveProfile(profile) {
    const safe = validateProfile(profile);
    const wrote = this.adapter.writeRaw(PROFILE_KEY, JSON.stringify(safe));
    return { ok: wrote, profile: safe, degraded: !wrote };
  }

  readCheckpoint() {
    const raw = this.adapter.readRaw(RUN_KEY);
    if (raw == null) return { run: null, status: 'empty' };
    try {
      return { run: validateRun(parseJson(raw)), status: 'ok' };
    } catch {
      this.backupCorrupt(raw);
      this.adapter.removeRaw(RUN_KEY);
      return { run: null, status: 'corrupt' };
    }
  }

  writeCheckpoint(run) {
    try {
      const safe = validateRun(run);
      const wrote = this.adapter.writeRaw(RUN_KEY, JSON.stringify(safe));
      return { ok: wrote, run: safe };
    } catch {
      return { ok: false, run: null, error: 'RUN_INVALID' };
    }
  }

  clearCheckpoint() {
    this.adapter.removeRaw(RUN_KEY);
  }

  readDiagnostics() {
    try {
      return parseJson(this.adapter.readRaw(DIAG_KEY)) ?? [];
    } catch {
      return [];
    }
  }

  appendDiagnostic(event) {
    const list = this.readDiagnostics();
    list.push({ ...event, at: this.now() });
    this.adapter.writeRaw(DIAG_KEY, JSON.stringify(list.slice(-200)));
  }
}

export function totalScore(profile) {
  return Object.values(profile.levelResults).reduce((sum, result) => sum + (result.bestScore || 0), 0);
}

export function clearedCount(profile) {
  return Object.keys(profile.levelResults).length;
}

export function pureThreeStarCount(profile) {
  return Object.values(profile.levelResults).filter((result) => result.pureThreeStar).length;
}

export function chapterStars(profile, chapter) {
  let stars = 0;
  for (const [levelId, result] of Object.entries(profile.levelResults)) {
    if (LEVEL_BY_ID.get(levelId)?.chapter === chapter) stars += result.highestStars;
  }
  return stars;
}

export function isLevelUnlocked(profile, levelId) {
  return profile.unlockedLevelIds.includes(levelId);
}

export function bestResult(profile, levelId) {
  return profile.levelResults[levelId] ?? null;
}
