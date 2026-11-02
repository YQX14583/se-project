import { CHAPTERS } from '../core/levels.js';
import { hashString, mulberry32 } from '../core/rng.js';

const W = 1080;
const H = 1920;

function roundRect(ctx, x, y, width, height, radius) {
  const r = Math.min(radius, width / 2, height / 2);
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + width, y, x + width, y + height, r);
  ctx.arcTo(x + width, y + height, x, y + height, r);
  ctx.arcTo(x, y + height, x, y, r);
  ctx.arcTo(x, y, x + width, y, r);
  ctx.closePath();
}

function wrapText(ctx, text, x, y, maxWidth, lineHeight, maxLines = 4) {
  const chars = [...text];
  let line = '';
  let lineIndex = 0;
  for (const char of chars) {
    const test = line + char;
    if (ctx.measureText(test).width > maxWidth && line) {
      ctx.fillText(line, x, y + lineIndex * lineHeight);
      line = char;
      lineIndex += 1;
      if (lineIndex >= maxLines) return y + (lineIndex - 1) * lineHeight;
    } else {
      line = test;
    }
  }
  if (line && lineIndex < maxLines) {
    ctx.fillText(line, x, y + lineIndex * lineHeight);
    lineIndex += 1;
  }
  return y + (lineIndex - 1) * lineHeight;
}

function drawStar(ctx, cx, cy, outer, inner, points = 5) {
  ctx.beginPath();
  for (let i = 0; i < points * 2; i += 1) {
    const radius = i % 2 === 0 ? outer : inner;
    const angle = (Math.PI / points) * i - Math.PI / 2;
    const x = cx + Math.cos(angle) * radius;
    const y = cy + Math.sin(angle) * radius;
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  }
  ctx.closePath();
}

export function pickQuote(settlement, chapterNumber) {
  const chapter = CHAPTERS[Math.max(0, Math.min(4, chapterNumber - 1))];
  const index = hashString(settlement.runId ?? `${settlement.levelId}:${settlement.score}`) % chapter.quotes.length;
  return chapter.quotes[index];
}

