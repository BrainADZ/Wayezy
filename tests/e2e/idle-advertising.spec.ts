import { expect, test } from './fixtures';

test.use({ viewport: { width: 1080, height: 1920 } });

test('kiosk: 10 s idle → advert → touch → clean home screen', async ({ page, errors }) => {
  await page.goto('/?device=K-001');
  await expect(page.locator('.kiosk-home .search-field')).toBeVisible();

  // Leave the kiosk mid-session: search overlay open with a query typed.
  await page.locator('.kiosk-home .search-field').click();
  await page.getByRole('dialog').getByRole('textbox').fill('coffee');
  await expect(page.locator('.result-row').first()).toBeVisible();
  const lastTouch = Date.now();

  const ad = page.locator('.ad-mode');
  await expect(ad).toBeVisible({ timeout: 16_000 });
  const idleSeconds = (Date.now() - lastTouch) / 1000;
  expect(idleSeconds).toBeGreaterThan(8.5);
  expect(idleSeconds).toBeLessThan(14);
  await expect(page.locator('.ad-mode .ad-media, .ad-mode .ad-house').first()).toBeVisible();
  await expect(page.locator('.search-overlay')).toHaveCount(0);

  // Touch anywhere (over where a category tile sits) returns to a clean home without click-through.
  await page.mouse.click(540, 700);
  await expect(ad).toHaveCount(0);
  await expect(page.locator('.kiosk-home .search-field')).toBeVisible();
  await expect(page.locator('.category-screen')).toHaveCount(0);
  await expect(page.locator('.place-sheet')).toHaveCount(0);
  // Taps in the first ~650 ms after waking are swallowed so the wake-up tap never lands on a control.
  await page.waitForTimeout(800);
  await page.locator('.kiosk-home .search-field').click();
  await expect(page.getByRole('dialog').getByRole('textbox')).toHaveValue('');
  expect(errors).toEqual([]);
});
