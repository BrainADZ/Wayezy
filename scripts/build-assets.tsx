/**
 * Generates production brand + demo assets into /public (run: npm run assets).
 *
 * - public/brand: WAY EZY wordmark (light/dark), app mark, PNG/WebP fallbacks
 * - public/icons: PWA icons, favicon, and every illustrated icon as a standalone SVG
 * - public/demo/ads: 1080×1920 demo advertising posters (WebP)
 * - docs/database/schema.sql: SQL generated from the migration source
 */
import fs from 'node:fs';
import path from 'node:path';
import { renderToStaticMarkup } from 'react-dom/server';
import sharp from 'sharp';
import { markSvg, wordmarkSvg } from '../apps/web/brand/logo-data';
import { illustratedIconNames, WayIcon } from '../apps/web/icons/illustrated';
import { migrations } from '../apps/server/db/migrations';

const root = path.resolve(import.meta.dirname, '..');
const out = (...parts: string[]) => {
  const file = path.join(root, ...parts);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  return file;
};
const write = (file: string, content: string) => fs.writeFileSync(out(file), content);

async function brand() {
  const light = wordmarkSvg({ tagline: true, theme: 'light-bg' });
  const dark = wordmarkSvg({ tagline: true, theme: 'dark-bg' });
  const mark = markSvg();
  write('public/brand/way-ezy-logo.svg', light);
  write('public/brand/way-ezy-logo-dark.svg', light); // dark tagline, for light backgrounds
  write('public/brand/way-ezy-logo-light.svg', dark); // light tagline, for dark backgrounds
  write('public/brand/way-ezy-wordmark.svg', wordmarkSvg({ tagline: false }));
  write('public/brand/way-ezy-mark.svg', mark);
  await sharp(Buffer.from(light))
    .resize({ width: 1600 })
    .png()
    .toFile(out('public/brand/way-ezy-logo.png'));
  await sharp(Buffer.from(light))
    .resize({ width: 1600 })
    .webp({ quality: 92 })
    .toFile(out('public/brand/way-ezy-logo.webp'));
  await sharp(Buffer.from(dark))
    .resize({ width: 1600 })
    .png()
    .toFile(out('public/brand/way-ezy-logo-light.png'));
  await sharp(Buffer.from(mark)).resize(512).png().toFile(out('public/brand/way-ezy-mark.png'));
  await sharp(Buffer.from(mark))
    .resize(512)
    .webp({ quality: 92 })
    .toFile(out('public/brand/way-ezy-mark.webp'));
  for (const size of [192, 512])
    await sharp(Buffer.from(mark))
      .resize(size)
      .png()
      .toFile(out(`public/icons/icon-${size}.png`));
  // Maskable icon: mark on a full-bleed white square with safe-zone padding.
  const maskable = markSvg({ background: '#ffffff' }).replace('rx="112"', 'rx="0"');
  await sharp(Buffer.from(maskable))
    .resize(512)
    .png()
    .toFile(out('public/icons/icon-maskable-512.png'));
  await sharp(Buffer.from(mark))
    .resize(180)
    .flatten({ background: '#ffffff' })
    .png()
    .toFile(out('public/icons/apple-touch-icon.png'));
  await sharp(Buffer.from(mark)).resize(32).png().toFile(out('public/icons/favicon-32.png'));
  // Legacy root favicon path.
  write('public/favicon.svg', mark);
}

function icons() {
  for (const name of illustratedIconNames) {
    const svg = renderToStaticMarkup(<WayIcon name={name} size={64} />)
      .replace('<svg ', '<svg xmlns="http://www.w3.org/2000/svg" ')
      .replace(' aria-hidden="true"', '');
    write(`public/icons/way/${name}.svg`, svg);
  }
}

const iconMarkup = (name: string, size: number, x: number, y: number) =>
  renderToStaticMarkup(<WayIcon name={name} size={size} />).replace(
    '<svg ',
    `<svg x="${x}" y="${y}" `,
  );

function poster(options: {
  background: string;
  accent: string;
  ink: string;
  eyebrow: string;
  headline: string[];
  highlight: string;
  body: string;
  location: string;
  icon: string;
  decoration?: string;
}) {
  const lines = options.headline
    .map(
      (line, i) =>
        `<text x="90" y="${1060 + i * 150}" font-size="150" font-weight="800" letter-spacing="-5" fill="${options.ink}">${line}</text>`,
    )
    .join('');
  return `<svg xmlns="http://www.w3.org/2000/svg" width="1080" height="1920" viewBox="0 0 1080 1920">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">${options.background}</linearGradient>
    <radialGradient id="glow" cx="0.75" cy="0.28" r="0.5"><stop offset="0" stop-color="#ffffff" stop-opacity="0.55"/><stop offset="1" stop-color="#ffffff" stop-opacity="0"/></radialGradient>
  </defs>
  <rect width="1080" height="1920" fill="url(#bg)"/>
  <rect width="1080" height="1920" fill="url(#glow)"/>
  ${options.decoration ?? ''}
  <circle cx="820" cy="520" r="330" fill="#ffffff" opacity="0.22"/>
  ${iconMarkup(options.icon, 520, 560, 250)}
  <g font-family="Inter, 'Segoe UI', Arial, sans-serif">
    <text x="90" y="880" font-size="44" font-weight="700" letter-spacing="8" fill="${options.ink}" opacity="0.75">${options.eyebrow}</text>
    ${lines}
    <rect x="90" y="${1150 + (options.headline.length - 1) * 150}" rx="30" width="${options.highlight.length * 44 + 80}" height="120" fill="${options.accent}"/>
    <text x="130" y="${1232 + (options.headline.length - 1) * 150}" font-size="72" font-weight="800" fill="#ffffff">${options.highlight}</text>
    <text x="90" y="${1380 + (options.headline.length - 1) * 150}" font-size="52" font-weight="500" fill="${options.ink}" opacity="0.85">${options.body}</text>
    <text x="90" y="${1470 + (options.headline.length - 1) * 150}" font-size="44" font-weight="700" fill="${options.ink}">${options.location}</text>
  </g>
</svg>`;
}

