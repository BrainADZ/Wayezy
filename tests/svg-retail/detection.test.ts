import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { chromium, type Browser, type Page } from '@playwright/test';
import { createServer, type ViteDevServer } from 'vite';
import type { DetectionReport } from '../../packages/svg-retail/detect';

let browser: Browser, server: ViteDevServer, page: Page;
before(async () => {
  server = await createServer({
    configFile: false,
    appType: 'custom',
    server: { host: '127.0.0.1', port: 0 },
  });
  server.middlewares.use('/__test', (_req, res) => {
    res.setHeader('Content-Type', 'text/html');
    res.end('<!doctype html><body></body>');
  });
  await server.listen();
  browser = await chromium.launch({ channel: process.env.E2E_CHANNEL ?? 'chrome', headless: true });
  page = await browser.newPage();
  await page.goto(`${server.resolvedUrls!.local[0]}__test`);
});
after(async () => {
  await browser?.close();
  await server?.close();
});

async function detect(source: string) {
  return page.evaluate(async (source) => {
    const modulePath = '/packages/svg-retail/detect.ts';
    const { parsePlan, detectRetailModules, applyRetailDebug } = await import(
      /* @vite-ignore */ modulePath
    );
    document.body.replaceChildren();
    const svg = parsePlan(source);
    document.body.append(svg);
    const originalElements = [...svg.querySelectorAll('*')];
    const originalAttributes = originalElements.map((el) =>
      [...el.attributes].map((a) => [a.name, a.value]),
    );
    const report = detectRetailModules(svg) as DetectionReport;
    const greenBefore = [...svg.querySelectorAll('path,rect,polygon')].map(
      (el) => getComputedStyle(el).fill,
    );
    applyRetailDebug(svg, report);
    svg.setAttribute('data-retail-debug', 'off');
    const greenAfter = [...svg.querySelectorAll('path,rect,polygon')].map(
      (el) => getComputedStyle(el).fill,
    );
    const preserved = originalElements.every(
      (el, i) =>
        el.isConnected &&
        originalAttributes[i].every(([key, value]) => el.getAttribute(key) === value),
    );
    const ids = [...svg.querySelectorAll('[data-module-id]')].map((el) =>
      el.getAttribute('data-module-id'),
    );
    return { report, preserved, greenBefore, greenAfter, ids };
  }, source);
}

test('uses inherited green fills, transforms, split tspans and excludes decorations', async () => {
  const result = await detect(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 500 500">
    <defs><path fill="#aabf6a" d="M0 0H500V500H0Z"/></defs>
    <g transform="translate(70 40) rotate(15)" fill="#aabf6a">
      <path id="original-unit" d="M0 0H150V120H0Z"/>
      <text x="10" y="55" font-size="10" fill="black"><tspan>RETAIL MODULE </tspan><tspan>14-B</tspan></text>
    </g>
    <rect x="400" y="10" width="1" height="1" fill="#aabf6a"/>
    <rect x="300" y="300" width="80" height="80" fill="red"/>
    <g display="none"><rect width="500" height="500" fill="#aabf6a"/></g>
  </svg>`);
  assert.equal(result.report.modules[0].id, 'module-14b');
  assert.equal(result.report.modules[0].status, 'detected');
  assert.equal(result.report.footprintCandidates, 1);
  assert.equal(result.preserved, true);
  assert.deepEqual(result.greenAfter, result.greenBefore);
});

test('handles holes and rejects distant labels instead of manufacturing assignments', async () => {
  const { report, ids } =
    await detect(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1000 1000">
    <path fill="#aabf6a" fill-rule="evenodd" d="M0 0H200V200H0Z M40 40H160V160H40Z"/>
    <text x="55" y="100" font-size="8">RETAIL MODULE 6-A</text>
    <text x="800" y="900" font-size="8">RETAIL MODULE 99</text>
  </svg>`);
  assert.equal(report.modules.find((m) => m.id === 'module-6a')?.status, 'uncertain');
  assert.equal(report.modules.find((m) => m.id === 'module-99')?.status, 'unmatched');
  assert.deepEqual(ids, []);
});

