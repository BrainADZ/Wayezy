import { test, expect, holdKioskAwake } from './fixtures';
import model from '../../packages/domain/reference/ground-floor-model.json' with { type: 'json' };
import walks from '../../packages/domain/reference/ground-floor-walks.json' with { type: 'json' };

test.use({ trace: 'off' }); // Tracing 31k source paths per action overwhelms the browser itself.

test.beforeEach(async ({ page }) => {
  // Trace snapshots of 31,000 source paths can block the browser longer than a demo
  // device's short attract timeout. Keep the real directory data; lengthen only that timer.
  await page.route('**/api/snapshot', async (route) => {
    const response = await route.fetch();
    if (response.status() === 304) return route.fulfill({ response });
    const data = await response.json();
    data.devices.forEach((device: { idleTimeout: number }) => {
      device.idleTimeout = 600;
    });
    await route.fulfill({ response, json: data });
  });
});

test('normal kiosk renders the authoritative inline SVG with metadata and existing camera controls', async ({
  page,
  errors,
}) => {
  test.setTimeout(150_000);
  await page.addInitScript(() => {
    (window as any).__geometryCalls = 0;
    const original = SVGGeometryElement.prototype.isPointInFill;
    SVGGeometryElement.prototype.isPointInFill = function (point) {
      (window as any).__geometryCalls++;
      return original.call(this, point);
    };
    (window as any).__rawMapFlash = false;
    new MutationObserver(() => {
      const source = document.querySelector('.ground-floor-source > svg');
      if (source && source.getAttribute('data-prepared-directory') !== '2')
        (window as any).__rawMapFlash = true;
    }).observe(document, { subtree: true, childList: true });
  });
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto('/?device=K-001');
  await expect(page.locator('.map-experience')).toBeVisible();
  await holdKioskAwake(page);
  const host = page.locator('.ground-floor-source');
  const source = host.locator(':scope > svg');
  await expect(host).toHaveAttribute('data-detection-status', 'ready', { timeout: 45000 });
  await expect(source).toHaveAttribute('viewBox', '0 0 914.89046 1455.8265');
  await expect(source).toHaveAttribute('data-prepared-directory', '2');
  expect(await page.evaluate(() => (window as any).__geometryCalls)).toBe(0);
  expect(await page.evaluate(() => (window as any).__rawMapFlash)).toBe(false);
  await source.evaluate((el) => el.setAttribute('data-test-mounted-once', 'yes'));
  await expect(host).toHaveAttribute('data-detected-modules', '47');
  await expect(host.locator('.directory-brand')).toHaveCount(model.displayModules.length);
  await expect(host.locator('[data-local-brand-logo]')).toHaveCount(28);
  await expect(host.locator('.directory-unit-name')).toHaveCount(3);
  for (const brand of [
    'soulfoods',
    'coyu',
    'perona',
    'love-birds',
    'eka',
    'suvasa',
    'nykaa-luxe',
    'cafe-dori',
  ])
    await expect(host.locator(`[data-local-brand-logo="${brand}"]`)).toHaveCount(1);
  await expect(host.locator('[data-local-brand-logo="good-earth"]')).toHaveCount(2);
  for (const brand of ['soulfoods', 'coyu', 'perona']) {
    const footprint = model.displayModules.find(
      (module) => module.tenantId === `ground-tenant-${brand}`,
    )!;
    await expect(
      host.locator(`[data-place-id="ground-tenant-${brand}"][data-map-paint="retail"]`),
    ).toHaveCount(footprint.sourceIds.length);
    await expect(
      host.locator(`.directory-brand[data-place-id="ground-tenant-${brand}"]`),
    ).not.toContainText('TO LET');
  }
  for (const [moduleId, brand] of [
    ['module-21b', 'coyu'],
    ['module-9a2', 'perona'],
  ]) {
    const original = model.modules.find((module) => module.id === moduleId)!;
    const ownership = await source.evaluate(
      (svg, sourceIds) =>
        sourceIds.map((id) => svg.querySelector(`#${id}`)!.getAttribute('data-place-id')),
      original.sourceIds,
    );
    expect(ownership.every((id) => id === `ground-tenant-${brand}`)).toBe(true);
  }
  await expect(host.locator('[data-walkway-treatment="surface"]')).toHaveCount(
    model.circulation.walkways.length,
  );
  await expect(host.locator('[data-store-opening]')).toHaveCount(model.circulation.openings.length);
  const entrancesStayOnSource = await source.evaluate((svg) => {
    const root = (svg as SVGSVGElement).getScreenCTM()!;
    return [...svg.querySelectorAll('[data-store-opening]')].every((opening) => {
      const original = svg.querySelector<SVGGeometryElement>(
        `#${opening.getAttribute('data-source-perimeter')}`,
      )!;
      const frame = opening.querySelector<SVGPolylineElement>('.directory-entrance-frame')!;
      const matrix = original.getScreenCTM()!.inverse().multiply(root);
      return Array.from({ length: frame.points.numberOfItems }, (_, i) =>
        frame.points.getItem(i),
      ).every((p) => original.isPointInStroke(new DOMPoint(p.x, p.y).matrixTransform(matrix)));
    });
  });
  expect(entrancesStayOnSource).toBe(true);
  await expect(host.locator('.directory-amenity')).toHaveCount(model.amenities.length);
  const escalators = host.locator('.directory-amenity[aria-label="Escalator"] use');
  await expect(escalators).toHaveCount(4);
  expect(
    await escalators.evaluateAll((icons) =>
      icons.map((icon) => [icon.getAttribute('width'), icon.getAttribute('height')]),
    ),
  ).toEqual(Array.from({ length: 4 }, () => ['112', '20']));
  await expect(page.locator('.explorer-map-legend')).toContainText('Entry gate');
  await expect(host.locator('[data-source-space]')).toHaveCount(5);
  await expect(host.locator('[data-map-paint="core"]')).toHaveCount(88);
  await expect(host.locator('[data-map-paint="door"]')).toHaveCount(48);
  await expect(
    host.locator('.directory-amenity[aria-label="Stairs"] .directory-amenity-caption'),
  ).toHaveCount(0);
  await expect(host.locator('.directory-amenity.is-washroom')).toHaveCount(3);
  await expect(host.locator('[data-place-id="women-toilet-north"]')).toHaveAttribute(
    'aria-label',
    "Women's toilet",
  );
  await expect(host.locator('[data-place-id="women-toilet-north"] use')).toHaveAttribute(
    'href',
    '#directory-icon-washroom-female',
  );
  await expect(host.locator('[data-place-id="men-toilet-north"] use')).toHaveAttribute(
    'href',
    '#directory-icon-washroom-male',
  );
  await expect(page.getByRole('complementary', { name: 'Map legend' })).toContainText(
    "Men's toilet",
  );
  await expect(page.getByRole('complementary', { name: 'Map legend' })).toContainText(
    "Women's toilet",
  );
  await expect(host.locator('[data-decor-source]')).toHaveCount(9);
  await expect(host.locator('.directory-pond')).toHaveCount(4);
  const pools = await host.locator('.directory-pond').evaluateAll((elements) =>
    elements.map((el) => {
      const b = (el as SVGGElement).getBBox();
      return { x: b.x, right: b.x + b.width, top: b.y, bottom: b.y + b.height };
    }),
  );
  for (const pool of pools) {
    expect(pool.x).toBeGreaterThan(379);
    expect(pool.right).toBeLessThan(406);
    for (const aisle of [610, 775, 974, 1180])
      expect(pool.top > aisle || pool.bottom < aisle).toBe(true);
  }
  await expect(host.locator('.directory-here-text')).toHaveText('YOU ARE HERE');
  const originPin = host.locator('[data-directory-origin-pin]');
  const entryOne = model.amenities.find((a) => a.id === 'ground-entry-starbucks')!;
  await expect(originPin).toHaveAttribute(
    'transform',
    `translate(${entryOne.point[0]} ${entryOne.point[1]}) rotate(90)`,
  );
  await expect(page.locator('.ground-orientation')).toHaveAttribute(
    'data-orientation',
    'landscape',
  );
  const actualSize = await source.boundingBox();
  expect(actualSize!.width).toBeGreaterThan(actualSize!.height);
  const pin = await host.locator('.directory-here-pin').getAttribute('d');
  await expect(page.locator('.explorer-map-legend .directory-guide-icon > path')).toHaveAttribute(
    'd',
    pin!,
  );
  for (const module of model.modules.filter((m) => !m.tenantId)) {
    const lines = await host
      .locator(`[data-brand-module="${module.id}"].directory-brand text`)
      .allTextContents();
    expect(lines.join(' ')).toBe('TO LET');
  }
  await expect(host.locator('[data-module-id="module-18"]').first()).toBeAttached();
  await expect(
    page.locator(
      '.ground-floor-plan, .ground-shop-target, .ground-unit-face, .site-marker, .site-connector, .explorer-route-line, [data-retail-overlay]',
    ),
  ).toHaveCount(0);

  // Every original vector and its geometry/transform remain authoritative after restyling.
  const preservation = await source.evaluate(async (element) => {
    const raw = await (await fetch('/maps/ground-floor-master.svg')).text();
    const original = new DOMParser().parseFromString(raw, 'image/svg+xml').documentElement;
    const actual = new Map([...element.querySelectorAll('[id]')].map((el) => [el.id, el]));
    const vectors = [...original.querySelectorAll('path,polygon,rect,g')];
    const preserved = vectors.every((el) => {
      const copy = actual.get(el.id);
      return (
        copy &&
        ['d', 'points', 'x', 'y', 'width', 'height', 'rx', 'ry', 'transform', 'clip-path'].every(
          (key) => el.getAttribute(key) === copy.getAttribute(key),
        )
      );
    });
    return { identical: preserved, total: vectors.length };
  });
  expect(preservation.identical).toBe(true);
  expect(preservation.total).toBeGreaterThan(31000);

  // Kiosk chrome stays in its existing components.
  await expect(page.getByRole('complementary', { name: 'Map legend' })).toBeVisible();
  await expect(page.getByRole('navigation', { name: 'Browse categories' })).toBeVisible();
  await expect(page.locator('.explorer-panel')).toBeVisible();
  await expect(
    page.getByRole('button', { name: 'Show Ground Floor', exact: true }),
  ).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByRole('button', { name: 'Show Level 1', exact: true })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Show Level 2', exact: true })).toHaveCount(0);
  const viewport = page.locator('.ground-camera');
  const fixedViewBox = await page.locator('.explorer-map-svg').getAttribute('viewBox');
  const fitted = await viewport.getAttribute('transform');
  const originalScale = await source.evaluate((el) => {
    const m = (el as SVGSVGElement).getScreenCTM()!;
    return Math.hypot(m.a, m.b);
  });
  await page.getByRole('button', { name: 'Zoom in', exact: true }).click();
  await expect(viewport).not.toHaveAttribute('transform', fitted!);
  await expect(page.locator('.explorer-map-svg')).toHaveAttribute('viewBox', fixedViewBox!);
  expect(
    await source.evaluate((el) => {
      const m = (el as SVGSVGElement).getScreenCTM()!;
      return Math.hypot(m.a, m.b);
    }),
  ).toBeGreaterThan(originalScale);
  const zoomed = await viewport.getAttribute('transform');
  await page.mouse.move(850, 550);
  await page.mouse.down();
  await page.mouse.move(900, 600, { steps: 5 });
  await page.mouse.up();
  await expect(viewport).not.toHaveAttribute('transform', zoomed!);
  await page.getByRole('button', { name: 'Fit map', exact: true }).click();
  await expect(viewport).not.toHaveAttribute('transform', fitted!);
  await page.screenshot({ path: 'test-results/architectural-kiosk.png' });

  // The corrected wings select as one outlet, including the previously vacant parts.
  for (const [brand, name] of [
    ['coyu', 'Coyu'],
    ['perona', 'Perona'],
  ]) {
    const tenantId = `ground-tenant-${brand}`;
    const footprint = model.displayModules.find((module) => module.tenantId === tenantId)!;
    await host.locator(`[data-place-id="${tenantId}"][role="button"]`).focus();
    await page.keyboard.press('Enter');
    await expect(page.locator('.explorer-panel')).toHaveAttribute('aria-label', `${name} details`);
    await expect(
      host.locator(`[data-place-id="${tenantId}"][data-map-paint="retail"].is-selected`),
    ).toHaveCount(footprint.sourceIds.length);
    await expect(
      host.locator(`[data-place-id="${tenantId}"][data-map-paint="retail"]`).first(),
    ).toHaveCSS('fill', 'rgb(7, 91, 75)');
    await page.screenshot({
      path: `test-results/ground-brand-${brand}.png`,
      animations: 'disabled',
    });
  }

  const women = host.locator('[data-place-id="women-toilet-north"][role="button"]');
  await women.focus();
  await page.keyboard.press('Enter');
  await expect(page.locator('.explorer-panel')).toHaveAttribute(
    'aria-label',
    "Women's toilet details",
  );

  // Select a real footprint, then filter and search through the existing shell.
  const loveBirds = host.locator('[data-module-id="module-14a"][role="button"]');
  await loveBirds.focus();
  await page.keyboard.press('Enter');
  await expect(page.locator('.explorer-panel')).toContainText('Love Birds');
  await expect(loveBirds).toHaveClass(/is-selected/);
  // Mouse selection must still work at the closer default zoom (without drag capture stealing clicks).
  const target = model.modules.find((m) => m.id === 'module-18')!.labelBox;
  const click = await source.evaluate((el, b) => {
    const p = new DOMPoint(b.x + b.width / 2, b.y + b.height / 2).matrixTransform(
      (el as SVGSVGElement).getScreenCTM()!,
    );
    return { x: p.x, y: p.y };
  }, target);
  await page.mouse.click(click.x, click.y);
  await expect(page.locator('.explorer-panel')).toHaveAttribute('aria-label', 'Starbucks details');
  await page
    .getByRole('navigation', { name: 'Browse categories' })
    .getByRole('button', { name: 'Dining', exact: true })
    .click();
  await expect(host.locator('[data-module-id="module-14a"]').first()).toHaveClass(/is-muted/);
  await expect(host.locator('[data-module-id="module-18"]').first()).not.toHaveClass(/is-muted/);
  await page.getByRole('textbox', { name: 'Search stores and amenities' }).fill('Starbucks');
  await expect(viewport).not.toHaveAttribute('transform', fitted!);
  await expect(host.locator('[data-module-id="module-18"]').first()).not.toHaveClass(/is-muted/);
  await page.getByRole('button', { name: 'Fit map', exact: true }).click();
  await expect(source).toHaveAttribute('data-test-mounted-once', 'yes');
  expect(await page.evaluate(() => (window as any).__geometryCalls)).toBe(0);

  await page.getByRole('textbox', { name: 'Search stores and amenities' }).fill('');
  const cafe = host.locator('[data-module-id="module-2a"][role="button"]');
  await cafe.focus();
  await page.keyboard.press('Enter');
  await page.getByRole('button', { name: 'Get Directions', exact: true }).click();
  const startingPoint = page.locator('select[aria-label="Starting point"]');
  await startingPoint.selectOption('ground-entry-masaba');
  const entryTwo = model.amenities.find((a) => a.id === 'ground-entry-masaba')!;
  await expect(originPin).toHaveAttribute(
    'transform',
    `translate(${entryTwo.point[0]} ${entryTwo.point[1]}) rotate(90)`,
  );
  await startingPoint.selectOption('ground-tenant-starbucks');
  const starbucks = walks.nodes.find((n) => n.id === 'ground-tenant-starbucks')!;
  await expect(originPin).toHaveAttribute(
    'transform',
    `translate(${starbucks.x} ${starbucks.y}) rotate(90)`,
  );
  await startingPoint.selectOption('start');
  const destinationOptions = await page
    .getByRole('combobox', { name: 'Destination' })
    .locator('option')
    .allTextContents();
  expect(destinationOptions.length).toBeGreaterThan(0);
  expect(destinationOptions.some((option) => option.includes('Ground Floor'))).toBe(true);
  expect(destinationOptions.every((option) => /Ground Floor|First Floor/.test(option))).toBe(true);
  await expect(page.locator('.directory-route')).toBeVisible();
  await expect(page.locator('.directory-route-line')).toHaveAttribute(
    'vector-effect',
    'non-scaling-stroke',
  );
  await expect(page.locator('.explorer-route-summary')).toContainText('Walking directions');
  await page.screenshot({ path: 'test-results/architectural-route.png' });
  await page.getByRole('button', { name: 'Start', exact: true }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Close', exact: true }).click();
  await expect(page.locator('.explorer-guidance-summary')).toContainText('Follow the marked route');
  await expect(page.locator('.directory-route-active-line')).toHaveAttribute('points', /\d+.*\d+/);
  await expect(page.locator('.directory-route-active-line')).toHaveAttribute('stroke', '#b48645');
  await expect(page.locator('.explorer-step-list')).not.toContainText('0 m');
  await page.getByRole('button', { name: 'Close directions', exact: true }).click();

  await page.getByRole('tab', { name: 'Popular' }).click();
  await page.getByRole('button', { name: 'Search filters' }).click();
  const floorFilter = page.getByRole('combobox', { name: 'Filter by floor' });
  await expect(floorFilter).toBeVisible();
  await floorFilter.selectOption('l0');
  await page.getByRole('textbox', { name: 'Search stores and amenities' }).fill('PVR Cinemas');
  await expect(page.locator('.explorer-search-results')).toContainText('No places found');
  await expect(floorFilter.locator('option')).toHaveText([
    'All floors',
    'Ground Floor',
    'First Floor',
  ]);
  await expect(page.locator('.reference-floor')).toHaveCount(0);
  await expect(host).toHaveAttribute('data-detection-status', 'ready');
  await expect(source).toHaveCount(1);
  await expect(host.locator('[data-module-id="module-14a"]').first()).toBeAttached();
  expect(errors).toEqual([]);
});

test('an unavailable source shows a load error and never falls back to the generated map', async ({
  page,
}) => {
  await page.route('**/maps/ground-floor-directory.svg*', (route) =>
    route.fulfill({ status: 404, body: 'Missing prepared architecture' }),
  );
  await page.goto('/?device=K-001');
  await expect(page.locator('.ground-floor-status[role="alert"]')).toContainText(
    'could not be loaded (404)',
  );
  await expect(
    page.locator(
      '.ground-floor-source > svg, .ground-floor-plan, .ground-unit-face, .reference-floor, .site-marker',
    ),
  ).toHaveCount(0);
});
