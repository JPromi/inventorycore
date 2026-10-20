import { Page, expect, test } from '@playwright/test';
import { join } from 'node:path';

/**
 * Screenshots for the README. Run against an instance filled by seed.mjs:
 *   npx playwright test -c screenshots/playwright.config.ts
 */
const out = (name: string) => join(__dirname, '..', '..', 'docs', 'screenshots', `${name}.png`);
const user = process.env['README_USER'] ?? 'inv';
const password = process.env['README_PASSWORD'] ?? 'core';

async function signIn(page: Page): Promise<void> {
  const response = await page.request.post('/api/auth', { data: { username: user, password } });
  expect(response.ok()).toBe(true);
}

async function assetUuid(page: Page, name: string): Promise<string> {
  const assets: { uuid: string; name: string }[] = await (await page.request.get('/api/assets')).json();
  return assets.find((asset) => asset.name === name)!.uuid;
}

/** Waits until the start screen is gone and the page has settled. */
async function settle(page: Page): Promise<void> {
  await expect(page.locator('#app-splash')).toHaveCount(0);
  await page.waitForLoadState('networkidle');
  await page.waitForTimeout(400);
}

test.describe('desktop', () => {
  test.use({ viewport: { width: 1440, height: 900 } });

  test('pages', async ({ page }) => {
    await signIn(page);

    await page.goto('/dashboard');
    await settle(page);
    await page.screenshot({ path: out('dashboard') });

    await page.goto('/assets');
    await settle(page);
    await page.screenshot({ path: out('assets') });

    await page.goto(`/assets/${await assetUuid(page, 'Atemschutzgerät PA 5')}`);
    await settle(page);
    await page.screenshot({ path: out('asset-detail') });

    const inspections: { items: { uuid: string; title: string }[] } = await (
      await page.request.get('/api/inspections/page?status=OPEN')
    ).json();
    const open = inspections.items.find((inspection) => inspection.title.startsWith('Jahresprüfung'))!;
    await page.goto(`/inspections/${open.uuid}`);
    await settle(page);
    await page.screenshot({ path: out('inspection') });

    await page.goto('/scan');
    await settle(page);
    await page.keyboard.type('FW-2026-0041\n');
    await expect(page.locator('.result-card')).toBeVisible();
    await page.waitForTimeout(400);
    await page.screenshot({ path: out('scan') });

    const templates: { uuid: string }[] = await (await page.request.get('/api/label-templates')).json();
    await page.goto(`/config/labels/${templates[0].uuid}/edit`);
    await settle(page);
    await page.screenshot({ path: out('label-editor') });

    await page.goto('/config/statuses');
    await settle(page);
    await page.screenshot({ path: out('statuses') });

    await page.goto('/admin/group-permissions');
    await settle(page);
    await page.screenshot({ path: out('permissions') });
  });

  test('dark mode', async ({ page }) => {
    await signIn(page);
    // the appearance is stored per user (uuid)
    const me: { uuid: string } = await (await page.request.get('/api/auth/me')).json();
    await page.addInitScript((key) => localStorage.setItem(key, 'dark'), `inventorycore.theme.user.${me.uuid}`);
    await page.goto('/dashboard');
    await settle(page);
    await page.screenshot({ path: out('dark-mode') });
  });
});

test.describe('phone', () => {
  test.use({
    viewport: { width: 390, height: 844 },
    deviceScaleFactor: 2,
    isMobile: true,
    hasTouch: true,
  });

  test('camera scan and asset', async ({ page }) => {
    await signIn(page);
    await page.goto('/scan');
    await settle(page);
    await page.getByRole('tab', { name: /Kamera/ }).click();
    // the fake camera shows a lasered Data Matrix code (FW-2026-0042)
    await expect(page.locator('.sheet-hit').first()).toBeVisible({ timeout: 20_000 });
    await page.waitForTimeout(500);
    // the camera picture is noisy: JPEG keeps it small
    await page.screenshot({ path: out('phone-camera').replace(/png$/, 'jpg'), type: 'jpeg', quality: 80 });

    await page.goto(`/assets/${await assetUuid(page, 'Atemschutzgerät PA 1')}`);
    await settle(page);
    await page.screenshot({ path: out('phone-asset') });
  });
});
