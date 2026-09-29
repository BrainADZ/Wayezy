/**
 * Packages a built WAY EZY (run `npm run build` first) into a self-contained folder + zip.
 *
 *   npx tsx scripts/package-release.ts demo        → <out>/WAY-EZY-Demo-<version>/
 *   npx tsx scripts/package-release.ts production  → <out>/WAY-EZY-<version>/
 *
 * demo:       includes the runtime node_modules copied from this machine (and, on Windows, the Node
 *             runtime itself) so a presenter can double-click START-WAY-EZY-DEMO.cmd with no install.
 * production: server + client bundles, a runtime-only package.json, Dockerfile, compose file,
 *             env template, schema and deployment docs. Dependencies are installed on the target.
 *
 * Output goes to RELEASE_OUT_DIR, or to ../../07_DEMO_BUILD / ../../08_PRODUCTION_RELEASES when this
 * repository sits inside the client delivery folder, or to ./release otherwise.
 */
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const kind = process.argv[2];
if (kind !== 'demo' && kind !== 'production') {
  console.error('Usage: tsx scripts/package-release.ts demo|production');
  process.exit(1);
}

const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8')) as {
  version: string;
  engines: Record<string, string>;
  dependencies: Record<string, string>;
};
for (const required of ['dist/client/index.html', 'dist/client/sw.js', 'dist/server/index.js']) {
  if (!fs.existsSync(path.join(root, required))) {
    console.error(`Missing ${required}. Run "npm run build" first.`);
    process.exit(1);
  }
}

/** Packages the server bundle imports at runtime (vite is only used by the dev server). */
const RUNTIME_DEPENDENCIES = [
  '@electric-sql/pglite',
  'express',
  'express-rate-limit',
  'helmet',
  'multer',
  'mongodb',
  'pg',
  'sharp',
  'zod',
];

const deliveryRoot = path.resolve(root, '..', '..');
const insideDelivery =
  fs.existsSync(path.join(deliveryRoot, '07_DEMO_BUILD')) &&
  fs.existsSync(path.join(deliveryRoot, '08_PRODUCTION_RELEASES'));
const outBase = process.env.RELEASE_OUT_DIR
  ? path.resolve(process.env.RELEASE_OUT_DIR)
  : insideDelivery
    ? path.join(deliveryRoot, kind === 'demo' ? '07_DEMO_BUILD' : '08_PRODUCTION_RELEASES')
    : path.join(root, 'release');
const name = kind === 'demo' ? `WAY-EZY-Demo-${pkg.version}` : `WAY-EZY-${pkg.version}`;
const out = path.join(outBase, name);

const copy = (from: string, to = from, filter?: (src: string) => boolean) => {
  const src = path.join(root, from);
  if (!fs.existsSync(src)) return;
  fs.cpSync(src, path.join(out, to), {
    recursive: true,
    filter: filter ? (s) => filter(s) : undefined,
  });
};
const write = (file: string, content: string) => {
  fs.mkdirSync(path.dirname(path.join(out, file)), { recursive: true });
  fs.writeFileSync(
    path.join(out, file),
    content.replace(/\r?\n/g, file.endsWith('.cmd') ? '\r\n' : '\n'),
  );
};
const installedVersion = (dep: string) =>
  (
    JSON.parse(fs.readFileSync(path.join(root, 'node_modules', dep, 'package.json'), 'utf8')) as {
      version: string;
    }
  ).version;

console.log(`Packaging ${kind} → ${out}`);
fs.rmSync(out, { recursive: true, force: true });
fs.mkdirSync(out, { recursive: true });

// Bundles (source maps stay out of the release; they are in the source tree build if needed).
const noMaps = (src: string) => !src.endsWith('.map');
copy('dist/client', 'dist/client', noMaps);
copy('dist/server', 'dist/server', noMaps);

