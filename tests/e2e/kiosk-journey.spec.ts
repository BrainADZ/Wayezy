import { devices } from '@playwright/test';
import { expect, holdKioskAwake, test } from './fixtures';

test.use({ viewport: { width: 1080, height: 1920 } });

test('kiosk: search → tenant → route → accessible route → QR → WAY EZY GO on a phone', async ({
  page,
  browser,
  errors,
}) => {
  await page.goto('/?device=K-001');
  await expect(page.locator('.kiosk-home .search-field')).toBeVisible();
  await holdKioskAwake(page);

  // Intent search: "italian food" finds Italian restaurants without a literal name match.
  await page.locator('.kiosk-home .search-field').click();
  const input = page.getByRole('dialog').getByRole('textbox');
  await input.fill('italian food');
  const results = page.locator('.result-row');
  await expect(results.filter({ hasText: 'Olive Trattoria' })).toBeVisible();
  await expect(results.filter({ hasText: 'Pizza Express' })).toBeVisible();

  // A misspelt query still gets a helpful answer instead of a dead end.
  await input.fill('zzqx');
  await expect(page.locator('.search-empty')).toBeVisible();
  await input.fill('italian food');
  await results.filter({ hasText: 'Olive Trattoria' }).first().click();

  // Tenant profile.
  const sheet = page.locator('section.place-sheet[aria-label="Olive Trattoria"]');
  await expect(sheet).toBeVisible();
  await expect(sheet.getByRole('button', { name: 'Get directions' })).toBeVisible();
  await expect(sheet.getByRole('button', { name: 'View on map' })).toBeVisible();
  await expect(sheet.getByRole('button', { name: 'Send to phone' })).toBeVisible();
  await sheet.getByRole('button', { name: 'Get directions' }).click();

  // Standard route: two floors up by escalator, realistic walking time.
  const summary = page.locator('.route-summary');
  await expect(summary).toContainText('Olive Trattoria');
  const metrics = page.locator('.route-metrics strong');
  await expect(metrics.first()).toHaveText('2');
  await expect(metrics.nth(1)).toHaveText('128');
  const steps = page.locator('.route-steps .route-step');
  await expect(steps.filter({ hasText: /escalator/i }).first()).toBeVisible();
  await expect(steps.last()).toContainText('Olive Trattoria');
  await expect(page.locator('.transition-banner')).toBeVisible({ timeout: 20_000 });

  // Accessible route switches to the lift.
  await page.getByRole('switch').click();
  await expect(page.getByRole('switch')).toHaveAttribute('aria-checked', 'true');
  await expect(steps.filter({ hasText: /lift/i }).first()).toBeVisible();
  await expect(steps.filter({ hasText: /escalator/i })).toHaveCount(0);
  await expect(metrics.first()).toHaveText('3');

  // Exploded multi-floor view toggles on.
  const allFloors = page.locator('.route-panel-controls button[aria-pressed]');
  await allFloors.click();
  await expect(allFloors).toHaveAttribute('aria-pressed', 'true');

  // Send to phone → signed short-lived token.
  const tokenResponse = page.waitForResponse(
    (r) => r.url().endsWith('/api/route-tokens') && r.request().method() === 'POST',
  );
  await page.locator('.route-actions').getByRole('button', { name: 'Send to phone' }).click();
  const token = (await (await tokenResponse).json()) as {
    token: string;
    url: string;
    expiresAt: string;
  };
  expect(token.url).toMatch(/\/go\/r\/[\w-]+\.[\w-]+$/);
  expect(new Date(token.expiresAt).getTime()).toBeGreaterThan(Date.now());
  await expect(page.locator('.qr-frame.is-ready img')).toBeVisible();
  await expect(page.locator('.qr-panel')).toContainText('Olive Trattoria');

  // The phone opens the same accessible route with no app.
  const phone = await browser.newContext({ ...devices['iPhone 13'], baseURL: undefined });
  const mobile = await phone.newPage();
  const mobileErrors: string[] = [];
  mobile.on('pageerror', (e) => mobileErrors.push(e.message));
  await mobile.goto(new URL(new URL(token.url).pathname, page.url()).href);
  await expect(mobile.locator('.go-destination')).toContainText('Olive Trattoria');
  await expect(mobile.locator('.go-step')).toBeVisible();
  await expect(mobile.locator('.go-accessible')).toHaveClass(/is-on/);
  const stepText = await mobile.locator('.go-step-text').innerText();
  await mobile.getByRole('button', { name: /next step/i }).click();
  await expect(mobile.locator('.go-step-text')).not.toHaveText(stepText);
  expect(mobileErrors).toEqual([]);
  await phone.close();

  // A tampered token is rejected.
  const tampered = await page.request.get(`/api/route-tokens/${token.token.slice(0, -2)}xx`);
  expect(tampered.status()).toBeGreaterThanOrEqual(400);
  expect(errors).toEqual([]);
});
