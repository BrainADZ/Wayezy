import { devices } from '@playwright/test';
import { expect, holdKioskAwake, releaseKiosk, signIn, test } from './fixtures';

/**
 * The 26-step client demo, end to end, with all three apps running together:
 * a portrait kiosk, a phone (WAY EZY GO) and a desktop COMMAND session.
 */
test('client demo script: 26 steps across kiosk, WAY EZY GO and COMMAND', async ({
  browser,
  page: admin,
  errors,
}) => {
  test.setTimeout(300_000);
  const kioskContext = await browser.newContext({ viewport: { width: 1080, height: 1920 } });
  const kiosk = await kioskContext.newPage();
  const kioskErrors: string[] = [];
  kiosk.on('pageerror', (e) => kioskErrors.push(e.message));
  kiosk.on(
    'console',
    (m) => m.type() === 'error' && !/WebGL|GPU stall/i.test(m.text()) && kioskErrors.push(m.text()),
  );

  // Baseline analytics (the demo database is pre-seeded, so step 24 checks for growth).
  await admin.setViewportSize({ width: 1440, height: 900 });
  await signIn(admin);
  type Totals = { searches: number; routeRequests: number; qrGenerated: number };
  const totals = async () =>
    ((await (await admin.request.get('/api/admin/analytics?days=1')).json()) as { totals: Totals })
      .totals;
  const baseline = await totals();

  // 1. Kiosk shows an attractive WAY EZY home.
  await kiosk.goto('/?device=K-001');
  const homeSearch = kiosk.locator('.kiosk-home .search-field');
  await expect(homeSearch).toBeVisible();
  await expect(kiosk.locator('.category-tile')).toHaveCount(8);
  await expect(
    kiosk.locator('.kiosk-map-slot canvas, .kiosk-map-slot svg[role="img"]').first(),
  ).toBeVisible({ timeout: 30_000 });

  // 2–3. Untouched for 10 seconds → full-screen advertisement.
  await kiosk.locator('.kiosk-venue').click(); // a neutral touch; the idle countdown starts here
  const idleFrom = Date.now();
  await expect(kiosk.locator('.ad-mode')).toBeVisible({ timeout: 16_000 });
  expect((Date.now() - idleFrom) / 1000).toBeGreaterThan(8.5);

  // 4–5. Touch → clean home.
  await kiosk.mouse.click(540, 960);
  await expect(kiosk.locator('.ad-mode')).toHaveCount(0);
  await expect(homeSearch).toBeVisible();
  await kiosk.waitForTimeout(800);
  await holdKioskAwake(kiosk);

  // 6–7. Search "Italian food" → restaurant suggestions.
  await homeSearch.click();
  await kiosk.getByRole('dialog').getByRole('textbox').fill('Italian food');
  const olive = kiosk.locator('.result-row').filter({ hasText: 'Olive Trattoria' });
  await expect(olive).toBeVisible();
  await expect(kiosk.locator('.result-row').filter({ hasText: 'Pizza Express' })).toBeVisible();

  // 8–9. Open the restaurant → rich profile.
  await olive.first().click();
  const sheet = kiosk.locator('section.place-sheet[aria-label="Olive Trattoria"]');
  await expect(sheet).toBeVisible();
  await expect(sheet.locator('.offer-card')).toBeVisible();
  await expect(sheet.locator('.status-badge').first()).toBeVisible();
  await expect(sheet).toContainText('Known for');

  // 10–12. Get directions → animated route with time and distance.
  await sheet.getByRole('button', { name: 'Get directions' }).click();
  const metrics = kiosk.locator('.route-metrics strong');
  await expect(metrics.first()).toHaveText('2');
  await expect(metrics.nth(1)).toHaveText('128');
  await expect(kiosk.locator('.transition-banner')).toBeVisible({ timeout: 20_000 });

  // 13–14. Accessible route → lift.
  await kiosk.getByRole('switch').click();
  await expect(kiosk.locator('.route-step').filter({ hasText: /lift/i }).first()).toBeVisible();
  await expect(kiosk.locator('.route-step').filter({ hasText: /escalator/i })).toHaveCount(0);
  await expect(metrics.nth(1)).toHaveText('103');

  // 15. Exploded multi-floor view.
  const explode = kiosk.locator('.route-panel-controls button[aria-pressed]');
  await explode.click();
  await expect(explode).toHaveAttribute('aria-pressed', 'true');

  // 16. Generate QR.
  const tokenResponse = kiosk.waitForResponse(
    (r) => r.url().endsWith('/api/route-tokens') && r.request().method() === 'POST',
  );
  await kiosk.locator('.route-actions').getByRole('button', { name: 'Send to phone' }).click();
  const { url } = (await (await tokenResponse).json()) as { url: string };
  await expect(kiosk.locator('.qr-frame.is-ready img')).toBeVisible();

  // 17–18. Open WAY EZY GO on a phone → same destination, same (accessible) route.
  const phoneContext = await browser.newContext({ ...devices['Pixel 7'] });
  const phone = await phoneContext.newPage();
  await phone.goto(new URL(new URL(url).pathname, kiosk.url()).href);
  await expect(phone.locator('.go-destination')).toContainText('Olive Trattoria');
  await expect(phone.locator('.go-destination')).toContainText('103 m');
  await expect(phone.locator('.go-accessible')).toHaveClass(/is-on/);
  await phoneContext.close();
  await kiosk.locator('.qr-panel .sheet-close').click();
  await kiosk
    .locator('.route-actions')
    .getByRole('button', { name: /start over/i })
    .click();
  await expect(homeSearch).toBeVisible();

  // 19. Open WAY EZY COMMAND.
  await admin.goto('/command');
  await expect(admin.locator('.cmd-stat').first()).toBeVisible();

  // 20. Change an offer.
  await admin.goto('/command/offers');
  await admin.locator('tr').filter({ hasText: 'Pasta Nights' }).first().click();
  const offerDrawer = admin.getByRole('dialog', { name: 'Edit offer' });
  const highlight = offerDrawer.getByLabel('Highlight', { exact: true });
  await highlight.fill('');
  await highlight.pressSequentially('25% OFF', { delay: 5 });
  await offerDrawer.getByRole('button', { name: /^Save/ }).click();
  await expect(admin.locator('.cmd-toast').filter({ hasText: /saved/i })).toBeVisible();

  // 21. Publish.
  await admin.locator('.cmd-publish-pill').click();
  await admin
    .getByRole('dialog', { name: /publish/i })
    .getByRole('button', { name: 'Publish now' })
    .click();
  await expect(admin.locator('.cmd-toast').filter({ hasText: /Published/ })).toBeVisible();

  // 22. The running kiosk reflects the change (live stream, no reload).
  await homeSearch.click();
  await kiosk.getByRole('dialog').getByRole('textbox').fill('olive trattoria');
  await kiosk.locator('.result-row').filter({ hasText: 'Olive Trattoria' }).first().click();
  await expect(kiosk.locator('.place-sheet .offer-card')).toContainText('25% OFF', {
    timeout: 35_000,
  });
  await kiosk.locator('.place-sheet .sheet-close').first().click();

  // 23. Create and schedule an advertisement.
  await admin.goto('/command/advertising');
  await admin.getByRole('button', { name: 'New campaign' }).click();
  const campaignDrawer = admin.getByRole('dialog', { name: 'New ad campaign' });
  const start = new Date(Date.now() + 2 * 86_400_000).toISOString().slice(0, 10);
  const end = new Date(Date.now() + 16 * 86_400_000).toISOString().slice(0, 10);
  await campaignDrawer.getByLabel('Campaign name').fill('Weekend Coffee Festival');
  await campaignDrawer.getByLabel('Advertiser').fill('The Coffee Bean & Tea Leaf');
  await campaignDrawer.getByLabel('Creative').selectOption('media-riverside-house');
  await campaignDrawer.getByLabel('Start date').fill(start);
  await campaignDrawer.getByLabel('End date').fill(end);
  await campaignDrawer.getByRole('button', { name: /Save & publish/ }).click();
  await expect(admin.locator('.cmd-toast').filter({ hasText: /scheduled/i })).toBeVisible();
  await expect(
    admin.locator('tr').filter({ hasText: 'Weekend Coffee Festival' }).getByText('Scheduled'),
  ).toBeVisible();

  // 24. Analytics include what just happened on the kiosk.
  await admin.goto('/command/analytics');
  await expect(admin.locator('.cmd-stat').first()).toBeVisible();
  await expect
    .poll(
      async () => {
        const now = await totals();
        return (
          now.searches > baseline.searches &&
          now.routeRequests > baseline.routeRequests &&
          now.qrGenerated > baseline.qrGenerated
        );
      },
      { timeout: 30_000, intervals: [2000] },
    )
    .toBe(true);

  // 25–26. Close a corridor → an open route recalculates automatically.
  await homeSearch.click();
  await kiosk.getByRole('dialog').getByRole('textbox').fill('olive trattoria');
  await kiosk.locator('.result-row').filter({ hasText: 'Olive Trattoria' }).first().click();
  await kiosk
    .locator('section.place-sheet')
    .getByRole('button', { name: 'Get directions' })
    .click();
  if ((await kiosk.getByRole('switch').getAttribute('aria-checked')) === 'true')
    await kiosk.getByRole('switch').click();
  await expect(metrics.nth(1)).toHaveText('128');

  await admin.goto('/command/routing');
  await admin.getByLabel('Search table').fill('l0-e-esc-e-up');
  await admin
    .locator('tr')
    .filter({ hasText: 'l0-e-esc-e-up' })
    .getByRole('button', { name: 'Close' })
    .click();
  await admin
    .getByRole('dialog', { name: 'Close corridor' })
    .getByRole('button', { name: 'Close corridor' })
    .click();
  await expect(
    admin.locator('.cmd-toast').filter({ hasText: /closed and published/i }),
  ).toBeVisible();

  await expect(kiosk.getByText('Route updated')).toBeVisible({ timeout: 35_000 });
  await expect(metrics.nth(1)).not.toHaveText('128');

  // Leave the shared test database as we found it.
  await admin.goto('/command/routing');
  await admin.getByLabel('Search table').fill('l0-e-esc-e-up');
  await admin
    .locator('tr')
    .filter({ hasText: 'l0-e-esc-e-up' })
    .getByRole('button', { name: 'Reopen' })
    .click();
  await expect(admin.locator('.cmd-toast').filter({ hasText: /reopened/i })).toBeVisible();

  await releaseKiosk(kiosk);
  await kioskContext.close();
  expect(kioskErrors).toEqual([]);
  expect(errors).toEqual([]);
});
