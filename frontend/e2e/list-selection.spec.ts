import { expect, Page, test } from '@playwright/test';
import { pageOf } from './support/paging';

const routes = [
  ['/assets', 'assets'], ['/locations', 'locations'], ['/config/types', 'asset-types'],
  ['/config/tags', 'tags'], ['/config/labels', 'label-templates'],
  ['/config/inspection-templates', 'inspection-types'], ['/inspections', 'inspections'],
  ['/admin/users', 'admin/users'], ['/admin/groups', 'admin/groups'], ['/admin/areas', 'admin/areas'],
] as const;

async function setup(page: Page, endpoint: string, options: { size?: number; fail?: string; admin?: boolean; nested?: boolean; image?: boolean } = {}) {
  let entries = Array.from({ length: options.size ?? 4 }, (_, i) => ({
    uuid: `id-${i}`, name: `Eintrag ${String(i + 1).padStart(2, '0')}`, title: `Eintrag ${String(i + 1).padStart(2, '0')}`,
    username: `user${i}`, displayName: `Eintrag ${String(i + 1).padStart(2, '0')}`, enabled: true,
    sourceProvider: 'LOCAL', role: 'USER', groupUuids: [], permissions: [], adminGroup: false,
    areaUuids: ['area'], areaUuid: 'area', defaultArea: false, areaNames: ['EDV'],
    fields: [], inspectionCount: 0, deletable: true, editable: true, usable: true,
    assetTypeNames: [], assetTypeUuids: [], mode: 'INVENTORY', status: 'OPEN',
    typeName: 'Inventur', createdAt: '2026-10-15T08:00:00Z', createdByName: 'Admin', filterSummary: 'Alle Assets',
    counts: { expected: 1, present: 0, missing: 0, passed: 0, failed: 0, pending: 1, unexpected: 0 },
    widthMm: 62, heightMm: 29, elementsJson: '[]',
    parentAssetUuid: options.nested && i === 1 ? 'id-0' : null,
    images: options.image ? [{ kind: 'THUMBNAIL', url: '/icons/icon-192x192.png' }] : [],
    memberCount: 0, members: [],
  }));
  const deleted: string[] = [];
  await page.route('**/api/**', async route => {
    const request = route.request();
    const path = new URL(request.url()).pathname.replace('/api/', '');
    if (request.method() === 'DELETE' && path.startsWith(endpoint + '/')) {
      const uuid = path.split('/').pop()!;
      if (uuid === options.fail) return route.fulfill({ status: 409, json: {} });
      deleted.push(uuid);
      entries = entries.filter(item => item.uuid !== uuid);
      await new Promise(resolve => setTimeout(resolve, 30));
      return route.fulfill({ status: 204 });
    }
    const body = path === 'auth/me' ? { authenticated: true, username: 'admin', role: options.admin === false ? 'USER' : 'ADMIN',
      permissions: [{ resourceType: 'ASSET', areaUuid: 'area', canView: true, canDelete: false }] }
      : path === endpoint ? entries
      : path === `${endpoint}/page` ? pageOf(entries, request.url())
      : path === 'areas' || path === 'admin/areas' ? [{ uuid: 'area', name: 'EDV', defaultArea: true }]
      : path === 'customization' ? {} : [];
    return route.fulfill({ json: body });
  });
  return { deleted, entries: () => entries };
}

