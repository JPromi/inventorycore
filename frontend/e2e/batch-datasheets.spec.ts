import { expect, Page, test } from '@playwright/test';
import { pageOf } from './support/paging';

async function setup(page: Page, limited = false) {
  let failAsset = false;
  const requests: string[] = [];
  const assets = [
    {
      uuid: 'one',
      name: 'Atemschutzgerät 1',
      invId: 'FW-1',
      serialNumber: 'SN-ONE',
      areaUuids: ['area'],
      images: [],
      fieldValues: [],
      tags: [],
    },
    {
      uuid: 'two',
      name: 'Atemschutzgerät 2',
      invId: 'FW-2',
      serialNumber: 'SN-TWO',
      areaUuids: ['area'],
      assetTypeUuid: 'type',
      locationUuid: 'room',
      fieldValues: [{ name: 'Druckprüfung', fieldKey: 'druck', value: 'true' }],
      tags: [],
      images: [{ kind: 'THUMBNAIL', sortOrder: 0, url: '/icons/icon-192x192.png' }],
    },
    {
      uuid: 'three',
      name: 'Nicht ausgewählt',
      invId: 'FW-3',
      areaUuids: ['area'],
      images: [],
      fieldValues: [],
      tags: [],
    },
  ];
  await page.addInitScript(() => {
    (window as any).printed = 0;
    window.print = () => {
      (window as any).printed++;
    };
  });
  await page.route('**/api/**', async (route) => {
    const url = new URL(route.request().url());
    const path = url.pathname;
    requests.push(path);
    if (path === '/api/assets/two' && failAsset) return route.fulfill({ status: 403, json: {} });
    const selected = assets.find((asset) => path === `/api/assets/${asset.uuid}`);
    await route.fulfill({
      json:
        path === '/api/auth/me'
          ? {
              authenticated: true,
              username: 'user',
              role: limited ? 'USER' : 'ADMIN',
              permissions: [{ resourceType: 'ASSET', canView: true, areaUuid: null }],
            }
          : path === '/api/assets/page'
            ? pageOf(assets, url)
            : selected
              ? { ...selected, description: `Beschreibung ${selected.invId}` }
              : path === '/api/assets'
                ? assets
                : path === '/api/areas'
                  ? [{ uuid: 'area', name: 'Feuerwehr', defaultArea: true }]
                  : path === '/api/asset-types'
                    ? [
                        {
                          uuid: 'type',
                          name: 'Atemschutz',
                          tags: [{ uuid: 'tag', name: 'Einsatzbereit' }],
                          fieldDefinitions: [
                            {
                              name: 'Druckprüfung',
                              fieldKey: 'druck',
                              fieldType: 'BOOLEAN',
                              sortOrder: 0,
                            },
                          ],
                        },
                      ]
                    : path === '/api/locations'
                      ? [{ uuid: 'room', name: 'Gerätehaus' }]
                      : path === '/api/customization'
                        ? { brandName: 'Feuerwehr', logoUrl: '/icons/icon-192x192.png' }
                        : path === '/api/assets/two/inspections'
                          ? [
                              {
                                inspectionUuid: 'run',
                                title: 'Letzte Atemschutzprüfung',
                                typeName: 'Atemschutzprüfung',
                                inspectionStatus: 'COMPLETED',
                                createdAt: '2026-10-01T08:00:00Z',
                                completedAt: '2026-10-01T09:00:00Z',
                                checkedAt: '2026-10-01T09:00:00Z',
                                status: 'PRESENT',
                                expected: true,
                                values: [],
                              },
                            ]
                          : [],
    });
  });
  await page.goto('/assets');
  await page.getByRole('button', { name: 'Auswählen', exact: true }).click();
  await page.locator('app-selection-checkbox input').nth(0).check();
  await page.locator('app-selection-checkbox input').nth(1).check();
  const open = async () => {
    await page.getByRole('button', { name: 'Aktionen', exact: true }).click();
    await page.getByRole('menuitem', { name: 'Datenblätter drucken', exact: true }).click();
  };
  return {
    requests,
    open,
    fail: (value: boolean) => {
      failAsset = value;
    },
  };
}

