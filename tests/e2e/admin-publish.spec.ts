import { expect, holdKioskAwake, signIn, test } from './fixtures';

test('COMMAND: edit tenant → publish → running kiosk updates live; corridor closure reroutes', async ({
  browser,
  page,
  errors,
}) => {
  // A kiosk is already running on the floor.
  const kioskContext = await browser.newContext({ viewport: { width: 1080, height: 1920 } });
  const kiosk = await kioskContext.newPage();
  const kioskErrors: string[] = [];
  kiosk.on('pageerror', (e) => kioskErrors.push(e.message));
  await kiosk.goto('/?device=K-001');
  await expect(kiosk.locator('.kiosk-home .search-field')).toBeVisible();
  await holdKioskAwake(kiosk);

  // Admin renames a tenant, typing key by key (guards against focus loss in the editor).
  await page.setViewportSize({ width: 1440, height: 900 });
  await signIn(page, '/command/tenants/olive-trattoria');
  const drawer = page.getByRole('dialog', { name: 'Olive Trattoria' });
  await expect(drawer).toBeVisible();
  const name = drawer.getByLabel('Tenant name', { exact: true });
  await name.fill('');
  await name.pressSequentially('Olive Trattoria Ristorante', { delay: 5 });
  await expect(name).toHaveValue('Olive Trattoria Ristorante');
  await drawer.getByRole('button', { name: 'Save tenant' }).click();
  await expect(page.locator('.cmd-toast').filter({ hasText: /saved/i })).toBeVisible();
  await expect(page.locator('.cmd-publish-pill')).toContainText('unpublished');

  // Unpublished edits never reach visitors.
  await kiosk.locator('.kiosk-home .search-field').click();
  const kioskSearch = kiosk.getByRole('dialog').getByRole('textbox');
  await kioskSearch.fill('ristorante');
  await expect(
    kiosk.locator('.result-row').filter({ hasText: 'Olive Trattoria Ristorante' }),
  ).toHaveCount(0);
  await kiosk.getByRole('dialog').getByRole('button', { name: 'Close', exact: true }).click();

  // Publish.
  await page.locator('.cmd-publish-pill').click();
  const dialog = page.getByRole('dialog', { name: /publish/i });
  await dialog.getByRole('textbox').fill('E2E: rename Olive Trattoria');
  await dialog.getByRole('button', { name: 'Publish now' }).click();
  await expect(page.locator('.cmd-toast').filter({ hasText: /Published/ })).toBeVisible();
  await expect(page.locator('.cmd-publish-pill')).toContainText('All changes live');

  // The running kiosk picks it up over the live stream — no reload.
  await kiosk.locator('.kiosk-home .search-field').click();
  await kioskSearch.fill('ristorante');
  await expect(
    kiosk.locator('.result-row').filter({ hasText: 'Olive Trattoria Ristorante' }),
  ).toBeVisible({ timeout: 35_000 });

  // The kiosk shows the route to the renamed tenant.
  await kiosk
    .locator('.result-row')
    .filter({ hasText: 'Olive Trattoria Ristorante' })
    .first()
    .click();
  await kiosk
    .locator('section.place-sheet')
    .getByRole('button', { name: 'Get directions' })
    .click();
  const metres = kiosk.locator('.route-metrics strong').nth(1);
  await expect(metres).toHaveText('128');

  // Closing the corridor to the east escalator publishes immediately; the open route recalculates.
  await page.goto('/command/routing');
  await expect(page.locator('.cmd-page-header h1')).toHaveText('Routing');
  await page.getByLabel('Search table').fill('l0-e-esc-e-up');
  await page
    .locator('tr')
    .filter({ hasText: 'l0-e-esc-e-up' })
    .getByRole('button', { name: 'Close' })
    .click();
  const closeDrawer = page.getByRole('dialog', { name: 'Close corridor' });
  await closeDrawer.getByRole('button', { name: 'Close corridor' }).click();
  await expect(
    page.locator('.cmd-toast').filter({ hasText: /closed and published/i }),
  ).toBeVisible();
  await expect(
    page.locator('tr').filter({ hasText: 'l0-e-esc-e-up' }).getByText('Closed'),
  ).toBeVisible();

  await expect(kiosk.getByText('Route updated')).toBeVisible({ timeout: 35_000 });
  await expect(metres).not.toHaveText('128');

  // Restore the shared E2E database for the specs that run after this one.
  const headers = { 'x-requested-with': 'way-ezy' };
  const tenants = (await (await page.request.get('/api/admin/resources/tenants')).json()) as {
    id: string;
    name: string;
  }[];
  const renamed = tenants.find((t) => t.id === 'olive-trattoria')!;
  expect(
    (
      await page.request.put('/api/admin/resources/tenants/olive-trattoria', {
        headers,
        data: { ...renamed, name: 'Olive Trattoria' },
      })
    ).ok(),
  ).toBeTruthy();
  expect(
    (
      await page.request.post('/api/admin/routing/closures', {
        headers,
        data: { edgeId: 'l0-e-esc-e-up', closed: false, publish: true },
      })
    ).ok(),
  ).toBeTruthy();

  await kiosk.close();
  await kioskContext.close();
  expect(kioskErrors).toEqual([]);
  expect(errors).toEqual([]);
});
