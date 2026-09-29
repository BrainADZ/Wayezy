import { createHash } from 'node:crypto';
import fs from 'node:fs';
import react from '@vitejs/plugin-react';
import { defineConfig, type Plugin } from 'vite';

/**
 * Emits dist/client/sw.js from apps/web/sw-template.js with a build id and the exact list of
 * hashed JS/CSS/font chunks, so kiosks keep working offline even for lazily loaded screens.
 */
function serviceWorker(): Plugin {
  return {
    name: 'way-ezy-service-worker',
    apply: 'build',
    generateBundle(_options, bundle) {
      const files = Object.keys(bundle)
        .filter((file) => /\.(js|css|woff2)$/.test(file) && !file.startsWith('sw'))
        // Browsers only fetch the unicode-range subsets they need; precache the Latin ones.
        .filter((file) => !/inter-(cyrillic|greek|vietnamese)/.test(file))
        // The admin console is never needed offline on a kiosk or phone.
        .filter(
          (file) =>
            !/(CommandApp|Dashboard|Tenants|Directory|Advertising|MediaLibrary|Devices|Analytics|MapEditor|Routing|Admin)-/.test(
              file,
            ),
        )
        .map((file) => `/${file}`)
        .sort();
      const brandDir = new URL('./public/brand/logo/', import.meta.url);
      const brandFiles = fs
        .readdirSync(brandDir)
        .filter((name) => /\.(svg|png|jpe?g|webp|avif)$/i.test(name));
      const brands = brandFiles.map((name) => `/brand/logo/${encodeURIComponent(name)}`);
      const precache = [
        '/manifest.webmanifest',
        '/favicon.svg',
        '/brand/way-ezy-mark.svg',
        '/icons/icon-192.png',
        '/icons/favicon-32.png',
        JSON.parse(
          fs.readFileSync(
            new URL('./packages/domain/reference/ground-floor-prepared.json', import.meta.url),
            'utf8',
          ),
        ).url,
        ...brands,
        ...files,
      ];
      const buildId = createHash('sha256')
        .update(precache.join('\n'))
        .update(
          fs.readFileSync(new URL('./public/maps/ground-floor-directory.svg', import.meta.url)),
        );
      for (const name of brandFiles)
        buildId.update(
          fs.readFileSync(
            new URL(`./public/brand/logo/${encodeURIComponent(name)}`, import.meta.url),
          ),
        );
      const buildIdShort = buildId.digest('hex').slice(0, 12);
      const source = fs
        .readFileSync(new URL('./apps/web/sw-template.js', import.meta.url), 'utf8')
        .replace('__BUILD_ID__', buildIdShort)
        .replace('__PRECACHE__', JSON.stringify(precache));
      this.emitFile({ type: 'asset', fileName: 'sw.js', source });
    },
  };
}

export default defineConfig(({ isSsrBuild }) => ({
  plugins: [react(), ...(isSsrBuild ? [] : [serviceWorker()])],
  publicDir: 'public',
  build: isSsrBuild
    ? { outDir: 'dist/server', target: 'node22', sourcemap: true, emptyOutDir: true }
    : {
        outDir: 'dist/client',
        sourcemap: true,
        emptyOutDir: true,
        // three.js + React Three Fiber are only reachable through the lazily imported 3D map chunk,
        // so the kiosk shell, WAY EZY GO and COMMAND load without them (SVG map first, 3D streams in).
        chunkSizeWarningLimit: 1200,
      },
  ssr: { external: ['@electric-sql/pglite', 'sharp', 'pg', 'vite'] },
  server: { host: '0.0.0.0' },
}));
