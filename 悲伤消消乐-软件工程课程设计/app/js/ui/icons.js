/** 内联 SVG 图标，避免任何外部资源请求。 */
const PATHS = {
  moon: '<path d="M20 14.5A8.5 8.5 0 0 1 9.5 4a8.5 8.5 0 1 0 10.5 10.5Z"/>',
  sun: '<circle cx="12" cy="12" r="4.2"/><path d="M12 2v2.4M12 19.6V22M2 12h2.4M19.6 12H22M4.9 4.9l1.7 1.7M17.4 17.4l1.7 1.7M19.1 4.9l-1.7 1.7M6.6 17.4l-1.7 1.7" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>',
  star: '<path d="m12 3 2.7 5.5 6.1.9-4.4 4.3 1 6.1-5.4-2.9L6.6 19.8l1-6.1L3.2 9.4l6.1-.9Z"/>',
  lock: '<rect x="5" y="10" width="14" height="10" rx="2.5"/><path d="M8 10V7a4 4 0 0 1 8 0v3" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>',
  play: '<path d="M8 5.5v13l10-6.5Z"/>',
  settings: '<circle cx="12" cy="12" r="3.1"/><path d="M12 2.8v2.1M12 19.1v2.1M2.8 12h2.1M19.1 12h2.1M5.4 5.4l1.5 1.5M17.1 17.1l1.5 1.5M18.6 5.4l-1.5 1.5M6.9 17.1l-1.5 1.5" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>',
  back: '<path d="M15 5 8 12l7 7" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/>',
  pause: '<rect x="7" y="5" width="3.4" height="14" rx="1.5"/><rect x="13.6" y="5" width="3.4" height="14" rx="1.5"/>',
  cloud: '<path d="M7.2 18.5h9.7a4 4 0 0 0 .5-8 5.6 5.6 0 0 0-10.7 1.2 3.4 3.4 0 0 0 .5 6.8Z"/>',
  wind: '<path d="M3 8h10.2a2.8 2.8 0 1 0-2.5-4.1M3 12h15a2.5 2.5 0 1 1-2.2 3.7M3 16h7.5a2.2 2.2 0 1 1-1.9 3.3" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round"/>',
  hug: '<path d="M12 20s-7.5-4.3-7.5-9.1A4.2 4.2 0 0 1 12 8a4.2 4.2 0 0 1 7.5 2.9C19.5 15.7 12 20 12 20Z"/>',
  resonance: '<circle cx="8" cy="12" r="2.4"/><circle cx="16" cy="8" r="2.4"/><circle cx="16" cy="16" r="2.4"/><path d="M10.2 10.9 13.8 9M10.2 13.1l3.6 1.9" stroke="currentColor" stroke-width="1.5"/>',
  ventilate: '<path d="M4 8h9.5a3 3 0 1 0-2.7-4.3M4 12h13a2.6 2.6 0 1 1-2.3 3.8M4 16h5.6a2 2 0 1 1-1.8 3" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round"/>',
  share: '<circle cx="6" cy="12" r="2.3"/><circle cx="17.5" cy="6" r="2.3"/><circle cx="17.5" cy="18" r="2.3"/><path d="m8.1 10.9 7.3-3.8M8.1 13.1l7.3 3.8" stroke="currentColor" stroke-width="1.6"/>',
  download: '<path d="M12 4v10m0 0 4-4m-4 4-4-4M5 19h14" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"/>',
  copy: '<rect x="8" y="8" width="11" height="12" rx="2"/><path d="M16 8V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h2" fill="none" stroke="currentColor" stroke-width="1.7"/>',
  close: '<path d="M6 6l12 12M18 6 6 18" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>',
  check: '<path d="m4.5 12.5 5 5 10-11" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/>',
  sparkle: '<path d="m12 2 1.7 6.3L20 10l-6.3 1.7L12 18l-1.7-6.3L4 10l6.3-1.7Z"/><path d="m19 16 .8 2.2L22 19l-2.2.8L19 22l-.8-2.2L16 19l2.2-.8Z"/>',
  book: '<path d="M4 5.5A2.5 2.5 0 0 1 6.5 3H20v16H6.5A2.5 2.5 0 0 0 4 21.5Z" fill="none" stroke="currentColor" stroke-width="1.8"/><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" fill="none" stroke="currentColor" stroke-width="1.8"/>',
  volume: '<path d="M4 9v6h3.5L13 20V4L7.5 9Z"/><path d="M16.5 8.5a5 5 0 0 1 0 7M19 6a8.5 8.5 0 0 1 0 12" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>',
  music: '<path d="M9 18V6l10-2v12" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/><circle cx="6.5" cy="18" r="2.5"/><circle cx="16.5" cy="16" r="2.5"/>',
  palette: '<path d="M12 3a9 9 0 0 0 0 18c1.6 0 2.3-1 1.8-2.2-.6-1.4.2-2.8 1.8-2.8h1.6A4 4 0 0 0 21 12a9 9 0 0 0-9-9Z" fill="none" stroke="currentColor" stroke-width="1.8"/><circle cx="7.5" cy="10" r="1.2"/><circle cx="12" cy="7" r="1.2"/><circle cx="16.5" cy="9.5" r="1.2"/>',
  trash: '<path d="M5 7h14M10 4h4l1 3H9ZM7 7l1 13h8l1-13M10 11v5M14 11v5" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>',
  chevron: '<path d="m9 5 7 7-7 7" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>',
  heart: '<path d="M12 20s-7.5-4.3-7.5-9.1A4.2 4.2 0 0 1 12 8a4.2 4.2 0 0 1 7.5 2.9C19.5 15.7 12 20 12 20Z"/>',
  info: '<circle cx="12" cy="12" r="9" fill="none" stroke="currentColor" stroke-width="1.8"/><path d="M12 10.5V17M12 7.2v.2" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>',
  replay: '<path d="M4 12a8 8 0 1 0 2.3-5.7M4 4v5h5" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>',
  arrow: '<path d="M4 12h15m0 0-5-5m5 5-5 5" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>',
};

export function icon(name, className = '') {
  const path = PATHS[name] ?? PATHS.sparkle;
  return `<svg class="icon ${className}" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" focusable="false">${path}</svg>`;
}
