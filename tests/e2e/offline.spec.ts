import { expect, test } from '@playwright/test';
import { holdKioskAwake, releaseKiosk } from './fixtures';

/**
 * Offline kiosk: after one online visit the service worker, the cached published directory and the warmed media
 * cache let a kiosk cold-start, show it is offline, search, route and play adverts with the network unplugged.
 * Service workers only exist in the production build.
 */
test.use({ viewport: { width: 1080, height: 1920 } });

test('kiosk cold-starts, searches, routes and plays adverts with no network after one online visit', async ({
  page,
  context,
}) => {
  test.skip(
    process.env.E2E_TARGET !== 'build',
    'The service worker is only registered in the production build.',
  );
  test.setTimeout(120_000);
  const pageErrors: string[] = [];
  page.on('pageerror', (e) => pageErrors.push(e.message));

  await page.goto('/?device=K-001');
  await expect(page.locator('.kiosk-home .search-field')).toBeVisible();
  await holdKioskAwake(page);
  await expect(
    page.locator('.kiosk-map-slot canvas, .kiosk-map-slot svg[role="img"]').first(),
  ).toBeVisible({ timeout: 30_000 });
  // The service worker installs (precaching the app shell and map code), takes control and caches published media.
  await expect
    .poll(
      () =>
        page.evaluate(async () => {
          if (!navigator.serviceWorker.controller) return false;
          const media = await caches.open('wez-media-v1');
          return (
            Boolean(await media.match('/demo/ads/festive-fashion-week.webp')) &&
            (await caches.keys()).some((k) => k.startsWith('wez-shell-'))
          );
        }),
      { timeout: 45_000, intervals: [1000] },
    )
    .toBe(true);

  await context.setOffline(true);
  await page.reload();
  await expect(page.locator('.kiosk-home .search-field')).toBeVisible({ timeout: 20_000 });
  await holdKioskAwake(page);
  await expect(page.locator('.offline-pill')).toBeVisible({ timeout: 20_000 });

  await page.locator('.kiosk-home .search-field').click();
  await page.getByRole('dialog').getByRole('textbox').fill('coffee');
  await page.locator('.result-row').filter({ hasText: 'Starbucks' }).first().click();
  await page.locator('section.place-sheet').getByRole('button', { name: 'Get directions' }).click();
  await expect(page.locator('.route-summary')).toContainText('Starbucks');
  await expect(page.locator('.route-steps .route-step').first()).toBeVisible();

  // Attract mode still plays real creatives from the cache.
  await releaseKiosk(page);
  await expect(page.locator('.ad-mode')).toBeVisible({ timeout: 20_000 });
  await expect
    .poll(
      () =>
        page.evaluate(() => {
          const media = document.querySelector('.ad-mode .ad-media');
          if (media instanceof HTMLImageElement) return media.complete && media.naturalWidth > 0;
          if (media instanceof HTMLVideoElement) return media.readyState >= 2;
          return Boolean(document.querySelector('.ad-mode .ad-house'));
        }),
      { timeout: 15_000 },
    )
    .toBe(true);

  await context.setOffline(false);
  expect(pageErrors).toEqual([]);
});
