import { AudioEngine } from './audio.js';
import { Game } from './core/game.js';
import { SaveRepository } from './core/profile.js';
import { CHAPTERS, LEVELS, PLAYABLE_LEVEL_IDS, getLevel } from './core/levels.js';
import {
  ITEMS, ITEM_ORDER, describeGoal, healingProgress,
} from './core/rules.js';
import { BoardView } from './ui/board-view.js';
import {
  escapeHtml, formatNumber, formatTime, itemIcon, itemName, sleep, starsHtml,
} from './ui/dom.js';
import { icon } from './ui/icons.js';
import {
  copyText, createJournalArtifact, createShareArtifact, downloadCanvas, filenameFor, pickQuote, shareCanvas,
} from './ui/share-card.js';

const params = new URLSearchParams(location.search);
const FAST = params.has('e2e');
const repo = new SaveRepository();
const game = new Game({ repo });
const audio = new AudioEngine(game.profile.settings);

const screenEl = document.getElementById('screen');
const modalEl = document.getElementById('modal-root');
const toastEl = document.getElementById('toast');

const ui = {
  screen: 'map',
  level: null,
  boardView: null,
  selected: null,
  pendingItem: null,
  busy: false,
  paused: false,
  hintTimer: null,
  timer: null,
  lastTick: 0,
  tickCount: 0,
  settlement: null,
  share: null,
  afterClose: null,
  settingsReturnTo: null,
  confirmReset: false,
  fast: FAST,
  introTimer: null,
};

let toastTimer = null;
let unlockBound = false;

function levelById(id) {
  return getLevel(id);
}

function chapterOf(number) {
  return CHAPTERS[number - 1];
}

function toast(message, type = 'info', duration = 2600) {
  clearTimeout(toastTimer);
  toastEl.textContent = message;
  toastEl.className = `toast show ${type}`;
  toastEl.setAttribute('role', type === 'warning' ? 'alert' : 'status');
  toastTimer = setTimeout(() => {
    toastEl.className = 'toast';
  }, duration);
}

function bindAudioUnlock() {
  if (unlockBound) return;
  unlockBound = true;
  const unlock = () => {
    audio.unlock();
    audio.setSettings(game.profile.settings);
  };
  document.addEventListener('pointerdown', unlock, { once: true, passive: true });
  document.addEventListener('keydown', unlock, { once: true });
}

function closeModal({ runOnClose = true } = {}) {
  const callback = ui.afterClose;
  ui.afterClose = null;
  ui.confirmReset = false;
  modalEl.innerHTML = '';
  document.body.classList.remove('modal-open');
  if (ui.screen === 'game' && game.canAct()) ui.paused = false;
  if (runOnClose && callback) callback();
}

function openModal(html, { dismissible = true, className = '', labelledBy = '' } = {}) {
  modalEl.innerHTML = `<div class="modal-backdrop ${className}" data-action="backdrop" data-dismissible="${dismissible}">${html}</div>`;
  document.body.classList.add('modal-open');
  const backdrop = modalEl.firstElementChild;
  backdrop.setAttribute('aria-hidden', 'false');
  const dialog = backdrop.querySelector('[role="dialog"]');
  if (dialog && labelledBy) dialog.setAttribute('aria-labelledby', labelledBy);
  const focusable = backdrop.querySelector('[data-autofocus]')
    ?? backdrop.querySelector('button:not([disabled]), [href], input, select, textarea');
  focusable?.focus({ preventScroll: true });
}

