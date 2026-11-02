import { TILE_TYPES, svgForColor } from '../core/tiles.js';
import { sleep } from './dom.js';
import { icon } from './icons.js';

function cellKey(r, c) {
  return `${r},${c}`;
}

/**
 * 键盘可操作的棋盘视图：按 tile id 复用 DOM，交换/掉落/消除由 CSS transform 过渡。
 * 只渲染引擎给出的快照，不参与任何数值计算。
 */
export class BoardView {
  constructor(root, { onSelect, onSwap, announce } = {}) {
    this.root = root;
    this.onSelect = onSelect;
    this.onSwap = onSwap;
    this.announce = announce;
    this.tiles = new Map();
    this.clouds = new Map();
    this.popping = new Set();
    this.poppingClouds = new Set();
    this.selected = null;
    this.hintMove = null;
    this.busy = false;
    this.focus = { r: 0, c: 0 };
    this.drag = null;
    this.accent = '#8fa8ff';
    this.mount();
  }

  mount() {
    this.root.innerHTML = '<div class="board-grid" aria-hidden="true"></div><div class="board-glow" aria-hidden="true"></div>';
    this.root.classList.add('board');
    this.root.setAttribute('role', 'group');
    this.root.setAttribute('aria-label', '消消乐棋盘，用方向键移动，回车选择方块');

    this.root.addEventListener('pointerdown', (event) => {
      if (this.busy) return;
      const tile = event.target.closest?.('.tile');
      if (!tile) return;
      this.drag = {
        r: Number(tile.dataset.r), c: Number(tile.dataset.c),
        x: event.clientX, y: event.clientY, id: event.pointerId,
      };
    });
    this.root.addEventListener('pointerup', (event) => {
      if (this.busy || !this.drag) return;
      const start = this.drag;
      this.drag = null;
      const dx = event.clientX - start.x;
      const dy = event.clientY - start.y;
      const targetEl = document.elementFromPoint(event.clientX, event.clientY)?.closest?.('.tile');
      if (Math.abs(dx) + Math.abs(dy) > 10 && targetEl) {
        const target = { r: Number(targetEl.dataset.r), c: Number(targetEl.dataset.c) };
        if (target.r !== start.r || target.c !== start.c) {
          this.onSwap?.({ r: start.r, c: start.c }, target);
          return;
        }
      }
      if (Math.abs(dx) + Math.abs(dy) <= 14) {
        this.onSelect?.({ r: start.r, c: start.c });
      }
    });
    this.root.addEventListener('pointercancel', () => { this.drag = null; });

    // 键盘：方向键移动焦点，Enter/Space 通过原生 button click 触发。
    this.root.addEventListener('keydown', (event) => {
      const tile = event.target.closest?.('.tile');
      if (!tile) return;
      const deltas = {
        ArrowUp: [-1, 0], ArrowDown: [1, 0], ArrowLeft: [0, -1], ArrowRight: [0, 1],
      };
      const delta = deltas[event.key];
      if (!delta) return;
      event.preventDefault();
      const r = Math.max(0, Math.min(7, Number(tile.dataset.r) + delta[0]));
      const c = Math.max(0, Math.min(7, Number(tile.dataset.c) + delta[1]));
      this.focus = { r, c };
      this.applyRovingTab();
      this.tiles.get(`${r}:${c}`)?.focus();
    });
    this.root.addEventListener('click', (event) => {
      if (event.detail !== 0) return;
      const tile = event.target.closest?.('.tile');
      if (!tile || this.busy) return;
      this.onSelect?.({ r: Number(tile.dataset.r), c: Number(tile.dataset.c) });
    });
    this.root.addEventListener('focusin', (event) => {
      const tile = event.target.closest?.('.tile');
      if (!tile) return;
      this.focus = { r: Number(tile.dataset.r), c: Number(tile.dataset.c) };
      this.applyRovingTab();
    });
  }

  setLevel(level) {
    this.level = level;
    this.accent = level.accent ?? this.accent;
    this.root.style.setProperty('--board-accent', this.accent);
  }

  setBusy(busy) {
    this.busy = busy;
    this.root.classList.toggle('busy', busy);
  }

  tileElement(id) {
    return this.tiles.get(id) ?? null;
  }

