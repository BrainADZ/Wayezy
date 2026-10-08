import { expect, test as base, type Page } from '@playwright/test';

export const E2E_PORT = Number(process.env.E2E_PORT ?? 4191);
export const E2E_ADMIN = { email: 'admin@wayezy.local', password: 'e2e-admin-password-2026' };

/** Console errors and uncaught exceptions, excluding benign browser noise. */
function watchErrors(page: Page) {
  const errors: string[] = [];
  const ignore = [
    /Download the React DevTools/,
    /WebGL/i,
    /GPU stall/i,
    /favicon/,
    /net::ERR_ABORTED/,
    /EventSource/,
  ];
  page.on('console', (message) => {
    if (message.type() !== 'error') return;
    const text = message.text();
    if (!ignore.some((pattern) => pattern.test(text))) errors.push(text);
  });
  page.on('pageerror', (error) => errors.push(`pageerror: ${error.message}`));
  return errors;
}

export const test = base.extend<{ errors: string[]; isolatedDatabase: void }>({
  isolatedDatabase: [
    async ({ request }, use) => {
      if (!process.env.E2E_EXTERNAL) {
        const response = await request.get('/api/health');
        const health = await response.json();
        expect(health.driver, 'Browser tests must use the isolated embedded database').toBe(
          'pglite',
        );
      }
      await use();
    },
    { auto: true },
  ],
  errors: async ({ page }, use) => {
    const errors = watchErrors(page);
    await use(errors);
    expect(errors, 'no console errors').toEqual([]);
  },
});
export { expect };

export async function signIn(page: Page, path = '/command') {
  await page.goto(path);
  await page.getByLabel('Email').fill(E2E_ADMIN.email);
  await page.getByLabel('Password').fill(E2E_ADMIN.password);
  await page.getByRole('button', { name: /sign in/i }).click();
  await expect(page.locator('.cmd-shell')).toBeVisible();
}

/** Keeps the kiosk from entering attract mode while a test inspects a screen. */
export async function holdKioskAwake(page: Page) {
  await page.evaluate(() => {
    const w = window as unknown as { __wezAwake?: number };
    if (w.__wezAwake) return;
    w.__wezAwake = window.setInterval(
      () =>
        document
          .querySelector('.explorer-header, .kiosk-header')
          ?.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true })),
      2500,
    );
  });
}

export async function releaseKiosk(page: Page) {
  await page.evaluate(() => {
    const w = window as unknown as { __wezAwake?: number };
    if (w.__wezAwake) window.clearInterval(w.__wezAwake);
    w.__wezAwake = undefined;
  });
}