for (const [route, endpoint] of routes) {
  test(`shift selection and batch deletion: ${route}`, async ({ page }) => {
    const state = await setup(page, endpoint);
    await page.goto(route);
    await expect(page.getByRole('button', { name: 'Aktionen', exact: true })).toHaveCount(0);
    await expect(page.locator('app-selection-checkbox:visible')).toHaveCount(0);
    await page.getByRole('button', { name: 'Auswählen', exact: true }).click();
    const checks = page.locator('app-selection-checkbox .selection-checkbox');
    await expect(checks).toHaveCount(4);
    const rows = page.locator('.selecting');
    await rows.nth(0).click({ position: { x: 60, y: 15 } });
    await rows.nth(2).click({ position: { x: 60, y: 15 }, modifiers: ['Shift'] });
    await expect(page.locator('app-list-actions')).toContainText('3 ausgewählt');
    await expect(page).toHaveURL(new RegExp(route.replaceAll('/', '\/') + '$'));
    await page.getByRole('button', { name: 'Aktionen', exact: true }).click();
    await page.getByRole('menuitem', { name: 'Löschen', exact: true }).click();
    const dialog = page.getByRole('alertdialog');
    await expect(dialog).toContainText('3 Einträge löschen?');
    await dialog.getByRole('button', { name: 'Löschen', exact: true }).click();
    await expect(checks).toHaveCount(1);
    expect(state.deleted).toHaveLength(3);
    await expect(page.locator('app-list-actions')).toContainText('0 ausgewählt');
  });
}

test('selection across loaded pages, indeterminate state, server search and grid view', async ({ page }) => {
  await setup(page, 'assets', { size: 70 });
  await page.goto('/assets');
  await page.getByRole('button', { name: 'Auswählen', exact: true }).click();
  const checks = page.locator('app-selection-checkbox .selection-checkbox');
  // the first page has 50 entries, scrolling to the end loads the rest
  await expect(checks).toHaveCount(50);
  await expect(page.locator('.eyebrow')).toContainText('70 Einträge');
  await checks.nth(1).click();
  await expect(page.getByRole('checkbox', { name: 'Alle geladenen auswählen' })).toHaveJSProperty('indeterminate', true);
  await page.locator('.list-end').scrollIntoViewIfNeeded();
  await expect(checks).toHaveCount(70);
  await checks.nth(61).click({ modifiers: ['Shift'] });
  await expect(page.locator('app-list-actions')).toContainText('61 ausgewählt');
  await page.getByRole('button', { name: 'Kachelansicht', exact: true }).click();
  await expect(page.locator('.items.grid .selection-checkbox:checked')).toHaveCount(61);
  // the search runs on the server; hidden selections are dropped
  await page.getByRole('textbox', { name: 'Suchen', exact: true }).fill('Eintrag 07');
  await expect(checks).toHaveCount(1);
  await expect(page.locator('.eyebrow')).toContainText('1 Treffer');
  await expect(page.locator('app-list-actions')).toContainText('0 ausgewählt');
  await checks.first().click();
  await expect(page.locator('app-list-actions')).toContainText('1 ausgewählt');
  await page.getByRole('button', { name: 'Auswahl aufheben', exact: true }).click();
  await expect(page.locator('app-list-actions')).toContainText('0 ausgewählt');
});

test('cancel, partial failure and child-before-parent deletion', async ({ page }) => {
  const state = await setup(page, 'assets', { nested: true, fail: 'id-2' });
  await page.goto('/assets');
  await page.getByRole('button', { name: 'Auswählen', exact: true }).click();
  await page.getByRole('checkbox', { name: 'Alle geladenen auswählen' }).check();
  const openDelete = async () => {
    await page.getByRole('button', { name: 'Aktionen', exact: true }).click();
    await page.getByRole('menuitem', { name: 'Löschen', exact: true }).click();
  };
  await openDelete();
  await page.getByRole('alertdialog').getByRole('button', { name: 'Abbrechen', exact: true }).click();
  expect(state.deleted).toHaveLength(0);
  await openDelete();
  await page.getByRole('alertdialog').getByRole('button', { name: 'Löschen', exact: true }).click();
  await expect(page.locator('app-list-actions [role="alert"]')).toContainText('3 gelöscht, 1 fehlgeschlagen');
  await expect(page.locator('app-selection-checkbox .selection-checkbox:checked')).toHaveCount(1);
  expect(state.deleted.indexOf('id-1')).toBeLessThan(state.deleted.indexOf('id-0'));
});