function renderMap() {
  stopTimer();
  ui.screen = 'map';
  ui.level = null;
  ui.boardView = null;
  ui.selected = null;
  ui.pendingItem = null;
  ui.busy = false;
  ui.paused = false;
  ui.settlement = null;
  ui.share = null;
  ui.afterClose = null;
  closeModal({ runOnClose: false });
  document.body.dataset.screen = 'map';
  document.body.classList.toggle('low-color', Boolean(game.profile.settings.reducedColorMode));

  const summary = game.summary();
  const playableTotal = game.allowAllLevels ? LEVELS.length : PLAYABLE_LEVEL_IDS.length;
  const demoStars = LEVELS.filter((level) => game.isPlayable(level.id)).reduce((sum, level) => sum + (game.profile.levelResults[level.id]?.highestStars ?? 0), 0);
  const resumeRun = game.resumeTarget();
  const resumeLevel = resumeRun ? levelById(resumeRun.levelId) : null;
  const storageNote = game.repo.storageAvailable
    ? '进度保存在这台设备的浏览器里'
    : '浏览器不允许本地存档 · 本次进度仅在内存';

  const resumeCard = resumeRun && resumeLevel ? `
    <div class="resume-card" data-testid="resume-card">
      <div class="resume-glow" aria-hidden="true"></div>
      <div class="resume-copy">
        <span class="eyebrow">${icon('play')} 继续上次</span>
        <strong>第 ${resumeLevel.chapter} 章 · ${resumeLevel.name}</strong>
        <p>还剩 ${resumeRun.movesLeft} 步 · 疗愈 ${Math.round(healingProgress(resumeRun) * 100)}%${resumeRun.gentle ? ' · 温柔模式' : ''}</p>
      </div>
      <button class="btn primary small" data-action="continue-run" data-level="${resumeLevel.id}" data-testid="continue-run">继续</button>
    </div>` : '';

  const chapterCards = CHAPTERS.map((chapter) => {
    const levels = LEVELS.filter((level) => level.chapter === chapter.id);
    const demoLevels = levels.filter((level) => game.isPlayable(level.id));
    const demoTotal = demoLevels.length;
    const stars = demoLevels.reduce((sum, level) => sum + (game.profile.levelResults[level.id]?.highestStars ?? 0), 0);
    const cleared = demoLevels.filter((level) => game.profile.levelResults[level.id]).length;
    const journalOpen = game.profile.journalsUnlocked.includes(chapter.id);
    const nodes = levels.map((level) => {
      const playable = game.isPlayable(level.id);
      const unlocked = game.isUnlocked(level.id);
      const best = game.profile.levelResults[level.id];
      const current = unlocked && !best;
      const label = playable
        ? `第 ${chapter.id} 章第 ${level.index} 关 ${level.name}${best ? `，最高 ${best.highestStars} 星` : '，可游玩'}`
        : `第 ${chapter.id} 章第 ${level.index} 关 ${level.name}，展示版暂未开放`;
      return `
        <button
          class="level-node ${unlocked ? (best ? 'done' : 'current') : 'locked'} ${playable ? '' : 'soon'}"
          data-action="${unlocked ? 'level' : 'locked'}"
          data-level="${level.id}"
          data-testid="level-${level.id}"
          aria-label="${escapeHtml(label)}"
          title="${escapeHtml(label)}"
          aria-disabled="${!unlocked}"
        >
          <span class="node-index">${String(level.index).padStart(2, '0')}</span>
          ${best ? starsHtml(best.highestStars, { className: 'mini' }) : unlocked ? `<span class="node-open">${icon('play')}</span>` : `<span class="node-lock">${icon('lock')}</span>`}
          ${current ? '<span class="node-dot" aria-hidden="true"></span>' : ''}
        </button>`;
    }).join('');

    return `
      <section class="chapter-card ${demoTotal > 0 && cleared === demoTotal ? 'complete' : ''}" id="chapter-${chapter.id}" style="--accent:${chapter.accent}" data-testid="chapter-${chapter.id}">
        <header class="chapter-heading">
          <div>
            <span class="chapter-roman">CHAPTER ${String(chapter.id).padStart(2, '0')}</span>
            <h2>${chapter.title}<small>${chapter.subtitle}</small></h2>
          </div>
          <div class="chapter-side">
            <span class="chapter-star-count">${icon('star')} ${stars}<small>/${demoTotal * 3}</small></span>
            <button class="journal-chip ${journalOpen ? '' : 'locked'}" data-action="journal" data-chapter="${chapter.id}" data-testid="journal-${chapter.id}" aria-label="${journalOpen ? `${chapter.title}章末情绪日记` : `${chapter.title}章末日记尚未解锁`}">
              ${icon(journalOpen ? 'book' : 'lock')}<span>章末日记</span>
            </button>
          </div>
        </header>
        <div class="level-grid">${nodes}</div>
        <footer class="chapter-foot">
          <div class="chapter-progress" aria-hidden="true"><span style="width:${demoTotal ? (cleared / demoTotal) * 100 : 0}%"></span></div>
          <span>${cleared} / ${demoTotal} 已放晴</span>
          ${demoTotal < 15 ? `<span class="demo-chip">开放 ${demoTotal} 关</span>` : ''}
        </footer>
      </section>`;
  }).join('');

  screenEl.innerHTML = `
    <div class="map-screen" data-testid="map">
      <div class="map-sky" aria-hidden="true">
        <span class="sky-moon"></span><span class="sky-glow"></span>
        <span class="sky-star s1"></span><span class="sky-star s2"></span><span class="sky-star s3"></span>
        <span class="sky-star s4"></span><span class="sky-star s5"></span>
      </div>
      <header class="map-header">
        <button class="brand" data-action="top" aria-label="回到顶部">
          <span class="brand-mark">${icon('moon')}</span>
          <span class="brand-text"><strong>悲伤消消乐</strong><small>SAD MATCH</small></span>
        </button>
        <div class="map-actions">
          <button class="ghost-btn" data-action="help">${icon('info')}<span>玩法</span></button>
          <button class="icon-btn" data-action="settings" aria-label="设置" data-testid="settings-open">${icon('settings')}</button>
        </div>
      </header>

      <section class="hero">
        <div class="hero-copy">
          <p class="eyebrow">情绪疗愈向三消 · 本地单机</p>
          <h1>把难过，<br><em>一点点消掉。</em></h1>
          <p class="lede">拖动相邻的方块，让同色三个连在一起。每消掉一点，悲伤值就低一点；等它归零，天就放晴了。</p>
          <div class="hero-tags">
            <span>${playableTotal} 个可玩关卡</span><span>5 段情绪</span><span>无广告 · 无内购</span>
          </div>
        </div>
        <div class="hero-panel">
          <div class="summary-stat">
            <span>共鸣总值</span><strong>${formatNumber(summary.totalScore)}</strong>
          </div>
          <div class="summary-stat">
            <span>收集星星</span><strong>${demoStars}<small>/${playableTotal * 3}</small></strong>
          </div>
          <div class="summary-stat">
            <span>纯净三星</span><strong>${summary.pureThreeStar}</strong>
          </div>
          <div class="summary-foot">
            <span class="storage-dot ${game.repo.storageAvailable ? '' : 'off'}"></span>${storageNote}
          </div>
        </div>
      </section>

      ${resumeCard}

      <div class="demo-banner">
        <span class="demo-badge">展示版</span>
        <span>本次开放 <b>${playableTotal}</b> 个关卡，覆盖 T1–T5 与章末关；其余关卡显示为待解锁，保留 75 关设计结构。</span>
      </div>

      <nav class="chapter-jump" aria-label="章节跳转">
        ${CHAPTERS.map((chapter) => `<button data-action="jump" data-chapter="${chapter.id}" style="--accent:${chapter.accent}"><b>0${chapter.id}</b>${chapter.title}</button>`).join('')}
      </nav>

      <main class="chapters">${chapterCards}</main>

      <footer class="map-footer">
        <div class="footer-moon">${icon('moon')}</div>
        <p>悲伤消消乐 · 把情绪放进一次次消除里</p>
        <p class="muted">展示版 · ${playableTotal} 关可玩 · 单机离线 · 不上传任何数据 · v1.0</p>
      </footer>
    </div>`;
  window.scrollTo({ top: 0, behavior: 'auto' });
}

function goalsHtml(goals) {
  return goals.map((goal) => {
    const color = goal.color !== undefined ? `style="--dot:${['#ff9a86', '#f6c85f', '#66d7b4', '#74b9ef', '#b9a3ee', '#f39ab8'][goal.color]}"` : '';
    return `
      <div class="goal ${goal.done ? 'done' : ''}" data-testid="goal-${goal.type}">
        <span class="goal-mark" ${color}>${goal.done ? icon('check') : `<i class="goal-dot"></i>`}</span>
        <span class="goal-copy"><strong>${goal.label}</strong><small>${goal.detail}</small></span>
        <span class="goal-progress">${goal.display}</span>
      </div>`;
  }).join('');
}

function itemCards(run) {
  return ITEM_ORDER.map((type) => {
    const count = game.profile.inventory[type] ?? 0;
    const disabled = count <= 0 || run.usedItems.length >= 2;
    const active = ui.pendingItem === type;
    return `
      <button class="item-card ${disabled ? 'is-disabled' : ''} ${active ? 'is-active' : ''}"
        data-action="item" data-item="${type}" data-testid="item-${type}"
        aria-label="${ITEMS[type].name}，库存 ${count}，${ITEMS[type].desc}"
        aria-disabled="${disabled}" aria-pressed="${active}">
        <span class="item-icon">${itemIcon(type)}</span>
        <span class="item-body"><strong>${ITEMS[type].name}</strong><small>${ITEMS[type].desc}</small></span>
        <span class="item-count">×${count}</span>
      </button>`;
  }).join('');
}

