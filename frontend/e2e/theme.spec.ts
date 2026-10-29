import { expect, Page, test } from '@playwright/test';
import { followSystemTheme } from './support/theme';

async function mockThemeApi(page: Page, advanced = true, authenticated = true) {
  let username = 'admin';
  let settings = {
    brandName: 'Feuerwehr',
    brandColor: '#0f766e',
    darkBrandColor: '#e4d455',
    advancedThemeEnabled: advanced,
    logoUrl: '/api/customization/logo?v=light',
    darkLogoUrl: '/api/customization/logo?mode=dark&v=dark',
    loginTitle: null,
    loginMessage: null,
    imprintUrl: null,
    privacyUrl: null,
    websiteUrl: null,
    supportUrl: null,
  };
  await page.route('**/api/**', async (route) => {
    const url = new URL(route.request().url());
    const path = url.pathname;
    const method = route.request().method();
    if (path === '/api/customization/logo')
      return route.fulfill({
        path:
          url.searchParams.get('mode') === 'dark'
            ? 'public/icons/icon-512x512.png'
            : 'public/icons/icon-192x192.png',
        contentType: 'image/png',
      });
    if (path === '/api/admin/customization' && method === 'PUT')
      settings = { ...settings, ...route.request().postDataJSON() };
    if (path === '/api/admin/customization/logo') {
      if (url.searchParams.get('mode') === 'dark')
        settings.darkLogoUrl = method === 'DELETE' ? '' : '/api/customization/logo?mode=dark&v=new';
      else settings.logoUrl = method === 'DELETE' ? '' : '/api/customization/logo?v=new';
    }
    await route.fulfill({
      json:
        path === '/api/auth/me'
          ? {
              authenticated,
              uuid: username,
              username,
              displayName: 'Max Muster',
              role: 'ADMIN',
              sourceProvider: 'LOCAL',
              permissions: [],
            }
          : path === '/api/customization' || path.startsWith('/api/admin/customization')
            ? settings
            : path === '/api/auth/providers'
              ? { oidcEnabled: false }
              : path.endsWith('/page')
                ? { items: [], total: 0, hasMore: false }
                : [],
    });
  });
  return { settings: () => settings, user: (value: string) => (username = value) };
}

test('light by default; system is live when chosen; overrides persist per user', async ({
  page,
}) => {
  const state = await mockThemeApi(page);
  await page.emulateMedia({ colorScheme: 'dark' });
  await page.goto('/profile');
  const selector = page.locator('app-profile-page app-theme-selector');
  // light although the system is dark
  await expect(page.locator('body')).toHaveAttribute('data-theme', 'light');
  await expect(selector.getByRole('button', { name: 'Hell', exact: true })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  await expect(page.locator('.brand img')).toHaveAttribute('src', state.settings().logoUrl);

  // "System" follows the system live and is kept
  await selector.getByRole('button', { name: 'System', exact: true }).click();
  await expect(page.locator('body')).toHaveAttribute('data-theme', 'dark');
  await expect(page.locator('.brand img')).toHaveAttribute('src', state.settings().darkLogoUrl);
  await expect(page.locator('body')).toHaveCSS('background-color', 'rgb(23, 24, 26)');
  await page.emulateMedia({ colorScheme: 'light' });
  await expect(page.locator('body')).toHaveAttribute('data-theme', 'light');
  await page.reload();
  await expect(selector.getByRole('button', { name: 'System', exact: true })).toHaveAttribute(
    'aria-pressed',
    'true',
  );

  await selector.getByRole('button', { name: 'Dunkel', exact: true }).click();
  await page.reload();
  await expect(selector.getByRole('button', { name: 'Dunkel', exact: true })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  await expect(page.locator('body')).toHaveAttribute('data-theme', 'dark');
  // another user on this browser starts light
  state.user('other');
  await page.reload();
  await expect(page.locator('body')).toHaveAttribute('data-theme', 'light');
  state.user('admin');
  await page.reload();
  await expect(page.locator('body')).toHaveAttribute('data-theme', 'dark');
});

for (const width of [1280, 390]) {
  test(`advanced branding, independent logo operations and light-only fallback (${width}px)`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 900 });
    await page.emulateMedia({ colorScheme: 'dark' });
    const state = await mockThemeApi(page, false);
    await page.goto('/admin/customization');
    await expect(page.locator('.style-modes')).toHaveCount(0);
    await expect(page.locator('.logo-preview')).toHaveAttribute('src', state.settings().logoUrl);
    await expect(page.getByRole('button', { name: 'Speichern', exact: true })).toHaveCSS(
      'background-color',
      'rgb(15, 118, 110)',
    );
    const advanced = page.getByRole('checkbox', { name: 'Erweiterte Darstellung' });
    await expect(advanced).toHaveCSS('appearance', 'none');
    expect(
      await advanced.evaluate((input) => input.closest('label')?.classList.contains('toggle')),
    ).toBe(true);
    await advanced.check();
    await expect(advanced).toHaveCSS('background-color', 'rgb(15, 118, 110)');
    await page.locator('.style-modes').getByRole('button', { name: 'Dunkel', exact: true }).click();
    await expect(page.locator('app-color-picker .trigger')).toContainText('#E4D455');
    await page.getByLabel('Name der Organisation', { exact: true }).fill('Feuerwehr Musterstadt');
    await page.locator('app-color-picker .trigger').click();
    await page.locator('.hex-field input').fill('#101010');
    await page.locator('.hex-field input').press('Enter');
    const fileChooser = page.waitForEvent('filechooser');
    await page.getByRole('button', { name: 'Logo hochladen', exact: true }).click();
    await (await fileChooser).setFiles('public/icons/icon-512x512.png');
    await expect(page.getByRole('status')).toHaveText('Logo gespeichert.');
    await expect(page.getByLabel('Name der Organisation', { exact: true })).toHaveValue(
      'Feuerwehr Musterstadt',
    );
    await expect(page.locator('.logo-preview')).toHaveAttribute('src', /mode=dark&v=new/);
    await page.getByRole('button', { name: 'Speichern', exact: true }).click();
    await expect(page.getByRole('status')).toHaveText('Gespeichert');
    expect(state.settings().brandColor).toBe('#0f766e');
    expect(state.settings().darkBrandColor).toBe('#101010');
    expect(state.settings().advancedThemeEnabled).toBe(true);
    await expect(page.locator('.sub-nav a.active svg')).not.toHaveCSS('color', 'rgb(16, 16, 16)');
    await expect(page.getByRole('button', { name: 'Speichern', exact: true })).toHaveCSS(
      'color',
      'rgb(255, 255, 255)',
    );
    await page.screenshot({
      path: test.info().outputPath('dark-customization-advanced.png'),
      fullPage: true,
    });
    await page.locator('.style-modes').getByRole('button', { name: 'Hell', exact: true }).click();
    await expect(page.locator('.logo-preview')).toHaveAttribute('src', state.settings().logoUrl);
    await page.locator('.style-modes').getByRole('button', { name: 'Dunkel', exact: true }).click();
    await page.getByRole('button', { name: 'Logo entfernen', exact: true }).click();
    await expect(page.getByRole('status')).toHaveText('Logo entfernt.');
    expect(state.settings().logoUrl).toContain('v=light');
    await expect(page.locator('.brand img')).toHaveAttribute('src', state.settings().logoUrl);
    await page.getByRole('checkbox', { name: 'Erweiterte Darstellung' }).uncheck();
    await expect(page.locator('.style-modes')).toHaveCount(0);
    await expect(page.locator('.logo-preview')).toHaveAttribute('src', state.settings().logoUrl);
    await page.getByRole('button', { name: 'Speichern', exact: true }).click();
    await expect(page.getByRole('status')).toHaveText('Gespeichert');
    expect(state.settings().darkBrandColor).toBe('#101010');
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
    await page.screenshot({
      path: test.info().outputPath('dark-customization.png'),
      fullPage: true,
    });
  });
}