test('users without delete permission cannot trigger batch deletion', async ({ page }) => {
  const state = await setup(page, 'assets', { admin: false });
  await page.goto('/assets');
  await page.getByRole('button', { name: 'Auswählen', exact: true }).click();
  await page.getByRole('checkbox', { name: 'Alle geladenen auswählen' }).check();
  await page.getByRole('button', { name: 'Aktionen', exact: true }).click();
  await expect(page.getByRole('menuitem', { name: 'Löschen', exact: true })).toBeDisabled();
  expect(state.deleted).toHaveLength(0);
});

test('batch label printing uses the chosen template and copies per asset', async ({ page }) => {
  await setup(page, 'assets');
  await page.route('**/api/label-templates', route => route.fulfill({ json: [
    { uuid: 'tpl', name: 'Inventarlabel', areaUuid: 'area', defaultForArea: true, widthMm: 62, heightMm: 29,
      elementsJson: JSON.stringify([{ id: 'n', type: 'text', x: 1, y: 1, width: 60, height: 8, content: '{name}' }]) },
  ] }));
  await page.goto('/assets');
  await page.getByRole('button', { name: 'Auswählen', exact: true }).click();
  const checks = page.locator('app-selection-checkbox .selection-checkbox');
  await checks.nth(0).click();
  await checks.nth(2).click();
  await page.getByRole('button', { name: 'Aktionen', exact: true }).click();
  const printItem = page.getByRole('menuitem', { name: 'Labels drucken', exact: true });
  const deleteColor = await page.getByRole('menuitem', { name: 'Löschen', exact: true }).evaluate(el => getComputedStyle(el).color);
  expect(await printItem.evaluate(el => getComputedStyle(el).color)).not.toBe(deleteColor);
  await printItem.click();
  const dialog = page.getByRole('dialog', { name: 'Label drucken' });
  await expect(dialog).toContainText('2 Labels drucken');
  await expect(dialog.locator('.pager')).toContainText('Eintrag 01 · 1 / 2');
  await dialog.getByRole('button', { name: 'Nächstes Asset', exact: true }).click();
  await expect(dialog.locator('.pager')).toContainText('Eintrag 03 · 2 / 2');
  await dialog.getByRole('spinbutton').fill('3');
  await expect(dialog).toContainText('6 Labels insgesamt');
  await dialog.getByRole('button', { name: 'Drucken', exact: true }).click();
  const pages = page.frameLocator('iframe').locator('.page');
  await expect(pages).toHaveCount(6);
  await expect(pages.nth(2)).toContainText('Eintrag 01');
  await expect(pages.nth(3)).toContainText('Eintrag 03');
});

for (const width of [320, 390, 1280]) {
  test(`selection toolbar uses two rows only on phones (${width}px)`, async ({ page }, testInfo) => {
    await page.setViewportSize({ width, height: 844 });
    await setup(page, 'assets');
    await page.goto('/assets');
    await page.getByRole('button', { name: 'Auswählen', exact: true }).click();
    const bar = page.locator('app-list-actions');
    const toggle = bar.locator('.selection-toggle');
    const actions = bar.getByRole('button', { name: 'Aktionen', exact: true });
    const selectPage = bar.locator('.select-page');
    const assertRows = async () => {
      const toggleBox = (await toggle.boundingBox())!;
      const actionsBox = (await actions.boundingBox())!;
      const selectBox = (await selectPage.boundingBox())!;
      expect(Math.abs(toggleBox.y - actionsBox.y)).toBeLessThan(2);
      expect(actionsBox.x).toBeGreaterThanOrEqual(toggleBox.x + toggleBox.width);
      if (width <= 640) {
        expect(selectBox.y).toBeGreaterThanOrEqual(toggleBox.y + toggleBox.height);
      } else {
        expect(selectBox.y).toBeLessThan(toggleBox.y + toggleBox.height);
      }
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    };
    await assertRows();
    await selectPage.locator('input').check();
    await expect(actions).toBeEnabled();
    await assertRows();
    await page.screenshot({ path: testInfo.outputPath('selection-toolbar.png') });
  });
}

