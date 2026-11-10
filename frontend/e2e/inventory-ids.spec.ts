import { expect, test } from '@playwright/test';

test('admin inserts at the cursor, saves, cancels and confirms regeneration', async ({ page }) => {
  let pattern = 'INV-{random_alphanumeric:10}';
  let regenerations = 0;
  await page.route('**/api/**', async route => {
    const path = new URL(route.request().url()).pathname;
    const method = route.request().method();
    if (path === '/api/admin/inventory-id-settings' && method === 'PUT') pattern = route.request().postDataJSON().pattern;
    if (path.endsWith('/inventory-id-settings/regenerate')) {
      expect(route.request().postDataJSON()).toEqual({ pattern, confirmed: true });
      regenerations++;
      await new Promise(resolve => setTimeout(resolve, 100));
      return route.fulfill({ json: { count: 12 } });
    }
    return route.fulfill({ json: path === '/api/auth/me'
      ? { authenticated: true, uuid: 'admin', username: 'admin', role: 'ADMIN', permissions: [] }
      : path === '/api/admin/inventory-id-settings' ? { pattern }
      : path === '/api/customization' ? { brandName: 'Feuerwehr', brandColor: '#b62f2f' }
      : path === '/api/auth/providers' ? { oidcEnabled: false }
      : path.endsWith('/page') ? { items: [], total: 0, hasMore: false } : [] });
  });
  await page.goto('/admin/inventory-ids');
  const input = page.getByRole('textbox', { name: 'Muster', exact: true });
  await expect(input).toHaveValue(pattern);
  await input.fill('FW-{unknown}');
  await expect(page.getByRole('button', { name: 'Speichern', exact: true })).toBeDisabled();
  await expect(page.locator('.preview-value')).toHaveCount(0);
  await input.fill('FW--END');
  await input.evaluate((el: HTMLInputElement) => el.setSelectionRange(3, 3));
  await page.getByRole('button', { name: 'Zufallszahlen', exact: true }).click();
  await expect(input).toHaveValue('FW-{random_number:10}-END');
  await expect(input).toBeFocused();
  await input.evaluate((el: HTMLInputElement) => el.setSelectionRange(0, 2));
  await page.getByRole('button', { name: 'Jahr (4 Stellen)', exact: true }).click();
  await expect(input).toHaveValue('{year}-{random_number:10}-END');
  await expect(page.locator('.preview-value')).toHaveText(/^[0-9]{4}-[0-9]{10}-END$/);
  const headingBox = await page.getByRole('heading', { name: 'Inventar-ID-Vergabe', exact: true }).boundingBox();
  const pageBox = await page.locator('.page').boundingBox();
  expect(headingBox!.x - pageBox!.x).toBeLessThan(40);
  await page.screenshot({ path: 'test-results/inventory-ids-desktop.png', fullPage: true });
  const regenerate = page.getByRole('button', { name: 'Alle Inventar-IDs neu generieren', exact: true });
  await expect(regenerate).toBeDisabled();
  await page.getByRole('button', { name: 'Speichern', exact: true }).click();
  await expect(page.locator('.saved')).toContainText('gespeichert');
  await page.getByRole('button', { name: 'Vorlage w\u00e4hlen' }).click();
  await page.getByRole('option', { name: 'Nur Zahlen (12 Stellen)' }).click();
  await expect(input).toHaveValue('{random_number:12}');
  await expect(page.locator('.preview-value')).toHaveText(/^[0-9]{12}$/);
  await page.getByRole('button', { name: 'Speichern', exact: true }).click();
  await expect(page.locator('.saved')).toContainText('gespeichert');
  await regenerate.click();
  await expect(page.getByRole('alertdialog')).toContainText('Scan-Codes');
  await page.getByRole('alertdialog').getByRole('button', { name: 'Abbrechen' }).click();
  expect(regenerations).toBe(0);
  await regenerate.click();
  await page.getByRole('alertdialog').getByRole('button', { name: 'Alle Inventar-IDs neu generieren', exact: true }).click();
  await expect(page.locator('.saved')).toContainText('12 Inventar-IDs');
  expect(regenerations).toBe(1);
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(page.getByRole('navigation')).not.toBeInViewport();
  await expect(input).toBeVisible();
  expect(await page.locator('.page').evaluate(el => el.scrollWidth <= el.clientWidth)).toBe(true);
  await page.locator('.page').evaluate(el => el.scrollTo(0, 0));
  await page.screenshot({ path: 'test-results/inventory-ids-mobile.png', fullPage: true });
});