  makeTile(tile, r, c, { spawn = false } = {}) {
    const type = TILE_TYPES[tile.color];
    const el = document.createElement('button');
    el.type = 'button';
    el.className = 'tile';
    el.dataset.id = tile.id;
    el.dataset.r = r;
    el.dataset.c = c;
    el.dataset.color = String(tile.color);
    el.setAttribute('aria-pressed', 'false');
    el.style.setProperty('--tile', type.color);
    el.style.setProperty('--deep', type.deep);
    el.setAttribute('aria-label', `第 ${r + 1} 行第 ${c + 1} 列，${type.label}`);
    el.innerHTML = `<span class="tile-face"><span class="tile-art-wrap">${svgForColor(tile.color)}</span><span class="tile-glint" aria-hidden="true"></span></span>`;
    el.style.transform = `translate(${c * 100}%, ${spawn ? -130 : r * 100}%)`;
    if (spawn) {
      el.classList.add('spawning');
      requestAnimationFrame(() => {
        el.style.transform = `translate(${c * 100}%, ${r * 100}%)`;
        el.classList.remove('spawning');
      });
    }
    this.root.appendChild(el);
    this.tiles.set(tile.id, el);
    return el;
  }

  updateTile(el, tile, r, c) {
    const type = TILE_TYPES[tile.color];
    if (el.dataset.color !== String(tile.color)) {
      el.dataset.color = String(tile.color);
      el.style.setProperty('--tile', type.color);
      el.style.setProperty('--deep', type.deep);
      el.setAttribute('aria-label', `第 ${r + 1} 行第 ${c + 1} 列，${type.label}`);
      el.querySelector('.tile-art-wrap').innerHTML = svgForColor(tile.color);
    }
    el.dataset.r = r;
    el.dataset.c = c;
    el.style.transform = `translate(${c * 100}%, ${r * 100}%)`;
    el.setAttribute('aria-label', `第 ${r + 1} 行第 ${c + 1} 列，${type.label}`);
  }

  render(snapshot, { animate = true, immediate = false } = {}) {
    if (!snapshot) return;
    const present = new Set();
    const sp = new Set();
    for (let r = 0; r < snapshot.rows; r += 1) {
      for (let c = 0; c < snapshot.cols; c += 1) {
        const tile = snapshot.grid[r][c];
        if (!tile) continue;
        present.add(tile.id);
        let el = this.tiles.get(tile.id);
        if (!el) {
          el = this.makeTile(tile, r, c, { spawn: animate && !immediate });
        } else {
          this.updateTile(el, tile, r, c);
        }
        if (this.selected && this.selected.r === r && this.selected.c === c) el.classList.add('selected');
        else el.classList.remove('selected');
        if (this.hintMove && ((this.hintMove.a.r === r && this.hintMove.a.c === c) || (this.hintMove.b.r === r && this.hintMove.b.c === c))) {
          el.classList.add('hint');
        } else {
          el.classList.remove('hint');
        }
      }
    }

    for (const [id, el] of this.tiles) {
      if (present.has(id)) continue;
      this.popTile(id, animate && !immediate);
    }

    const cloudKeys = new Set();
    for (const cloud of snapshot.clouds ?? []) {
      const key = cellKey(cloud.r, cloud.c);
      cloudKeys.add(key);
      let el = this.clouds.get(key);
      if (!el) {
        el = document.createElement('div');
        el.className = 'cloud';
        el.dataset.r = cloud.r;
        el.dataset.c = cloud.c;
        el.style.transform = `translate(${cloud.c * 100}%, ${cloud.r * 100}%)`;
        el.innerHTML = `<span class="cloud-art">${icon('cloud')}</span><span class="cloud-pips" aria-hidden="true"><i></i><i></i><i></i></span>`;
        this.root.appendChild(el);
        this.clouds.set(key, el);
      }
      el.dataset.hits = String(cloud.hits ?? 0);
      el.setAttribute('aria-label', `阴云，第 ${cloud.r + 1} 行第 ${cloud.c + 1} 列，还需 ${3 - (cloud.hits ?? 0)} 次相邻消除`);
      el.querySelectorAll('.cloud-pips i').forEach((pip, index) => {
        pip.classList.toggle('on', index < (cloud.hits ?? 0));
      });
    }
    for (const [key, el] of this.clouds) {
      if (cloudKeys.has(key)) continue;
      this.popCloud(key, animate && !immediate);
    }

    this.applyRovingTab();
    if (this.hintMove) this.root.classList.add('has-hint');
  }

