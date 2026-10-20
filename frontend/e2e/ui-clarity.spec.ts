import { expect, test } from '@playwright/test';

for (const width of [1280, 390]) {
  test(`detail actions stay compact and keyboard accessible (${width}px)`, async ({ page }) => {
    await page.setViewportSize({ width, height: 844 });
    const asset = {
      uuid: 'asset',
      name: 'Atemschutzgerät mit Reserveflasche',
      invId: 'FW-123',
      images: [],
      areaUuids: [],
      tags: [],
      fields: [],
    };
    await page.route('**/api/**', async (route) => {
      const path = new URL(route.request().url()).pathname;
      await route.fulfill({
        json:
          path === '/api/auth/me'
            ? { authenticated: true, username: 'admin', role: 'ADMIN', permissions: [] }
            : path === '/api/assets/asset'
              ? asset
              : [],
      });
    });
    await page.goto('/assets/asset');
    await expect(page.getByRole('heading', { name: asset.name, exact: true })).toBeVisible();
    await expect(page.locator('.main-image')).toHaveCount(0);
    await expect(
      page.locator('.header-actions').getByRole('button', { name: 'Drucken', exact: true }),
    ).toHaveCount(0);
    const trigger = page.getByRole('button', { name: 'Weitere Aktionen', exact: true });
    await trigger.click();
    await expect(page.getByRole('menuitem', { name: 'Drucken', exact: true })).toBeFocused();
    await page.keyboard.press('End');
    await expect(page.getByRole('menuitem', { name: 'Löschen', exact: true })).toBeFocused();
    await page.keyboard.press('Escape');
    await expect(trigger).toBeFocused();
    await expect(page.getByRole('menu')).toHaveCount(0);
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
    ).toBe(true);
    await page.screenshot({ path: test.info().outputPath('compact-detail.png'), fullPage: true });
  });
}
