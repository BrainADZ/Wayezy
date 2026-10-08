import { expect, signIn, test } from './fixtures';

test.use({ trace: 'off', viewport: { width: 1440, height: 900 } });

test('COMMAND shows the architectural map, network tools and live Ground Floor closures', async ({
  page,
  errors,
}) => {
  await signIn(page, '/command/maps');
  await expect(page.locator('.cmd-ground-map-canvas .ground-floor-source > svg')).toHaveAttribute(
    'data-prepared-directory',
    '2',
    { timeout: 45_000 },
  );
  await expect(page.locator('.cmd-ground-node')).not.toHaveCount(0);
  const tools = page.getByRole('group', { name: 'Route network tools' });
  await expect(tools.getByRole('button', { name: 'Add node' })).toBeVisible();
  await expect(tools.getByRole('button', { name: 'Connect' })).toBeVisible();
  await expect(page.locator('.cmd-map-ground, .cmd-map-feature')).toHaveCount(0);
  await tools.getByRole('button', { name: 'Add node' }).click();
  const point = await page.locator('.cmd-map-svg > g').evaluate((group) => {
    const screen = new DOMPoint(440, 600).matrixTransform((group as SVGGElement).getScreenCTM()!);
    return { x: screen.x, y: screen.y };
  });
  await page.mouse.click(point.x, point.y);
  const customNode = page.locator('.cmd-ground-node[data-node-id^="ground-custom-node-"]');
  await expect(customNode).toHaveCount(1);
  const customId = await customNode.getAttribute('data-node-id');
  await tools.getByRole('button', { name: 'Connect' }).click();
  await page.locator('.cmd-ground-node[data-node-id="ground-walk-65"]').click();
  await expect(page.locator('.cmd-ground-node[data-node-id="ground-walk-65"]')).toHaveAttribute(
    'fill',
    '#e67d20',
  );
  await customNode.click();
  await expect(page.locator('.cmd-toast').filter({ hasText: 'Walkway connected' })).toBeVisible();

  await page.getByRole('link', { name: 'Routing', exact: true }).click();
  await expect(page.locator('.cmd-page-header h1')).toHaveText('Routing');
  await expect(page.getByText('Ground Floor route available')).toBeVisible();
  const headers = { 'x-requested-with': 'way-ezy' };
  const customPreview = await page.request.post('/api/admin/routing/preview', {
    headers,
    data: {
      fromNodeId: 'ground-entry-starbucks',
      toNodeId: customId,
      accessible: false,
    },
  });
  expect(customPreview.ok()).toBe(true);
  expect(
    ((await customPreview.json()) as { route: { edges: { id: string }[] } }).route.edges.some(
      (edge) => edge.id.startsWith('ground-custom-edge-'),
    ),
  ).toBe(true);
  const preview = async () => {
    const response = await page.request.post('/api/admin/routing/preview', {
      headers,
      data: {
        fromNodeId: 'ground-entry-starbucks',
        toNodeId: 'ground-tenant-parisian',
        accessible: false,
      },
    });
    expect(response.ok()).toBe(true);
    return ((await response.json()) as { route: { edges: { id: string }[] } }).route.edges.map(
      (edge) => edge.id,
    );
  };
  const before = await preview();
  expect(before).toContain('master-walk-25');

  await page.getByLabel('Search table').fill('master-walk-25');
  await page
    .locator('tr')
    .filter({ hasText: 'master-walk-25' })
    .getByRole('button', { name: 'Close', exact: true })
    .click();
  await page
    .getByRole('dialog', { name: 'Close walkway' })
    .getByRole('button', { name: 'Close walkway' })
    .click();
  await expect(
    page.locator('.cmd-toast').filter({ hasText: 'Walkway closed and published' }),
  ).toBeVisible();
  const rerouted = await preview();
  expect(rerouted).not.toContain('master-walk-25');
  expect(rerouted).not.toEqual(before);

  await page
    .locator('tr')
    .filter({ hasText: 'master-walk-25' })
    .getByRole('button', { name: 'Reopen', exact: true })
    .click();
  expect(await preview()).toEqual(before);
  expect(errors).toEqual([]);
});
