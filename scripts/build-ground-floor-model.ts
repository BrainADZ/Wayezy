import fs from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { chromium } from '@playwright/test';
import { createServer } from 'vite';
import type { FloorModel } from '../packages/svg-retail/ground-model';

const source = await fs.readFile('public/maps/ground-floor-master.svg', 'utf8');
const server = await createServer({
  configFile: false,
  appType: 'custom',
  server: { host: '127.0.0.1', port: 0 },
  optimizeDeps: { noDiscovery: true },
});
server.middlewares.use('/__model', (_req, res) => {
  res.setHeader('Content-Type', 'text/html');
  res.end('<!doctype html><body></body>');
});
await server.listen();
const browser = await chromium.launch({
  channel: process.env.E2E_CHANNEL ?? 'chrome',
  headless: true,
});
try {
  const page = await browser.newPage();
  await page.goto(`${server.resolvedUrls!.local[0]}__model`);
  const model = await page.evaluate(async (source) => {
    const parserPath = '/packages/svg-retail/detect.ts',
      modelPath = '/packages/svg-retail/ground-model.ts';
    const { parsePlan } = await import(/* @vite-ignore */ parserPath);
    const { buildGroundFloorModel } = await import(/* @vite-ignore */ modelPath);
    const svg = parsePlan(source);
    document.body.append(svg);
    await document.fonts.ready;
    return buildGroundFloorModel(svg) as FloorModel;
  }, source);
  await fs.writeFile(
    'packages/domain/reference/ground-floor-model.json',
    JSON.stringify(
      { ...model, sourceSha256: createHash('sha256').update(source).digest('hex') },
      null,
      2,
    ) + '\n',
  );
  console.log(
    `${model.modules.length} source modules; ${model.modules.filter((m) => m.tenantId).length} occupied modules; ${model.amenities.length} amenities.`,
  );
  console.log(model.warnings);
} finally {
  await browser.close();
  await server.close();
}
