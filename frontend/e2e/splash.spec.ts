import { expect, test } from '@playwright/test';

test('the start screen shows the logo while loading and disappears once the app runs', async ({ page }) => {
  let release: () => void = () => {};
  const texts = new Promise<void>((resolve) => (release = resolve));
  await page.route('**/i18n/de.json', async (route) => {
    await texts;
    await route.continue();
  });
  await page.route('**/api/**', (route) => route.fulfill({ status: 401, json: {} }));
  await page.goto('/');
  const splash = page.locator('#app-splash');
  await expect(splash).toBeVisible();
  await expect(splash).toContainText('InventoryCore');
  release();
  await expect(splash).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Anmelden' })).toBeVisible();
});

test('the start screen uses the remembered branding', async ({ page }) => {
  await page.addInitScript(() =>
    localStorage.setItem('inventorycore.splash', JSON.stringify({ name: 'FF Musterstadt', color: '#1d4ed8' })),
  );
  await page.route('**/i18n/de.json', () => new Promise(() => {}));
  await page.goto('/');
  await expect(page.locator('#app-splash .splash-name')).toHaveText('FF Musterstadt');
  await expect(page.locator('#app-splash .splash-tile')).toHaveCSS('fill', 'rgb(29, 78, 216)');
});

test('without JavaScript a page explains that it is needed', async ({ browser, baseURL }) => {
  const context = await browser.newContext({ javaScriptEnabled: false });
  const page = await context.newPage();
  await page.goto(baseURL ?? '/');
  await expect(page.getByRole('heading', { name: 'JavaScript wird benötigt' })).toBeVisible();
  await expect(page.locator('#app-splash')).toBeHidden();
  await context.close();
});
