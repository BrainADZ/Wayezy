/**
 * WAY EZY wordmark geometry, traced from the supplied gradient logo (way-ezy-logo.png).
 *
 * Each letter is built from translucent ribbon strokes with horizontal cuts, exactly like the
 * source artwork, so the mark stays crisp at any size. Units: glyph height = 230.
 * Shared by the React <Logo/> component and scripts/build-assets.ts (static SVG/PNG/WebP files).
 */
export interface Ribbon {
  id: string;
  /** Polygon points "x,y x,y …" */
  points: string;
  /** Gradient stops, from the first point's end to the opposite end. */
  stops: [string, string, string?];
  /** Gradient direction: vertical (top→bottom) or horizontal (left→right). */
  axis: 'v' | 'h';
}

const W = 62; // ribbon thickness measured horizontally
const H = 230;
/** Diagonal/vertical ribbon from a top centre-x to a bottom centre-x, cut horizontally. */
const diag = (
  id: string,
  top: number,
  bottom: number,
  stops: Ribbon['stops'],
  y1 = 0,
  y2 = H,
): Ribbon => ({
  id,
  points: `${top - W / 2},${y1} ${top + W / 2},${y1} ${bottom + W / 2},${y2} ${bottom - W / 2},${y2}`,
  stops,
  axis: 'v',
});
const bar = (
  id: string,
  x1: number,
  x2: number,
  y1: number,
  y2: number,
  stops: Ribbon['stops'],
): Ribbon => ({
  id,
  points: `${x1},${y1} ${x2},${y1} ${x2},${y2} ${x1},${y2}`,
  stops,
  axis: 'h',
});

export const WORDMARK_WIDTH = 1250;
export const WORDMARK_HEIGHT = H;

export const ribbons: Ribbon[] = [
  // W
  diag('w1', 32, 102, ['#16c8ff', '#3a78ff', '#6a5cff']),
  diag('w2', 180, 102, ['#c592ff', '#8a4dff']),
  diag('w3', 180, 250, ['#2bb3ff', '#3f68ff']),
  // A (shares its left leg with the last W stroke)
  diag('a1', 350, 250, ['#0fc6ff', '#5aa2ff', '#9ab8ff']),
  diag('a2', 350, 430, ['#2e8cff', '#5a5cff', '#7c3cff']),
  bar('a3', 300, 405, 128, 178, ['#9a6bff', '#7c4dff']),
  // Y
  diag('y1', 420, 510, ['#ffc13a', '#ff7a55', '#ff4fb4'], 0, 140),
  diag('y2', 595, 510, ['#3a25ff', '#5a38ff', '#8e4dff'], 0, 140),
  diag('y3', 510, 510, ['#b457ff', '#d64cff'], 110, H),
  // E
  diag('e1', 681, 681, ['#ff4fd8', '#8a5cff', '#2f6bff']),
  bar('e2', 650, 820, 0, 55, ['#ff40cf', '#ff6aa6']),
  bar('e3', 650, 795, 90, 142, ['#ff4fc8', '#ff82b4']),
  bar('e4', 650, 806, 175, H, ['#3d6bff', '#9d86ff', '#d8ccff']),
  // Z
  bar('z1', 838, 1000, 0, 52, ['#ffa928', '#ffd531']),
  {
    id: 'z2',
    points: `938,0 1000,0 892,${H} 830,${H}`,
    stops: ['#ff8a2a', '#ff3f9f', '#7a2cff'],
    axis: 'v',
  },
  bar('z3', 830, 1016, 178, H, ['#8b2cff', '#ff3f9a', '#ffac3d']),
  // Y
  diag('y4', 1043, 1121, ['#ff7ea0', '#b44dff', '#8b3dff'], 0, 140),
  diag('y5', 1205, 1121, ['#ffd531', '#ff9a3a', '#ff6a3d'], 0, 140),
  diag('y6', 1121, 1121, ['#d94bff', '#ff4fd8'], 110, H),
];

/** The W ribbons alone, used for the square app mark / favicon. */
export const markRibbons = ribbons.filter((r) => r.id.startsWith('w') || r.id === 'a1');

export const TAGLINE = 'FIND · EXPLORE · ENJOY';

