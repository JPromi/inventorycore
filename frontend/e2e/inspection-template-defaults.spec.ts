import { expect, test } from '@playwright/test';

test('template defaults are editable and passed to inspection preview and creation', async ({ page }) => {
  const type = { uuid: 'template', name: 'Inventur', mode: 'INVENTORY', fields: [],
    assetTypeUuids: [], areaUuids: [], areaNames: [], assetTypeNames: [],
    usable: true, editable: true, deletable: true, inspectionCount: 0, protocolAreaUuid: 'general',
    defaultTagUuids: ['tag'], defaultAssetTypeUuids: ['pc'], defaultLocationUuids: ['garage', 'office'],
    recurringTagUuids: ['tag'], intervalValue: 6, intervalUnit: 'DAYS', includeChildAssets: true, checkFunction: false };
  let preview: any;
  let created: any;
  let saved: any;
  await page.addInitScript(() => localStorage.setItem('inventorycore.selectedAreas', JSON.stringify(['edv'])));
  await page.route('**/api/**', async route => {
    const request = route.request();
    const path = new URL(request.url()).pathname;
    if (path === '/api/inspections/preview') {
      preview = request.postDataJSON();
      return route.fulfill({ json: { count: preview.includeChildAssets ? 3 : 1 } });
    }
    if (path === '/api/inspections' && request.method() === 'POST') {
      created = request.postDataJSON();
      return route.fulfill({ status: 400, json: {} });
    }
    if (path === '/api/inspection-types/template' && request.method() !== 'GET') {
      saved = request.postDataJSON();
      return route.fulfill({ json: { ...type, ...saved } });
    }
    const body = path === '/api/auth/me'
      ? { authenticated: true, username: 'admin', role: 'ADMIN', permissions: [] }
      : path === '/api/inspection-types/template' ? type
      : path === '/api/inspection-types' ? [type]
      : path === '/api/areas' ? [{ uuid: 'general', name: 'Allgemein', defaultArea: true }, { uuid: 'edv', name: 'EDV', defaultArea: false }]
      : path === '/api/assets' ? [{ uuid: 'pc-1', name: 'Computer', areaUuids: ['edv'], tags: [{ uuid: 'extra', name: 'Zusatz' }] }]
      : path === '/api/asset-types' ? [{ uuid: 'pc', name: 'Computer' }]
      : path === '/api/locations' ? [{ uuid: 'garage', name: 'Garage' }, { uuid: 'office', name: 'Büro' }]
      : path === '/api/tags' ? [{ uuid: 'tag', name: 'EDV', color: null }, { uuid: 'extra', name: 'Zusatz', color: null }] : [];
    return route.fulfill({ json: body });
  });
  await page.goto('/config/inspection-templates/new');
  await expect(page.locator('app-search-select[name="protocolArea"]')).toContainText('EDV');
  await page.goto('/config/inspection-templates/template');
  await expect(page.locator('app-search-select[name="protocolArea"]')).toContainText('Allgemein');
  await expect(page.getByRole('heading', { name: 'Prüfungsvorlage bearbeiten', exact: true })).toBeVisible();
  await page.goto('/config/inspection-types/template');
  await expect(page).toHaveURL(/\/config\/inspection-templates\/template$/);
  await expect(page.getByRole('heading', { name: 'Filter', exact: true })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Anwendungsbereich', exact: true })).toBeVisible();
  const filterSection = page.locator('section').filter({ has: page.getByRole('heading', { name: 'Filter', exact: true }) }).last();
  const appliesSection = page.locator('section').filter({ has: page.getByRole('heading', { name: 'Anwendungsbereich', exact: true }) }).last();
  await expect(filterSection.locator('app-multi-select[name="defaultTagUuids"]')).toBeVisible();
  await expect(filterSection.locator('app-multi-select[name="assetTypeUuids"]')).toHaveCount(0);
  await expect(appliesSection.locator('app-multi-select[name="assetTypeUuids"]')).toBeVisible();
  await expect(appliesSection.locator('app-multi-select[name="areaUuids"]')).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Wiederholung', exact: true })).toBeVisible();
  await expect(page.locator('app-multi-select[name="defaultTagUuids"] .chip')).toContainText('EDV');
  await expect(page.locator('input[name="includeChildAssets"]')).toBeChecked();
  await expect(page.locator('app-multi-select[name="defaultAssetTypeUuids"] .chip')).toContainText('Computer');
  await expect(page.locator('app-multi-select[name="defaultLocationUuids"] .chip')).toHaveCount(2);
  await expect(page.locator('app-multi-select[name="recurringTagUuids"] .chip')).toContainText('EDV');
  await page.locator('input[name="includeChildAssets"]').uncheck();
  await page.locator('button[type="submit"]').click();
  await expect.poll(() => saved).toMatchObject({ defaultTagUuids: ['tag'], includeChildAssets: false,
    defaultAssetTypeUuids: ['pc'], defaultLocationUuids: ['garage', 'office'], recurringTagUuids: ['tag'], protocolAreaUuid: 'general' });

  await page.goto('/inspections/new?type=template');
  await expect(page.locator('app-search-select[name="protocolArea"]')).toContainText('Allgemein');
  await expect(page.locator('app-search-select[name="protocolArea"] .trigger')).toBeDisabled();
  for (const name of ['location', 'tags', 'assetTypes']) {
    const control = page.locator(`app-multi-select[name="${name}"]`);
    await expect(control.locator('.chip.locked').first()).toBeVisible();
    await expect(control.locator('.chip button')).toHaveCount(0);
    await control.locator('input').focus();
    await control.locator('input').press('Backspace');
    await expect(control.locator('.chip.locked').first()).toBeVisible();
  }
  await expect(page.locator('app-multi-select[name="location"] .chip')).toHaveCount(2);
  await expect(page.locator('app-multi-select[name="assetTypes"] .chip')).toContainText('Computer');
  await expect(page.locator('app-multi-select[name="tags"] .chip')).toContainText('EDV');
  const tagControl = page.locator('app-multi-select[name="tags"]');
  await tagControl.locator('input').fill('Zusatz');
  await tagControl.getByRole('option', { name: 'Zusatz', exact: true }).click();
  await expect(tagControl.locator('.chip')).toHaveCount(2);
  await tagControl.getByRole('button', { name: 'Zusatz entfernen' }).click();
  await expect(tagControl.locator('.chip.locked')).toContainText('EDV');
  await expect(page.locator('input[name="includeChildAssets"]')).toBeChecked();
  await expect.poll(() => preview).toMatchObject({ includeChildAssets: true, filter: { tagUuids: ['tag'] } });
  await page.locator('input[name="includeChildAssets"]').uncheck();
  await expect.poll(() => preview.includeChildAssets).toBe(false);
  await page.locator('button[type="submit"]').click();
  await expect.poll(() => created).toMatchObject({ includeChildAssets: false, areaUuid: 'general',
    filter: { tagUuids: ['tag'], assetTypeUuids: ['pc'], locationUuids: ['garage', 'office'] } });
});