write(
  'package.json',
  JSON.stringify(
    {
      name: 'way-ezy',
      version: pkg.version,
      private: true,
      type: 'module',
      description: 'WAY EZY runtime package (kiosk, WAY EZY GO, WAY EZY COMMAND).',
      engines: pkg.engines,
      scripts: { start: 'node dist/server/index.js' },
      dependencies: Object.fromEntries(
        RUNTIME_DEPENDENCIES.map((dep) => [dep, installedVersion(dep)]),
      ),
    },
    null,
    2,
  ) + '\n',
);
copy('.env.example');
copy('docs/database/schema.sql', 'docs/database/schema.sql');
for (const doc of [
  'README.md',
  'docs/DEPLOYMENT.md',
  'docs/ADMIN_GUIDE.md',
  'docs/DEMO_SCRIPT.md',
  'docs/KNOWN_LIMITATIONS.md',
  'docs/BROWSER_COMPATIBILITY.md',
])
  copy(doc);

/** Copies a dependency and its transitive dependencies from the local (flat) node_modules. */
function copyDependencyClosure(deps: string[]) {
  const seen = new Set<string>();
  const queue = [...deps];
  while (queue.length) {
    const dep = queue.shift()!;
    if (seen.has(dep)) continue;
    const dir = path.join(root, 'node_modules', dep);
    if (!fs.existsSync(dir)) continue; // optional platform packages that are not installed here
    seen.add(dep);
    fs.cpSync(dir, path.join(out, 'node_modules', dep), { recursive: true, dereference: true });
    const manifest = JSON.parse(fs.readFileSync(path.join(dir, 'package.json'), 'utf8')) as {
      dependencies?: Record<string, string>;
      optionalDependencies?: Record<string, string>;
    };
    queue.push(
      ...Object.keys(manifest.dependencies ?? {}),
      ...Object.keys(manifest.optionalDependencies ?? {}),
    );
  }
  return seen.size;
}

