import fs from 'node:fs';
import path from 'node:path';
import { defineConfig, devices } from '@playwright/test';
import { E2E_ADMIN, E2E_PORT } from './tests/e2e/fixtures';

/**
 * E2E runs against an isolated server: its own embedded database under test-results/,
 * test-only credentials, and a fixed route-token secret. Nothing touches `.data`.
 *
 *   npm run test:e2e              → dev server (Vite middleware), fastest to iterate
 *   E2E_TARGET=build npm run test:e2e → the production bundle in dist/ (run `npm run build` first)
 */
const dataDir = path.join('test-results', 'e2e-data');

// The config is evaluated in the runner and in every worker; only the runner resets the database.
if (!process.env.TEST_WORKER_INDEX && !process.env.E2E_KEEP_DATA)
  fs.rmSync(dataDir, { recursive: true, force: true });

const useBuild = process.env.E2E_TARGET === 'build';
// E2E_LOW_MEMORY=1 keeps the embedded PostgreSQL (WebAssembly) on the baseline compiler; for small CI runners.
const nodeFlags = process.env.E2E_LOW_MEMORY ? '--no-wasm-tier-up ' : '';

export default defineConfig({
  testDir: 'tests/e2e',
  outputDir: 'test-results/e2e-artifacts',
  fullyParallel: false,
  workers: 1,
  timeout: 90_000,
  expect: { timeout: 15_000 },
  retries: process.env.CI ? 1 : 0,
  reporter: [['list'], ['json', { outputFile: 'test-results/e2e-results.json' }]],
  use: {
    baseURL: `http://localhost:${E2E_PORT}`,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    ...devices['Desktop Chrome'],
    // Installed Google Chrome by default (proprietary codecs for the MP4/WebM ad path); E2E_CHANNEL=chromium for CI images.
    channel: process.env.E2E_CHANNEL ?? 'chrome',
    launchOptions: {
      args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'],
    },
  },
  webServer: process.env.E2E_EXTERNAL
    ? undefined
    : {
        command: useBuild
          ? `node ${nodeFlags}dist/server/index.js`
          : `node ${nodeFlags}node_modules/tsx/dist/cli.mjs apps/server/index.ts`,
        url: `http://localhost:${E2E_PORT}/api/health`,
        reuseExistingServer: false,
        timeout: 120_000,
        stdout: 'ignore',
        stderr: 'pipe',
        env: {
          NODE_ENV: useBuild ? 'production' : 'development',
          APP_MODE: 'demo',
          PORT: String(E2E_PORT),
          HOST: '127.0.0.1',
          DATA_DIR: dataDir,
          DATABASE_URL: '',
          MONGODB_URI: '',
          MONGODB_DATABASE: 'wayezy-e2e',
          MONGODB_IMPORT_PGLITE: 'false',
          STORAGE_DRIVER: 'local',
          SEED_DEMO: 'true',
          DEMO_ANALYTICS: 'false',
          PUBLIC_BASE_URL: `http://localhost:${E2E_PORT}`,
          ROUTE_TOKEN_SECRET: 'e2e-route-token-secret-0123456789abcdef',
          ADMIN_EMAIL: E2E_ADMIN.email,
          ADMIN_PASSWORD: E2E_ADMIN.password,
          DEMO_USERS: 'false',
          LOG_LEVEL: 'warn',
        },
      },
});
