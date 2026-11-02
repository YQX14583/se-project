/**
 * BoardEngine：交换合法性、匹配识别、掉落补块、阴云命中、重排。
 * 不接触 DOM、存档或浏览器 API；所有随机性由 seed 控制，便于复现与模拟。
 */
import { mulberry32, randomInt, shuffle } from './rng.js';
import { reductionFor, scoreFor } from './rules.js';

function key(r, c) {
  return `${r},${c}`;
}

export class Board {
  constructor({ rows = 8, cols = 8, colors = 5, seed = 1, initialClouds = 0 } = {}) {
    this.rows = rows;
    this.cols = cols;
    this.colors = colors;
    this.seed = seed >>> 0;
    this.rng = mulberry32(this.seed || 1);
    this.nextId = 1;
    this.clouds = [];
    this.grid = Array.from({ length: rows }, () => Array(cols).fill(null));
    this.generate(initialClouds);
  }

  makeTile(color) {
    const tile = { id: `t${this.nextId}`, color };
    this.nextId += 1;
    return tile;
  }

  inBounds(r, c) {
    return r >= 0 && r < this.rows && c >= 0 && c < this.cols;
  }

  cloudAt(r, c) {
    return this.clouds.find((cloud) => cloud.r === r && cloud.c === c) || null;
  }

  isCloud(r, c) {
    return Boolean(this.cloudAt(r, c));
  }

  tileAt(r, c) {
    return this.inBounds(r, c) ? this.grid[r][c] : null;
  }

  generate(initialClouds = 0) {
    for (let attempt = 0; attempt < 80; attempt += 1) {
      this.grid = Array.from({ length: this.rows }, () => Array(this.cols).fill(null));
      this.clouds = [];
      this.nextId = 1;

      const cloudTarget = Math.max(0, Math.min(initialClouds, 4));
      let guard = 0;
      while (this.clouds.length < cloudTarget && guard < 500) {
        guard += 1;
        const r = randomInt(this.rng, 0, this.rows - 1);
        const c = randomInt(this.rng, 0, this.cols - 1);
        if (!this.cloudAt(r, c)) this.clouds.push({ r, c, hits: 0 });
      }

      for (let r = 0; r < this.rows; r += 1) {
        for (let c = 0; c < this.cols; c += 1) {
          if (this.cloudAt(r, c)) continue;
          this.grid[r][c] = this.makeTile(this.safeColor(r, c));
        }
      }

      if (this.findMatches().cells.length === 0 && this.hasMove()) return;
    }
    // 极端参数下仍失败：允许一次不保证无匹配的盘面，由首轮结算自动清除。
    for (let r = 0; r < this.rows; r += 1) {
      for (let c = 0; c < this.cols; c += 1) {
        if (!this.cloudAt(r, c)) this.grid[r][c] = this.makeTile(randomInt(this.rng, 0, this.colors - 1));
      }
    }
  }

  safeColor(r, c) {
    const banned = new Set();
    const left1 = this.grid[r]?.[c - 1];
    const left2 = this.grid[r]?.[c - 2];
    if (left1 && left2 && left1.color === left2.color) banned.add(left1.color);
    const up1 = this.grid[r - 1]?.[c];
    const up2 = this.grid[r - 2]?.[c];
    if (up1 && up2 && up1.color === up2.color) banned.add(up1.color);
    const choices = [];
    for (let color = 0; color < this.colors; color += 1) {
      if (!banned.has(color)) choices.push(color);
    }
    if (choices.length === 0) return randomInt(this.rng, 0, this.colors - 1);
    return choices[randomInt(this.rng, 0, choices.length - 1)];
  }

  findMatches() {
    const cells = new Map();
    const runs = [];

    const addRun = (run) => {
      if (run.length < 3) return;
      runs.push(run);
      for (const item of run) {
        cells.set(key(item.r, item.c), {
          r: item.r, c: item.c, id: item.id, color: item.color,
        });
      }
    };

    for (let r = 0; r < this.rows; r += 1) {
      let run = [];
      for (let c = 0; c < this.cols; c += 1) {
        const tile = this.grid[r][c];
        if (!tile) {
          addRun(run);
          run = [];
        } else if (run.length && tile.color === run[run.length - 1].color) {
          run.push({ r, c, id: tile.id, color: tile.color });
        } else {
          addRun(run);
          run = [{ r, c, id: tile.id, color: tile.color }];
        }
      }
      addRun(run);
    }

    for (let c = 0; c < this.cols; c += 1) {
      let run = [];
      for (let r = 0; r < this.rows; r += 1) {
        const tile = this.grid[r][c];
        if (!tile) {
          addRun(run);
          run = [];
        } else if (run.length && tile.color === run[run.length - 1].color) {
          run.push({ r, c, id: tile.id, color: tile.color });
        } else {
          addRun(run);
          run = [{ r, c, id: tile.id, color: tile.color }];
        }
      }
      addRun(run);
    }

    return { cells: [...cells.values()], runs };
  }