function gameTemplate(level, run) {
  const chapter = chapterOf(level.chapter);
  return `
    <div class="game-screen chapter-${level.chapter}" style="--accent:${chapter.accent}" data-testid="game">
      <div class="game-sky" aria-hidden="true"><span class="game-haze"></span><span class="game-moon"></span></div>
      <header class="game-top">
        <button class="game-back" data-action="map" aria-label="回到地图">${icon('back')}<span>地图</span></button>
        <div class="game-title">
          <small>第 ${level.chapter} 章 · ${chapter.title}</small>
          <strong>${level.name}</strong>
        </div>
        <div class="game-top-right">
          <span class="timer-pill" id="hud-time-pill">${icon('sun')} <b id="hud-time-top">00:00</b></span>
          <button class="icon-btn" data-action="pause" aria-label="暂停" data-testid="pause">${icon('pause')}</button>
        </div>
      </header>

      <div class="game-layout">
        <section class="hud-panel" aria-label="关卡状态">
          <div class="sadness-card" id="sadness-card">
            <div class="sadness-head">
              <span class="sadness-label">${icon('cloud')} 悲伤值</span>
              <strong><span id="hud-sadness" data-testid="hud-sadness">${run.sadness}</span><small> / <span id="hud-layer-s0">${run.layerS0}</span></small></strong>
            </div>
            <div class="sadness-track"><div class="sadness-fill" id="sadness-fill"></div></div>
            <div class="sadness-foot">
              <span id="hud-heal">疗愈 ${Math.round(healingProgress(run) * 100)}%</span>
              <span id="hud-layer" data-testid="hud-layer">第 ${run.layer} / ${run.layers} 层</span>
            </div>
            ${run.gentle ? `<span class="gentle-badge" title="连续失败 3 次后开启：本次 +10 步，星级上限 2 星">温柔模式 · +10 步</span>` : ''}
          </div>

          <div class="stat-grid">
            <div class="stat-chip"><span>剩余步数</span><strong id="hud-moves" data-testid="hud-moves">${run.movesLeft}</strong></div>
            <div class="stat-chip"><span>共鸣值</span><strong id="hud-score" data-testid="hud-score">${formatNumber(run.score)}</strong></div>
            <div class="stat-chip"><span>用时</span><strong id="hud-time">${formatTime(run.elapsedMs)}</strong></div>
          </div>

          <div class="goals-card">
            <div class="card-title"><span>这一关的心事</span><span class="card-sub">${level.tutorial ? '教学' : level.pace === 'hard' ? '困难' : level.pace === 'steady' ? '中档' : '喘息'}</span></div>
            <div id="hud-goals">${goalsHtml(game.goals())}</div>
          </div>
          <p class="hud-note">${run.gentle ? '这一局步数更宽裕，但最高只能拿到 2 星。' : '交换相邻方块，三个同色就能消除。'}</p>
        </section>

        <main class="board-stage">
          <div class="board-aura" aria-hidden="true"></div>
          <div class="board-shell">
            <div class="board" id="board" data-testid="board"></div>
            <div class="level-intro" id="level-intro" aria-hidden="true">
              <small>第 ${level.chapter} 章 · ${chapter.title}</small>
              <strong>${level.name}</strong>
              <p>${describeGoal(level)}</p>
            </div>
          </div>
          <div class="board-tip" id="board-tip">${describeGoal(level)}</div>
        </main>

        <aside class="item-panel" aria-label="道具">
          <div class="item-panel-head"><span>道具</span><span id="item-used">${run.usedItems.length} / 2</span></div>
          <div class="item-list" id="item-list">${itemCards(run)}</div>
          <p class="item-note">道具不直接减悲伤值，消除才算数。</p>
        </aside>
      </div>
      <div class="live-region visually-hidden" id="live-region" aria-live="polite"></div>
    </div>`;
}

function startRun(levelId, { restore = true, seed = null } = {}) {
  const result = game.startLevel(levelId, { restore, seed });
  if (!result.ok) {
    if (result.code === 'LEVEL_LOCKED') toast('先通过前一关，才能走进这里。', 'warning');
    else toast('暂时打不开这一关。', 'warning');
    return;
  }
  stopTimer();
  ui.level = result.level;
  ui.screen = 'game';
  ui.selected = null;
  ui.pendingItem = null;
  ui.busy = false;
  ui.paused = false;
  ui.settlement = null;
  ui.share = null;
  ui.afterClose = null;
  closeModal({ runOnClose: false });
  renderGame(result.restored);
  if (result.restored) toast('已回到上次停下的盘面。', 'good');
}

function renderGame(restored = false) {
  const level = ui.level;
  const run = game.run;
  document.body.dataset.screen = 'game';
  document.body.classList.toggle('low-color', Boolean(game.profile.settings.reducedColorMode));
  screenEl.innerHTML = gameTemplate(level, run);
  window.scrollTo({ top: 0, behavior: 'auto' });

  const boardRoot = document.getElementById('board');
  ui.boardView = new BoardView(boardRoot, {
    onSelect: (point) => selectTile(point),
    onSwap: (a, b) => onSwipe(a, b),
    announce: (text) => announce(text),
  });
  ui.boardView.setLevel(level);
  ui.boardView.render(run.board, { immediate: true });
  updateHUD();
  startTimer();
  showIntro(restored);
  scheduleHint();
}

function showIntro(restored) {
  const el = document.getElementById('level-intro');
  if (!el) return;
  if (restored || FAST) {
    el.remove();
    return;
  }
  requestAnimationFrame(() => el.classList.add('show'));
  clearTimeout(ui.introTimer);
  ui.introTimer = setTimeout(() => {
    el.classList.remove('show');
    setTimeout(() => el.remove(), 500);
  }, 1900);
  if (ui.level.tutorial) {
    setTimeout(() => {
      if (ui.screen === 'game' && game.canAct()) setBoardTip('拖动或点选相邻的两个方块，凑齐三个同色。');
    }, 2200);
  }
}

function announce(text) {
  const live = document.getElementById('live-region');
  if (live) live.textContent = text;
}

