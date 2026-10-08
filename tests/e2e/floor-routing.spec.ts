import { test, expect, holdKioskAwake } from './fixtures';

test.use({ trace: 'off' });

test('kiosk routes from the Ground Floor to a First Floor brand by escalator', async ({
  page,
  errors,
}) => {
  test.setTimeout(150_000);
  await page.setViewportSize({ width: 1920, height: 900 });
  await page.goto('/?device=K-001');
  await expect(page.locator('.map-experience')).toBeVisible();
  await holdKioskAwake(page);
  await expect(page.locator('.ground-floor-source')).toHaveAttribute(
    'data-detection-status',
    'ready',
    { timeout: 45000 },
  );

  await page.locator('.explorer-detail-search').click();
  await page.getByRole('textbox', { name: 'Search stores and amenities' }).fill('Greenr');
  await page.locator('.explorer-search-result', { hasText: 'Greenr' }).first().click();
  await page.getByRole('button', { name: 'Get Directions', exact: true }).click();

  // Directions open on the visitor's floor with the leg to the escalator.
  const summary = page.locator('.explorer-route-summary');
  await expect(summary).toContainText('Walking directions');
  await expect(summary).toContainText('take the escalator to First Floor');
  await expect(summary).toContainText('Ground Floor → First Floor walkways');
  await expect(
    page.getByRole('button', { name: 'Show Ground Floor', exact: true }),
  ).toHaveAttribute('aria-pressed', 'true');
  const floors = page.getByRole('group', { name: 'Route floors' });
  await expect(floors).toBeVisible();
  const groundLeg = page.locator('.directory-route[data-route-floor="l0"]');
  await expect(groundLeg).toBeVisible();
  await expect(groundLeg.locator('[data-floor-change="leave"]')).toContainText('↑ First Floor');
  await page.screenshot({ path: 'test-results/floor-route-ground.png' });

  await floors.getByRole('button', { name: 'Show route on First Floor' }).click();
  await expect(page.locator('.first-floor-source')).toHaveAttribute('data-map-status', 'ready', {
    timeout: 45000,
  });
  const firstLeg = page.locator('.directory-route[data-route-floor="l1"]');
  await expect(firstLeg).toBeVisible();
  await expect(firstLeg.locator('[data-floor-change="arrive"]')).toContainText('From Ground Floor');
  await page.screenshot({ path: 'test-results/floor-route-first.png' });

  // Step-by-step guidance follows the route onto the First Floor.
  await page.getByRole('button', { name: 'Start', exact: true }).click();
  // The phone handoff is signed by the server, which must know First Floor destinations.
  const qr = page.getByRole('dialog');
  await expect(qr.locator('img[alt="QR code"]')).toBeVisible();
  await expect(qr.locator('.qr-expiry')).toBeVisible();
  await expect(qr.locator('.qr-destination')).toContainText(
    'Ground Floor → First Floor walking route',
  );
  await qr.getByRole('button', { name: 'Close', exact: true }).click();
  await expect(
    page.getByRole('button', { name: 'Show Ground Floor', exact: true }),
  ).toHaveAttribute('aria-pressed', 'true');
  const ride = page.locator('.explorer-step', { hasText: 'Take the escalator up to First Floor' });
  await expect(ride).toContainText('Ground Floor → First Floor');
  await ride.click();
  await expect(
    page.locator('.directory-route-floor-change[data-floor-change="leave"]'),
  ).toBeVisible();
  await page.getByRole('button', { name: 'Next direction' }).click();
  await expect(page.getByRole('button', { name: 'Show First Floor', exact: true })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  await expect(page.locator('.explorer-step[aria-current="step"]')).toContainText(
    'Leave the escalator',
  );
  await expect(page.locator('.directory-route-active-line')).toHaveAttribute('points', /\d+.*\d+/);
  await page.screenshot({ path: 'test-results/floor-route-steps.png' });
  expect(errors).toEqual([]);
});
