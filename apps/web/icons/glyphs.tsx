import type { CSSProperties } from 'react';

/**
 * Small monochrome utility glyphs (chevrons, close, edit …) drawn on a 24px grid with a 2px
 * rounded stroke. They inherit `currentColor` so they sit quietly next to text. Visitor-facing
 * discovery uses the illustrated WayIcon family instead.
 */
const paths: Record<string, string> = {
  chevronLeft: 'M15 18l-6-6 6-6',
  chevronRight: 'M9 18l6-6-6-6',
  chevronDown: 'M6 9l6 6 6-6',
  chevronUp: 'M18 15l-6-6-6 6',
  arrowLeft: 'M19 12H5M11 18l-6-6 6-6',
  arrowRight: 'M5 12h14M13 6l6 6-6 6',
  arrowUp: 'M12 19V5M6 11l6-6 6 6',
  arrowUpRight: 'M7 17L17 7M8 7h9v9',
  turnLeft: 'M18 20v-7a4 4 0 0 0-4-4H6M10 5L6 9l4 4',
  turnRight: 'M6 20v-7a4 4 0 0 1 4-4h8M14 5l4 4-4 4',
  slightLeft: 'M16 20v-6L8 6M8 12V6h6',
  slightRight: 'M8 20v-6l8-8M16 12V6h-6',
  close: 'M18 6L6 18M6 6l12 12',
  plus: 'M12 5v14M5 12h14',
  minus: 'M5 12h14',
  check: 'M20 6L9 17l-5-5',
  edit: 'M4 20h4L19 9l-4-4L4 16zM13.5 6.5l4 4',
  trash: 'M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3',
  search: 'M11 18a7 7 0 1 1 0-14 7 7 0 0 1 0 14zM20 20l-4-4',
  menu: 'M4 7h16M4 12h16M4 17h16',
  refresh: 'M20 11a8 8 0 0 0-14.9-3M4 5v4h4M4 13a8 8 0 0 0 14.9 3M20 19v-4h-4',
  upload: 'M12 16V4M7 9l5-5 5 5M4 17v3h16v-3',
  download: 'M12 4v12M7 11l5 5 5-5M4 17v3h16v-3',
  eye: 'M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12zM12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6z',
  eyeOff:
    'M3 3l18 18M10.6 5.1A11.4 11.4 0 0 1 12 5c6.4 0 10 7 10 7a15.3 15.3 0 0 1-3.2 3.8M6.2 6.2C3.5 8.2 2 12 2 12s3.6 7 10 7c1.4 0 2.7-.3 3.8-.8M9.9 9.9a3 3 0 0 0 4.2 4.2',
  mail: 'M3 5h18v14H3zM3 7l9 7 9-7',
  lock: 'M6 11h12v10H6zM8 11V8a4 4 0 0 1 8 0v3',
  logout: 'M15 4h4v16h-4M10 16l4-4-4-4M14 12H4',
  filter: 'M4 5h16l-6 8v6l-4-2v-4z',
  layers: 'M12 3l9 5-9 5-9-5zM3 13l9 5 9-5M3 17.5l9 5 9-5',
  cube: 'M12 3l8 4.5v9L12 21l-8-4.5v-9zM12 12l8-4.5M12 12v9M12 12L4 7.5',
  map: 'M9 4L3 6v14l6-2 6 2 6-2V4l-6 2zM9 4v14M15 6v14',
  zoomIn: 'M11 18a7 7 0 1 1 0-14 7 7 0 0 1 0 14zM20 20l-4-4M11 8v6M8 11h6',
  zoomOut: 'M11 18a7 7 0 1 1 0-14 7 7 0 0 1 0 14zM20 20l-4-4M8 11h6',
  locate:
    'M12 19a7 7 0 1 0 0-14 7 7 0 0 0 0 14zM12 2v3M12 19v3M2 12h3M19 12h3M12 14a2 2 0 1 0 0-4 2 2 0 0 0 0 4z',
  expand: 'M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5',
  compress: 'M9 4v5H4M15 4v5h5M9 20v-5H4M15 20v-5h5',
  explode: 'M12 2l7 3.5-7 3.5-7-3.5zM5 11.5l7 3.5 7-3.5M5 18l7 3.5 7-3.5',
  play: 'M7 4l13 8-13 8z',
  pause: 'M7 4h4v16H7zM13 4h4v16h-4z',
  replay: 'M3 12a9 9 0 1 0 3-6.7M3 4v5h5',
  clock: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM12 7v5l3 2',
  calendar: 'M4 6h16v14H4zM4 10h16M8 3v5M16 3v5',
  star: 'M12 3l2.8 5.7 6.2.9-4.5 4.4 1 6.2L12 17.3 6.5 20.2l1-6.2L3 9.6l6.2-.9z',
  heart: 'M12 20s-8-4.6-8-10.2A4.8 4.8 0 0 1 12 7a4.8 4.8 0 0 1 8 2.8C20 15.4 12 20 12 20z',
  share:
    'M18 8a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM6 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM18 22a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM8.6 13.5l6.8 4M15.4 6.5l-6.8 4',
  globe:
    'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM3 12h18M12 3c2.5 2.5 3.8 5.5 3.8 9s-1.3 6.5-3.8 9c-2.5-2.5-3.8-5.5-3.8-9S9.5 5.5 12 3z',
  external: 'M14 4h6v6M20 4l-9 9M18 14v6H4V6h6',
  alert: 'M12 3l10 18H2zM12 10v4M12 17.5v.5',
  info: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM12 11v6M12 7.5v.5',
  wifiOff:
    'M3 3l18 18M8.5 16.4a5 5 0 0 1 7 0M5 12.9a10 10 0 0 1 4.2-2.5M12 20h.01M16.7 10.6A10 10 0 0 1 19 12.9M2 9.3a15 15 0 0 1 4.3-2.8M10.7 5.1A15 15 0 0 1 22 9.3',
  wifi: 'M5 12.9a10 10 0 0 1 14 0M8.5 16.4a5 5 0 0 1 7 0M2 9.3a15 15 0 0 1 20 0M12 20h.01',
  user: 'M12 12a4.5 4.5 0 1 0 0-9 4.5 4.5 0 0 0 0 9zM4 21a8 8 0 0 1 16 0',
  users:
    'M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM2 21a7 7 0 0 1 14 0M16 3.5a4 4 0 0 1 0 7.5M18 14a6 6 0 0 1 4 7',
  settings:
    'M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z',
  dashboard: 'M4 4h7v9H4zM13 4h7v5h-7zM13 11h7v9h-7zM4 15h7v5H4z',
  chart: 'M4 20V10M10 20V4M16 20v-7M22 20H2',
  monitor: 'M3 4h18v12H3zM8 20h8M12 16v4',
  car: 'M5 17H3v-6l2-5h14l2 5v6h-2M5 17h14M5 17v2h3v-2M16 17v2h3v-2M5 11h14M7 14h.01M17 14h.01',
  creditCard: 'M3 6h18v12H3zM3 11h18M7 15h4',
  lift: 'M4 3h16v18H4zM12 10v11M8 15v-5M16 15v-5M9 7l3-3 3 3',
  escalator: 'M2 19h6l8-12h6M8 19l8-12M3 7h4M17 19h4',
  stairs: 'M2 20h5v-5h5v-5h5V5h5',
  megaphone: 'M3 11v3h3l7 5V6L6 11zM17 9a4 4 0 0 1 0 7M20 6.5a8 8 0 0 1 0 12',
  image: 'M4 5h16v14H4zM4 16l5-5 4 4 3-3 4 4M15.5 9.5h.01',
  route:
    'M6 19a2 2 0 1 0 0-4 2 2 0 0 0 0 4zM18 9a2 2 0 1 0 0-4 2 2 0 0 0 0 4zM6 15V9a3 3 0 0 1 3-3h1M18 9v6a3 3 0 0 1-3 3h-1',
  building: 'M4 21V5l8-3 8 3v16M9 21v-4h6v4M8 8h.01M12 8h.01M16 8h.01M8 12h.01M12 12h.01M16 12h.01',
  tag: 'M3 12V4h8l10 10-8 8zM7.5 8.5h.01',
  store:
    'M4 9l1.5-5h13L20 9M4 9h16v11H4zM4 9a2.7 2.7 0 0 0 5.3 0 2.7 2.7 0 0 0 5.4 0 2.7 2.7 0 0 0 5.3 0M10 20v-5h4v5',
  grid: 'M4 4h6v6H4zM14 4h6v6h-6zM4 14h6v6H4zM14 14h6v6h-6z',
  pin: 'M12 22s7-6.5 7-12a7 7 0 1 0-14 0c0 5.5 7 12 7 12zM12 12.5a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5z',
  node: 'M12 16a4 4 0 1 0 0-8 4 4 0 0 0 0 8z',
  link: 'M9 15l6-6M10.5 5.5l1.2-1.2a4.5 4.5 0 0 1 6.4 6.4l-1.2 1.2M13.5 18.5l-1.2 1.2a4.5 4.5 0 0 1-6.4-6.4l1.2-1.2',
  cursor: 'M5 3l14 8-6 1.5L10 19z',
  move: 'M12 3v18M3 12h18M12 3l-3 3M12 3l3 3M12 21l-3-3M12 21l3-3M3 12l3-3M3 12l3 3M21 12l-3-3M21 12l-3 3',
  shield: 'M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6z',
  history: 'M3 12a9 9 0 1 0 3-6.7M3 4v5h5M12 7v5l3 2',
  palette:
    'M12 3a9 9 0 0 0 0 18c1.5 0 2-1 2-2s-1-1.5-1-2.5S14 15 15 15h2a4 4 0 0 0 4-4c0-4.4-4-8-9-8zM7.5 11h.01M10 7.5h.01M15 7.5h.01',
  keyboard: 'M3 6h18v12H3zM7 10h.01M11 10h.01M15 10h.01M7 14h10',
  backspace: 'M21 5H9l-6 7 6 7h12zM17 9l-6 6M11 9l6 6',
  mic: 'M12 15a3 3 0 0 0 3-3V6a3 3 0 0 0-6 0v6a3 3 0 0 0 3 3zM19 11a7 7 0 0 1-14 0M12 18v3',
  accessibility: 'M12 6a2 2 0 1 0 0-4 2 2 0 0 0 0 4zM5 9l7 1 7-1M12 10v5l-3 6M12 15l3 6',
  contrast: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM12 3v18a9 9 0 0 0 0-18z',
  textSize: 'M4 18l5-12 5 12M5.5 14h7M15 18l3-7 3 7M15.8 16h4.4',
  qr: 'M4 4h6v6H4zM14 4h6v6h-6zM4 14h6v6H4zM14 14h2v2h-2zM18 14h2v2h-2zM14 18h2v2h-2zM18 18h2v2h-2z',
  phone: 'M7 2h10v20H7zM11 18h2',
  key: 'M15 7a4 4 0 1 1-3.9 5H3v3h3v3h3v-3h2.1A4 4 0 0 1 15 7z',
  copy: 'M9 9h11v11H9zM5 15H4V4h11v1',
  dot: 'M12 14a2 2 0 1 0 0-4 2 2 0 0 0 0 4z',
};

export type GlyphName = keyof typeof paths;

export function Glyph({
  name,
  size = 20,
  strokeWidth = 2,
  className,
  style,
  title,
}: {
  name: GlyphName | string;
  size?: number;
  strokeWidth?: number;
  className?: string;
  style?: CSSProperties;
  title?: string;
}) {
  const filled = name === 'play' || name === 'star' || name === 'dot';
  return (
    <svg
      viewBox="0 0 24 24"
      width={size}
      height={size}
      fill={filled ? 'currentColor' : 'none'}
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className ? `glyph ${className}` : 'glyph'}
      style={style}
      aria-hidden={title ? undefined : true}
      role={title ? 'img' : undefined}
      focusable="false"
    >
      {title ? <title>{title}</title> : null}
      <path d={paths[name] ?? paths.dot} />
    </svg>
  );
}