test('anonymous dark login uses dark branding; labels remain light', async ({ page }) => {
  await followSystemTheme(page);
  await page.emulateMedia({ colorScheme: 'dark' });
  const state = await mockThemeApi(page, true, false);
  await page.goto('/login');
  await expect(page.locator('body')).toHaveAttribute('data-theme', 'dark');
  await expect(page.locator('.custom-logo').first()).toHaveAttribute(
    'src',
    state.settings().darkLogoUrl,
  );
  await expect(page.locator('.login-button')).toHaveCSS('background-color', 'rgb(228, 212, 85)');
  await expect(page.locator('.login-button')).toHaveCSS('color', 'rgb(0, 0, 0)');
  await page.screenshot({ path: test.info().outputPath('dark-login.png'), fullPage: true });
  await page.unroute('**/api/**');
  await mockThemeApi(page, true, true);
  await page.goto('/config/labels/new');
  await page.getByRole('button', { name: 'Logo', exact: true }).click();
  await expect(page.locator('.label img')).toHaveAttribute('src', state.settings().logoUrl);
});

test('dark screens still print light documents and the light logo', async ({ page }) => {
  await followSystemTheme(page);
  await page.emulateMedia({ colorScheme: 'dark' });
  const state = await mockThemeApi(page);
  await page.route('**/api/assets/asset', (route) =>
    route.fulfill({
      json: {
        uuid: 'asset',
        name: 'Atemschutzgerät',
        areaUuids: [],
        images: [],
      },
    }),
  );
  await page.addInitScript(() => {
    window.print = () => {};
  });
  await page.goto('/assets/asset');
  await expect(page.locator('body')).toHaveAttribute('data-theme', 'dark');
  await page.getByRole('button', { name: 'Weitere Aktionen', exact: true }).click();
  await page.getByRole('menuitem', { name: 'Drucken', exact: true }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Drucken', exact: true }).click();
  await page.emulateMedia({ media: 'print', colorScheme: 'dark' });
  const printed = page.locator('body > .print-document.active');
  await expect(printed).toBeVisible();
  await expect(printed).toHaveCSS('color', 'rgb(33, 33, 33)');
  await expect(printed).toHaveCSS('color-scheme', 'light');
  await expect(printed).toHaveCSS('background-color', 'rgb(255, 255, 255)');
  await expect(page.locator('body')).toHaveCSS('background-color', 'rgb(255, 255, 255)');
  await expect(printed.locator('.print-pages .logo').first()).toHaveAttribute(
    'src',
    state.settings().logoUrl,
  );
});

test('appearance remains usable when browser storage is unavailable', async ({ page }) => {
  await page.addInitScript(() => {
    Storage.prototype.getItem = () => {
      throw new DOMException('Blocked', 'SecurityError');
    };
    Storage.prototype.setItem = () => {
      throw new DOMException('Blocked', 'SecurityError');
    };
    Storage.prototype.removeItem = () => {
      throw new DOMException('Blocked', 'SecurityError');
    };
  });
  await mockThemeApi(page);
  await page.emulateMedia({ colorScheme: 'light' });
  await page.goto('/profile');
  await page
    .locator('app-profile-page app-theme-selector')
    .getByRole('button', { name: 'Dunkel', exact: true })
    .click();
  await expect(page.locator('body')).toHaveAttribute('data-theme', 'dark');
});