if (kind === 'demo') {
  const count = copyDependencyClosure(RUNTIME_DEPENDENCIES);
  console.log(`  copied ${count} runtime packages`);
  if (process.platform === 'win32') {
    fs.mkdirSync(path.join(out, 'runtime'), { recursive: true });
    fs.copyFileSync(process.execPath, path.join(out, 'runtime', 'node.exe'));
    console.log(`  bundled Node ${process.version} (runtime/node.exe)`);
  }
  write(
    'START-WAY-EZY-DEMO.cmd',
    `@echo off
title WAY EZY demo server
cd /d "%~dp0"
set NODE_ENV=production
set APP_MODE=demo
if not defined PORT set PORT=4173
set DATA_DIR=data
set NODE_EXE=node
if exist "%~dp0runtime\\node.exe" set NODE_EXE="%~dp0runtime\\node.exe"
echo.
echo  WAY EZY demo is starting on http://localhost:%PORT%/
echo    Kiosk            http://localhost:%PORT%/?device=K-001
echo    WAY EZY GO       http://localhost:%PORT%/go
echo    WAY EZY COMMAND  http://localhost:%PORT%/command
echo  Sign-in details are written to data\\demo-access.txt on first start.
echo  Close this window to stop the demo.
echo.
start "" /min cmd /c "timeout /t 5 /nobreak >nul && start "" http://localhost:%PORT%/?device=K-001"
%NODE_EXE% dist\\server\\index.js
pause
`,
  );
  write(
    'start-way-ezy-demo.sh',
    `#!/usr/bin/env sh
# WAY EZY demo launcher for macOS / Linux (requires Node.js ${pkg.engines.node}).
# The bundled node_modules were copied from a Windows build machine: run "npm install --omit=dev" once first.
cd "$(dirname "$0")"
export NODE_ENV=production APP_MODE=demo DATA_DIR=data PORT="\${PORT:-4173}"
echo "WAY EZY demo: http://localhost:$PORT/?device=K-001  |  /go  |  /command (see data/demo-access.txt)"
exec node dist/server/index.js
`,
  );
  write(
    'README-DEMO.md',
    `# WAY EZY — demo build ${pkg.version}

## Start (Windows)
1. Unzip anywhere (a path without special permissions, e.g. Desktop).
2. Double-click **START-WAY-EZY-DEMO.cmd**. The kiosk opens in your browser after a few seconds.
3. COMMAND sign-in details are in **data/demo-access.txt** (created on first start).

Press **F11** in Chrome/Edge for full-screen kiosk mode. The portrait kiosk layout scales to any
window, but looks best on a 1080×1920 screen or a portrait browser window.

## Phone hand-off (QR)
Phones must reach this computer over Wi-Fi. The server prints a LAN address when it starts; if
Windows Firewall asks, allow Node.js on private networks. To pin the address used inside QR codes:
\`set PUBLIC_BASE_URL=http://<this-computer-ip>:4173\` before starting.

## Reset
Close the window, delete the **data** folder, start again (fresh demo data and new passwords).

## macOS / Linux
Install Node.js ${pkg.engines.node}, run \`npm install --omit=dev\` once, then \`sh start-way-ezy-demo.sh\`.

See DEMO_SCRIPT.md for the 26-step client walkthrough.
`,
  );
  copy('docs/DEMO_SCRIPT.md', 'DEMO_SCRIPT.md');
} else {
  // The release already contains built bundles, so its Dockerfile only installs the runtime.
  write(
    'Dockerfile',
    `FROM node:22-bookworm-slim
ENV NODE_ENV=production PORT=4173 DATA_DIR=/app/.data
WORKDIR /app
COPY package.json ./
RUN npm install --omit=dev && npm cache clean --force
COPY dist ./dist
RUN mkdir -p /app/.data && chown -R node:node /app/.data
USER node
EXPOSE 4173
VOLUME ["/app/.data"]
HEALTHCHECK --interval=30s --timeout=5s --start-period=30s --retries=3 \\
  CMD node -e "fetch('http://127.0.0.1:' + (process.env.PORT || 4173) + '/api/health').then((r) => process.exit(r.ok ? 0 : 1)).catch(() => process.exit(1))"
CMD ["node", "dist/server/index.js"]
`,
  );
  copy('docker-compose.yml');
  write('.dockerignore', 'node_modules\n.data\n.env\n');
  write(
    'README-RELEASE.md',
    `# WAY EZY ${pkg.version} — production release

Contents: \`dist/\` (client + server bundles), runtime \`package.json\`, \`Dockerfile\`, \`docker-compose.yml\`,
\`.env.example\`, database schema and deployment documentation.

Quick start (Docker, with MongoDB):

\`\`\`bash
cp .env.example .env   # set NODE_ENV=production, APP_MODE=production, PUBLIC_BASE_URL, ROUTE_TOKEN_SECRET, ADMIN_PASSWORD, MONGO_PASSWORD; disable demo flags
docker compose up -d --build
\`\`\`

Without Docker (Node.js ${pkg.engines.node}):

\`\`\`bash
npm install --omit=dev
NODE_ENV=production node dist/server/index.js
\`\`\`

Full instructions: docs/DEPLOYMENT.md.
`,
  );
}

// Zip next to the folder (Windows 10+ tar, or zip elsewhere). The folder itself is the primary artefact.
const zipPath = `${out}.zip`;
fs.rmSync(zipPath, { force: true });
try {
  // Windows' own bsdtar writes zip archives (a GNU tar earlier on PATH, e.g. from Git Bash, cannot).
  const windowsTar = path.join(process.env.SystemRoot ?? 'C:\\Windows', 'System32', 'tar.exe');
  if (process.platform === 'win32')
    execFileSync(
      fs.existsSync(windowsTar) ? windowsTar : 'tar.exe',
      ['-a', '-c', '-f', zipPath, '-C', outBase, name],
      { stdio: 'ignore' },
    );
  else execFileSync('zip', ['-qr', zipPath, name], { cwd: outBase, stdio: 'ignore' });
  console.log(`  zip: ${zipPath} (${Math.round(fs.statSync(zipPath).size / 1024 / 1024)} MB)`);
} catch {
  console.log('  (zip tool not available — folder only)');
}
console.log('Done.');
