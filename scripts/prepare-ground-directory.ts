import fs from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { brotliCompressSync, gzipSync, constants } from 'node:zlib';
import { chromium } from '@playwright/test';
import { createServer } from 'vite';
import model from '../packages/domain/reference/ground-floor-model.json';

const source = await fs.readFile('public/maps/ground-floor-master.svg', 'utf8');
const sourceHash = createHash('sha256').update(source).digest('hex');
if (sourceHash !== model.sourceSha256)
  throw new Error('Master changed. Run npm run model:ground before preparing the directory.');
const server = await createServer({
  configFile: false,
  appType: 'custom',
  server: { host: '127.0.0.1', port: 0 },
  optimizeDeps: { noDiscovery: true },
});
server.middlewares.use('/__prepare', (_req, res) => res.end('<!doctype html><body></body>'));
await server.listen();
const browser = await chromium.launch({
  channel: process.env.E2E_CHANNEL ?? 'chrome',
  headless: true,
});
try {
  const page = await browser.newPage();
  await page.goto(`${server.resolvedUrls!.local[0]}__prepare`);
  const result = await page.evaluate(
    async ({ source, model }) => {
      const parser = '/packages/svg-retail/detect.ts',
        renderer = '/apps/web/explorer/ground-directory.ts',
        tenants = '/packages/domain/reference/ground-floor-tenants.json',
        circulation = '/packages/svg-retail/ground-circulation.ts';
      const [{ parsePlan }, { presentGroundDirectory }, { default: bindings }] = await Promise.all([
        import(parser),
        import(renderer),
        import(tenants),
      ]);
      const font = new FontFace(
        'Inter',
        'url(/node_modules/@fontsource/inter/files/inter-latin-600-normal.woff2)',
        { weight: '600' },
      );
      document.fonts.add(await font.load());
      const svg = parsePlan(source) as SVGSVGElement;
      document.body.append(svg);
      const places = bindings.tenants.map((t: any) => ({
        id: `ground-tenant-${t.id}`,
        name: t.name,
        floorId: 'l0',
        nodeId: `ground-tenant-${t.id}`,
        category: t.category,
        categoryId: t.category,
        kind: 'tenant',
        description: '',
        tenant: { logo: t.logo },
      }));
      presentGroundDirectory(svg, model, places);
      const escalators = [
        ...svg.querySelectorAll('.directory-amenity[aria-label="Escalator"] use'),
      ];
      if (
        escalators.length !== 4 ||
        escalators.some(
          (icon) => icon.getAttribute('width') !== '112' || icon.getAttribute('height') !== '20',
        )
      )
        throw new Error('Ground-floor escalators must use one consistent 112 × 20 symbol.');
      if (!svg.querySelector('#directory-icon-entrance path'))
        throw new Error('Entry gate symbol is missing.');
      const stateModule = '/apps/web/explorer/ground-directory-state.ts';
      const { updateDirectoryOriginPin } = await import(stateModule);
      const entryOne = model.amenities.find(
        (amenity: any) => amenity.id === 'ground-entry-starbucks',
      )!;
      const entryTwo = model.amenities.find(
        (amenity: any) => amenity.id === 'ground-entry-masaba',
      )!;
      const pin = svg.querySelector('[data-directory-origin-pin]')!;
      updateDirectoryOriginPin(svg, { x: entryTwo.point[0], y: entryTwo.point[1] });
      if (
        pin.getAttribute('transform') !==
        `translate(${entryTwo.point[0]} ${entryTwo.point[1]}) rotate(90)`
      )
        throw new Error('You Are Here pin did not move to Entry 2.');
      updateDirectoryOriginPin(svg, { x: entryOne.point[0], y: entryOne.point[1] });
      const { prepareCirculation } = await import(circulation);
      const graph = prepareCirculation(svg);
      svg.setAttribute('data-prepared-directory', '2');
      svg.setAttribute('data-source-sha256', model.sourceSha256);
      // Source geometry strings and transforms are kept verbatim. Exporter metadata and
      // inter-element whitespace are unnecessary to display or interact with the map.
      svg.querySelectorAll('metadata').forEach((el) => el.remove());
      const walker = document.createTreeWalker(svg, NodeFilter.SHOW_COMMENT | NodeFilter.SHOW_TEXT);
      const remove: Node[] = [];
      while (walker.nextNode())
        if (walker.currentNode.nodeType === 8 || !walker.currentNode.textContent?.trim())
          remove.push(walker.currentNode);
      remove.forEach((n) => n.parentNode?.removeChild(n));
      return { svg: new XMLSerializer().serializeToString(svg), graph };
    },
    { source, model },
  );
  await fs.writeFile('public/maps/ground-floor-directory.svg', result.svg);
  const brotli = brotliCompressSync(result.svg, {
    params: { [constants.BROTLI_PARAM_QUALITY]: 6 },
  });
  await fs.writeFile('public/maps/ground-floor-directory.svg.br', brotli);
  await fs.writeFile('public/maps/ground-floor-directory.svg.gz', gzipSync(result.svg));
  await fs.writeFile(
    'packages/domain/reference/ground-floor-walks.json',
    JSON.stringify(result.graph, null, 2) + '\n',
  );
  const sha256 = createHash('sha256').update(result.svg).digest('hex');
  await fs.writeFile(
    'packages/domain/reference/ground-floor-prepared.json',
    JSON.stringify(
      {
        version: 2,
        sourceSha256: sourceHash,
        sha256,
        url: `/maps/ground-floor-directory.svg?v=${sha256.slice(0, 12)}`,
      },
      null,
      2,
    ) + '\n',
  );
  const svgSizeMb = (Buffer.byteLength(result.svg) / 1024 / 1024).toFixed(2);
  console.log(
    `Prepared ${model.modules.length} modules, ${model.amenities.length} amenities; ${svgSizeMb} MB. ` +
      'No runtime detection or geometry measurement required.',
  );
  console.log('Circulation validation:', result.graph.warnings);
  console.log(`Prepared network transfer: ${(brotli.length / 1024).toFixed(0)} KB Brotli.`);
} finally {
  await browser.close();
  await server.close();
}