/** Static SVG string (for favicon, PWA icons and downloadable brand files). */
export function wordmarkSvg(
  options: { tagline?: boolean; theme?: 'light-bg' | 'dark-bg'; padding?: number } = {},
) {
  const tagline = options.tagline ?? true;
  const pad = options.padding ?? 24;
  const taglineColor = options.theme === 'dark-bg' ? '#e8ecf7' : '#34405e';
  const height = WORDMARK_HEIGHT + (tagline ? 110 : 0) + pad * 2;
  const width = WORDMARK_WIDTH + pad * 2;
  const blend = options.theme === 'dark-bg' ? 'screen' : 'multiply';
  const defs = ribbons
    .map((r) => {
      const [x2, y2] = r.axis === 'v' ? ['0', '1'] : ['1', '0'];
      const stops = r.stops
        .filter(Boolean)
        .map(
          (c, i, all) =>
            `<stop offset="${all.length === 1 ? 0 : i / (all.length - 1)}" stop-color="${c}"/>`,
        );
      return `<linearGradient id="g-${r.id}" x1="0" y1="0" x2="${x2}" y2="${y2}">${stops.join('')}</linearGradient>`;
    })
    .join('');
  const shapes = ribbons
    .map(
      (r) =>
        `<polygon points="${r.points}" fill="url(#g-${r.id})" stroke="url(#g-${r.id})" stroke-width="7" stroke-linejoin="round" opacity="0.93" style="mix-blend-mode:${blend}"/>`,
    )
    .join('');
  const textAttributes = [
    `x="${WORDMARK_WIDTH / 2}"`,
    `y="${WORDMARK_HEIGHT + 88}"`,
    'text-anchor="middle"',
    'font-family="Inter, \'Segoe UI\', Arial, sans-serif"',
    'font-size="56"',
    'font-weight="600"',
    'letter-spacing="18"',
    `fill="${taglineColor}"`,
  ].join(' ');
  const text = tagline ? `<text ${textAttributes}>${TAGLINE}</text>` : '';
  const svgAttributes = [
    'xmlns="http://www.w3.org/2000/svg"',
    `viewBox="0 0 ${width} ${height}"`,
    `width="${width}"`,
    `height="${height}"`,
    'role="img"',
    'aria-label="WAY EZY — Find, Explore, Enjoy"',
  ].join(' ');
  return `<svg ${svgAttributes}><defs>${defs}</defs><g transform="translate(${pad} ${pad})" style="isolation:isolate">${shapes}${text}</g></svg>`;
}

export function markSvg(options: { background?: string; size?: number } = {}) {
  const size = options.size ?? 512;
  const bg = options.background ?? '#ffffff';
  const defs = markRibbons
    .map(
      (r) =>
        `<linearGradient id="m-${r.id}" x1="0" y1="0" x2="0" y2="1">${r.stops
          .filter(Boolean)
          .map(
            (c, i, all) => `<stop offset="${i / Math.max(1, all.length - 1)}" stop-color="${c}"/>`,
          )
          .join('')}</linearGradient>`,
    )
    .join('');
  const shapes = markRibbons
    .map(
      (r) =>
        `<polygon points="${r.points}" fill="url(#m-${r.id})" stroke="url(#m-${r.id})" stroke-width="7" stroke-linejoin="round" opacity="0.94" style="mix-blend-mode:multiply"/>`,
    )
    .join('');
  // W + A-left occupies x ≈ 0..381; centre it in a 512 square with a soft rounded tile.
  const svgAttributes = [
    'xmlns="http://www.w3.org/2000/svg"',
    'viewBox="0 0 512 512"',
    `width="${size}"`,
    `height="${size}"`,
    'role="img"',
    'aria-label="WAY EZY"',
  ].join(' ');
  const tile = `<rect width="512" height="512" rx="112" fill="${bg}"/>`;
  const ribbons = `<g transform="translate(78 138) scale(0.93)" style="isolation:isolate">${shapes}</g>`;
  const accent = '<circle cx="410" cy="392" r="26" fill="#ff4f9a"/>';
  return `<svg ${svgAttributes}><defs>${defs}</defs>${tile}${ribbons}${accent}</svg>`;
}
