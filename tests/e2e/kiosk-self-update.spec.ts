import { expect, test } from './fixtures';

test.use({ viewport: { width: 1080, height: 1920 } });

test('kiosk picks up a new deployment at its next idle moment, once', async ({ page }) => {
  test.setTimeout(90_000);
  // Pretend the server now has a newer client build than the one this page was loaded with.
  await page.route('**/api/config', async (route) => {
    const response = await route.fetch();
    const body = (await response.json()) as Record<string, unknown>;
    await route.fulfill({ response, json: { ...body, clientBuild: '/assets/index-NEWBUILD.js' } });
  });
  await page.goto('/?device=K-001');
  await expect(page.locator('.kiosk-home .search-field')).toBeVisible();
  await page.locator('.kiosk-venue').click();

  // Idle → reload instead of attract mode (the visitor-facing session was already empty).
  const reloaded = page.waitForEvent('load', { timeout: 20_000 });
  await reloaded;
  await expect(page.locator('.kiosk-home .search-field')).toBeVisible();

  // The reloaded page still differs (same fake build): no reload loop, attract mode runs normally.
  let reloads = 0;
  page.on('load', () => reloads++);
  await expect(page.locator('.ad-mode')).toBeVisible({ timeout: 20_000 });
  expect(reloads).toBe(0);
});
