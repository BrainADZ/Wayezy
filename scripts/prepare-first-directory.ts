import fs from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { brotliCompressSync, gzipSync, constants } from 'node:zlib';
import { chromium } from '@playwright/test';
import { createServer } from 'vite';

const source = await fs.readFile(
  'public/maps/First Floor Plan- Grand View High Street.svg',
  'utf8',
);
const sourceSha256 = createHash('sha256').update(source).digest('hex');
const server = await createServer({
  configFile: false,
  appType: 'custom',
  server: { host: '127.0.0.1', port: 0 },
  optimizeDeps: { noDiscovery: true },
});
server.middlewares.use('/__prepare-first', (_req, res) => res.end('<!doctype html><body></body>'));
await server.listen();
const browser = await chromium.launch({
  channel: process.env.E2E_CHANNEL ?? 'chrome',
  headless: true,
});
try {
  const page = await browser.newPage();
  await page.goto(`${server.resolvedUrls!.local[0]}__prepare-first`);
  const result = await page.evaluate(
    async ({ source, sourceSha256 }) => {
      const parser = '/packages/svg-retail/detect.ts',
        builder = '/packages/svg-retail/first-floor-model.ts',
        renderer = '/apps/web/explorer/ground-directory.ts';
      const [{ parsePlan }, { buildFirstFloorModel }, { presentGroundDirectory }] =
        await Promise.all([import(parser), import(builder), import(renderer)]);
      const font = new FontFace(
        'Inter',
        'url(/node_modules/@fontsource/inter/files/inter-latin-600-normal.woff2)',
        { weight: '600' },
      );
      document.fonts.add(await font.load());
      const svg = parsePlan(source);
      document.body.append(svg);
      const { model, tenants } = buildFirstFloorModel(svg);
      const places = tenants.map((t: any) => ({
        id: `first-tenant-${t.id}`,
        name: t.name,
        floorId: 'l1',
        nodeId: `first-tenant-${t.id}`,
        category: t.category,
        categoryId: t.category,
        kind: 'tenant',
        description: '',
        tenant: { logo: t.logo },
      }));
      presentGroundDirectory(svg, model, places, {
        tenants,
        balancedLabels: true,
        spaces: [
          { id: 'first-lobby-c', name: 'LOBBY C', kind: 'lobby', sourceTextId: 'tspan11424' },
          { id: 'first-lobby-d', name: 'LOBBY D', kind: 'lobby', sourceTextId: 'tspan11426' },
          { id: 'first-lobby-e', name: 'LOBBY E', kind: 'lobby', sourceTextId: 'tspan11428' },
        ],
      });
      svg.setAttribute('data-prepared-directory', 'first-1');
      svg.setAttribute('data-source-sha256', sourceSha256);
      svg.querySelectorAll('metadata').forEach((el: Element) => el.remove());
      const walker = document.createTreeWalker(svg, NodeFilter.SHOW_COMMENT | NodeFilter.SHOW_TEXT);
      const remove: Node[] = [];
      while (walker.nextNode())
        if (walker.currentNode.nodeType === 8 || !walker.currentNode.textContent?.trim())
          remove.push(walker.currentNode);
      remove.forEach((node) => node.parentNode?.removeChild(node));
      return { svg: new XMLSerializer().serializeToString(svg), model, tenants };
    },
    { source, sourceSha256 },
  );
  await fs.writeFile('public/maps/first-floor-directory.svg', result.svg);
  await fs.writeFile(
    'public/maps/first-floor-directory.svg.br',
    brotliCompressSync(result.svg, { params: { [constants.BROTLI_PARAM_QUALITY]: 6 } }),
  );
  await fs.writeFile('public/maps/first-floor-directory.svg.gz', gzipSync(result.svg));
  const sha256 = createHash('sha256').update(result.svg).digest('hex');
  await fs.writeFile(
    'packages/domain/reference/first-floor-model.json',
    JSON.stringify({ ...result.model, sourceSha256, tenants: result.tenants }, null, 2) + '\n',
  );
  await fs.writeFile(
    'packages/domain/reference/first-floor-prepared.json',
    JSON.stringify(
      { sourceSha256, sha256, url: `/maps/first-floor-directory.svg?v=${sha256.slice(0, 12)}` },
      null,
      2,
    ) + '\n',
  );
  console.log(
    `Prepared First Floor: ${result.model.modules.length} source modules, ${result.tenants.length} brands, ${result.model.amenities.length} amenities.`,
  );
} finally {
  await browser.close();
  await server.close();
}