test('does not split an original shape shared by multiple module labels', async () => {
  const { report, ids, preserved } =
    await detect(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 200">
    <rect width="400" height="200" fill="#aabf6a"/>
    <text x="20" y="50" font-size="10">RETAIL MODULE 14-A</text>
    <text x="220" y="50" font-size="10">RETAIL MODULE 14-B</text>
  </svg>`);
  assert.ok(report.modules.every((m) => m.status === 'uncertain'));
  assert.deepEqual(report.modules[0].shapeIndexes, report.modules[1].shapeIndexes);
  assert.deepEqual(ids, []);
  assert.ok(preserved);
});

test('recovers adjacent PDF glyph labels without consuming the next RETAIL prefix', async () => {
  const glyphs = [...'RETAILMODULE18RETAILMODULE14-A']
    .map(
      (c, i) =>
        `<use href="#glyph" data-text="${c}" transform="translate(${i < 14 ? 10 + i * 2 : 220 + (i - 14) * 2} 40)"/>`,
    )
    .join('');
  const { report } = await detect(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 200">
    <defs><path id="glyph" d="M0 0H1V2H0Z"/></defs>
    <rect width="180" height="100" fill="#aabf6a"/><rect x="200" width="180" height="100" fill="#adc16d"/>
    <g>${glyphs}</g>
  </svg>`);
  assert.deepEqual(
    report.modules.map((m) => m.id),
    ['module-14a', 'module-18'],
  );
  assert.ok(report.modules.every((m) => m.status === 'detected'));
});

test('real architectural source keeps every original attribute and detects requested modules', async () => {
  const source = await fs.readFile('public/maps/ground-floor-master.svg', 'utf8');
  const result = await detect(source);
  for (const id of ['module-18', 'module-14a', 'module-14b', 'module-6a', 'module-6b'])
    assert.equal(result.report.modules.find((m) => m.id === id)?.status, 'detected', id);
  assert.ok(result.report.modules.some((m) => m.status === 'uncertain'));
  assert.ok(result.report.unassigned.length > 0);
  assert.ok(result.preserved);
  assert.deepEqual(result.greenBefore, result.greenAfter);
});

test('recovers multiline outline labels and suffixes across unrelated XML groups', async () => {
  const lines: [string, number, number][] = [
    ['RETAIL', 20, 20],
    ['MODULE', 20, 30],
    ['20', 28, 40],
    ['B', 30, 50],
  ];
  const glyphs = lines
    .map(([text, x, y]) =>
      [...text]
        .map(
          (char, i) => `<g><use href="#glyph" data-text="${char}" x="${x + i * 4}" y="${y}"/></g>`,
        )
        .join(''),
    )
    .join('');
  const { report } = await detect(
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 200"><defs><path id="glyph" d="M0 0H3V6H0Z"/></defs><rect width="180" height="100" fill="#aabf6a"/>${glyphs}</svg>`,
  );
  assert.equal(report.modules.length, 1);
  assert.equal(report.modules[0].id, 'module-20b');
  assert.equal(report.modules[0].status, 'detected');
});

test('gives separate bounds to two labels within a single native text element', async () => {
  const { report } = await detect(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 200">
    <rect width="180" height="100" fill="#aabf6a"/><rect x="200" width="180" height="100" fill="#aabf6a"/>
    <text font-size="8"><tspan x="10" y="30">RETAIL MODULE 18</tspan><tspan x="210" y="30">RETAIL MODULE 14-A</tspan></text>
  </svg>`);
  assert.equal(report.modules.length, 2);
  assert.ok(report.modules.every((m) => m.status === 'detected'));
  assert.notDeepEqual(report.modules[0].shapeIndexes, report.modules[1].shapeIndexes);
});