  findMoves(limit = Infinity) {
    const moves = [];
    for (let r = 0; r < this.rows; r += 1) {
      for (let c = 0; c < this.cols; c += 1) {
        if (!this.grid[r][c] || this.isCloud(r, c)) continue;
        for (const [dr, dc] of [[0, 1], [1, 0]]) {
          const nr = r + dr;
          const nc = c + dc;
          if (!this.inBounds(nr, nc) || !this.grid[nr][nc] || this.isCloud(nr, nc)) continue;
          const a = this.grid[r][c];
          const b = this.grid[nr][nc];
          this.grid[r][c] = b;
          this.grid[nr][nc] = a;
          const matches = this.findMatches();
          this.grid[r][c] = a;
          this.grid[nr][nc] = b;
          if (matches.cells.length) {
            const colors = Array(6).fill(0);
            for (const cell of matches.cells) colors[cell.color] += 1;
            moves.push({ a: { r, c }, b: { r: nr, c: nc }, count: matches.cells.length, colors, cells: matches.cells });
            if (moves.length >= limit) return moves;
          }
        }
      }
    }
    return moves;
  }

  findMove() {
    return this.findMoves(1)[0] ?? null;
  }

  hasMove() {
    return this.findMoves(1).length > 0;
  }

  swapCells(a, b) {
    if (!this.inBounds(a.r, a.c) || !this.inBounds(b.r, b.c)) return false;
    if (this.isCloud(a.r, a.c) || this.isCloud(b.r, b.c)) return false;
    if (!this.grid[a.r][a.c] || !this.grid[b.r][b.c]) return false;
    if (Math.abs(a.r - b.r) + Math.abs(a.c - b.c) !== 1) return false;
    const tmp = this.grid[a.r][a.c];
    this.grid[a.r][a.c] = this.grid[b.r][b.c];
    this.grid[b.r][b.c] = tmp;
    return true;
  }

  removeCells(cells) {
    const removed = [];
    for (const cell of cells) {
      const tile = this.tileAt(cell.r, cell.c);
      if (!tile) continue;
      removed.push({ r: cell.r, c: cell.c, id: tile.id, color: tile.color });
      this.grid[cell.r][cell.c] = null;
    }
    return removed;
  }

  gravityAndRefill() {
    for (let c = 0; c < this.cols; c += 1) {
      const slots = [];
      for (let r = this.rows - 1; r >= 0; r -= 1) {
        if (!this.isCloud(r, c)) slots.push(r);
      }
      const tiles = [];
      for (let r = this.rows - 1; r >= 0; r -= 1) {
        if (!this.isCloud(r, c) && this.grid[r][c]) tiles.push(this.grid[r][c]);
      }
      for (const r of slots) this.grid[r][c] = null;
      for (let i = 0; i < slots.length; i += 1) {
        this.grid[slots[i]][c] = i < tiles.length
          ? tiles[i]
          : this.makeTile(randomInt(this.rng, 0, this.colors - 1));
      }
    }
  }

