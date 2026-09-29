import fs from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { chromium } from '@playwright/test';
import { createServer } from 'vite';
import type { DetectionReport, DetectionOptions } from '../packages/svg-retail/detect';

const args = process.argv.slice(2);
function argument(name: string, fallback: string) {
  const index = args.indexOf(name);
  return index < 0 ? fallback : args[index + 1];
}
const input = path.resolve(argument('--input', 'public/maps/ground-floor-master.svg'));
const output = path.resolve(argument('--out', 'tmp/retail-detection'));
const source = await fs.readFile(input, 'utf8').catch(() => {
  throw new Error(
    `SVG not found: ${input}. Provide the master SVG or pass --input with the existing architectural SVG path.`,
  );
});
const options: DetectionOptions = JSON.parse(argument('--options', '{}'));
const server = await createServer({
  configFile: false,
  appType: 'custom',
  server: { host: '127.0.0.1', port: 0 },
});
server.middlewares.use('/__retail_runner', (_req, res) => {
  res.setHeader('Content-Type', 'text/html');
  res.end('<!doctype html><html><body><div id="plan"></div></body></html>');
});
let browser: Awaited<ReturnType<typeof chromium.launch>> | undefined;
try {
  await server.listen();
  browser = await chromium.launch({ channel: process.env.E2E_CHANNEL ?? 'chrome', headless: true });
  const page = await browser.newPage({ viewport: { width: 1200, height: 1600 } });
  await page.goto(`${server.resolvedUrls!.local[0]}__retail_runner`);
  const result = await page.evaluate(
    async ({ source, options }) => {
      const modulePath = '/packages/svg-retail/detect.ts';
      const { parsePlan, detectRetailModules, applyRetailDebug } = await import(
        /* @vite-ignore */ modulePath
      );
      const svg = parsePlan(source);
      document.getElementById('plan')!.append(svg);
      await document.fonts.ready;
      const report = detectRetailModules(svg, options) as DetectionReport;
      applyRetailDebug(svg, report);
      return { report, debug: new XMLSerializer().serializeToString(svg) };
    },
    { source, options },
  );
  const report = {
    ...result.report,
    source: input,
    sourceSha256: createHash('sha256').update(source).digest('hex'),
  };
  await fs.mkdir(output, { recursive: true });
  await fs.writeFile(path.join(output, 'report.json'), JSON.stringify(report, null, 2) + '\n');
  const lines = report.modules.map(
    (m) => `${m.id.padEnd(14)} ${m.status}${m.reasons.length ? ` — ${m.reasons.join(' ')}` : ''}`,
  );
  const summary =
    [
      ...lines,
      '',
      `${report.unassigned.length} unassigned green footprint candidates.`,
      ...report.warnings,
    ].join('\n') + '\n';
  await fs.writeFile(path.join(output, 'report.txt'), summary);
  if (args.includes('--debug')) {
    await fs.writeFile(path.join(output, 'debug.svg'), result.debug);
    await page.screenshot({ path: path.join(output, 'debug.png'), fullPage: true });
  }
  console.log(summary);
  console.log(`Reports saved to ${output}`);
} finally {
  await browser?.close();
  await server.close();
}