function updateHUD({ frame = null } = {}) {
  const run = game.run;
  if (!run || ui.screen !== 'game') return;
  const level = ui.level;
  const sadness = frame ? frame.sadnessAfter : run.sadness;
  const score = frame ? frame.scoreAfter : run.score;
  const layerS0 = run.layerS0 || run.s0;
  const healNow = Math.max(0, Math.min(1, (run.healed + (layerS0 - sadness)) / Math.max(1, run.totalS0)));

  const setText = (id, value) => {
    const el = document.getElementById(id);
    if (el) el.textContent = value;
  };
  setText('hud-sadness', sadness);
  setText('hud-layer-s0', layerS0);
  setText('hud-heal', `疗愈 ${Math.round(healNow * 100)}%`);
  setText('hud-layer', `第 ${run.layer} / ${run.layers} 层`);
  setText('hud-moves', run.movesLeft);
  setText('hud-score', formatNumber(score));
  setText('hud-time', formatTime(run.elapsedMs));
  setText('hud-time-top', formatTime(run.elapsedMs));
  setText('item-used', `${run.usedItems.length} / 2`);

  const fill = document.getElementById('sadness-fill');
  if (fill) fill.style.width = `${Math.max(0, Math.min(100, (sadness / Math.max(1, layerS0)) * 100))}%`;
  const card = document.getElementById('sadness-card');
  card?.classList.toggle('is-low', sadness / Math.max(1, layerS0) <= 0.5);

  const goals = document.getElementById('hud-goals');
  if (goals) goals.innerHTML = goalsHtml(game.goals());

  const items = document.getElementById('item-list');
  if (items) items.innerHTML = itemCards(run);
  const panel = document.querySelector('.game-screen');
  panel?.classList.toggle('is-calm', healNow > 0.5);
  panel?.classList.toggle('is-won', run.phase === 'won');
}

function setBoardTip(text, { cancel = false } = {}) {
  const el = document.getElementById('board-tip');
  if (!el) return;
  el.classList.add('is-active');
  el.innerHTML = `<span>${text}</span>${cancel ? '<button class="text-btn" data-action="cancel-item">取消</button>' : ''}`;
}

function resetBoardTip() {
  const el = document.getElementById('board-tip');
  if (!el) return;
  el.classList.remove('is-active');
  el.textContent = describeGoal(ui.level);
}

function selectTile(point) {
  if (ui.busy || !game.canAct()) return;
  if (ui.pendingItem) {
    executeItem(ui.pendingItem, { r: point.r, c: point.c });
    return;
  }
  clearHint();
  audio.play('select');
  if (!ui.selected) {
    ui.selected = point;
    ui.boardView.setSelected(point);
    setBoardTip('再点一个相邻的方块，把它们交换。');
    return;
  }
  if (ui.selected.r === point.r && ui.selected.c === point.c) {
    ui.selected = null;
    ui.boardView.setSelected(null);
    resetBoardTip();
    return;
  }
  const adjacent = Math.abs(ui.selected.r - point.r) + Math.abs(ui.selected.c - point.c) === 1;
  if (adjacent) {
    const first = ui.selected;
    ui.selected = null;
    ui.boardView.setSelected(null);
    attemptSwap(first, point);
  } else {
    ui.selected = point;
    ui.boardView.setSelected(point);
    setBoardTip('要交换的是相邻的两个方块。');
  }
}

function onSwipe(a, b) {
  if (ui.busy || !game.canAct()) return;
  if (ui.pendingItem) {
    executeItem(ui.pendingItem, { r: a.r, c: a.c });
    return;
  }
  const adjacent = Math.abs(a.r - b.r) + Math.abs(a.c - b.c) === 1;
  if (!adjacent) {
    selectTile(a);
    toast('只能交换相邻的方块。', 'warning');
    return;
  }
  ui.selected = null;
  ui.boardView.setSelected(null);
  attemptSwap(a, b);
}

async function attemptSwap(a, b) {
  if (ui.busy || !game.canAct()) return;
  clearHint();
  ui.busy = true;
  ui.boardView.setBusy(true);
  setBoardTip('消除正在发生…');
  const result = game.swap(a, b);
  if (!result.ok) {
    ui.busy = false;
    ui.boardView.setBusy(false);
    ui.boardView.markInvalid(a, b);
    audio.play('invalid');
    toast(result.message ?? '这次交换没有连成三个。', 'warning');
    resetBoardTip();
    scheduleHint();
    return;
  }
  audio.play('swap');
  if (result.swapBoard) ui.boardView.render(result.swapBoard, { animate: true });
  await sleep(ui.fast ? 0 : 140);
  await ui.boardView.play(result, game.run, {
    fast: ui.fast,
    onFrame: (frame) => {
      updateHUD({ frame });
      audio.play('match', { chain: frame.chain });
      if (frame.cloudsCleared?.length) audio.play('cloud');
      if (frame.cloudsCleared?.length) announce(`阴云散开，${frame.cells.length} 个方块被消除`);
      else announce(`消除 ${frame.cells.length} 个方块，连锁 ${frame.chain}`);
    },
    onLayer: (layerUp) => {
      audio.play('layer');
      showLayerBanner(layerUp);
    },
  });
  afterAction(result);
}

async function executeItem(type, target) {
  if (ui.busy || !game.canAct()) return;
  if ((game.profile.inventory[type] ?? 0) <= 0) {
    toast(`${ITEMS[type].name}用完了，通关后再来拿。`, 'warning');
    return;
  }
  if (game.run.usedItems.length >= 2) {
    toast('这一关最多用两次道具，把机会留给更需要的时刻。', 'warning');
    return;
  }
  ui.busy = true;
  ui.pendingItem = null;
  ui.boardView.setSelected(null);
  updateHUD();
  setBoardTip(`${ITEMS[type].name}正在发生…`);
  const result = game.useItem(type, target);
  if (!result.ok) {
    ui.busy = false;
    updateHUD();
    resetBoardTip();
    audio.play('invalid');
    toast(result.message ?? '这个位置现在用不了。', 'warning');
    return;
  }
  audio.play('item');
  await ui.boardView.play(result, game.run, {
    fast: ui.fast,
    onFrame: (frame) => {
      updateHUD({ frame });
      if (frame.cells?.length) audio.play('match', { chain: frame.chain });
      if (frame.cloudsCleared?.length) audio.play('cloud');
    },
    onLayer: (layerUp) => {
      audio.play('layer');
      showLayerBanner(layerUp);
    },
  });
  afterAction(result);
}

function afterAction(result) {
  ui.busy = false;
  ui.boardView?.setBusy(false);
  ui.selected = null;
  updateHUD();
  resetBoardTip();
  if (result.bonusDelta) toast(`心事完成 · 共鸣值 +${result.bonusDelta}`, 'good');
  if (result.reshuffled) toast('没有可消除的走法，盘面重新排列了。', 'info');
  if (result.layerUp) {
    // 层切换的提示由 showLayerBanner 负责，这里只确保数值回到新层。
    updateHUD();
  }
  if (result.phase === 'won') {
    audio.play('win');
    document.querySelector('.game-screen')?.classList.add('is-won');
    setTimeout(() => openSettlement(), ui.fast ? 0 : 550);
    return;
  }
  if (result.phase === 'lost') {
    audio.play('lose');
    setTimeout(() => openSettlement(), ui.fast ? 0 : 500);
    return;
  }
  if (result.phase === 'afterglow') {
    setBoardTip('悲伤值已经清零，但还有些心事没做完。');
  }
  scheduleHint();
}

