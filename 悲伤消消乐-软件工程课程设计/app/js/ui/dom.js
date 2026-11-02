import { ITEMS } from '../core/rules.js';
import { icon } from './icons.js';

export function escapeHtml(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

export function formatNumber(value) {
  return Math.round(Number(value) || 0).toLocaleString('zh-CN');
}

export function formatTime(ms) {
  const total = Math.max(0, Math.floor((ms ?? 0) / 1000));
  const minutes = Math.floor(total / 60);
  const seconds = total % 60;
  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
}

export function sleep(ms) {
  return new Promise((resolve) => { setTimeout(resolve, ms); });
}

export function starsHtml(stars, { className = '', empty = true } = {}) {
  let out = `<span class="stars ${className}" aria-label="${stars} 星">`;
  for (let i = 1; i <= 3; i += 1) {
    out += `<span class="star ${i <= stars ? 'filled' : empty ? 'empty' : 'hidden'}">${icon('star')}</span>`;
  }
  return `${out}</span>`;
}

const ITEM_ICONS = {
  breathe: 'wind',
  hug: 'hug',
  resonate: 'resonance',
  ventilate: 'ventilate',
};

export function itemIcon(type, className = '') {
  return icon(ITEM_ICONS[type] ?? 'sparkle', className);
}

export function itemName(type) {
  return ITEMS[type]?.name ?? type;
}