  /**
   * 连续结算：初始消除 → 阴云命中/消散/生成 → 掉落补块 → 连锁。
   * 返回逐帧报告，UI 只负责播放，不重新计算数值。
   */
  resolveWaves(initialCells, opts = {}) {
    const {
      sadness: startSadness = 0,
      score: startScore = 0,
      s0 = 100,
      moveIndex = 0,
      allowCloudSpawn = true,
      forceCloudSpawn = false,
      chainStart = 1,
    } = opts;

    let sadness = startSadness;
    let score = startScore;
    let pending = Array.isArray(initialCells) ? initialCells : null;
    let wave = 0;
    let chainMax = 0;
    let cloudsCleared = 0;
    let spawnedClouds = 0;
    let spawnedThisMove = false;
    const removedColors = Array(6).fill(0);
    const frames = [];

    while (wave < 60) {
      const cells = pending
        ? pending.filter((cell) => this.tileAt(cell.r, cell.c))
        : this.findMatches().cells;
      pending = null;
      if (!cells.length) break;

      wave += 1;
      const chain = chainStart + wave - 1;
      chainMax = Math.max(chainMax, chain);
      const count = cells.length;
      const reduction = reductionFor(count, chain);
      const scoreDelta = scoreFor(count, chain);
      const nextSadness = Math.max(0, sadness - reduction);

      const cloudHits = [];
      for (const cloud of this.clouds) {
        const hit = cells.some((cell) => Math.abs(cell.r - cloud.r) + Math.abs(cell.c - cloud.c) === 1);
        if (hit) cloudHits.push({ r: cloud.r, c: cloud.c, hits: cloud.hits + 1 });
      }
      for (const cloud of this.clouds) {
        const found = cloudHits.find((item) => item.r === cloud.r && item.c === cloud.c);
        if (found) cloud.hits = found.hits;
      }

      const removed = this.removeCells(cells);
      for (const tile of removed) removedColors[tile.color] += 1;

      let extraScore = 0;
      const dissipated = [];
      const survivors = [];
      for (const cloud of this.clouds) {
        if (cloud.hits >= 3) {
          dissipated.push({ r: cloud.r, c: cloud.c });
          extraScore += 50;
          cloudsCleared += 1;
        } else {
          survivors.push(cloud);
        }
      }
      this.clouds = survivors;

      let spawnedCloud = null;
      const canSpawn = !spawnedThisMove
        && allowCloudSpawn
        && moveIndex > 0
        && moveIndex % 3 === 0
        && this.clouds.length < 3
        && (forceCloudSpawn || nextSadness / s0 > 0.5);
      if (canSpawn) {
        const holes = removed.filter((cell) => !this.tileAt(cell.r, cell.c) && !this.cloudAt(cell.r, cell.c));
        if (holes.length) {
          const hole = holes[randomInt(this.rng, 0, holes.length - 1)];
          this.clouds.push({ r: hole.r, c: hole.c, hits: 0 });
          spawnedCloud = { r: hole.r, c: hole.c };
          spawnedThisMove = true;
          spawnedClouds += 1;
        }
      }

      const frameScore = scoreDelta + extraScore;
      score += frameScore;
      sadness = nextSadness;
      this.gravityAndRefill();

      frames.push({
        chain,
        cells: removed,
        reduction,
        scoreDelta: frameScore,
        sadnessAfter: sadness,
        scoreAfter: score,
        cloudHits,
        cloudsCleared: dissipated,
        spawnedCloud,
        clouds: this.clouds.map((cloud) => ({ ...cloud })),
        board: this.toSnapshot(),
      });
      if (wave >= 60) break;
    }

    return {
      frames,
      sadness,
      score,
      chainMax,
      cloudsCleared,
      spawnedClouds,
      removedColors,
      spentScore: score - startScore,
    };
  }

  applyItemEffect(type, target = {}) {
    if (type === 'ventilate') {
      this.reshuffle();
      return { cleared: [], reshuffled: true };
    }
    if (type === 'resonate') {
      if (!Number.isInteger(target.color) || target.color < 0 || target.color >= this.colors) {
        return { cleared: [], error: 'INVALID_TARGET' };
      }
      const cells = [];
      for (let r = 0; r < this.rows; r += 1) {
        for (let c = 0; c < this.cols; c += 1) {
          if (this.grid[r][c]?.color === target.color) cells.push({ r, c });
        }
      }
      if (!cells.length) return { cleared: [], error: 'INVALID_TARGET' };
      return { cleared: cells };
    }
    if (!this.inBounds(target.r, target.c)) return { cleared: [], error: 'INVALID_TARGET' };
    if (type === 'breathe') {
      if (!this.tileAt(target.r, target.c)) return { cleared: [], error: 'INVALID_TARGET' };
      return { cleared: [{ r: target.r, c: target.c }] };
    }
    if (type === 'hug') {
      const cells = [];
      for (let r = target.r - 1; r <= target.r + 1; r += 1) {
        for (let c = target.c - 1; c <= target.c + 1; c += 1) {
          if (this.inBounds(r, c) && this.tileAt(r, c)) cells.push({ r, c });
        }
      }
      if (!cells.length) return { cleared: [], error: 'INVALID_TARGET' };
      return { cleared: cells };
    }
    return { cleared: [], error: 'INVALID_TARGET' };
  }