function showLayerBanner(layerUp) {
  const host = document.querySelector('.board-stage');
  if (!host) return;
  const banner = document.createElement('div');
  banner.className = 'layer-banner';
  banner.innerHTML = `<small>第 ${layerUp.to} 层</small><strong>情绪又涌上来一点</strong><span>别急，慢慢来。</span>`;
  host.appendChild(banner);
  requestAnimationFrame(() => banner.classList.add('show'));
  setTimeout(() => {
    banner.classList.remove('show');
    setTimeout(() => banner.remove(), 500);
  }, 1700);
}

function clearHint() {
  clearTimeout(ui.hintTimer);
  ui.boardView?.setHint(null);
}

function scheduleHint() {
  clearTimeout(ui.hintTimer);
  if (ui.fast || !game.canAct()) return;
  const delay = ui.level?.tutorial ? 4200 : 11000;
  ui.hintTimer = setTimeout(() => {
    if (!game.canAct() || ui.busy || ui.selected || ui.pendingItem) return;
    const move = game.board().findMove();
    if (move) {
      ui.boardView.setHint(move);
      setBoardTip('试试交换这两块？');
    }
  }, delay);
}

function chooseItem(type) {
  if (ui.busy || !game.canAct()) return;
  if (ui.pendingItem === type) {
    cancelItem();
    return;
  }
  if (game.run.usedItems.length >= 2) {
    toast('这一关已经用过两次道具了。', 'warning');
    return;
  }
  if ((game.profile.inventory[type] ?? 0) <= 0) {
    toast(`${ITEMS[type].name}用完了，通关后再来拿。`, 'warning');
    return;
  }
  audio.play('click');
  if (type === 'ventilate') {
    executeItem(type, {});
    return;
  }
  ui.pendingItem = type;
  ui.selected = null;
  ui.boardView.setSelected(null);
  updateHUD();
  setBoardTip(ITEMS[type].hint, { cancel: true });
}

function cancelItem() {
  ui.pendingItem = null;
  updateHUD();
  resetBoardTip();
}

function openSettlement() {
  if (!game.run) return;
  const result = game.settle();
  if (!result.ok) {
    toast('结算还没有准备好。', 'warning');
    return;
  }
  const settlement = result.settlement;
  stopTimer();
  ui.settlement = settlement;
  ui.pendingItem = null;
  ui.busy = true;
  document.body.dataset.screen = 'settlement';
  renderSettlementModal(settlement);
}

function settlementTemplate(s) {
  const level = levelById(s.levelId);
  const chapter = chapterOf(s.chapter);
  const lost = s.lost;
  const quote = lost ? '今天先到这里，也算前进。' : pickQuote(s, s.chapter);
  const reasonText = {
    moves: '步数用完了，悲伤还剩下一点。',
    precision: '疗愈完成了，但没有在目标步数内放晴。',
    goals: '步数用完了，还有些心事没做完。',
    timeout: '六分钟到了，先让这一局停在这里。',
  }[s.reason] ?? '这一关还没有走完。';
  const rewards = (s.rewards ?? []).length
    ? `<div class="reward-strip"><span class="reward-title">带走的道具</span>${s.rewards.map((reward) => `<span class="reward ${reward.capped ? 'capped' : ''}">${itemIcon(reward.type)}<b>${ITEMS[reward.type].name}</b><em>${reward.amount > 0 ? `+${reward.amount}` : '已满'}</em></span>`).join('')}</div>`
    : '';
  const nextAvailable = s.unlockedNext && game.isUnlocked(s.unlockedNext);
  const actions = lost
    ? `<button class="btn primary" data-action="again" data-testid="settle-again">再来一次</button>
       <button class="btn ghost" data-action="map" data-testid="settle-map">回到地图</button>`
    : `${nextAvailable ? `<button class="btn primary" data-action="next" data-testid="settle-next">下一关 ${icon('arrow')}</button>` : `<button class="btn primary" data-action="map" data-testid="settle-map">回到地图</button>`}
       <button class="btn ghost" data-action="again">再来一次</button>
       <button class="btn share-btn" data-action="share-open" data-testid="share-open">${icon('share')} 留下这一刻</button>
       ${nextAvailable ? `<button class="btn ghost" data-action="map" data-testid="settle-map">回到地图</button>` : ''}`;

  return `
    <div class="settlement-card ${lost ? 'is-lost' : 'is-won'}" role="dialog" aria-modal="true" aria-labelledby="settle-title" data-testid="settlement">
      <div class="settle-sun" aria-hidden="true"></div>
      <p class="eyebrow">第 ${s.chapter} 章 · ${chapter.title}</p>
      <h2 id="settle-title">${lost ? '这一关，先到这里' : '放晴了'}</h2>
      <p class="settle-level">${level.name}</p>
      ${lost ? `<p class="settle-reason">${reasonText}</p>` : `<div class="settle-stars">${starsHtml(s.stars, { className: 'large' })}</div>`}
      ${lost ? '' : `<p class="settle-quote">“${quote}”</p>`}
      <div class="settle-stats">
        <div><span>共鸣值</span><strong>${formatNumber(s.score)}</strong></div>
        <div><span>${lost ? '剩余悲伤' : '剩余步数'}</span><strong>${lost ? s.sadness : `${s.movesLeft}<small> / ${s.moveBudget}</small>`}</strong></div>
        <div><span>${lost ? '连续失败' : '个人总分'}</span><strong>${lost ? s.failureStreak : formatNumber(s.totalScore)}</strong></div>
      </div>
      ${lost ? '' : `
        <div class="settle-compare">
          <span>${s.newBest ? '刷新了自己的最好成绩' : s.previousBest ? `最好成绩 ${formatNumber(s.previousBest)}` : '新的记录'}</span>
          ${s.pure ? '<span class="pure-chip">纯净通关</span>' : ''}
          ${s.gentle ? '<span class="gentle-chip">温柔模式</span>' : ''}
          ${s.newBest ? '<span class="best-chip">NEW BEST</span>' : ''}
        </div>`}
      <div class="settle-goals">${goalsHtml(s.goals)}</div>
      ${rewards}
      ${lost && s.gentleNext ? '<p class="settle-hint">下次进入这一关会开启温柔模式：+10 步，最高 2 星。</p>' : ''}
      ${lost ? '' : `<p class="settle-hint">${s.journalUnlocked ? '这一章的情绪日记已经解锁，可以在地图上打开。' : `下一关${s.unlockedNext ? '已经解锁' : '还在前面等你'}。`}</p>`}
      <div class="settle-actions">${actions}</div>
      <button class="corner-close" data-action="map" aria-label="回到地图">${icon('close')}</button>
    </div>`;
}