  popTile(id, animate = true) {
    if (this.popping.has(id)) return;
    const el = this.tiles.get(id);
    if (!el) return;
    this.popping.add(id);
    el.classList.add('pop');
    el.disabled = true;
    if (!animate) {
      el.remove();
      this.tiles.delete(id);
      this.popping.delete(id);
      return;
    }
    setTimeout(() => {
      el.remove();
      this.tiles.delete(id);
      this.popping.delete(id);
    }, 280);
  }

  popCloud(key, animate = true) {
    if (this.poppingClouds.has(key)) return;
    const el = this.clouds.get(key);
    if (!el) return;
    this.poppingClouds.add(key);
    el.classList.add('pop');
    if (!animate) {
      el.remove();
      this.clouds.delete(key);
      this.poppingClouds.delete(key);
      return;
    }
    setTimeout(() => {
      el.remove();
      this.clouds.delete(key);
      this.poppingClouds.delete(key);
    }, 320);
  }

  setSelected(selected) {
    this.selected = selected;
    for (const [id, el] of this.tiles) {
      const r = Number(el.dataset.r);
      const c = Number(el.dataset.c);
      el.classList.toggle('selected', Boolean(selected && selected.r === r && selected.c === c));
      el.setAttribute('aria-pressed', String(Boolean(selected && selected.r === r && selected.c === c)));
    }
    if (selected) {
      this.focus = selected;
      this.applyRovingTab();
      this.tiles.get(`${selected.r}:${selected.c}`)?.focus({ preventScroll: true });
    }
  }

  setHint(move) {
    this.hintMove = move;
    for (const el of this.tiles.values()) el.classList.remove('hint');
    if (!move) {
      this.root.classList.remove('has-hint');
      return;
    }
    const a = this.tiles.get(`${move.a.r}:${move.a.c}`);
    const b = this.tiles.get(`${move.b.r}:${move.b.c}`);
    a?.classList.add('hint');
    b?.classList.add('hint');
    this.root.classList.add('has-hint');
  }

  markInvalid(a, b) {
    for (const point of [a, b]) {
      const el = this.tiles.get(`${point.r}:${point.c}`);
      if (!el) continue;
      el.classList.remove('shake');
      void el.offsetWidth;
      el.classList.add('shake');
      setTimeout(() => el.classList.remove('shake'), 420);
    }
  }

  applyRovingTab() {
    for (const el of this.tiles.values()) el.tabIndex = -1;
    let focusEl = this.tiles.get(`${this.focus.r}:${this.focus.c}`);
    if (!focusEl) {
      focusEl = this.tiles.values().next().value;
      if (focusEl) this.focus = { r: Number(focusEl.dataset.r), c: Number(focusEl.dataset.c) };
    }
    if (focusEl) focusEl.tabIndex = 0;
  }

  async play(result, run, { fast = false, onFrame, onLayer } = {}) {
    const wait = (ms) => sleep(fast ? 0 : ms);
    // FR-AV-03：单步动画 ≤0.6s，整条连锁 ≤2s。按帧数分摊预算，避免长连锁超时。
    const animatedFrames = result.frames.filter((frame) => !frame.reshuffle).length || 1;
    const perFrame = Math.min(400, 1800 / animatedFrames);
    const popWait = Math.round(perFrame * 0.55);
    const fallWait = Math.max(0, perFrame - popWait);
    for (const frame of result.frames) {
      if (frame.reshuffle) {
        this.root.classList.add('reshuffling');
        await wait(320);
        this.root.classList.remove('reshuffling');
        this.render(frame.board, { animate: !fast });
        await wait(120);
        continue;
      }
      for (const cell of frame.cells ?? []) this.popTile(cell.id, !fast);
      for (const cloud of frame.cloudsCleared ?? []) this.popCloud(cellKey(cloud.r, cloud.c), !fast);
      onFrame?.(frame);
      await wait(popWait);
      this.render(frame.board, { animate: !fast });
      await wait(fallWait);
      if (frame.spawnedCloud) this.root.classList.add('cloud-born');
      setTimeout(() => this.root.classList.remove('cloud-born'), 320);
    }
    if (result.layerUp) {
      onLayer?.(result.layerUp);
      await wait(700);
    }
    this.render(run.board, { animate: !fast });
    this.setSelected(null);
  }
}
