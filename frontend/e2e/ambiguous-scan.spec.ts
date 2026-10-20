import { expect, Page, test } from '@playwright/test';

const me = { authenticated: true, username: 'admin', displayName: 'Admin', role: 'ADMIN', permissions: [] };

const asset = (uuid: string, name: string, invId: string, serialNumber: string | null) => ({
  uuid, name, invId, serialNumber, inventoryNumber: null, description: null, assetTypeUuid: null, locationUuid: null,
  tagUuids: [], tags: [], areaUuids: [], images: [], fields: [],
});

async function mockApi(page: Page, handle: (path: string, method: string, body: unknown) => unknown) {
  await page.route('**/api/**', async (route) => {
    const request = route.request();
    const path = new URL(request.url()).pathname;
    const answer = path === '/api/auth/me' ? me : handle(path, request.method(), request.postDataJSON());
    await route.fulfill({ json: answer ?? [] });
  });
}

for (const viewport of [{ width: 1280, height: 800 }, { width: 390, height: 844 }]) {
  test(`inspection scan with a code of two assets lets the user pick one (${viewport.width}px)`, async ({ page }) => {
    await page.setViewportSize(viewport);
    const item = {
      uuid: 'item-laptop', assetUuid: 'laptop', assetName: 'Laptop', invId: 'EDV-1', serialNumber: 'SN-7',
      assetTypeUuid: null, assetTypeName: null, locationName: null, expected: true, status: 'PENDING', method: null,
      condition: null, scannedCode: null, checkedAt: null, checkedByName: null, note: null, values: [], photos: [],
      parentAssetUuid: null, parentAssetNote: null, inspectionPolicy: 'STANDARD',
    };
    const detail = {
      summary: { uuid: 'run', title: 'Inventur', typeName: 'Inventur', mode: 'INVENTORY', status: 'OPEN', checkFunction: false,
        areaUuids: [], areaNames: [], filterSummary: 'Alle Assets', createdAt: '2026-10-15T08:00:00Z', createdByName: 'Admin',
        completedAt: null, completedByName: null,
        counts: { expected: 1, present: 0, missing: 0, passed: 0, failed: 0, pending: 1, unexpected: 0, defect: 0, functionUnchecked: 0 } },
      filter: { locationUuid: null, includeSubLocations: true, tagUuids: [], assetTypeUuids: [], areaUuids: [] },
      comment: null, fields: [], items: [item],
    };
    const scans: unknown[] = [];
    await mockApi(page, (path, method, body) => {
      if (path === '/api/inspections/run/scan' && method === 'POST') {
        scans.push(body);
        const chosen = (body as { assetUuid: string | null }).assetUuid;
        if (!chosen) {
          return { outcome: 'AMBIGUOUS', message: '2 Assets passen zu „SN-7“. Bitte das richtige Asset auswählen.', item: null, candidates: [
            { uuid: 'laptop', name: 'Laptop', invId: 'EDV-1', assetTypeName: 'Notebook', locationName: 'Büro',
              matchedBy: 'SERIAL_NUMBER', inInspection: true },
            { uuid: 'monitor', name: 'Monitor', invId: 'SN-7', assetTypeName: null, locationName: 'Lager',
              matchedBy: 'INV_ID', inInspection: false },
          ] };
        }
        return { outcome: 'CHECKED', message: 'Laptop ist vorhanden.', item: { ...item, status: 'PRESENT', method: 'SCAN' } };
      }
      return path === '/api/inspections/run' ? detail : [];
    });

    await page.goto('/inspections/run');
    const input = page.getByRole('textbox', { name: 'Gescannter Code' });
    await input.fill('SN-7');
    await input.press('Enter');

    const choices = page.getByRole('group', { name: 'Asset auswählen' });
    await expect(page.getByText('2 Assets passen zu „SN-7“')).toBeVisible();
    await expect(choices.getByRole('button')).toHaveCount(2);
    await expect(choices.getByRole('button', { name: /Laptop/ })).toContainText('Treffer über Seriennummer');
    await expect(choices.getByRole('button', { name: /Laptop/ })).toContainText('In dieser Prüfung');
    await expect(choices.getByRole('button', { name: /Monitor/ })).toContainText('Treffer über Inventar-ID · SN-7 · Lager');
    await expect(page.locator('#item-item-laptop')).not.toHaveClass(/present/);

    await choices.getByRole('button', { name: /Laptop/ }).click();
    await expect(page.getByText('Laptop ist vorhanden.')).toBeVisible();
    await expect(choices).toHaveCount(0);
    await expect(page.locator('#item-item-laptop')).toHaveClass(/present/);
    expect(scans).toEqual([{ code: 'SN-7', assetUuid: null }, { code: 'SN-7', assetUuid: 'laptop' }]);
  });
}

test('scan page shows every asset of a shared code with the field that matched', async ({ page }) => {
  await mockApi(page, (path) => path === '/api/scan'
    ? { code: 'SN-7', matchedBy: 'CODE', locations: [],
        assets: [asset('laptop', 'Laptop', 'EDV-1', 'SN-7'), asset('monitor', 'Monitor', 'SN-7', null)] }
    : []);
  await page.goto('/scan');
  const input = page.getByRole('textbox').first();
  await input.fill('SN-7');
  await input.press('Enter');
  await expect(page.getByText('2 Treffer für')).toBeVisible();
  await expect(page.locator('.result-card')).toHaveCount(2);
  await expect(page.locator('.result-card', { hasText: 'Laptop' })).toContainText('gefunden über die Seriennummer');
  await expect(page.locator('.result-card', { hasText: 'Monitor' })).toContainText('gefunden über die Inventar-ID');
});