test('mobile tile selection and actions menu remain within viewport',async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await setup(page, 'assets');
  await page.goto('/assets');
  await page.getByRole('button', { name: 'Auswählen', exact: true }).click();
  await page.getByRole('button', { name: 'Kachelansicht', exact: true }).click();
  await page.locator('app-selection-checkbox .selection-checkbox').nth(0).click();
  await page.getByRole('button', { name: 'Aktionen', exact: true }).click();
  const menu = await page.getByRole('menu').boundingBox();
  expect(menu!.x).toBeGreaterThanOrEqual(0);
  expect(menu!.x + menu!.width).toBeLessThanOrEqual(390);
  await page.screenshot({ path: testInfo.outputPath('mobile-selection.png'), fullPage: true });
});

for (const width of [1280, 390]) {
  test(`grid checkbox overlays the image without shifting the tile (${width}px)`, async ({ page }, testInfo) => {
    await page.setViewportSize({ width, height: 844 });
    await setup(page, 'assets', { image: true });
    await page.goto('/assets');
    await page.getByRole('button', { name: 'Kachelansicht', exact: true }).click();
    const card = page.locator('.item').first();
    const before = await card.boundingBox();
    await page.getByRole('button', { name: 'Auswählen', exact: true }).click();
    const image = await card.locator('.thumb').boundingBox();
    const check = await card.locator('.selection-mark').boundingBox();
    expect(check!.x).toBeGreaterThan(image!.x);
    expect(check!.y).toBeGreaterThan(image!.y);
    expect(check!.x + check!.width).toBeLessThan(image!.x + image!.width);
    expect(check!.y + check!.height).toBeLessThan(image!.y + image!.height);
    expect((await card.boundingBox())!.height).toBeCloseTo(before!.height, 0);
    await card.locator('app-selection-checkbox input').check();
    await expect(card).toHaveClass(/is-selected/);
    await page.screenshot({ path: testInfo.outputPath('grid-image-selection.png') });
  });

  test(`selection mode gates row clicks and hides controls on exit (${width}px)`, async ({ page }) => {
    await page.setViewportSize({ width, height: 844 });
    await setup(page, 'assets');
    await page.goto('/assets');
    await expect(page.locator('app-selection-checkbox:visible')).toHaveCount(0);
    await page.locator('.item').first().locator('strong').click();
    await expect(page).toHaveURL(/\/assets\/id-0$/);

    await page.goto('/assets');
    await page.getByRole('button', { name: 'Auswählen', exact: true }).click();
    await page.locator('.item').first().locator('strong').click();
    await expect(page.locator('app-list-actions')).toContainText('1 ausgewählt');
    await page.locator('.item').nth(2).locator('strong').click({ modifiers: ['Shift'] });
    await expect(page.locator('app-list-actions')).toContainText('3 ausgewählt');
    await expect(page).toHaveURL(/\/assets$/);
    await page.getByRole('button', { name: 'Auswahl beenden', exact: true }).click();
    await expect(page.locator('app-selection-checkbox:visible')).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Aktionen', exact: true })).toHaveCount(0);
    await page.getByRole('button', { name: 'Auswählen', exact: true }).click();
    await expect(page.locator('app-list-actions')).toContainText('0 ausgewählt');
    await page.locator('app-selection-checkbox input').first().press('Space');
    await expect(page.locator('app-list-actions')).toContainText('1 ausgewählt');
    await expect(page.locator('app-selection-checkbox .selection-mark svg')).toHaveCount(1);
    await page.keyboard.press('Escape');
    await expect(page.locator('app-selection-checkbox:visible')).toHaveCount(0);
  });
}
