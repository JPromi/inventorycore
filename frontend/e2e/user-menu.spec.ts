import { expect, test } from '@playwright/test';

for (const width of [1280, 390]) {
  test(`user menu, long name, metadata and logout (${width}px)`, async ({ page }) => {
    await page.setViewportSize({ width, height: 844 });
    let loggedOut = false;
    await page.route('**/api/**', async route => {
      const path = new URL(route.request().url()).pathname;
      if (path === '/api/auth/logout') {
        loggedOut = true;
        return route.fulfill({ status: 204 });
      }
      const body = path === '/api/auth/me' ? loggedOut ? { authenticated: false }
        : { authenticated: true, username: 'admin', displayName: 'Maximilian Muster mit einem sehr langen Benutzernamen', role: 'ADMIN', permissions: [] }
        : path === '/api/app-info' ? { name: 'InventoryCore', version: '2.3.4', githubUrl: 'https://github.com/JPromi/inventorycore' }
        : path === '/api/auth/providers' ? { oidcEnabled: false }
        : path.endsWith('/page') ? { items: [], total: 0, hasMore: false } : [];
      await route.fulfill({ json: body });
    });
    await page.goto('/assets');
    const openDrawer = async () => {
      if (width === 390) await page.getByRole('button', { name: 'Menü öffnen', exact: true }).click();
    };
    await openDrawer();
    await expect(page.locator('.app-info')).toContainText('InventoryCore');
    await expect(page.locator('.app-info')).toContainText('Version 2.3.4');
    await expect(page.locator('.app-info a')).toHaveAttribute('href', 'https://github.com/JPromi/inventorycore');
    const name = page.locator('.user-name');
    expect(await name.evaluate(element => element.scrollWidth > element.clientWidth)).toBe(true);
    expect(await name.evaluate(element => getComputedStyle(element).maskImage)).toContain('linear-gradient');
    const trigger = page.getByRole('button', { name: 'Benutzermenü', exact: true });
    await trigger.click();
    const menu = page.locator('#user-menu');
    await expect(menu).toBeVisible();
    const bounds = (await menu.boundingBox())!;
    expect(bounds.x).toBeGreaterThanOrEqual(0);
    expect(bounds.y + bounds.height).toBeLessThanOrEqual(844);
    await page.screenshot({ path: test.info().outputPath('user-menu.png') });
    await page.keyboard.press('Escape');
    await expect(menu).toHaveCount(0);
    await expect(trigger).toBeFocused();
    await openDrawer();
    await trigger.click();
    await menu.getByRole('link', { name: 'Profil', exact: true }).click();
    await expect(page).toHaveURL(/\/profile$/);
    await openDrawer();
    await trigger.click();
    await menu.getByRole('button', { name: 'Abmelden', exact: true }).click();
    await expect(page).toHaveURL(/\/login$/);
    expect(loggedOut).toBe(true);
  });
}
