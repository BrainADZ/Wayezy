import { test, expect, holdKioskAwake, signIn } from './fixtures';

test('reference kiosk: floors, map controls, routes, accessible routing and signed GO handoff', async ({
  page,
  errors,
}) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/?device=K-003');
  await expect(page.locator('.map-experience')).toBeVisible();
  await holdKioskAwake(page);
  await expect(page.locator('.explorer-search-result').first()).toBeVisible();
  await expect(page.getByRole('button', { name: 'Show Level 1', exact: true })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  const map = page.locator('.explorer-map-svg');
  await expect(map).toContainText('YOU ARE HERE');
  await page.getByRole('button', { name: 'Show Level 3', exact: true }).click();
  await expect(page.locator('.reference-floor')).toBeVisible();
  const initialView = await map.getAttribute('viewBox');
  await page.getByRole('button', { name: 'Zoom in', exact: true }).click();
  await expect(map).not.toHaveAttribute('viewBox', initialView!);
  await page.getByRole('button', { name: 'Fit map', exact: true }).click();
  await page.getByRole('textbox', { name: 'Search stores and amenities' }).fill('Lacoste');
  await page.locator('.explorer-search-result').filter({ hasText: 'Lacoste' }).click();
  await expect(page.getByRole('heading', { name: 'Lacoste', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Directions', exact: true }).click();
  await page.getByRole('checkbox', { name: 'Accessible', exact: true }).check();
  await expect(page.locator('.explorer-route-summary')).toContainText('Step-free route');
  await expect(page.locator('.explorer-route-line').first()).toBeVisible();
  await page.getByRole('button', { name: 'Start', exact: true }).click();
  await expect(page.getByRole('dialog')).toBeVisible();
  await expect(page.getByAltText('QR code')).toBeVisible();
  await page.getByRole('dialog').getByRole('button', { name: 'Close', exact: true }).click();
  await expect(page.getByRole('complementary', { name: 'Step-by-step directions' })).toBeVisible();
  await expect(page.locator('.explorer-step-list')).toContainText('lift');
  await page.screenshot({ path: 'test-results/reference-route.png' });
  const token = await page.request.post('/api/route-tokens', {
    headers: { 'x-requested-with': 'way-ezy' },
    data: {
      deviceId: 'K-003',
      startNodeId: 'l1-kiosk-k003',
      destinationId: 'ref-lacoste',
      accessible: true,
    },
  });
  expect(token.ok()).toBeTruthy();
  const { url } = await token.json();
  await page.goto(url);
  await expect(page.locator('.go-shell')).toBeVisible();
  await expect(page.getByText('Lacoste').first()).toBeVisible();
  expect(errors).toEqual([]);
});

test('reference kiosk: offline search and route, idle advertising and clean session reset', async ({
  page,
  context,
}) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/?device=K-001');
  await expect(page.locator('.explorer-search-result').first()).toBeVisible();
  const menu = await page.getByRole('button', { name: 'Menu', exact: true }).boundingBox();
  expect(menu!.x + menu!.width).toBeLessThanOrEqual(390);
  const floors = await page.locator('.explorer-floor-controls').boundingBox();
  const controls = await page.locator('.explorer-map-controls').boundingBox();
  expect(controls!.y).toBeGreaterThanOrEqual(floors!.y + floors!.height);
  await context.setOffline(true);
  await page.getByRole('textbox', { name: 'Search stores and amenities' }).fill('Lacoste');
  await page.locator('.explorer-search-result').filter({ hasText: 'Lacoste' }).click();
  await page.getByRole('button', { name: 'Directions', exact: true }).click();
  await expect(page.locator('.explorer-route-summary')).toBeVisible();
  await context.setOffline(false);
  await expect(page.locator('.ad-mode')).toBeVisible({ timeout: 18000 });
  await page.locator('.ad-mode').dispatchEvent('pointerdown');
  await expect(page.getByRole('textbox', { name: 'Search stores and amenities' })).toHaveValue('');
  await expect(page.locator('.explorer-search-result').first()).toBeVisible();
  await expect(page.getByRole('button', { name: 'Show Level 0', exact: true })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  expect(errors).toEqual([]);
});

test('COMMAND publishes store names and map geometry into a running reference kiosk', async ({
  page,
  browser,
  errors,
}) => {
  await signIn(page, '/command/tenants/ref-lacoste');
  const context = await browser.newContext({
    viewport: { width: 1440, height: 900 },
  });
  const kiosk = await context.newPage();
  await kiosk.goto('/?device=K-001');
  await expect(kiosk.locator('.map-experience')).toBeVisible();
  await holdKioskAwake(kiosk);
  const headers = { 'x-requested-with': 'way-ezy' };
  const tenants = await (await page.request.get('/api/admin/resources/tenants')).json();
  const tenant = tenants.find((item: { id: string }) => item.id === 'ref-lacoste');
  const nodes = await (await page.request.get('/api/admin/resources/nodes')).json();
  const node = nodes.find((item: { id: string }) => item.id === tenant.nodeId);
  const features = await (await page.request.get('/api/admin/resources/features')).json();
  const feature = features.find((item: { id: string }) => item.id === tenant.featureId);
  try {
    const drawer = page.getByRole('dialog', { name: 'Lacoste', exact: true });
    await drawer.getByLabel('Tenant name', { exact: true }).fill('Lacoste Studio');
    await drawer.getByRole('button', { name: 'Save tenant' }).click();
    await expect(page.locator('.cmd-toast').filter({ hasText: /saved/i })).toBeVisible();
    expect(
      (
        await page.request.put(`/api/admin/resources/nodes/${node.id}`, {
          headers,
          data: { ...node, x: node.x + 12 },
        })
      ).ok(),
    ).toBeTruthy();
    const points = feature.points.map(([x, y]: number[]) => [x + 12, y]);
    expect(
      (
        await page.request.put(`/api/admin/resources/features/${feature.id}`, {
          headers,
          data: { ...feature, points },
        })
      ).ok(),
    ).toBeTruthy();
    await expect(kiosk.getByRole('button', { name: 'View Lacoste', exact: true })).toBeVisible();
    await expect(
      kiosk.getByRole('button', { name: 'View Lacoste Studio', exact: true }),
    ).toHaveCount(0);
    await page.locator('.cmd-publish-pill').click();
    const dialog = page.getByRole('dialog', { name: /publish/i });
    await dialog.getByRole('textbox').fill('Verify reference kiosk map integration');
    await dialog.getByRole('button', { name: 'Publish now' }).click();
    const marker = kiosk.getByRole('button', {
      name: 'View Lacoste Studio',
      exact: true,
    });
    await expect(marker).toBeVisible({ timeout: 35000 });
    await expect(marker).toHaveAttribute('transform', `translate(${node.x + 12} ${node.y})`);
    await expect(kiosk.locator(`[data-feature-id="${feature.id}"]`)).toHaveAttribute(
      'points',
      points.map((p: number[]) => p.join(',')).join(' '),
    );
    await kiosk.screenshot({ path: 'test-results/reference-desktop.png' });
    await kiosk.setViewportSize({ width: 1080, height: 1920 });
    await kiosk.screenshot({ path: 'test-results/reference-portrait.png' });
    await kiosk.setViewportSize({ width: 390, height: 844 });
    await kiosk.screenshot({ path: 'test-results/reference-mobile.png' });
    expect(
      await kiosk.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
    ).toBeTruthy();
  } finally {
    await page.request.put(`/api/admin/resources/tenants/${tenant.id}`, {
      headers,
      data: tenant,
    });
    await page.request.put(`/api/admin/resources/nodes/${node.id}`, {
      headers,
      data: node,
    });
    await page.request.put(`/api/admin/resources/features/${feature.id}`, {
      headers,
      data: feature,
    });
    await page.request.post('/api/admin/publish', {
      headers,
      data: { note: 'Restore reference kiosk test changes' },
    });
    await context.close();
  }
  expect(errors).toEqual([]);
});