for (const width of [1280, 390]) {
  test(`selected datasheets form one print job (${width}px)`, async ({ page }) => {
    await page.setViewportSize({ width, height: 844 });
    const state = await setup(page);
    await state.open();
    const dialog = page.getByRole('dialog', { name: 'Asset-Datenblatt drucken' });
    await expect(dialog).toContainText('2 Datenblätter');
    await expect(dialog.getByLabel('Letzte Prüfung mit Prüfwerten')).toBeVisible();
    await page.screenshot({ path: test.info().outputPath('batch-settings.png') });
    await dialog.getByRole('button', { name: 'Drucken', exact: true }).click();
    await expect.poll(() => page.evaluate(() => (window as any).printed)).toBe(1);
    await page.emulateMedia({ media: 'print' });
    const pages = page.locator('.print-document.active .print-pages');
    await expect(pages.locator('h1')).toHaveText(['Atemschutzgerät 1', 'Atemschutzgerät 2']);
    await expect(pages).toContainText('SN-ONE');
    await expect(pages).toContainText('SN-TWO');
    await expect(pages).toContainText('Beschreibung FW-2');
    await expect(pages).toContainText('Druckprüfung');
    await expect(pages).toContainText('Einsatzbereit');
    await expect(pages).toContainText('Letzte Atemschutzprüfung');
    await expect(pages).not.toContainText('Nicht ausgewählt');
    await expect(pages.locator('.print-page')).toHaveCount(2);
    await expect(pages.locator('.print-page-footer').last()).toContainText('Seite 2 von 2');
    await expect(pages.locator('.print-figure img')).toHaveCount(1);
    await page.screenshot({ path: test.info().outputPath('batch-print.png'), fullPage: true });
    await page.evaluate(() => window.dispatchEvent(new Event('afterprint')));
    await expect(page.locator('app-asset-print-batch')).toHaveCount(0);
    await page.emulateMedia({ media: 'screen' });
    await state.open();
    await dialog.getByLabel('Letzte Prüfung mit Prüfwerten').uncheck();
    await dialog.locator('.field', { hasText: 'Bilder' }).locator('.trigger').click();
    await page.getByRole('option', { name: 'Keine Bilder', exact: true }).click();
    await dialog.getByRole('button', { name: 'Drucken', exact: true }).click();
    await expect.poll(() => page.evaluate(() => (window as any).printed)).toBe(2);
    await expect(pages).not.toContainText('Letzte Atemschutzprüfung');
    await expect(pages.locator('.print-figure img')).toHaveCount(0);
  });
}

test('failed selected asset stops the job and can be retried', async ({ page }) => {
  const state = await setup(page);
  state.fail(true);
  await state.open();
  await expect(page.getByRole('alert')).toContainText('nicht vollständig geladen');
  expect(await page.evaluate(() => (window as any).printed)).toBe(0);
  await expect(page.locator('app-asset-print')).toHaveCount(0);
  state.fail(false);
  await page.getByRole('button', { name: 'Erneut versuchen', exact: true }).click();
  await expect(page.getByRole('dialog', { name: 'Asset-Datenblatt drucken' })).toBeVisible();
  await page.getByRole('button', { name: 'Abbrechen', exact: true }).click();
  await expect(page.locator('app-asset-print-batch')).toHaveCount(0);
  await expect(page.locator('body > .print-document')).toHaveCount(0);
});

test('view-only users can print without requesting inspection history', async ({ page }) => {
  const state = await setup(page, true);
  await state.open();
  const dialog = page.getByRole('dialog', { name: 'Asset-Datenblatt drucken' });
  await expect(dialog).toBeVisible();
  await expect(dialog.getByLabel('Letzte Prüfung mit Prüfwerten')).toHaveCount(0);
  expect(state.requests.filter((path) => path.endsWith('/inspections'))).toHaveLength(0);
});