export function createShareArtifact({ settlement, level }) {
  const chapter = CHAPTERS[level.chapter - 1];
  const quote = pickQuote(settlement, level.chapter);
  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext('2d');
  const rng = mulberry32(hashString(settlement.runId ?? level.id));

  // 底色：深夜到章节色的微光
  const bg = ctx.createLinearGradient(0, 0, 0, H);
  bg.addColorStop(0, '#080c1c');
  bg.addColorStop(0.46, '#111a35');
  bg.addColorStop(0.78, '#1d233f');
  bg.addColorStop(1, '#0b1022');
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, W, H);

  // 星点
  for (let i = 0; i < 90; i += 1) {
    const x = rng() * W;
    const y = rng() * H * 0.62;
    const r = 0.8 + rng() * 2.2;
    ctx.globalAlpha = 0.12 + rng() * 0.5;
    ctx.fillStyle = '#dfe8ff';
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.globalAlpha = 1;

  // 中央光晕
  const glow = ctx.createRadialGradient(540, 700, 20, 540, 700, 520);
  glow.addColorStop(0, `${chapter.accent}88`);
  glow.addColorStop(0.45, `${chapter.accent}22`);
  glow.addColorStop(1, `${chapter.accent}00`);
  ctx.fillStyle = glow;
  ctx.fillRect(0, 120, W, 1200);

  // 太阳
  const sunY = 610;
  ctx.save();
  ctx.translate(540, sunY);
  ctx.strokeStyle = 'rgba(255, 236, 190, .45)';
  ctx.lineWidth = 3;
  for (let i = 0; i < 28; i += 1) {
    const angle = (Math.PI * 2 * i) / 28;
    const inner = 190 + (i % 3) * 7;
    const outer = 238 + (i % 4) * 9;
    ctx.beginPath();
    ctx.moveTo(Math.cos(angle) * inner, Math.sin(angle) * inner);
    ctx.lineTo(Math.cos(angle) * outer, Math.sin(angle) * outer);
    ctx.stroke();
  }
  const sunGrad = ctx.createRadialGradient(-30, -40, 20, 0, 0, 170);
  sunGrad.addColorStop(0, '#fff8dd');
  sunGrad.addColorStop(0.55, '#ffd98a');
  sunGrad.addColorStop(1, '#e9a85a');
  ctx.fillStyle = sunGrad;
  ctx.beginPath();
  ctx.arc(0, 0, 150, 0, Math.PI * 2);
  ctx.fill();
  ctx.globalAlpha = 0.18;
  ctx.fillStyle = '#fff';
  ctx.beginPath();
  ctx.arc(-46, -54, 38, 0, Math.PI * 2);
  ctx.fill();
  ctx.globalAlpha = 1;
  ctx.restore();

  // 品牌
  ctx.fillStyle = 'rgba(232, 238, 255, .78)';
  ctx.font = '500 30px "PingFang SC", "Hiragino Sans GB", "Microsoft YaHei", sans-serif';
  ctx.textAlign = 'left';
  ctx.fillText('悲伤消消乐', 84, 106);
  ctx.textAlign = 'right';
  ctx.fillStyle = `${chapter.accent}dd`;
  ctx.fillText(`第 ${level.chapter} 章 · ${chapter.title}`, W - 84, 106);

  // 关卡名
  ctx.textAlign = 'center';
  ctx.fillStyle = '#f5f0e6';
  ctx.font = '600 92px "Songti SC", "Noto Serif SC", "STSong", serif';
  ctx.fillText(level.name, 540, 935);

  ctx.fillStyle = 'rgba(231, 236, 252, .62)';
  ctx.font = '400 30px "PingFang SC", "Hiragino Sans GB", "Microsoft YaHei", sans-serif';
  ctx.fillText(`第 ${level.index} 关 · ${settlement.stars} 星放晴`, 540, 1002);

  // 三星
  const starY = 1110;
  for (let i = 0; i < 3; i += 1) {
    const filled = i < settlement.stars;
    ctx.save();
    ctx.translate(540 + (i - 1) * 92, starY);
    drawStar(ctx, 0, 0, 34, 15);
    if (filled) {
      const g = ctx.createLinearGradient(0, -34, 0, 34);
      g.addColorStop(0, '#ffe9a8');
      g.addColorStop(1, '#e9a94f');
      ctx.fillStyle = g;
    } else {
      ctx.fillStyle = 'rgba(255,255,255,.10)';
    }
    ctx.fill();
    ctx.strokeStyle = filled ? 'rgba(255, 240, 190, .8)' : 'rgba(255,255,255,.18)';
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.restore();
  }

  // 情绪文案
  ctx.fillStyle = '#efe7d8';
  ctx.font = '400 42px "Songti SC", "Noto Serif SC", "STSong", serif';
  const quoteBottom = wrapText(ctx, quote, 540, 1280, 820, 66, 3);

  // 共鸣值
  const statY = Math.max(1450, quoteBottom + 100);
  ctx.fillStyle = 'rgba(231, 236, 252, .55)';
  ctx.font = '400 28px "PingFang SC", "Hiragino Sans GB", "Microsoft YaHei", sans-serif';
  ctx.fillText('共鸣值', 540, statY);
  const scoreGrad = ctx.createLinearGradient(0, statY + 20, 0, statY + 110);
  scoreGrad.addColorStop(0, '#fff3cb');
  scoreGrad.addColorStop(1, '#f0b87a');
  ctx.fillStyle = scoreGrad;
  ctx.font = '600 86px "Songti SC", "Noto Serif SC", "STSong", serif';
  ctx.fillText(String(settlement.score), 540, statY + 96);

  // 疗愈条
  const barY = statY + 158;
  ctx.fillStyle = 'rgba(255,255,255,.10)';
  roundRect(ctx, 200, barY, 680, 16, 8);
  ctx.fill();
  const barGrad = ctx.createLinearGradient(200, 0, 880, 0);
  barGrad.addColorStop(0, '#7fc9b0');
  barGrad.addColorStop(0.55, '#f6c85f');
  barGrad.addColorStop(1, '#ff9a86');
  ctx.fillStyle = barGrad;
  roundRect(ctx, 200, barY, 680, 16, 8);
  ctx.fill();
  ctx.fillStyle = 'rgba(231, 236, 252, .62)';
  ctx.font = '400 24px "PingFang SC", "Hiragino Sans GB", "Microsoft YaHei", sans-serif';
  ctx.textAlign = 'left';
  ctx.fillText('疗愈 100%', 200, barY + 52);
  ctx.textAlign = 'right';
  ctx.fillText(`悲伤值 0 / ${settlement.totalS0 ?? level.s0}`, 880, barY + 52);

  // 页脚
  ctx.textAlign = 'center';
  ctx.fillStyle = 'rgba(231, 236, 252, .38)';
  ctx.font = '400 26px "PingFang SC", "Hiragino Sans GB", "Microsoft YaHei", sans-serif';
  ctx.fillText('把难过，一点点消掉。', 540, 1812);
  ctx.fillStyle = 'rgba(231, 236, 252, .22)';
  ctx.font = '400 22px "PingFang SC", "Hiragino Sans GB", "Microsoft YaHei", sans-serif';
  ctx.fillText('悲伤消消乐 · 本地单机', 540, 1856);

  const text = `${level.name} · ${settlement.stars} 星放晴\n${quote}\n共鸣值 ${settlement.score} · 悲伤消消乐`;
  return {
    canvas,
    dataUrl: canvas.toDataURL('image/png'),
    text,
    quote,
    width: W,
    height: H,
  };
}

export function canvasToBlob(canvas) {
  return new Promise((resolve, reject) => {
    if (canvas.toBlob) canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error('BLOB_FAILED'))), 'image/png');
    else reject(new Error('BLOB_UNSUPPORTED'));
  });
}

