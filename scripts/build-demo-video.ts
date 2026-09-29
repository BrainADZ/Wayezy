/**
 * Renders the demo video advert (public/demo/ads/blockbuster-weekend.webm): a 12-second, 1080×1920
 * muted cinema spot drawn on a canvas and captured with MediaRecorder in headless Chrome.
 *
 *   npx tsx scripts/build-demo-video.ts
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from '@playwright/test';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const fontDir = path.join(root, 'node_modules/@fontsource/inter/files');
const font = (weight: number) =>
  fs.readFileSync(path.join(fontDir, `inter-latin-${weight}-normal.woff2`)).toString('base64');
const out = path.join(root, 'public/demo/ads/blockbuster-weekend.webm');

const DURATION_MS = 12_000;

const browser = await chromium.launch({ channel: process.env.E2E_CHANNEL ?? 'chrome' });
const page = await browser.newPage();
await page.setContent('<!doctype html><html><body style="margin:0;background:#000"></body></html>');
// tsx keeps function names via an injected __name helper that does not exist inside the page.
await page.evaluate('window.__name = (fn) => fn');

const base64 = await page.evaluate(
  async ({ bold, semi, duration }) => {
    const load = async (name: string, data: string, weight: string) => {
      const face = new FontFace(name, `url(data:font/woff2;base64,${data})`, { weight });
      await face.load();
      document.fonts.add(face);
    };
    await load('Inter', bold, '800');
    await load('Inter', semi, '600');

    const W = 1080;
    const H = 1920;
    const canvas = document.createElement('canvas');
    canvas.width = W;
    canvas.height = H;
    document.body.appendChild(canvas);
    const ctx = canvas.getContext('2d')!;
    const ease = (t: number) => 1 - Math.pow(1 - Math.min(1, Math.max(0, t)), 3);
    const fade = (t: number, start: number, length = 0.6) => ease((t - start) / length);

    const stars = Array.from({ length: 90 }, (_, i) => ({
      x: (i * 397) % W,
      y: (i * 733) % 1100,
      r: 1 + ((i * 7) % 3),
      p: i * 0.37,
    }));

    function frame(ms: number) {
      const t = ms / 1000;
      // Night-sky gradient.
      const bg = ctx.createLinearGradient(0, 0, 0, H);
      bg.addColorStop(0, '#0b1030');
      bg.addColorStop(0.55, '#2a1152');
      bg.addColorStop(1, '#070818');
      ctx.fillStyle = bg;
      ctx.fillRect(0, 0, W, H);

      for (const s of stars) {
        ctx.globalAlpha = 0.35 + 0.35 * Math.sin(t * 2 + s.p);
        ctx.fillStyle = '#ffffff';
        ctx.beginPath();
        ctx.arc(s.x, s.y, s.r, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.globalAlpha = 1;

      // Sweeping spotlights.
      for (const [originX, phase, color] of [
        [220, 0, 'rgba(22,200,255,0.20)'],
        [860, 1.7, 'rgba(255,79,216,0.18)'],
        [540, 3.1, 'rgba(255,176,32,0.16)'],
      ] as const) {
        const angle = -Math.PI / 2 + Math.sin(t * 0.7 + phase) * 0.45;
        const length = 1900;
        const spread = 0.16;
        ctx.fillStyle = color;
        ctx.beginPath();
        ctx.moveTo(originX, 1500);
        ctx.lineTo(
          originX + Math.cos(angle - spread) * length,
          1500 + Math.sin(angle - spread) * length,
        );
        ctx.lineTo(
          originX + Math.cos(angle + spread) * length,
          1500 + Math.sin(angle + spread) * length,
        );
        ctx.closePath();
        ctx.fill();
      }

      // Film strip rolling across the middle.
      const stripY = 1180;
      ctx.save();
      ctx.translate(0, stripY);
      ctx.rotate(-0.08);
      ctx.fillStyle = '#12131c';
      ctx.fillRect(-100, 0, W + 200, 190);
      const offset = (t * 160) % 120;
      for (let x = -120; x < W + 200; x += 120) {
        ctx.fillStyle = '#f5f2ea';
        ctx.fillRect(x - offset, 14, 44, 26);
        ctx.fillRect(x - offset, 150, 44, 26);
        const hue = ((x + 1200) / 120) % 4;
        ctx.fillStyle = ['#16c8ff', '#6a5cff', '#ff4fd8', '#ffb020'][Math.floor(hue)];
        ctx.globalAlpha = 0.85;
        ctx.fillRect(x - offset - 30, 52, 104, 86);
        ctx.globalAlpha = 1;
      }
      ctx.restore();

      // Headline copy with staggered entrances.
      ctx.textAlign = 'center';
      const eyebrow = fade(t, 0.4);
      ctx.globalAlpha = eyebrow;
      ctx.fillStyle = '#ffb020';
      ctx.font = '600 44px Inter';
      ctx.fillText('THIS WEEKEND · LEVEL 2', W / 2, 330 - (1 - eyebrow) * 30);

      const title = fade(t, 0.9, 0.8);
      ctx.globalAlpha = title;
      const scale = 0.85 + 0.15 * title;
      ctx.save();
      ctx.translate(W / 2, 560);
      ctx.scale(scale, scale);
      const grad = ctx.createLinearGradient(-420, 0, 420, 0);
      grad.addColorStop(0, '#16c8ff');
      grad.addColorStop(0.35, '#8f7dff');
      grad.addColorStop(0.7, '#ff4fd8');
      grad.addColorStop(1, '#ffb020');
      ctx.fillStyle = grad;
      ctx.font = '800 150px Inter';
      ctx.fillText('BLOCK', 0, -40);
      ctx.fillText('BUSTER', 0, 120);
      ctx.fillStyle = '#ffffff';
      ctx.font = '800 96px Inter';
      ctx.fillText('WEEKEND', 0, 250);
      ctx.restore();

      const sub = fade(t, 2.2);
      ctx.globalAlpha = sub;
      ctx.fillStyle = '#dfe3f5';
      ctx.font = '600 48px Inter';
      ctx.fillText('New releases on the big screen', W / 2, 950);

      // Rotating "now showing" slots.
      const slots = ['Action · 11:30', 'Family · 14:10', 'Thriller · 18:45', 'Comedy · 21:30'];
      const active = Math.floor(t / 2.2) % slots.length;
      const slotIn = fade((t % 2.2) + 0.0, 0, 0.35);
      ctx.globalAlpha = sub * slotIn;
      ctx.fillStyle = 'rgba(255,255,255,0.12)';
      ctx.beginPath();
      ctx.roundRect(W / 2 - 330, 1470, 660, 120, 60);
      ctx.fill();
      ctx.fillStyle = '#ffffff';
      ctx.font = '800 58px Inter';
      ctx.fillText(slots[active], W / 2, 1551);

      // Call to action pulses near the end of the loop.
      const cta = fade(t, 3.2);
      const pulse = 1 + 0.04 * Math.sin(t * 5);
      ctx.globalAlpha = cta;
      ctx.save();
      ctx.translate(W / 2, 1740);
      ctx.scale(pulse, pulse);
      ctx.fillStyle = '#ffffff';
      ctx.beginPath();
      ctx.roundRect(-300, -62, 600, 124, 62);
      ctx.fill();
      ctx.fillStyle = '#1b1446';
      ctx.font = '800 50px Inter';
      ctx.fillText('Tap for directions', 0, 18);
      ctx.restore();
      ctx.globalAlpha = 1;
    }

    const stream = canvas.captureStream(30);
    const recorder = new MediaRecorder(stream, {
      mimeType: 'video/webm;codecs=vp9',
      videoBitsPerSecond: 2_500_000,
    });
    const chunks: Blob[] = [];
    recorder.ondataavailable = (e) => e.data.size && chunks.push(e.data);
    const done = new Promise<void>((resolve) => (recorder.onstop = () => resolve()));
    const started = performance.now();
    recorder.start(500);
    await new Promise<void>((resolve) => {
      const tick = () => {
        const elapsed = performance.now() - started;
        frame(elapsed);
        if (elapsed < duration) requestAnimationFrame(tick);
        else resolve();
      };
      tick();
    });
    recorder.stop();
    await done;
    const buffer = await new Blob(chunks, { type: 'video/webm' }).arrayBuffer();
    let binary = '';
    const bytes = new Uint8Array(buffer);
    for (let i = 0; i < bytes.length; i += 0x8000)
      binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
    return btoa(binary);
  },
  { bold: font(800), semi: font(600), duration: DURATION_MS },
);

fs.writeFileSync(out, Buffer.from(base64, 'base64'));
console.log(`Wrote ${path.relative(root, out)} (${Math.round(fs.statSync(out).size / 1024)} KB)`);
await browser.close();