function renderSettlementModal(s) {
  ui.afterClose = null;
  openModal(settlementTemplate(s), { dismissible: false, className: s.lost ? 'settle-backdrop lost' : 'settle-backdrop won' });
  // 结算页的星星逐个亮起，给一点仪式感。
  document.querySelectorAll('.settle-stars .star').forEach((star, index) => {
    star.style.animationDelay = `${index * 0.13}s`;
  });
}

function openShare() {
  const settlement = ui.settlement;
  if (!settlement) return;
  const level = levelById(settlement.levelId);
  const artifact = createShareArtifact({ settlement, level });
  ui.share = artifact;
  ui.afterClose = () => renderSettlementModal(settlement);
  openModal(`
    <div class="share-modal" role="dialog" aria-modal="true" aria-labelledby="share-title" data-testid="share-modal">
      <header class="modal-head">
        <div><p class="eyebrow">留下这一刻</p><h2 id="share-title">把这次放晴带走吧</h2></div>
        <button class="icon-btn" data-action="close" aria-label="关闭">${icon('close')}</button>
      </header>
      <div class="share-preview" id="share-preview"></div>
      <p class="share-copy" id="share-copy">${escapeHtml(artifact.quote)}</p>
      <div class="share-actions">
        <button class="btn primary" data-action="share-save" data-testid="share-save">${icon('download')} 保存图片</button>
        <button class="btn ghost" data-action="share-copy" data-testid="share-copy">${icon('copy')} 复制文案</button>
        <button class="btn ghost" data-action="share-system">${icon('share')} 系统分享</button>
      </div>
      <p class="privacy-note">图片与文案只包含本关成绩和情绪文案，不含账号、设备或位置信息；不会上传任何数据。</p>
    </div>`, { className: 'share-backdrop' });
  document.getElementById('share-preview')?.appendChild(artifact.canvas);
}

function openJournal(chapterNumber) {
  if (!game.profile.journalsUnlocked.includes(chapterNumber)) {
    toast('通关这一章的第 15 关后，日记才会打开。', 'warning');
    return;
  }
  const chapter = chapterOf(chapterNumber);
  ui.afterClose = null;
  openModal(`
    <div class="journal-modal" role="dialog" aria-modal="true" aria-labelledby="journal-title" data-testid="journal-modal" style="--accent:${chapter.accent}">
      <header class="modal-head">
        <div><p class="eyebrow">第 ${chapter.id} 章 · 章末日记</p><h2 id="journal-title">${chapter.title}</h2></div>
        <button class="icon-btn" data-action="close" aria-label="关闭">${icon('close')}</button>
      </header>
      <p class="journal-sub">${chapter.subtitle}</p>
      <p class="journal-text">${escapeHtml(chapter.journal)}</p>
      <blockquote>“${chapter.quotes[0]}”</blockquote>
      <div class="journal-actions">
        <button class="btn primary" data-action="journal-share" data-chapter="${chapter.id}" data-testid="journal-share">${icon('share')} 留下这一刻</button>
        <button class="btn ghost" data-action="close">收起日记</button>
      </div>
    </div>`, { className: 'journal-backdrop' });
}

function openJournalShare(chapterNumber) {
  const chapter = chapterOf(chapterNumber);
  const artifact = createJournalArtifact(chapterNumber);
  ui.share = artifact;
  ui.afterClose = () => openJournal(chapterNumber);
  openModal(`
    <div class="share-modal" role="dialog" aria-modal="true" aria-labelledby="share-title" data-testid="share-modal">
      <header class="modal-head">
        <div><p class="eyebrow">章末日记</p><h2 id="share-title">把这段心情留下</h2></div>
        <button class="icon-btn" data-action="close" aria-label="关闭">${icon('close')}</button>
      </header>
      <div class="share-preview" id="share-preview"></div>
      <p class="share-copy">${escapeHtml(chapter.journal.slice(0, 42))}…</p>
      <div class="share-actions">
        <button class="btn primary" data-action="share-save">${icon('download')} 保存图片</button>
        <button class="btn ghost" data-action="share-copy">${icon('copy')} 复制文案</button>
        <button class="btn ghost" data-action="share-system">${icon('share')} 系统分享</button>
      </div>
      <p class="privacy-note">日记图片只包含章节文字与文案；不含账号、设备或位置信息。</p>
    </div>`, { className: 'share-backdrop' });
  document.getElementById('share-preview')?.appendChild(artifact.canvas);
}

function openPause() {
  if (!game.run || !game.canAct()) return;
  ui.paused = true;
  const run = game.run;
  ui.afterClose = null;
  openModal(`
    <div class="pause-modal" role="dialog" aria-modal="true" aria-labelledby="pause-title">
      <p class="eyebrow">停一下</p>
      <h2 id="pause-title">这一关先放在这里</h2>
      <p class="pause-sub">盘面、悲伤值、剩余步数和道具次数都已保存，随时可以回来。</p>
      <div class="pause-stats">
        <div><span>剩余步数</span><strong>${run.movesLeft}</strong></div>
        <div><span>已用道具</span><strong>${run.usedItems.length} / 2</strong></div>
        <div><span>用时</span><strong>${formatTime(run.elapsedMs)}</strong></div>
      </div>
      <div class="pause-actions">
        <button class="btn primary" data-action="resume" data-autofocus>继续这一关</button>
        <button class="btn ghost" data-action="restart">${icon('replay')} 重新开始</button>
        <button class="btn ghost" data-action="settings">${icon('settings')} 设置</button>
        <button class="btn ghost" data-action="map">回到地图</button>
      </div>
    </div>`, { className: 'pause-backdrop' });
}

function openHelp() {
  ui.afterClose = null;
  openModal(`
    <div class="help-modal" role="dialog" aria-modal="true" aria-labelledby="help-title">
      <header class="modal-head">
        <div><p class="eyebrow">怎么玩</p><h2 id="help-title">把难过，一点点消掉</h2></div>
        <button class="icon-btn" data-action="close" aria-label="关闭">${icon('close')}</button>
      </header>
      <div class="help-steps">
        <div><b>01</b><h3>交换相邻方块</h3><p>拖动或点选两个相邻方块，三个同色连成一线就会消除。</p></div>
        <div><b>02</b><h3>让悲伤值归零</h3><p>消除会降低悲伤值。清零就放晴；有些关卡要穿过 2–3 层情绪。</p></div>
        <div><b>03</b><h3>用道具，但别依赖</h3><p>每关最多用 2 次。道具只作用于盘面，靠消除间接减悲伤值。</p></div>
        <div><b>04</b><h3>收集星星</h3><p>剩余步数越多、阴云越少，星级越高。连续失败 3 次会开启温柔模式。</p></div>
      </div>
      <div class="help-note">${icon('palette')} 颜色始终搭配形状：即使关闭颜色，也能只凭图案辨认所有方块。</div>
      <div class="help-actions"><button class="btn primary" data-action="close" data-autofocus>开始</button></div>
    </div>`, { className: 'help-backdrop' });
}

