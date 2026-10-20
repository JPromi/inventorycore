import { expect, Page, test } from '@playwright/test';

const permission = (resourceType: string, rights: Record<string, boolean>) => ({
  uuid: resourceType, resourceType, areaUuid: 'edv', canView: true, canEdit: false, canInspect: false,
  canDelete: false, admin: false, canCreate: false, ...rights,
});

async function signIn(page: Page, permissions: object[]) {
  await page.route('**/api/**', async (route) => {
    const path = new URL(route.request().url()).pathname;
    const body = path === '/api/auth/me'
      ? { authenticated: true, username: 'gwart', displayName: 'Gerätewart', role: 'USER', permissions }
      : path === '/api/areas' ? [{ uuid: 'edv', name: 'EDV', defaultArea: true }]
      : path === '/api/dashboard' ? { assetCount: 0, locationCount: 0, assetTypeCount: 0, tagCount: 0, canInspect: false,
        due: { overdue: 0, dueSoon: 0, ok: 0 }, nextDue: [], openInspectionCount: 0, completedInspectionCount: 0,
        recentInspections: [], results: { ok: 0, defect: 0, missing: 0, failed: 0 }, topTags: [], assetsByType: [], otherTypeAssetCount: 0 }
      : path.endsWith('/page') ? { items: [], total: 0, hasMore: false }
      : path === '/api/asset-types/t1' ? { uuid: 't1', name: 'Pressluftatmer', areaUuids: ['edv'] } : [];
    await route.fulfill({ json: body });
  });
}

const nav = (page: Page) => page.locator('nav');

test('without the right to maintain types the configuration is hidden and closed', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await signIn(page, [permission('ASSET', { canEdit: true, canInspect: true }), permission('ASSET_TYPE', {})]);
  await page.goto('/dashboard');
  await expect(nav(page).getByText('Inventar', { exact: true })).toBeVisible();
  await expect(nav(page).getByText('Konfiguration', { exact: true })).toHaveCount(0);

  for (const route of ['/config/statuses', '/config/tags', '/config/types', '/config/labels', '/config/inspection-templates']) {
    await page.goto(route);
    await expect(page).toHaveURL(/\/dashboard$/);
  }
  // the type of an asset can still be looked at
  await page.goto('/config/types/t1');
  await expect(page).toHaveURL(/\/config\/types\/t1$/);
});

test('with the right to edit types in one area the configuration is there', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await signIn(page, [permission('ASSET_TYPE', { canEdit: true })]);
  await page.goto('/dashboard');
  await nav(page).getByText('Konfiguration', { exact: true }).click();
  await expect(nav(page).getByRole('link', { name: 'Status' })).toBeVisible();
  await nav(page).getByRole('link', { name: 'Status' }).click();
  await expect(page).toHaveURL(/\/config\/statuses$/);
});
