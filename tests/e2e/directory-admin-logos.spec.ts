import sharp from 'sharp';
import { expect, holdKioskAwake, signIn, test } from './fixtures';
import type { Tenant } from '../../packages/domain';

test.use({ trace: 'off', viewport: { width: 1600, height: 1000 } });

test('admin uploads a first-floor logo, adds a map-linked store and publishes to an already running kiosk', async ({
  page,
  browser,
  errors,
}) => {
  test.setTimeout(240_000);
  const failedRequests: string[] = [];
  page.on('response', (response) => {
    if (response.status() >= 400) failedRequests.push(`${response.status()} ${response.url()}`);
  });
  await signIn(page, '/command/tenants');
  await expect(page.getByRole('button', { name: 'Add tenant', exact: true })).toBeVisible();
  const boot = await (await page.request.get('/api/admin/bootstrap')).json();
  const original: Tenant = boot.data.tenants.find(
    (tenant: Tenant) => tenant.id === 'first-tenant-greenr',
  );
  expect(boot.data.tenants.filter((tenant: Tenant) => tenant.floorId === 'l1')).toHaveLength(20);
  const kiosk = await browser.newPage({ viewport: { width: 1920, height: 1000 } });
  const headers = { 'x-requested-with': 'way-ezy' };
  let logo = '';
  let newId = '';
  try {
    await kiosk.goto('/?device=K-001');
    await holdKioskAwake(kiosk);
    await kiosk.getByRole('button', { name: 'Show First Floor', exact: true }).click();
    await expect(kiosk.locator('.first-floor-source')).toHaveAttribute('data-map-status', 'ready', {
      timeout: 45000,
    });
    await page.goto(`/command/tenants/${original.id}`);
    const editor = page.getByRole('dialog', { name: original.name, exact: true });
    await expect(editor).toBeVisible();
    const png = await sharp({
      create: { width: 420, height: 220, channels: 4, background: '#075b4b' },
    })
      .composite([
        {
          input: Buffer.from(
            '<svg width="420" height="220"><text x="210" y="126" text-anchor="middle" font-family="Arial" font-size="56" fill="white">STUDIO</text></svg>',
          ),
        },
      ])
      .png()
      .toBuffer();
    await editor
      .locator('input[type="file"]')
      .setInputFiles({ name: 'studio-logo.png', mimeType: 'image/png', buffer: png });
    await expect(editor.locator('.cmd-media-current img').first()).toHaveAttribute(
      'src',
      /^\/media\//,
    );
    logo = (await editor.locator('.cmd-media-current img').first().getAttribute('src')) ?? '';
    await editor.getByLabel('Tenant name', { exact: true }).fill('Greenr Studio');
    await editor.getByRole('button', { name: 'Save tenant', exact: true }).click();
    const oldBrand = kiosk.locator('.directory-brand[data-place-id="first-tenant-greenr"]');
    await expect(oldBrand.locator('image')).toHaveCount(0);

    await page.getByRole('button', { name: 'Add tenant', exact: true }).click();
    const add = page.getByRole('dialog', { name: 'New tenant', exact: true });
    await add.getByLabel('Tenant name', { exact: true }).fill('Studio Annex');
    await add.getByRole('button', { name: 'Choose', exact: true }).click();
    await add
      .locator('.cmd-media-tile')
      .filter({ has: page.locator(`img[src="${logo}"]`) })
      .click();
    await add.getByRole('tab', { name: 'Map location', exact: true }).click();
    await add.getByLabel('Floor', { exact: true }).selectOption('l1');
    await add.getByLabel('Map unit', { exact: true }).selectOption('first-module-22');
    const entrance = boot.data.nodes.find(
      (node: { floorId: string; type: string }) =>
        node.floorId === 'l1' && node.type === 'corridor',
    );
    await add
      .getByLabel('Entrance node (route destination)', { exact: true })
      .selectOption(entrance.id);
    await add.getByRole('button', { name: 'Save tenant', exact: true }).click();
    await expect(add).not.toBeVisible();
    const updated = await (await page.request.get('/api/admin/bootstrap')).json();
    newId = updated.data.tenants.find((tenant: Tenant) => tenant.name === 'Studio Annex').id;
    await expect(kiosk.locator('.directory-brand[data-brand-module="module-22"]')).toHaveText(
      'TO LET',
    );
    await page.locator('.cmd-publish-pill').click();
    const publish = page.getByRole('dialog', { name: /publish/i });
    await publish.getByRole('button', { name: 'Publish now' }).click();
    await expect(oldBrand.locator('image')).toHaveAttribute('href', logo, { timeout: 35000 });
    const annex = kiosk.locator(`.directory-brand[data-place-id="${newId}"]`);
    await expect(annex.locator('image')).toHaveAttribute('href', logo);
    await expect(annex).not.toContainText('TO LET');
    await kiosk.locator(`[data-place-id="${newId}"][role="button"]`).focus();
    await kiosk.keyboard.press('Enter');
    await expect(kiosk.locator('.explorer-panel')).toHaveAttribute(
      'aria-label',
      'Studio Annex details',
    );
    await kiosk.screenshot({
      path: 'test-results/admin-first-floor-logo.png',
      animations: 'disabled',
    });
    await page.goto('/command/maps');
    await page.getByRole('tab', { name: 'First Floor', exact: true }).click();
    await expect(page.locator('.cmd-ground-map-canvas .first-floor-source')).toHaveAttribute(
      'data-map-status',
      'ready',
      { timeout: 45000 },
    );
    await expect(
      page.locator(`.cmd-ground-map-canvas .directory-brand[data-place-id="${newId}"] image`),
    ).toHaveAttribute('href', logo);
    await page.screenshot({
      path: 'test-results/admin-first-floor-editor.png',
      animations: 'disabled',
    });
    await page.goto('/command/routing');
    await page.getByLabel('To', { exact: true }).selectOption(original.nodeId);
    await expect(page.getByText('First Floor route available')).toBeVisible();
    expect(errors, JSON.stringify(failedRequests)).toEqual([]);
  } finally {
    await page.request.put(`/api/admin/resources/tenants/${original.id}`, {
      headers,
      data: original,
    });
    if (newId) await page.request.delete(`/api/admin/resources/tenants/${newId}`, { headers });
    await page.request.post('/api/admin/publish', {
      headers,
      data: { note: 'Restore browser test edits' },
    });
    await kiosk.close();
  }
});