function settingSwitch(key, title, description, value) {
  return `
    <button class="setting-row" data-action="toggle-setting" data-key="${key}" role="switch" aria-checked="${value}" aria-label="${title}">
      <span class="setting-copy"><strong>${title}</strong><small>${description}</small></span>
      <span class="switch ${value ? 'on' : ''}" aria-hidden="true"><i></i></span>
    </button>`;
}

function openSettings(returnTo = null) {
  ui.settingsReturnTo = returnTo;
  ui.afterClose = returnTo === 'pause' ? () => openPause() : null;
  const settings = game.profile.settings;
  const storage = game.repo.storageAvailable
    ? '本地存档可用 · 进度只保存在这台设备'
    : '本地存档不可用 · 本次进度只保存在内存，关闭页面后会丢失';
  openModal(`
    <div class="settings-modal" role="dialog" aria-modal="true" aria-labelledby="settings-title">
      <header class="modal-head">
        <div><p class="eyebrow">偏好</p><h2 id="settings-title">设置</h2></div>
        <button class="icon-btn" data-action="close" aria-label="关闭">${icon('close')}</button>
      </header>
      <div class="settings-list">
        ${settingSwitch('sfx', '音效', '消除、连锁、放晴的提示音', settings.sfx)}
        ${settingSwitch('music', '背景音', '很轻的环境垫音，可单独关闭', settings.music)}
        ${settingSwitch('reducedColorMode', '低颜色依赖', '降低颜色饱和度，强化形状与纹理边界', settings.reducedColorMode)}
      </div>
      <div class="storage-status ${game.repo.storageAvailable ? '' : 'off'}"><span class="storage-dot ${game.repo.storageAvailable ? '' : 'off'}"></span>${storage}</div>
      <div class="settings-danger">
        <div><strong>清除进度</strong><small>关卡、星级、道具和日记都会回到初始状态</small></div>
        <button class="text-btn danger" data-action="reset-progress" data-testid="reset-progress">${ui.confirmReset ? '再点一次确认清除' : '清除全部进度'}</button>
      </div>
      <div class="settings-about">
        <p>悲伤消消乐 v1.0 · 单机离线 · 无账号 · 无第三方采集</p>
        <p class="muted">基于任务一需求基线 v1.0 与任务二软件设计文档实现。</p>
      </div>
    </div>`, { className: 'settings-backdrop' });
}

function openRestartConfirm() {
  ui.afterClose = () => openPause();
  openModal(`
    <div class="confirm-modal" role="dialog" aria-modal="true" aria-labelledby="confirm-title">
      <p class="eyebrow">重新开始</p>
      <h2 id="confirm-title">要重新摆一次盘面吗？</h2>
      <p class="pause-sub">当前这一局的进度会被放弃；已经拿到的星级和总分不会受影响。</p>
      <div class="confirm-actions">
        <button class="btn primary" data-action="confirm-restart">重新开始</button>
        <button class="btn ghost" data-action="close">继续这一关</button>
      </div>
    </div>`, { className: 'confirm-backdrop' });
}

function goMap() {
  if (game.run && game.canAct()) game.saveCheckpoint();
  stopTimer();
  game.leaveRun();
  ui.screen = 'map';
  ui.busy = false;
  ui.pendingItem = null;
  closeModal({ runOnClose: false });
  renderMap();
}

function again() {
  const levelId = ui.settlement?.levelId ?? ui.level?.id;
  if (!levelId) return;
  closeModal({ runOnClose: false });
  ui.busy = false;
  startRun(levelId, { restore: false });
}

function nextLevel() {
  const levelId = game.nextLevel();
  closeModal({ runOnClose: false });
  ui.busy = false;
  if (levelId && game.isUnlocked(levelId)) startRun(levelId, { restore: false });
  else goMap();
}

function startTimer() {
  stopTimer();
  ui.lastTick = performance.now();
  ui.tickCount = 0;
  ui.timer = setInterval(tickTimer, 1000);
}

function stopTimer() {
  if (ui.timer) clearInterval(ui.timer);
  ui.timer = null;
  clearTimeout(ui.hintTimer);
}

function tickTimer() {
  const now = performance.now();
  if (ui.screen !== 'game' || ui.paused || document.hidden || !game.canAct()) {
    ui.lastTick = now;
    return;
  }
  const delta = Math.min(1600, now - ui.lastTick);
  ui.lastTick = now;
  const out = game.addElapsed(delta);
  ui.tickCount += 1;
  if (ui.tickCount % 5 === 0) game.saveCheckpoint();
  const timeEl = document.getElementById('hud-time');
  const topEl = document.getElementById('hud-time-top');
  if (timeEl) timeEl.textContent = formatTime(game.run.elapsedMs);
  if (topEl) topEl.textContent = formatTime(game.run.elapsedMs);
  if (game.run.elapsedMs >= 300000) document.querySelector('.timer-pill')?.classList.add('is-late');
  if (out.phase) {
    stopTimer();
    toast('六分钟到了，这一局先收在这里。', 'warning', 3200);
    setTimeout(() => openSettlement(), 600);
  }
}

async function saveArtifact(mode) {
  const artifact = ui.share;
  if (!artifact) return;
  const level = ui.level ?? (ui.settlement ? levelById(ui.settlement.levelId) : null);
  const name = level ? filenameFor(level) : '悲伤消消乐-心情.png';
  if (mode === 'save') {
    try {
      await downloadCanvas(artifact.canvas, name);
      toast('图片已经保存到下载目录。', 'good');
    } catch {
      toast('图片生成失败了，再试一次吧。', 'warning');
    }
    return;
  }
  if (mode === 'copy') {
    try {
      await copyText(artifact.text);
      toast('文案已经复制。', 'good');
    } catch {
      toast('复制失败，可以长按图片保存。', 'warning');
    }
    return;
  }
  const outcome = await shareCanvas(artifact.canvas, artifact.text, name);
  if (outcome.ok) return;
  if (outcome.code === 'SHARE_UNSUPPORTED') {
    try {
      await downloadCanvas(artifact.canvas, name);
      await copyText(artifact.text);
      toast('浏览器不支持系统分享，已保存图片并复制文案。', 'info', 3200);
    } catch {
      toast('系统分享不可用，请使用保存图片或复制文案。', 'warning');
    }
  } else if (outcome.code !== 'SHARE_CANCELLED') {
    toast('系统分享没有完成，可以用保存图片或复制文案。', 'warning');
  }
}

