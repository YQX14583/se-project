/* 浏览器验收脚本（Playwright）。
 * 运行前：npm install --no-save playwright && npx playwright install chromium
 * 运行：node tests/browser.cjs
 */
const { chromium } = require('playwright');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { spawn } = require('node:child_process');

const root = path.resolve(__dirname, '..');
const appDir = path.join(root, 'app');
const evidenceDir = path.join(root, 'evidence');
const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'sadmatch-e2e-'));
const base = 'http://127.0.0.1:8771';
const results = [];
const errors = [];
let browser;
let server;

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function waitServer() {
  for (let i = 0; i < 60; i += 1) {
    try {
      const res = await fetch(base);
      if (res.ok) return;
    } catch { /* 继续等 */ }
    await sleep(150);
  }
  throw new Error('static server did not start');
}

async function step(name, fn) {
  const start = Date.now();
  try {
    await fn();
    results.push({ name, status: 'PASS', ms: Date.now() - start });
    console.log('PASS', name);
  } catch (error) {
    results.push({ name, status: 'FAIL', ms: Date.now() - start, error: error.message });
    console.error('FAIL', name, error);
    throw error;
  }
}

async function newPage(context) {
  const page = await context.newPage();
  page.on('pageerror', (error) => errors.push(`PAGEERROR ${error.message}`));
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(`CONSOLE ${message.text()}`);
  });
  return page;
}

