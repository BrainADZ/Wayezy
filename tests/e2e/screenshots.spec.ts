import fs from 'node:fs';
import path from 'node:path';
import type { Page } from '@playwright/test';
import { expect, holdKioskAwake, signIn, test } from './fixtures';

/**
 * Captures the deliverable screenshots into docs/screenshots/ (npm run screenshots).
 * Each shot waits for real content (3D canvas, finished route animation) rather than fixed sleeps where possible.
 */
const outDir = path.join('docs', 'screenshots');
fs.mkdirSync(outDir, { recursive: true });
const shot = (page: Page, name: string) =>
  page.screenshot({ path: path.join(outDir, `${name}.png`), animations: 'disabled' });

async function waitForMap(page: Page) {
  await expect(
    page.locator('.kiosk-map-slot canvas, .kiosk-map-slot svg[role="img"]').first(),
  ).toBeVisible({ timeout: 30_000 });
  // Let the camera intro, label fade-in and label declutter settle.
  await page.waitForTimeout(4500);
}

test.describe.configure({ mode: 'serial' });

test.describe('kiosk 1080×1920', () => {
  test.use({ viewport: { width: 1080, height: 1920 } });

  test('home, search, tenant, route, multi-floor, accessible, QR, ads', async ({ page }) => {
    test.setTimeout(180_000);
    await page.goto('/?device=K-001');
    await expect(page.locator('.kiosk-home .search-field')).toBeVisible();
    await holdKioskAwake(page);
    await waitForMap(page);
    await shot(page, '01-kiosk-home');

    await page.locator('.kiosk-home .search-field').click();
    await page.getByRole('dialog').getByRole('textbox').fill('italian food');
    await expect(page.locator('.result-row').filter({ hasText: 'Olive Trattoria' })).toBeVisible();
    await page.waitForTimeout(600);
    await shot(page, '02-kiosk-search');

    await page.locator('.result-row').filter({ hasText: 'Olive Trattoria' }).first().click();
    const sheet = page.locator('section.place-sheet[aria-label="Olive Trattoria"]');
    await expect(sheet).toBeVisible();
    await page.waitForTimeout(1200);
    await shot(page, '03-kiosk-tenant');

    await sheet.getByRole('button', { name: 'Get directions' }).click();
    await expect(page.locator('.route-summary')).toContainText('Olive Trattoria');
    await page.waitForTimeout(3500);
    await shot(page, '04-kiosk-route-floor-change');
    await expect(page.locator('.arrived-chip')).toBeVisible({ timeout: 40_000 });
    await page.waitForTimeout(800);
    await shot(page, '05-kiosk-route-3d');

    await page.locator('.route-panel-controls button[aria-pressed]').click();
    await expect(page.locator('.route-step.is-arrive.is-active')).toBeVisible({ timeout: 40_000 });
    await page.waitForTimeout(1200);
    await shot(page, '06-kiosk-multi-floor');
    await page.locator('.route-panel-controls button[aria-pressed]').click();

    await page.getByRole('switch').click();
    await expect(page.locator('.accessible-badge')).toBeVisible();
    await expect(page.locator('.arrived-chip')).toBeVisible({ timeout: 40_000 });
    await page.waitForTimeout(800);
    await shot(page, '07-kiosk-accessible-route');

    await page.locator('.route-actions').getByRole('button', { name: 'Send to phone' }).click();
    await expect(page.locator('.qr-frame.is-ready img')).toBeVisible();
    await page.waitForTimeout(500);
    await shot(page, '08-kiosk-qr-handoff');

    // Attract mode: stop the keep-alive, go home, wait for the idle timeout.
    await page.locator('.qr-panel .sheet-close').click();
    await page.evaluate(() => {
      const w = window as unknown as { __wezAwake?: number };
      if (w.__wezAwake) window.clearInterval(w.__wezAwake);
    });
    await expect(page.locator('.ad-mode')).toBeVisible({ timeout: 20_000 });
    await page.waitForTimeout(1500);
    await shot(page, '09-kiosk-advertisement');
  });
});

async function routeTokenUrl(page: Page, accessible = false) {
  const response = await page.request.post('/api/route-tokens', {
    headers: { 'x-requested-with': 'way-ezy' },
    data: {
      startNodeId: 'l0-kiosk-k001',
      destinationId: 'olive-trattoria',
      accessible,
      deviceId: 'K-001',
    },
  });
  expect(response.ok()).toBeTruthy();
  const { url } = (await response.json()) as { url: string };
  return new URL(url).pathname;
}

for (const [label, size] of [
  ['390x844', { width: 390, height: 844 }],
  ['430x932', { width: 430, height: 932 }],
] as const) {
  test.describe(`WAY EZY GO ${label}`, () => {
    test.use({ viewport: size, isMobile: true, hasTouch: true, deviceScaleFactor: 2 });
    test(`route hand-off on a phone ${label}`, async ({ page }) => {
      await page.goto(await routeTokenUrl(page));
      await expect(page.locator('.go-destination')).toContainText('Olive Trattoria');
      await expect(page.locator('.go-map canvas, .go-map svg[role="img"]').first()).toBeVisible({
        timeout: 30_000,
      });
      await page.waitForTimeout(4000);
      await shot(page, `10-go-route-${label}`);
      if (label === '390x844') {
        await page.goto('/go');
        await expect(page.locator('.go-search input')).toBeVisible();
        await page.locator('.go-search input').fill('coffee');
        await page.waitForTimeout(600);
        await shot(page, '11-go-browse-390x844');
      }
    });
  });
}

test.describe('tablet 768×1024', () => {
  test.use({ viewport: { width: 768, height: 1024 }, hasTouch: true });
  test('WAY EZY GO on a tablet', async ({ page }) => {
    await page.goto(await routeTokenUrl(page, true));
    await expect(page.locator('.go-destination')).toContainText('Olive Trattoria');
    await page.waitForTimeout(4000);
    await shot(page, '12-go-tablet-768');
  });
});

for (const [label, size] of [
  ['1440', { width: 1440, height: 900 }],
  ['1920', { width: 1920, height: 1080 }],
] as const) {
  test.describe(`COMMAND ${label}`, () => {
    test.use({ viewport: size });
    test(`dashboard and editors ${label}`, async ({ page }) => {
      await signIn(page);
      await expect(page.locator('.cmd-stat').first()).toBeVisible();
      await page.waitForTimeout(800);
      await shot(page, `13-command-dashboard-${label}`);
      if (label === '1440') {
        for (const [section, name] of [
          ['tenants/olive-trattoria', '14-command-tenant-editor'],
          ['advertising', '15-command-campaigns'],
          ['maps', '16-command-map-editor'],
          ['routing', '17-command-routing'],
          ['devices', '18-command-devices'],
          ['analytics', '19-command-analytics'],
        ] as const) {
          await page.goto(`/command/${section}`);
          await expect(page.locator('.cmd-page-header h1').first()).toBeVisible();
          await page.waitForTimeout(900);
          await shot(page, name);
        }
      }
    });
  });
}