function toggleSetting(key) {
  ui.confirmReset = false;
  const next = !game.profile.settings[key];
  game.updateSettings({ [key]: next });
  audio.setSettings(game.profile.settings);
  document.body.classList.toggle('low-color', Boolean(game.profile.settings.reducedColorMode));
  openSettings(ui.settingsReturnTo);
}

function resetProgress() {
  if (!ui.confirmReset) {
    ui.confirmReset = true;
    openSettings(ui.settingsReturnTo);
    toast('再点一次“清除全部进度”，确认清除。', 'warning', 3200);
    return;
  }
  game.resetProgress();
  audio.setSettings(game.profile.settings);
  document.body.classList.remove('low-color');
  closeModal({ runOnClose: false });
  goMap();
  toast('进度已经清空，可以从第 1 章重新开始。', 'good');
}

document.addEventListener('click', (event) => {
  const actionEl = event.target.closest('[data-action]');
  if (!actionEl) return;
  const action = actionEl.dataset.action;
  if (action === 'backdrop') {
    if (event.target !== actionEl) return;
    if (actionEl.dataset.dismissible === 'true') closeModal();
    return;
  }
  if (action === 'locked') {
    const level = levelById(actionEl.dataset.level);
    toast(level && !game.isPlayable(level.id)
      ? '这一关在展示版中暂未开放，其余关卡会随内容更新解锁。'
      : '先通过前面的关卡，才能走进这里。', 'warning');
    return;
  }
  audio.play('click');
  switch (action) {
    case 'level': startRun(actionEl.dataset.level, { restore: true }); break;
    case 'continue-run': startRun(actionEl.dataset.level, { restore: true }); break;
    case 'jump': document.getElementById(`chapter-${actionEl.dataset.chapter}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' }); break;
    case 'top': window.scrollTo({ top: 0, behavior: 'smooth' }); break;
    case 'settings': openSettings(ui.paused ? 'pause' : null); break;
    case 'help': openHelp(); break;
    case 'journal': openJournal(Number(actionEl.dataset.chapter)); break;
    case 'journal-share': openJournalShare(Number(actionEl.dataset.chapter)); break;
    case 'pause': openPause(); break;
    case 'resume': closeModal(); ui.paused = false; break;
    case 'restart': openRestartConfirm(); break;
    case 'confirm-restart': {
      const levelId = game.run?.levelId;
      closeModal({ runOnClose: false });
      ui.paused = false;
      if (levelId) startRun(levelId, { restore: false });
      break;
    }
    case 'map': goMap(); break;
    case 'item': chooseItem(actionEl.dataset.item); break;
    case 'cancel-item': cancelItem(); break;
    case 'share-open': openShare(); break;
    case 'share-save': saveArtifact('save'); break;
    case 'share-copy': saveArtifact('copy'); break;
    case 'share-system': saveArtifact('system'); break;
    case 'next': nextLevel(); break;
    case 'again': again(); break;
    case 'close': closeModal(); break;
    case 'toggle-setting': toggleSetting(actionEl.dataset.key); break;
    case 'reset-progress': resetProgress(); break;
    default: break;
  }
});

document.addEventListener('keydown', (event) => {
  if (event.key === 'Escape') {
    if (ui.pendingItem) {
      cancelItem();
      return;
    }
    if (modalEl.firstElementChild) {
      if (modalEl.firstElementChild.dataset.dismissible === 'true') closeModal();
      return;
    }
    if (ui.screen === 'game' && game.canAct()) openPause();
    return;
  }
  if (event.key === 'Tab' && modalEl.firstElementChild) {
    const focusables = [...modalEl.querySelectorAll('button:not([disabled]), [href], input, select, textarea')].filter((el) => el.offsetParent !== null);
    if (!focusables.length) return;
    const first = focusables[0];
    const last = focusables[focusables.length - 1];
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  }
});

document.addEventListener('visibilitychange', () => {
  if (document.hidden) {
    if (ui.screen === 'game' && game.canAct()) game.saveCheckpoint();
  } else {
    ui.lastTick = performance.now();
  }
});

window.addEventListener('pagehide', () => {
  if (ui.screen === 'game' && game.canAct()) game.saveCheckpoint();
});

window.addEventListener('beforeunload', () => {
  if (ui.screen === 'game' && game.canAct()) game.saveCheckpoint();
});

function boot() {
  bindAudioUnlock();
  document.body.classList.toggle('low-color', Boolean(game.profile.settings.reducedColorMode));
  if (FAST) document.documentElement.classList.add('e2e');
  renderMap();
  if (game.profileStatus === 'recovered') {
    toast('发现一段无法恢复的旧进度，已从新的旅程开始。', 'warning', 4200);
  } else if (game.profileStatus === 'storage-degraded') {
    toast('浏览器不允许本地存档，本次进度只保存在内存里。', 'warning', 4200);
  }
}

boot();

if (FAST) {
  window.__sadApp = {
    game,
    audio,
    ui,
    start: (levelId) => startRun(levelId, { restore: false }),
    unlockAll: () => game.unlockAllForTest(),
    state: () => ({
      screen: ui.screen,
      phase: game.run?.phase ?? null,
      run: game.run ? JSON.parse(JSON.stringify(game.run)) : null,
      settlement: ui.settlement,
      summary: game.profileSummary,
      storage: game.repo.storageAvailable,
    }),
    findMove: () => game.board().findMove(),
    autoPlay: async () => {
      let guard = 0;
      while (game.canAct() && guard < 260) {
        const board = game.board();
        const level = game.level(game.run.levelId);
        let move = board.findMove();
        if (level.bonus?.type === 'T2') {
          const moves = board.findMoves(40);
          moves.sort((a, b) => (b.colors[level.bonus.color] ?? 0) - (a.colors[level.bonus.color] ?? 0) || b.count - a.count);
          move = moves[0] ?? move;
        }
        if (!move) break;
        const result = game.swap(move.a, move.b);
        if (!result.ok) break;
        ui.boardView?.render(game.run.board, { immediate: true });
        updateHUD();
        guard += 1;
        if (guard % 8 === 0) await sleep(0);
      }
      updateHUD();
      if (game.run && ['won', 'lost'].includes(game.run.phase)) openSettlement();
      return { phase: game.run?.phase, moves: game.run?.movesUsed, guard };
    },
    useItem: (type, target) => game.useItem(type, target),
    saveCheckpoint: () => game.saveCheckpoint(),
  };
}
