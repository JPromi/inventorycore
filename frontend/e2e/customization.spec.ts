import { expect, test, Page } from '@playwright/test';

const defaults = { brandName: 'Testfirma', brandColor: '#0f766e', loginTitle: 'Firmenanmeldung',
  loginMessage: 'Mit deinem Firmenkonto anmelden.', imprintUrl: 'https://example.org/imprint',
  privacyUrl: 'https://example.org/privacy', websiteUrl: 'https://example.org', supportUrl: null,
  logoUrl: '/api/customization/logo?v=test' };

async function mockApi(page: Page, authenticated: boolean, color = defaults.brandColor) {
  let settings = { ...defaults, brandColor: color };
  let savedLabel: any;
  await page.route('**/api/**', async route => {
    const path = new URL(route.request().url()).pathname;
    const method = route.request().method();
    if (path === '/api/customization/logo') return route.fulfill({ path: 'public/icons/icon-192x192.png', contentType: 'image/png' });
    if (path === '/api/admin/customization' && method === 'PUT') settings = { ...settings, ...route.request().postDataJSON() };
    if (path === '/api/admin/customization/logo') settings.logoUrl = method === 'DELETE' ? null as any : '/api/customization/logo?v=new';
    if (path === '/api/label-templates' && method === 'POST') {
      savedLabel = route.request().postDataJSON();
      return route.fulfill({ json: { ...savedLabel, uuid: 'label' } });
    }
    const body = path === '/api/auth/me' ? { authenticated, username: authenticated ? 'admin' : null, role: 'ADMIN', permissions: [] }
      : path === '/api/customization' || path.startsWith('/api/admin/customization') ? settings
      : path === '/api/auth/providers' ? { oidcEnabled: false }
      : path === '/api/label-templates' && savedLabel ? [{ ...savedLabel, uuid: 'label' }]
      : path === '/api/assets/asset' ? { uuid: 'asset', name: 'Computer', areaUuids: ['area'], invId: 'PC-1', fieldValues: [] }
      : path === '/api/areas' ? [{ uuid: 'area', name: 'EDV', defaultArea: true }] : [];
    return route.fulfill({ json: body });
  });
  return { settings: () => settings, savedLabel: () => savedLabel };
}

