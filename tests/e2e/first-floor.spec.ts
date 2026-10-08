import { test, expect, holdKioskAwake } from './fixtures';
import model from '../../packages/domain/reference/first-floor-model.json' with { type: 'json' };

test.use({ trace: 'off' });

for (const viewport of [
  { width: 1920, height: 900 },
  { width: 390, height: 844 },
]) {
  test(`supplied First Floor switches and supports camera controls at ${viewport.width}px`, async ({
    page,
    errors,
  }) => {
    test.setTimeout(150_000);
    await page.setViewportSize(viewport);
    await page.goto('/?device=K-001');
    await expect(page.locator('.map-experience')).toBeVisible();
    await holdKioskAwake(page);
    const panel = page.locator('.explorer-panel');
    await expect(panel).toBeVisible();
    await expect(page.locator('.ground-floor-source')).toHaveAttribute(
      'data-detection-status',
      'ready',
      { timeout: 45000 },
    );
    const guide = await page.locator('.explorer-map-legend').innerHTML();
    const initialPanel = await panel.getAttribute('aria-label');
    const first = page.getByRole('button', { name: 'Show First Floor', exact: true });
    await first.click();
    await expect(first).toHaveAttribute('aria-pressed', 'true');
    await expect(panel).toBeVisible();
    await expect(panel).toHaveAttribute('aria-label', initialPanel!);
    const source = page.locator('.first-floor-source > svg');
    await expect(page.locator('.first-floor-source')).toHaveAttribute('data-map-status', 'ready', {
      timeout: 45000,
    });
    await expect(source).toHaveAttribute('viewBox', '0 0 1122.6667 1588');
    await expect(source).toHaveAttribute('data-prepared-directory', 'first-1');
    await expect(page.locator('.explorer-map-legend')).toHaveJSProperty('innerHTML', guide);
    await expect(source.locator('.directory-brand')).toHaveCount(31);
    for (const id of ['cinepolis', 'sko']) {
      const brand = source.locator(`.directory-brand[data-place-id="first-tenant-${id}"]`);
      await expect(brand).toHaveCount(1);
      await expect(brand).not.toContainText('TO LET');
    }
    await expect(source.locator('#path3508')).toHaveAttribute(
      'data-place-id',
      'first-tenant-cinepolis',
    );
    for (const id of ['module-22', 'module-23']) {
      const vacant = source.locator(`.directory-brand[data-brand-module="${id}"]`);
      await expect(vacant).toHaveAttribute('data-place-id', '');
      await expect(vacant).toHaveText('TO LET');
    }
    await expect(source.locator('[data-door-label="first-cinema-entrance"]')).toHaveText('ENTRY');
    const door = source.locator('#path3937');
    await expect(door).toHaveAttribute('data-directory-door', 'first-cinema-entrance');
    await expect(door).toHaveCSS('stroke', 'rgb(47, 89, 76)');
    await expect(door).toHaveCSS('opacity', '1');
    await expect(source.locator('[data-store-opening]')).toHaveCount(
      model.circulation.openings.length,
    );
    await expect(source.locator('.first-walkway-surface > path')).toHaveCount(
      model.circulation.tileSourceIds.length,
    );
    await expect(source.locator('[data-void-kind="courtyard"]')).toHaveCount(3);
    await expect(source.locator('[data-void-kind="atrium"]')).toHaveCount(2);
    await expect(source.locator('[data-walkway-label]')).toHaveCount(2);
    await expect(source.locator('#path11438')).toHaveCSS('stroke', 'rgb(139, 157, 130)');
    await expect(source.locator('#path11438')).toHaveCSS('opacity', '1');
    const entrancesFollowSource = await source
      .locator('[data-store-opening]')
      .evaluateAll((elements) =>
        elements.every((el) => {
          const source = document.getElementById(
            el.getAttribute('data-source-perimeter')!,
          ) as unknown as SVGGeometryElement;
          const svg = source.ownerSVGElement!;
          const matrix = source.getScreenCTM()!.inverse().multiply(svg.getScreenCTM()!);
          const points = (el.querySelector('polyline') as SVGPolylineElement).points;
          return [...Array(points.numberOfItems).keys()].every((i) => {
            const point = points.getItem(i);
            return source.isPointInStroke(new DOMPoint(point.x, point.y).matrixTransform(matrix));
          });
        }),
      );
    expect(entrancesFollowSource).toBe(true);
    await expect(source.locator('[data-place-id="first-escalator-cinema"] use')).toHaveAttribute(
      'href',
      '#directory-escalator-top',
    );
    await expect(source.locator('.directory-amenity')).toHaveCount(model.amenities.length);
    await expect(source.locator('[data-local-brand-logo]')).toHaveCount(4);
    await expect(page.locator('.ground-floor-source, .reference-floor, .site-marker')).toHaveCount(
      0,
    );
    await expect(page.locator('.explorer-floor-caption')).toHaveText('First Floor');
    const original = await page.evaluate(async () => {
      const response = await fetch(
        '/maps/First%20Floor%20Plan-%20Grand%20View%20High%20Street.svg',
      );
      const doc = new DOMParser().parseFromString(await response.text(), 'image/svg+xml');
      const actual = document.querySelector('.first-floor-source > svg')!;
      const ids = new Map([...actual.querySelectorAll('[id]')].map((el) => [el.id, el]));
      return [...doc.documentElement.querySelectorAll('path,polygon,rect,g')].every((el) => {
        const copy = ids.get(el.id);
        return (
          copy &&
          ['d', 'points', 'x', 'y', 'width', 'height', 'rx', 'ry', 'transform', 'clip-path'].every(
            (key) => copy.getAttribute(key) === el.getAttribute(key),
          )
        );
      });
    });
    expect(original).toBe(true);
    const retail = await source
      .locator('[data-map-paint="retail"]')
      .evaluateAll((elements) => elements.map((el) => getComputedStyle(el).fill));
    expect(retail).not.toContain('rgb(170, 191, 106)');
    const camera = page.locator('.ground-camera');
    const fitted = await camera.getAttribute('transform');
    await page.getByRole('button', { name: 'Zoom in', exact: true }).click();
    await expect(camera).not.toHaveAttribute('transform', fitted!);
    await page.getByRole('button', { name: 'Fit map', exact: true }).click();
    await expect(camera).toHaveAttribute('transform', /scale\(1\)/);
    await page.screenshot({ path: `test-results/first-floor-${viewport.width}.png` });
    if (viewport.width === 1920) {
      // Review the cinema at a readable scale as well as the full floor.
      const cinema = source.locator('#path3512');
      const box = await cinema.boundingBox();
      if (box)
        await page.screenshot({
          path: 'test-results/cinema-corrected.png',
          clip: { x: box.x - 35, y: box.y - 10, width: 320, height: 365 },
        });
    }
    const greenr = source.locator('[data-place-id="first-tenant-greenr"][role="button"]').first();
    await greenr.focus();
    await page.keyboard.press('Enter');
    await expect(panel).toHaveAttribute('aria-label', 'Greenr details');
    await expect(
      source.locator('[data-place-id="first-tenant-greenr"][role="button"]').first(),
    ).toHaveAttribute('aria-pressed', 'true');
    await page.getByRole('button', { name: 'Show Ground Floor', exact: true }).click();
    await expect(page.locator('.ground-floor-source')).toHaveAttribute(
      'data-detection-status',
      'ready',
      { timeout: 45000 },
    );
    await expect(page.locator('.first-floor-source')).toHaveCount(0);
    await expect(panel).toBeVisible();
    await expect(page.locator('.explorer-map-legend')).toHaveJSProperty('innerHTML', guide);
    await first.click();
    await expect(page.locator('.first-floor-source')).toHaveAttribute('data-map-status', 'ready', {
      timeout: 45000,
    });
    await expect(panel).toHaveAttribute('aria-label', 'Greenr details');
    expect(errors).toEqual([]);
  });
}
