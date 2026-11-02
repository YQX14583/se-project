/**
 * 方块的双重编码：每种颜色固定绑定一种形状。
 * 关闭颜色或色觉缺陷时，仍可只凭形状辨认（NFR-09 / AC-21）。
 */
export const TILE_TYPES = [
  {
    key: 'coral', name: '珊瑚', shape: 'circle', color: '#ff9a86', deep: '#e8745d',
    label: '珊瑚色圆形', glyph: '●',
  },
  {
    key: 'amber', name: '琥珀', shape: 'diamond', color: '#f6c85f', deep: '#d9a52f',
    label: '琥珀色菱形', glyph: '◆',
  },
  {
    key: 'mint', name: '薄荷', shape: 'leaf', color: '#66d7b4', deep: '#34ab88',
    label: '薄荷色叶片', glyph: '❧',
  },
  {
    key: 'sky', name: '天青', shape: 'drop', color: '#74b9ef', deep: '#3f8dcc',
    label: '天青色水滴', glyph: '◈',
  },
  {
    key: 'lilac', name: '丁香', shape: 'star', color: '#b9a3ee', deep: '#8a6fd1',
    label: '丁香色星形', glyph: '★',
  },
  {
    key: 'rose', name: '玫瑰', shape: 'flower', color: '#f39ab8', deep: '#d66b91',
    label: '玫瑰色花朵', glyph: '✿',
  },
];

export const SHAPE_PATHS = {
  circle: '<circle cx="50" cy="50" r="28"/>',
  diamond: '<path d="M50 16 84 50 50 84 16 50Z"/>',
  leaf: '<path d="M27 70C27 41 47 22 78 22c0 31-19 51-47 51-2 0-3-1-4-3Z"/><path d="M31 68c12-15 25-24 39-30" fill="none" stroke="#fff" stroke-opacity=".55" stroke-width="5" stroke-linecap="round"/>',
  drop: '<path d="M50 16c13 17 26 31 26 43a26 26 0 1 1-52 0c0-12 13-26 26-43Z"/>',
  star: '<path d="m50 15 10.6 22.7 24.9 3.2-18.3 17.2 4.8 24.6L50 71.2 27.9 82.7l4.8-24.6L14.5 40.9l24.9-3.2Z"/>',
  flower: '<circle cx="50" cy="28" r="14"/><circle cx="72" cy="44" r="14"/><circle cx="64" cy="70" r="14"/><circle cx="36" cy="70" r="14"/><circle cx="28" cy="44" r="14"/><circle cx="50" cy="50" r="11" fill="#fff" fill-opacity=".9"/>',
};

export function tileType(color) {
  return TILE_TYPES[color];
}

export function shapeLabel(color) {
  return TILE_TYPES[color]?.label ?? '未知方块';
}

export function svgForColor(color) {
  const type = TILE_TYPES[color];
  return `<svg viewBox="0 0 100 100" aria-hidden="true" focusable="false" class="tile-art"><g fill="currentColor">${SHAPE_PATHS[type.shape]}</g></svg>`;
}
