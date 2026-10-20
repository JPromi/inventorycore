import { expect, Page, test } from '@playwright/test';

async function mockApi(page: Page) {
  await page.route('**/api/**', async (route) => {
    const path = new URL(route.request().url()).pathname;
    const json = path === '/api/auth/me' ? { authenticated: true, username: 'admin', role: 'ADMIN', permissions: [] }
      : path.endsWith('/page') ? { items: [{ uuid: 'x', name: 'Atemschutzgerät PA 1', areaUuids: [] }], total: 1, page: 0, size: 50, hasMore: false }
      : path === '/api/customization' ? {} : [];
    await route.fulfill({ json });
  });
}

const pressed = (page: Page, title: string) =>
  page.getByRole('button', { name: title, exact: true });

test('each list page remembers its view', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await mockApi(page);
  await page.goto('/assets');
  await expect(pressed(page, 'Listenansicht')).toHaveAttribute('aria-pressed', 'true');
  await pressed(page, 'Kachelansicht').click();

  await page.goto('/locations');
  await expect(pressed(page, 'Listenansicht')).toHaveAttribute('aria-pressed', 'true');
  await pressed(page, 'Baumansicht').click();

  // back on the asset list and after a reload: the chosen views again
  await page.goto('/assets');
  await expect(pressed(page, 'Kachelansicht')).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('.items')).toHaveClass(/grid/);
  await page.reload();
  await expect(pressed(page, 'Kachelansicht')).toHaveAttribute('aria-pressed', 'true');
  await page.goto('/locations');
  await expect(pressed(page, 'Baumansicht')).toHaveAttribute('aria-pressed', 'true');

  // types have no tree; an unknown or broken value falls back to the list
  await page.evaluate(() => localStorage.setItem('inventorycore.listViews', JSON.stringify({ 'asset-types': 'tree' })));
  await page.goto('/config/types');
  await expect(pressed(page, 'Listenansicht')).toHaveAttribute('aria-pressed', 'true');
  await page.evaluate(() => localStorage.setItem('inventorycore.listViews', '{kaputt'));
  await page.goto('/assets');
  await expect(pressed(page, 'Listenansicht')).toHaveAttribute('aria-pressed', 'true');
});
