import { test, expect, holdKioskAwake } from './fixtures';

test.use({ trace: 'off' });

test('walking route stays visible when turn-by-turn directions start', async ({ page }) => {
  test.setTimeout(90_000);
  await page.route('**/api/snapshot', async (route) => {
    const response = await route.fetch();
    const data = await response.json();
    data.devices.forEach((device: { idleTimeout: number }) => {
      device.idleTimeout = 600;
    });
    await route.fulfill({ response, json: data });
  });
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto('/?device=K-001');
  await holdKioskAwake(page);
  await expect(page.locator('.ground-floor-source')).toHaveAttribute(
    'data-detection-status',
    'ready',
    { timeout: 45_000 },
  );
  await page.getByRole('button', { name: 'Get Directions', exact: true }).click();
  await page.getByRole('combobox', { name: 'Destination' }).selectOption('ground-tenant-cafe-dori');
  await expect(page.locator('.directory-route-line')).toBeVisible();
  await page.getByRole('button', { name: 'Start', exact: true }).click();
  const active = page.locator('.directory-route-active-line');
  const visibleOnMap = () =>
    active.evaluate((element) => {
      const line = element as SVGPolylineElement;
      const matrix = line.getScreenCTM();
      if (!matrix || line.getTotalLength() <= 0) return false;
      return Array.from({ length: line.points.numberOfItems }, (_, i) =>
        line.points.getItem(i),
      ).some((point) => {
        const screen = new DOMPoint(point.x, point.y).matrixTransform(matrix);
        return screen.x > 420 && screen.x < 1180 && screen.y > 90 && screen.y < 900;
      });
    });
  await expect.poll(visibleOnMap).toBe(true);
  await expect(active).toHaveAttribute('vector-effect', 'non-scaling-stroke');
  await page.screenshot({ path: 'test-results/ground-route-start.png' });
});