async function ads() {
  const confetti = (colors: string[]) =>
    Array.from({ length: 26 }, (_, i) => {
      const x = (i * 137) % 1080;
      const y = 80 + ((i * 263) % 700);
      return `<rect x="${x}" y="${y}" width="${14 + (i % 3) * 6}" height="${8 + (i % 2) * 6}" rx="4" fill="${colors[i % colors.length]}" transform="rotate(${(i * 37) % 180} ${x} ${y})" opacity="0.8"/>`;
    }).join('');
  const posters: [string, string][] = [
    [
      'festive-fashion-week',
      poster({
        background:
          '<stop offset="0" stop-color="#ffd6e8"/><stop offset="0.55" stop-color="#e8d9ff"/><stop offset="1" stop-color="#ffe7c7"/>',
        accent: '#e8457a',
        ink: '#2a1640',
        eyebrow: 'LEVEL 1 · FASHION &amp; LIFESTYLE',
        headline: ['Festive', 'Fashion Week'],
        highlight: 'UP TO 40% OFF',
        body: 'Festive edits for the whole family',
        location: 'Westside · L1-11 · Take the escalator up',
        icon: 'fashion',
        decoration: confetti(['#ff5c9a', '#ffc53d', '#7c5cff', '#16c8ff']),
      }),
    ],
    [
      'olive-pasta-nights',
      poster({
        background:
          '<stop offset="0" stop-color="#fff4e0"/><stop offset="1" stop-color="#e6f0d2"/>',
        accent: '#556b2f',
        ink: '#2d3319',
        eyebrow: 'LEVEL 2 · CINEMA &amp; DINING',
        headline: ['Pasta', 'Nights'],
        highlight: '20% OFF PASTA',
        body: 'Handmade pasta · Mon–Thu after 6 PM',
        location: 'Olive Trattoria · L2-07',
        icon: 'dining',
        decoration: confetti(['#9bb35a', '#ff9f2e', '#f04b4b']),
      }),
    ],
    [
      'tech-fest',
      poster({
        background:
          '<stop offset="0" stop-color="#d9ecff"/><stop offset="1" stop-color="#e3e0ff"/>',
        accent: '#1a5cff',
        ink: '#10213f',
        eyebrow: 'LEVEL 0 · ENTRANCE &amp; ESSENTIALS',
        headline: ['Tech', 'Fest'],
        highlight: 'NO-COST EMI',
        body: 'Deals on laptops, phones and TVs',
        location: 'Croma · L0-03',
        icon: 'electronics',
        decoration: confetti(['#1a5cff', '#16c8ff', '#7c5cff']),
      }),
    ],
    [
      'riverside-house',
      poster({
        background:
          '<stop offset="0" stop-color="#dff6ff"/><stop offset="0.5" stop-color="#efe6ff"/><stop offset="1" stop-color="#ffe3f1"/>',
        accent: '#6a5cff',
        ink: '#14213d',
        eyebrow: 'RIVERSIDE SHOPPING CENTRE',
        headline: ['Find it.', 'Love it.'],
        highlight: 'TOUCH TO EXPLORE',
        body: '40 places to shop, eat and play',
        location: 'Directions from any WAY EZY kiosk',
        icon: 'map',
        decoration: confetti(['#16c8ff', '#6a5cff', '#ff4fd8', '#ffb020']),
      }),
    ],
  ];
  for (const [name, svg] of posters) {
    write(`public/demo/ads/${name}.svg`, svg);
    await sharp(Buffer.from(svg))
      .webp({ quality: 88 })
      .toFile(out(`public/demo/ads/${name}.webp`));
  }
}

function schema() {
  const header =
    '-- WAY EZY database schema (generated from apps/server/db/migrations.ts — do not edit by hand)\n';
  write(
    'docs/database/schema.sql',
    header + migrations.map((m) => `-- ${m.id}\n${m.sql.trim()}\n`).join('\n'),
  );
}

await brand();
icons();
await ads();
schema();
console.log('Assets generated.');