export async function downloadCanvas(canvas, filename) {
  const blob = await canvasToBlob(canvas);
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
  return blob;
}

export async function copyText(text) {
  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(text);
    return true;
  }
  const area = document.createElement('textarea');
  area.value = text;
  area.setAttribute('readonly', '');
  area.style.position = 'fixed';
  area.style.opacity = '0';
  document.body.appendChild(area);
  area.select();
  const ok = document.execCommand('copy');
  area.remove();
  return ok;
}

export async function shareCanvas(canvas, text, filename) {
  if (!navigator.share) return { ok: false, code: 'SHARE_UNSUPPORTED' };
  try {
    const blob = await canvasToBlob(canvas);
    const file = new File([blob], filename, { type: 'image/png' });
    if (navigator.canShare?.({ files: [file] })) {
      await navigator.share({ files: [file], title: '悲伤消消乐', text });
      return { ok: true, method: 'files' };
    }
    await navigator.share({ title: '悲伤消消乐', text });
    return { ok: true, method: 'text' };
  } catch (error) {
    if (error?.name === 'AbortError') return { ok: false, code: 'SHARE_CANCELLED' };
    return { ok: false, code: 'SHARE_FAILED', error };
  }
}


export function createJournalArtifact(chapterNumber) {
  const chapter = CHAPTERS[Math.max(0, Math.min(4, chapterNumber - 1))];
  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext('2d');
  const rng = mulberry32(hashString(`journal:${chapter.id}`));

  const bg = ctx.createLinearGradient(0, 0, 0, H);
  bg.addColorStop(0, '#080c1c');
  bg.addColorStop(0.5, '#141c37');
  bg.addColorStop(1, '#0a0f21');
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, W, H);

  for (let i = 0; i < 70; i += 1) {
    ctx.globalAlpha = 0.12 + rng() * 0.42;
    ctx.fillStyle = '#dfe8ff';
    ctx.beginPath();
    ctx.arc(rng() * W, rng() * H * 0.7, 0.8 + rng() * 2, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.globalAlpha = 1;

  const glow = ctx.createRadialGradient(540, 560, 30, 540, 560, 480);
  glow.addColorStop(0, `${chapter.accent}66`);
  glow.addColorStop(1, `${chapter.accent}00`);
  ctx.fillStyle = glow;
  ctx.fillRect(0, 100, W, 1000);

  ctx.textAlign = 'center';
  ctx.fillStyle = `${chapter.accent}dd`;
  ctx.font = '500 30px "PingFang SC", "Hiragino Sans GB", "Microsoft YaHei", sans-serif';
  ctx.fillText('章末情绪日记', 540, 430);

  ctx.fillStyle = '#f5f0e6';
  ctx.font = '600 120px "Songti SC", "Noto Serif SC", "STSong", serif';
  ctx.fillText(chapter.title, 540, 650);

  ctx.fillStyle = 'rgba(231, 236, 252, .55)';
  ctx.font = '400 30px "PingFang SC", "Hiragino Sans GB", "Microsoft YaHei", sans-serif';
  ctx.fillText(chapter.subtitle, 540, 715);

  const line = ctx.createLinearGradient(340, 0, 740, 0);
  line.addColorStop(0, `${chapter.accent}00`);
  line.addColorStop(0.5, `${chapter.accent}aa`);
  line.addColorStop(1, `${chapter.accent}00`);
  ctx.fillStyle = line;
  ctx.fillRect(340, 790, 400, 2);

  ctx.fillStyle = '#efe7d8';
  ctx.font = '400 42px "Songti SC", "Noto Serif SC", "STSong", serif';
  const bottom = wrapText(ctx, chapter.journal, 540, 1010, 800, 72, 8);

  ctx.fillStyle = 'rgba(231, 236, 252, .72)';
  ctx.font = '400 34px "Songti SC", "Noto Serif SC", "STSong", serif';
  wrapText(ctx, `“${chapter.quotes[0]}”`, 540, Math.max(1550, bottom + 120), 760, 54, 3);

  ctx.fillStyle = 'rgba(231, 236, 252, .38)';
  ctx.font = '400 26px "PingFang SC", "Hiragino Sans GB", "Microsoft YaHei", sans-serif';
  ctx.fillText('把难过，一点点消掉。', 540, 1812);
  ctx.fillStyle = 'rgba(231, 236, 252, .22)';
  ctx.font = '400 22px "PingFang SC", "Hiragino Sans GB", "Microsoft YaHei", sans-serif';
  ctx.fillText('悲伤消消乐 · 本地单机', 540, 1856);

  return {
    canvas,
    dataUrl: canvas.toDataURL('image/png'),
    text: `第 ${chapter.id} 章 · ${chapter.title}\n${chapter.journal}\n—— 悲伤消消乐`,
    quote: chapter.quotes[0],
    width: W,
    height: H,
  };
}

export function filenameFor(level, suffix = '') {
  return `悲伤消消乐-${level.chapter}章-${level.name}${suffix}.png`;
}
