import { expect, test } from '@playwright/test';

for (const viewport of [{ width: 1280, height: 800 }, { width: 390, height: 844 }]) {
  for (const completed of [false, true]) {
    test(`inspection hierarchy ${completed ? 'protocol' : 'open'} (${viewport.width}px)`, async ({ page }, testInfo) => {
      await page.setViewportSize(viewport);
      const item = (uuid: string, name: string, parent: string | null = null, note: string | null = null) => ({
        uuid: `item-${uuid}`, assetUuid: uuid, assetName: name, invId: `INV-${uuid}`, serialNumber: null,
        assetTypeUuid: null, assetTypeName: null, locationName: null, expected: true,
        status: 'PENDING', method: null, condition: null, scannedCode: null, checkedAt: null,
        checkedByName: null, note: null, values: [], photos: [], parentAssetUuid: parent,
        parentAssetNote: note, inspectionPolicy: parent ? 'MANUAL' : 'STANDARD',
      });
      const items = [item('pc', 'Computer'), item('ram', 'RAM', 'pc', 'RAM Slot 1'),
        item('chip', 'Chip', 'ram', 'Modul A'), item('ssd', 'SSD', 'pc', 'SATA 1')];
      const detail = {
        summary: { uuid: 'run', title: 'Inventur', typeName: 'Inventur', mode: 'INVENTORY', status: completed ? 'COMPLETED' : 'OPEN',
          checkFunction: false, areaUuids: [], areaNames: [], filterSummary: 'Alle Assets', createdAt: '2026-10-15T08:00:00Z',
          createdByName: 'Admin', completedAt: completed ? '2026-10-15T09:00:00Z' : null, completedByName: 'Admin',
          counts: { expected: 4, present: 0, missing: 0, passed: 0, failed: 0, pending: 4, unexpected: 0, defect: 0, functionUnchecked: 0 } },
        filter: { locationUuid: null, includeSubLocations: true, tagUuids: [], assetTypeUuids: [], areaUuids: [] },
        comment: null, fields: [], items,
      };
      await page.route('**/api/**', async (route) => {
        const path = new URL(route.request().url()).pathname;
        if (route.request().method() === 'PATCH' && path.endsWith('/items/item-ram')) {
          const updated = Object.assign(items[1], { status: 'PRESENT', method: 'MANUAL' });
          return route.fulfill({ json: updated });
        }
        const body = path === '/api/auth/me'
          ? { authenticated: true, username: 'admin', displayName: 'Admin', role: 'ADMIN', permissions: [] }
          : path === '/api/inspections/run' ? detail : [];
        await route.fulfill({ json: body });
      });
      await page.goto('/inspections/run');
      if (completed) {
        await expect(page.locator('.protocol-asset')).toHaveCount(4);
        expect(await page.locator('.protocol-asset').nth(2).evaluate((element) => getComputedStyle(element).marginInlineStart)).not.toBe('0px');
      } else {
        const computer = page.locator('#item-item-pc');
        const ram = page.locator('#item-item-ram');
        await expect(page.locator('.item-list > .item')).toHaveCount(4);
        await expect(ram).toContainText('RAM Slot 1');
        await expect(ram).toContainText('Ohne Label');
        await computer.locator('.asset-group-toggle').click();
        await expect(page.locator('.item-list > .item')).toHaveCount(1);
        await page.getByRole('textbox', { name: 'Suchen', exact: true }).fill('Modul A');
        await expect(page.locator('#item-item-chip')).toBeVisible();
        await expect(computer).toBeVisible();
        await page.getByRole('textbox', { name: 'Suchen', exact: true }).fill('');
        await computer.locator('.asset-group-toggle').click();
        await ram.getByRole('button', { name: 'Vorhanden', exact: true }).click();
        await expect(ram).toHaveClass(/present/);
        await expect(computer).toContainText('1/2 Unter-Assets geprüft');
        await expect(page.locator('#item-item-chip')).not.toHaveClass(/present/);
      }
      await page.screenshot({ path: testInfo.outputPath('inspection.png'), fullPage: true });
    });
  }
}
