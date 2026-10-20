import { expect, test } from '@playwright/test';
import { followSystemTheme } from './support/theme';

for (const endpoint of ['assets', 'locations']) {
  for (const width of [1280, 390]) {
    test(`detail cards and discreet history (${endpoint}, ${width}px)`, async ({ page }) => {
      await page.setViewportSize({ width, height: 844 });
      await followSystemTheme(page);
      await page.emulateMedia({ colorScheme: width === 390 ? 'dark' : 'light' });
      const item = {
        uuid: 'item',
        name: 'Fahrzeughalle',
        description: 'Feuerwehrhaus',
        images: [],
        areaUuids: [],
      };
      const logs = Array.from({ length: 4 }, (_, index) => ({
        uuid: `log-${index}`,
        createdAt: '2026-10-20T08:00:00Z',
        userName: 'Max Muster',
        action: 'UPDATE',
        objectType: endpoint === 'assets' ? 'ASSET' : 'LOCATION',
        objectUuid: 'item',
        objectName: item.name,
        details: [],
      }));
      await page.route('**/api/**', async (route) => {
        const url = new URL(route.request().url());
        const path = url.pathname;
        await route.fulfill({
          json:
            path === '/api/auth/me'
              ? { authenticated: true, username: 'admin', role: 'ADMIN', permissions: [] }
              : path === `/api/${endpoint}/item`
                ? item
                : path === `/api/${endpoint}/item/logs`
                  ? {
                      items: logs.slice(0, Number(url.searchParams.get('size') || 15)),
                      total: 4,
                      page: 0,
                      size: 15,
                    }
                  : [],
        });
      });
      await page.goto(`/${endpoint}/item`);
      const facts = page.locator('.card', { has: page.locator('.details') });
      await expect(facts).toBeVisible();
      await expect(facts).toHaveCSS('border-top-style', 'solid');
      await expect(facts).toHaveCSS('border-top-width', '1px');
      const history = page.locator('app-audit-history');
      const disclosure = history.locator('details');
      await expect(history.locator('summary')).toContainText('Verlauf');
      await expect(history.locator('summary')).toContainText('4');
      await expect(disclosure).not.toHaveAttribute('open');
      await expect(history.locator('app-audit-timeline')).not.toBeVisible();
      await page.screenshot({ path: test.info().outputPath('detail-cards.png'), fullPage: true });
      await history.locator('summary').focus();
      await page.keyboard.press('Enter');
      await expect(disclosure).toHaveAttribute('open');
      await expect(history.locator('app-audit-timeline')).toBeVisible();
      await history.getByRole('link').click();
      await expect(page).toHaveURL(new RegExp(`/${endpoint}/item/history$`));
      await expect(page.locator('app-audit-history .card app-audit-timeline')).toBeVisible();
      await expect(page.locator('app-audit-history summary')).toHaveCount(0);
    });
  }
}