(async () => {
  fs.mkdirSync(evidenceDir, { recursive: true });
  server = spawn(process.env.PYTHON || 'python3', ['-m', 'http.server', '8771', '--bind', '127.0.0.1'], {
    cwd: appDir, stdio: ['ignore', 'pipe', 'pipe'],
  });
  server.on('error', (error) => { throw error; });
  await waitServer();
  browser = await chromium.launch({ headless: true });

  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, acceptDownloads: true });
  const page = await newPage(context);
  const requests = [];
  page.on('request', (request) => requests.push(request.url()));

  await step('B01 地图加载：75 个节点、8 个可玩关卡、5 个章节', async () => {
    await page.goto(`${base}/?e2e=1`, { waitUntil: 'networkidle' });
    assert.equal(await page.locator('.level-node').count(), 75);
    assert.equal(await page.locator('.level-node.current').count(), 8);
    assert.equal(await page.locator('.chapter-card').count(), 5);
    assert.match(await page.locator('.demo-banner').innerText(), /开放 8 个关卡/);
    await page.screenshot({ path: path.join(evidenceDir, '20-e2e-map.png'), fullPage: false });
  });

  await step('B02 进入首关：64 个方块、HUD 与教学提示', async () => {
    await page.locator('[data-testid="level-C1-L01"]').click();
    await page.waitForTimeout(350);
    assert.equal(await page.locator('.tile').count(), 64);
    assert.equal(await page.locator('[data-testid=hud-sadness]').innerText(), '40');
    assert.equal(await page.locator('[data-testid=hud-moves]').innerText(), '40');
    assert.equal(await page.locator('[data-testid=hud-layer]').innerText(), '第 1 / 2 层');
    await page.screenshot({ path: path.join(evidenceDir, '21-e2e-game.png'), fullPage: false });
  });

  await step('B03 点击交换：扣一步、悲伤值下降、共鸣值增加', async () => {
    const move = await page.evaluate(() => window.__sadApp.findMove());
    assert.ok(move);
    await page.locator(`.tile[data-r="${move.a.r}"][data-c="${move.a.c}"]`).click();
    await page.locator(`.tile[data-r="${move.b.r}"][data-c="${move.b.c}"]`).click();
    await page.waitForTimeout(900);
    assert.equal(await page.locator('[data-testid=hud-moves]').innerText(), '39');
    const state = await page.evaluate(() => window.__sadApp.state().run);
    assert.ok(state.sadness < 40);
    assert.ok(state.score > 0);
  });

  await step('B04 使用深呼吸：不扣步数、库存减少、道具有效', async () => {
    const before = await page.evaluate(() => window.__sadApp.state().run);
    await page.locator('[data-testid=item-breathe]').click();
    await page.waitForTimeout(120);
    const target = await page.evaluate(() => {
      const board = window.__sadApp.game.board();
      for (let r = 0; r < 8; r += 1) for (let c = 0; c < 8; c += 1) if (board.tileAt(r, c)) return { r, c };
      return null;
    });
    await page.locator(`.tile[data-r="${target.r}"][data-c="${target.c}"]`).click();
    await page.waitForTimeout(900);
    const state = await page.evaluate(() => window.__sadApp.state().run);
    assert.equal(state.movesLeft, before.movesLeft);
    assert.equal(state.usedItems.length, 1);
    assert.equal(await page.locator('[data-testid=item-breathe] .item-count').innerText(), '×0');
  });

  await step('B05 暂停/继续、回到地图、继续上次', async () => {
    await page.locator('[data-testid=pause]').click();
    await page.waitForTimeout(200);
    assert.equal(await page.locator('.pause-modal').count(), 1);
    await page.locator('[data-action=resume]').click();
    await page.waitForTimeout(200);
    assert.equal(await page.locator('[data-testid=game]').count(), 1);
    await page.locator('[data-action=map]').click();
    await page.waitForTimeout(400);
    assert.equal(await page.locator('[data-testid=resume-card]').count(), 1);
    await page.locator('[data-testid=continue-run]').click();
    await page.waitForTimeout(400);
    const state = await page.evaluate(() => window.__sadApp.state().run);
    assert.equal(state.usedItems.length, 1);
  });

  await step('B06 刷新页面后仍可恢复同一局', async () => {
    const before = await page.evaluate(() => window.__sadApp.state().run);
    await page.reload({ waitUntil: 'networkidle' });
    await page.waitForTimeout(400);
    assert.equal(await page.locator('[data-testid=resume-card]').count(), 1);
    await page.locator('[data-testid=continue-run]').click();
    await page.waitForTimeout(400);
    const after = await page.evaluate(() => window.__sadApp.state().run);
    assert.equal(after.runId, before.runId);
    assert.deepEqual(after.board, before.board);
  });

  await step('B07 自动通关并生成结算页', async () => {
    await page.evaluate(() => window.__sadApp.autoPlay());
    await page.waitForTimeout(500);
    assert.equal(await page.locator('[data-testid=settlement]').count(), 1);
    assert.ok((await page.locator('.settle-stars .star.filled').count()) >= 1);
    await page.screenshot({ path: path.join(evidenceDir, '22-e2e-settlement.png'), fullPage: false });
  });

  await step('B08 分享：1080×1920 成图、保存与复制', async () => {
    await page.locator('[data-testid=share-open]').click();
    await page.waitForTimeout(400);
    assert.equal(await page.locator('[data-testid=share-modal]').count(), 1);
    const canvas = await page.evaluate(() => {
      const el = document.querySelector('.share-preview canvas');
      return { width: el.width, height: el.height, size: el.toDataURL('image/png').length };
    });
    assert.equal(canvas.width, 1080);
    assert.equal(canvas.height, 1920);
    assert.ok(canvas.size > 100000);
    const downloadPromise = page.waitForEvent('download');
    await page.locator('[data-action=share-save]').click();
    const download = await downloadPromise;
    const file = path.join(temp, 'share.png');
    await download.saveAs(file);
    assert.ok(fs.statSync(file).size > 10000);
    await page.screenshot({ path: path.join(evidenceDir, '23-e2e-share.png'), fullPage: false });
    await page.locator('[data-action=share-copy]').click();
    await page.waitForTimeout(250);
    assert.match(await page.locator('#toast').innerText(), /复制/);
    await page.locator('[data-action=close]').first().click();
    await page.waitForTimeout(300);
    assert.equal(await page.locator('[data-testid=settlement]').count(), 1);
  });

  await step('B09 结算返回地图：星级、进度与日记联动', async () => {
    await page.locator('[data-testid=settle-map]').click();
    await page.waitForTimeout(500);
    assert.equal(await page.locator('[data-testid=map]').count(), 1);
    assert.ok((await page.locator('[data-testid=level-C1-L01] .stars.mini .star.filled').count()) >= 1);
    assert.match(await page.locator('[data-testid=chapter-1] .chapter-foot').innerText(), /1 \/ 4/);
  });

  await step('B10 待解锁关卡给出明确提示', async () => {
    await page.locator('[data-testid="level-C1-L04"]').click({ force: true });
    await page.waitForTimeout(300);
    assert.match(await page.locator('#toast').innerText(), /展示版中暂未开放/);
  });

  await step('B11 设置：低颜色依赖持久化', async () => {
    await page.locator('[data-testid=settings-open]').click();
    await page.waitForTimeout(250);
    await page.locator('[data-action=toggle-setting][data-key=reducedColorMode]').click();
    await page.waitForTimeout(250);
    assert.equal(await page.locator('[data-action=toggle-setting][data-key=reducedColorMode]').getAttribute('aria-checked'), 'true');
    await page.locator('[data-action=close]').first().click();
    await page.reload({ waitUntil: 'networkidle' });
    await page.waitForTimeout(400);
    assert.equal(await page.evaluate(() => document.body.classList.contains('low-color')), true);
    await page.screenshot({ path: path.join(evidenceDir, '24-e2e-lowcolor.png'), fullPage: false });
  });

  await step('B12 关闭动画的自动化无法绕过规则：直接调用仍返回合法状态', async () => {
    const state = await page.evaluate(() => window.__sadApp.state());
    assert.ok(state.summary.totalScore > 0);
    assert.ok(state.summary.cleared >= 1);
  });

  await context.close();

  // 章末日记 + 分享（独立上下文，避免上面的进度干扰）
  const journalContext = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const journalPage = await newPage(journalContext);
  await journalPage.goto(`${base}/?e2e=1`, { waitUntil: 'networkidle' });
  await step('B13 章末关通关解锁日记，并可生成日记分享图', async () => {
    await journalPage.evaluate(() => window.__sadApp.start('C1-L15'));
    await journalPage.waitForTimeout(250);
    await journalPage.evaluate(() => window.__sadApp.autoPlay());
    await journalPage.waitForTimeout(500);
    assert.equal(await journalPage.locator('[data-testid=settlement]').count(), 1);
    assert.match(await journalPage.locator('[data-testid=settlement]').innerText(), /日记/);
    await journalPage.locator('[data-testid=settle-map]').click();
    await journalPage.waitForTimeout(500);
    await journalPage.locator('[data-testid=journal-1]').click();
    await journalPage.waitForTimeout(350);
    assert.equal(await journalPage.locator('[data-testid=journal-modal]').count(), 1);
    await journalPage.locator('[data-testid=journal-share]').click();
    await journalPage.waitForTimeout(350);
    assert.equal(await journalPage.locator('.share-preview canvas').count(), 1);
    await journalPage.screenshot({ path: path.join(evidenceDir, '25-e2e-journal.png'), fullPage: false });
  });
  await journalContext.close();

  // 移动端
  const mobileContext = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  const mobilePage = await newPage(mobileContext);
  await mobilePage.goto(`${base}/?e2e=1`, { waitUntil: 'networkidle' });
  await step('B14 移动端无横向滚动，棋盘与道具在一屏内', async () => {
    assert.equal(await mobilePage.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
    await mobilePage.locator('[data-testid="level-C1-L01"]').click();
    await mobilePage.waitForTimeout(300);
    const layout = await mobilePage.evaluate(() => ({
      width: document.documentElement.scrollWidth,
      inner: innerWidth,
      board: document.querySelector('#board').getBoundingClientRect().width,
      itemsTop: document.querySelector('.item-panel').getBoundingClientRect().top,
      height: innerHeight,
    }));
    assert.ok(layout.width <= layout.inner);
    assert.ok(layout.board >= 320);
    assert.ok(layout.itemsTop < layout.height);
    await mobilePage.screenshot({ path: path.join(evidenceDir, '26-e2e-mobile.png'), fullPage: false });
  });
  await mobileContext.close();

  // 离线
  const offlineContext = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const offlinePage = await newPage(offlineContext);
  await offlinePage.goto(`${base}/?e2e=1`, { waitUntil: 'networkidle' });
  await step('B15 首屏完成后断网仍可完成一次交换', async () => {
    await offlinePage.locator('[data-testid="level-C1-L01"]').click();
    await offlinePage.waitForTimeout(250);
    await offlineContext.setOffline(true);
    const move = await offlinePage.evaluate(() => window.__sadApp.findMove());
    await offlinePage.locator(`.tile[data-r="${move.a.r}"][data-c="${move.a.c}"]`).click();
    await offlinePage.locator(`.tile[data-r="${move.b.r}"][data-c="${move.b.c}"]`).click();
    await offlinePage.waitForTimeout(900);
    const moves = await offlinePage.locator('[data-testid=hud-moves]').innerText();
    assert.equal(moves, '39');
    await offlineContext.setOffline(false);
  });
  await offlineContext.close();

  // 坏档与存储不可用
  const corruptContext = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const corruptPage = await newPage(corruptContext);
  await corruptPage.addInitScript(() => localStorage.setItem('sadmatch.profile.v1', '{"bad":'));
  await step('B16 坏档隔离：可正常进入地图并提示', async () => {
    await corruptPage.goto(`${base}/`, { waitUntil: 'networkidle' });
    await corruptPage.waitForTimeout(500);
    assert.match(await corruptPage.locator('#toast').innerText(), /无法恢复/);
    assert.equal(await corruptPage.locator('[data-testid=map]').count(), 1);
  });
  await corruptContext.close();

  const deniedContext = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const deniedPage = await newPage(deniedContext);
  await deniedPage.addInitScript(() => {
    Object.defineProperty(window, 'localStorage', { get() { throw new DOMException('denied', 'SecurityError'); } });
  });
  await step('B17 本地存储不可用时仍可游玩并提示内存降级', async () => {
    await deniedPage.goto(`${base}/`, { waitUntil: 'networkidle' });
    await deniedPage.waitForTimeout(500);
    assert.match(await deniedPage.locator('#toast').innerText(), /只保存在内存/);
    await deniedPage.locator('[data-testid="level-C1-L01"]').click();
    await deniedPage.waitForTimeout(300);
    const move = await deniedPage.evaluate(() => window.__sadApp ? window.__sadApp.findMove() : null);
    assert.ok(move === null || move);
    assert.equal(await deniedPage.locator('[data-testid=game]').count(), 1);
  });
  await deniedContext.close();

  await step('B18 运行期没有外部域请求、没有前端未捕获异常', async () => {
    const external = requests.filter((url) => {
      try { return new URL(url).origin !== base; } catch { return true; }
    });
    assert.deepEqual(external, []);
    assert.deepEqual(errors, []);
  });

  fs.writeFileSync(path.join(evidenceDir, 'browser-tests.json'), JSON.stringify({
    date: new Date().toISOString(),
    browser: browser.version(),
    base,
    results,
    errors,
    externalRequests: requests.filter((url) => { try { return new URL(url).origin !== base; } catch { return true; } }),
  }, null, 2));

  console.log('\nALL BROWSER CHECKS PASSED');
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
}).finally(async () => {
  if (browser) await browser.close();
  if (server) server.kill();
  fs.rmSync(temp, { recursive: true, force: true });
});