for (const width of [1280, 390]) {
  test(`public login branding and legal links (${width}px)`, async ({ page }, testInfo) => {
    await page.setViewportSize({ width, height: 900 });
    await mockApi(page, false);
    await page.goto('/login');
    await expect(page.getByRole('heading', { name: 'Firmenanmeldung' })).toBeVisible();
    await expect(page.getByRole('link', { name: 'Impressum' })).toHaveAttribute('href', defaults.imprintUrl);
    await expect(page.getByRole('link', { name: 'Datenschutz' })).toHaveAttribute('href', defaults.privacyUrl);
    await expect.poll(() => page.locator('.custom-logo:visible').evaluate((img: HTMLImageElement) => img.naturalWidth)).toBeGreaterThan(0);
    await expect(page.locator('.login-button')).toHaveCSS('background-color', 'rgb(15, 118, 110)');
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.screenshot({ path: testInfo.outputPath('login-branding.png'), fullPage: true });
  });

  test(`admin customization, logo upload, label elements (${width}px)`, async ({ page }, testInfo) => {
    await page.setViewportSize({ width, height: 900 });
    const state = await mockApi(page, true);
    page.on('frameattached', frame => {
      void frame.evaluate(() => {
        window.print = () => {
          parent.document.body.dataset['printLoaded'] = String(Array.from(document.images).every(image => image.complete && image.naturalWidth > 0));
        };
      }).catch(() => {});
    });
    await page.goto('/admin/customization');
    await page.getByLabel('Name der Organisation', { exact: true }).fill('Neue Firma');
    await page.locator('input[type="file"]').setInputFiles('public/icons/icon-192x192.png');
    await expect(page.getByRole('status')).toHaveText('Logo gespeichert.');
    await expect(page.getByLabel('Name der Organisation', { exact: true })).toHaveValue('Neue Firma');
    await page.getByRole('button', { name: 'Speichern', exact: true }).click();
    await expect(page.getByRole('status')).toHaveText('Gespeichert');
    expect(state.settings().brandName).toBe('Neue Firma');
    await page.screenshot({ path: testInfo.outputPath('customization.png'), fullPage: true });

    await page.goto('/config/labels/new');
    await page.getByRole('button', { name: 'Logo', exact: true }).click();
    await expect.poll(() => page.locator('.label img').evaluate((img: HTMLImageElement) => img.naturalWidth)).toBeGreaterThan(0);
    await page.getByRole('button', { name: 'Text', exact: true }).click();
    await page.locator('textarea').last().fill('{brandName}\n{website}');
    await page.getByLabel('X', { exact: true }).fill('2');
    await page.getByLabel('Y', { exact: true }).fill('22');
    await page.getByLabel('Breite', { exact: true }).fill('58');
    await page.getByLabel('Schriftgröße (pt)', { exact: true }).fill('6');
    await page.getByLabel('Hauptfarbe verwenden').check();
    await expect(page.locator('.label .element.selected')).toContainText('Neue Firma');
    await expect(page.locator('.label .element.selected')).toContainText('https://example.org');
    await expect(page.locator('.label .element.selected')).toHaveCSS('color', 'rgb(15, 118, 110)');
    await page.screenshot({ path: testInfo.outputPath('label-branding.png'), fullPage: true });
    await page.getByLabel('Name *', { exact: true }).fill('Firmenlabel');
    await page.getByRole('button', { name: 'Speichern', exact: true }).click();
    await expect.poll(() => state.savedLabel()).toBeTruthy();
    const elements = JSON.parse(state.savedLabel().elementsJson);
    expect(elements.some((item: any) => item.type === 'logo')).toBe(true);
    expect(elements.some((item: any) => item.useBrandColor && item.content.includes('{brandName}'))).toBe(true);
    await page.goto('/assets/asset');
    await page.getByRole('button', { name: 'Weitere Aktionen', exact: true }).click();
    await page.getByRole('menuitem', { name: 'Label drucken', exact: true }).click();
    // the preview; the dialog also renders hidden copies for printing
    await expect(page.locator('app-label-print-dialog .preview .label img')).toBeVisible();
    await page.locator('app-label-print-dialog').getByRole('button', { name: 'Drucken', exact: true }).click();
    await expect(page.locator('body')).toHaveAttribute('data-print-loaded', 'true');
  });
}

for (const colors of [
  { brand: '#101010', normal: 'rgb(255, 255, 255)', hover: 'rgb(255, 255, 255)' },
  { brand: '#f5e55a', normal: 'rgb(0, 0, 0)', hover: 'rgb(0, 0, 0)' },
  { brand: '#808080', normal: 'rgb(0, 0, 0)', hover: 'rgb(255, 255, 255)' },
]) {
  test(`brand button text contrast including hover (${colors.brand})`, async ({ page }) => {
    await mockApi(page, false, colors.brand);
    await page.goto('/login');
    const button = page.locator('.login-button');
    await expect(button).toHaveCSS('color', colors.normal);
    await expect(button.locator('svg')).toHaveCSS('color', colors.normal);
    await button.hover();
    await expect(button).toHaveCSS('color', colors.hover);
    await expect(button.locator('svg')).toHaveCSS('color', colors.hover);

    await page.unroute('**/api/**');
    await mockApi(page, true, colors.brand);
    await page.goto('/admin/customization');
    const save = page.getByRole('button', { name: 'Speichern', exact: true });
    await expect(save).toHaveCSS('color', colors.normal);
    await save.hover();
    await expect(save).toHaveCSS('color', colors.hover);
  });
}
