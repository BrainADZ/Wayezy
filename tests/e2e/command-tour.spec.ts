import { expect, signIn, test } from './fixtures';

const sections = [
  ['dashboard', /Good (morning|afternoon|evening)|Dashboard/],
  ['venue', /Venue/],
  ['maps', /Floors & maps/i],
  ['routing', /Routing/],
  ['tenants', /Tenants/],
  ['categories', /Categories/],
  ['amenities', /Amenities/],
  ['offers', /Offers/],
  ['events', /Events/],
  ['advertising', /Campaigns|Advertising/i],
  ['media', /Media library/i],
  ['devices', /Screens & devices/i],
  ['analytics', /Analytics/],
  ['users', /Users/],
  ['roles', /Roles/i],
  ['branding', /Branding/],
  ['languages', /Languages/],
  ['settings', /System settings/i],
  ['audit', /Audit log/i],
] as const;

test.use({ viewport: { width: 1440, height: 900 } });

test('every COMMAND section renders for a Super Admin', async ({ page, errors }) => {
  await signIn(page);
  for (const [id, heading] of sections) {
    await page.goto(`/command/${id}`);
    await expect(page.locator('.cmd-page-header h1').first(), `section ${id}`).toHaveText(heading);
    await expect(page.locator('.cmd-loading')).toHaveCount(0);
    if (process.env.E2E_TOUR_SHOTS)
      await page.screenshot({ path: `test-results/tour/command-${id}.png`, fullPage: true });
  }
  expect(errors).toEqual([]);
});