  reshuffle() {
    const positions = [];
    for (let r = 0; r < this.rows; r += 1) {
      for (let c = 0; c < this.cols; c += 1) {
        if (!this.isCloud(r, c)) positions.push({ r, c });
      }
    }
    for (let attempt = 0; attempt < 300; attempt += 1) {
      const tiles = positions.map(({ r, c }) => this.grid[r][c]).filter(Boolean);
      const mixed = shuffle(this.rng, tiles);
      positions.forEach(({ r, c }, i) => { this.grid[r][c] = mixed[i] ?? this.makeTile(randomInt(this.rng, 0, this.colors - 1)); });
      if (this.findMatches().cells.length === 0 && this.hasMove()) return true;
    }
    for (let attempt = 0; attempt < 120; attempt += 1) {
      for (const { r, c } of positions) {
        this.grid[r][c] = this.makeTile(randomInt(this.rng, 0, this.colors - 1));
      }
      if (this.findMatches().cells.length === 0 && this.hasMove()) return true;
    }
    return false;
  }

  toSnapshot() {
    return {
      rows: this.rows,
      cols: this.cols,
      colors: this.colors,
      nextId: this.nextId,
      seed: this.seed,
      grid: this.grid.map((row) => row.map((tile) => (tile ? { id: tile.id, color: tile.color } : null))),
      clouds: this.clouds.map((cloud) => ({ r: cloud.r, c: cloud.c, hits: cloud.hits })),
    };
  }

  static fromSnapshot(snapshot) {
    if (!snapshot || !Array.isArray(snapshot.grid) || !Array.isArray(snapshot.clouds)) {
      throw new Error('BOARD_SNAPSHOT_INVALID');
    }
    const rows = snapshot.rows;
    const cols = snapshot.cols;
    if (!Number.isInteger(rows) || !Number.isInteger(cols) || rows < 3 || cols < 3 || rows > 12 || cols > 12) {
      throw new Error('BOARD_SNAPSHOT_INVALID');
    }
    if (snapshot.grid.length !== rows || snapshot.grid.some((row) => !Array.isArray(row) || row.length !== cols)) {
      throw new Error('BOARD_SNAPSHOT_INVALID');
    }
    const board = Object.create(Board.prototype);
    board.rows = rows;
    board.cols = cols;
    board.colors = snapshot.colors ?? 6;
    board.seed = snapshot.seed ?? 1;
    board.rng = mulberry32(board.seed || 1);
    board.nextId = snapshot.nextId ?? 1;
    board.clouds = snapshot.clouds.map((cloud) => ({ r: cloud.r, c: cloud.c, hits: cloud.hits ?? 0 }));
    board.grid = snapshot.grid.map((row) => row.map((tile) => (tile ? { id: tile.id, color: tile.color } : null)));
    const cloudKeys = new Set(board.clouds.map((cloud) => key(cloud.r, cloud.c)));
    let maxId = 0;
    for (let r = 0; r < rows; r += 1) {
      for (let c = 0; c < cols; c += 1) {
        const tile = board.grid[r][c];
        if (!tile) continue;
        if (cloudKeys.has(key(r, c))) throw new Error('BOARD_SNAPSHOT_INVALID');
        if (!Number.isInteger(tile.color) || tile.color < 0 || tile.color >= board.colors) {
          throw new Error('BOARD_SNAPSHOT_INVALID');
        }
        const numeric = Number(String(tile.id).replace(/^t/, ''));
        if (Number.isFinite(numeric)) maxId = Math.max(maxId, numeric);
      }
    }
    for (const cloud of board.clouds) {
      if (!Number.isInteger(cloud.r) || !Number.isInteger(cloud.c) || cloud.r < 0 || cloud.r >= rows || cloud.c < 0 || cloud.c >= cols) {
        throw new Error('BOARD_SNAPSHOT_INVALID');
      }
      if (!Number.isInteger(cloud.hits) || cloud.hits < 0 || cloud.hits > 3) {
        throw new Error('BOARD_SNAPSHOT_INVALID');
      }
    }
    if (board.clouds.length > 3) throw new Error('BOARD_SNAPSHOT_INVALID');
    board.nextId = Math.max(board.nextId, maxId + 1);
    return board;
  }

  clone() {
    return Board.fromSnapshot(this.toSnapshot());
  }
}
