import { expect, Locator, test } from '@playwright/test';

/** Picks an option of the app-search-select in the print dialog field with this caption. */
async function choose(dialog: Locator, caption: string, option: string) {
  const field = dialog.locator('.field', { hasText: caption });
  await field.locator('.trigger').click();
  await field.getByRole('option', { name: new RegExp(`^${option}`) }).click();
  await expect(field.locator('.trigger')).toContainText(option);
}

const item = (i: number, overrides: Record<string, unknown> = {}) => ({
  uuid: `item-${i}`, assetUuid: `asset-${i}`, assetName: `Notebook ${String(i).padStart(3, '0')}`, invId: `INV-${1000 + i}`,
  serialNumber: null, assetTypeUuid: 'type', assetTypeName: 'Notebook', locationName: 'Wien / Büro 2', expected: true,
  status: 'PRESENT', method: 'SCAN', condition: null, scannedCode: null, checkedAt: '2026-10-15T08:30:00Z',
  checkedByName: 'Max Muster', note: null, photos: [], parentAssetUuid: null, parentAssetNote: null, inspectionPolicy: 'STANDARD',
  values: [{ fieldUuid: 'f1', fieldName: 'Akku', fieldType: 'TEXT', value: 'ok' }],
  ...overrides,
});

test('inspection protocol prints as a branded multi-page document', async ({ page }, testInfo) => {
  const items = [
    ...Array.from({ length: 60 }, (_, i) => item(i + 1)),
    item(61, { status: 'MISSING', method: null, checkedAt: null, checkedByName: null, values: [] }),
    item(62, { status: 'PENDING', method: null, checkedAt: null, checkedByName: null, values: [] }),
    item(63, { note: 'Display hat einen Kratzer', photos: [{ uuid: 'p', fileUuid: 'f', url: '/icons/icon-192x192.png',
      thumbnailUrl: '/icons/icon-192x192.png', takenAt: '2026-10-15T08:31:00Z' }] }),
    item(64, { expected: false, assetUuid: null, assetName: 'Unbekannter Code', invId: null, scannedCode: 'XYZ-99', values: [] }),
  ];
  const detail = {
    summary: { uuid: 'run', title: 'Jahresinventur Wien 2026', typeName: 'Inventur IT', mode: 'INVENTORY', status: 'COMPLETED',
      checkFunction: false, areaUuids: ['area'], areaNames: ['EDV'], filterSummary: 'Standort Wien inkl. Unterstandorte',
      createdAt: '2026-10-15T08:00:00Z', createdByName: 'Max Muster', completedAt: '2026-10-15T11:15:00Z', completedByName: 'Erika Beispiel',
      counts: {} },
    filter: { locationUuid: null, includeSubLocations: true, tagUuids: [], assetTypeUuids: [], areaUuids: [] },
    comment: 'Zwei Geräte im Lager nicht auffindbar.\nNachkontrolle nächste Woche.',
    fields: [{ uuid: 'f1', name: 'Akku', fieldType: 'TEXT', required: false, assetTypeUuid: null }],
    items,
  };
  await page.addInitScript(() => {
    (window as unknown as { printed: number }).printed = 0;
    window.print = () => { (window as unknown as { printed: number }).printed++; };
  });
  await page.route('**/api/**', route => {
    const path = new URL(route.request().url()).pathname;
    const body = path === '/api/auth/me' ? { authenticated: true, username: 'admin', displayName: 'Admin', role: 'ADMIN', permissions: [] }
      : path === '/api/inspections/run' ? detail
      : path === '/api/customization' ? { brandName: 'Muster GmbH', logoUrl: '/icons/icon-192x192.png' } : [];
    return route.fulfill({ json: body });
  });

  await page.goto('/inspections/run');
  await page.getByRole('button', { name: 'Drucken', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Prüfbericht drucken' });
  await expect(dialog.locator('select')).toHaveCount(0);
  await choose(dialog, 'Papierformat', 'A4');
  await choose(dialog, 'Ausrichtung', 'Hochformat');
  await choose(dialog, 'Seitenränder', 'Normal');
  await expect(dialog.getByLabel('Fotos drucken')).toBeChecked();
  await dialog.getByRole('button', { name: 'Drucken', exact: true }).click();
  await expect.poll(() => page.evaluate(() => (window as unknown as { printed: number }).printed)).toBe(1);
  await expect(dialog).toHaveCount(0);

  await page.emulateMedia({ media: 'print' });
  const sheet = page.locator('body > .print-document.active');
  await expect(sheet).toBeVisible();
  await expect(page.locator('app-root')).toBeHidden();
  await expect(sheet.locator('.print-pages h1')).toHaveText('Jahresinventur Wien 2026');
  await expect(sheet.locator('.print-pages .doc-meta')).toContainText('Inventur IT (Inventur)');
  await expect(sheet.locator('.print-pages .doc-meta')).toContainText('Erika Beispiel');
  await expect(sheet.locator('.print-source')).toBeHidden();
  // every row exactly once, spread over pages that each have margins, footer and page number
  const pages = sheet.locator('.print-pages > .print-page');
  await expect(sheet.locator('.print-pages .print-table tbody tr')).toHaveCount(64);
  const count = await pages.count();
  expect(count).toBeGreaterThan(2);
  for (let i = 0; i < count; i++) {
    const current = pages.nth(i);
    await expect(current.locator('.print-page-footer')).toContainText(`Seite ${i + 1} von ${count}`);
    expect(await current.evaluate(element => getComputedStyle(element).paddingLeft)).not.toBe('0px');
    expect(await current.locator('.print-page-content').evaluate(element => element.scrollHeight <= element.clientHeight + 1)).toBe(true);
    await expect(current.locator('.print-page-header')).toHaveCount(i ? 1 : 0);
    // a table continued on this page repeats its header
    const tables = current.locator('table');
    for (let t = 0; t < await tables.count(); t++) await expect(tables.nth(t).locator('thead')).toHaveCount(1);
  }
  await expect(pages.first().locator('h1')).toHaveText('Jahresinventur Wien 2026');
  await expect(pages.last().locator('.doc-signatures')).toHaveCount(1);
  await expect(page.locator('#print-document-page')).toHaveCount(1);
  expect(await page.title()).toBe('Prüfbericht – Jahresinventur Wien 2026');

  // "Ränder: Keine" in the browser means zero page margins: the margins still come from the sheets
  const pdf = await page.pdf({ preferCSSPageSize: true, printBackground: true, margin: { top: 0, right: 0, bottom: 0, left: 0 } });
  await testInfo.attach('protocol.pdf', { body: pdf, contentType: 'application/pdf' });
  expect((pdf.toString('latin1').match(/\/Type\s*\/Page[^s]/g) ?? []).length).toBe(count);

  // closing the browser dialog restores the app
  await page.emulateMedia({ media: 'screen' });
  await page.evaluate(() => window.dispatchEvent(new Event('afterprint')));
  await expect(page.locator('#print-document-page')).toHaveCount(0);
  await expect(sheet.locator('.print-page')).toHaveCount(0);
  await expect(page.locator('body')).not.toHaveClass(/printing-document/);
  expect(await page.title()).not.toContain('Prüfbericht');
});

test('asset data sheet prints details, images, last inspection and due dates by choice', async ({ page }, testInfo) => {
  const image = (name: string, sortOrder: number) => ({ kind: sortOrder ? 'GALLERY' : 'THUMBNAIL', url: '/icons/icon-192x192.png',
    thumbnailUrl: '/icons/icon-192x192.png', fileName: name, sortOrder });
  const asset = {
    uuid: 'nb', name: 'Notebook Max', invId: 'INV-0042', serialNumber: 'SN-123', inventoryNumber: 'A-77', description: 'Dienstgerät\nmit Dockingstation',
    inspectionPolicy: 'STANDARD', assetTypeUuid: 'type', locationUuid: 'room', areaUuids: ['area'], createdAt: '2025-03-01T09:00:00Z',
    fieldValues: [{ fieldKey: 'ram', name: 'RAM', value: '32', customAssetField: false }], tags: [{ uuid: 't', name: 'Mobil' }],
    images: [image('front.png', 0), image('rueckseite.png', 1), image('typenschild.png', 2)],
  };
  const inspections = [
    { inspectionUuid: 'old', title: 'Inventur 2025', typeName: 'Inventur', inspectionStatus: 'COMPLETED', createdAt: '2025-10-01T08:00:00Z',
      completedAt: '2025-10-01T12:00:00Z', expected: true, status: 'PRESENT', method: 'SCAN', condition: null, checkedAt: '2025-10-01T09:00:00Z',
      checkedByName: 'Max Muster', locationName: 'Büro 2', note: null, values: [] },
    { inspectionUuid: 'new', title: 'E-Check Oktober', typeName: 'E-Check', inspectionStatus: 'COMPLETED', createdAt: '2026-10-10T08:00:00Z',
      completedAt: '2026-10-10T12:00:00Z', expected: true, status: 'FAILED', method: 'MANUAL', condition: null, checkedAt: '2026-10-10T09:30:00Z',
      checkedByName: 'Erika Beispiel', locationName: 'Büro 2', note: 'Netzteil-Kabel beschädigt',
      values: [{ fieldUuid: 'f', fieldName: 'Isolationswiderstand ok', fieldType: 'BOOLEAN', value: 'false' }] },
  ];
  const schedules = [{ assetUuid: 'nb', assetName: 'Notebook Max', invId: 'INV-0042', assetTypeName: 'Notebook', locationName: 'Büro 2',
    inspectionTypeUuid: 'echeck', inspectionTypeName: 'E-Check', inspectionTypeColor: null, intervalValue: 1, intervalUnit: 'YEARS',
    lastCheckedAt: '2026-10-10T09:30:00Z', lastCheckedByName: 'Erika Beispiel', lastResult: 'FAILED', nextDueDate: '2027-10-10',
    fixedDueDate: null, state: 'OK', daysUntilDue: 360, assetAreaUuids: ['area'] }];
  await page.addInitScript(() => {
    (window as unknown as { printed: number }).printed = 0;
    window.print = () => { (window as unknown as { printed: number }).printed++; };
  });
  await page.route('**/api/**', route => {
    const path = new URL(route.request().url()).pathname;
    const body = path === '/api/auth/me' ? { authenticated: true, username: 'admin', displayName: 'Admin', role: 'ADMIN', permissions: [] }
      : path === '/api/assets/nb' ? asset
      : path === '/api/assets/nb/inspections' ? inspections
      : path === '/api/assets/nb/inspection-schedules' ? schedules
      : path === '/api/assets' ? [asset, { uuid: 'dock', name: 'Dockingstation', invId: 'INV-0043', parentAssetUuid: 'nb', parentAssetNote: 'USB-C', areaUuids: ['area'] }]
      : path === '/api/asset-types' ? [{ uuid: 'type', name: 'Notebook', tags: [],
        fieldDefinitions: [{ name: 'RAM', fieldKey: 'ram', fieldType: 'NUMBER', required: false, typeField: true, sortOrder: 0 }] }]
      : path === '/api/locations' ? [{ uuid: 'site', name: 'Wien' }, { uuid: 'room', name: 'Büro 2', parentLocationUuid: 'site' }]
      : path === '/api/areas' ? [{ uuid: 'area', name: 'EDV', defaultArea: true }]
      : path === '/api/customization' ? { brandName: 'Muster GmbH', logoUrl: '/icons/icon-192x192.png' } : [];
    return route.fulfill({ json: body });
  });

  await page.goto('/assets/nb');
  await page.getByRole('button', { name: 'Drucken', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Asset-Datenblatt drucken' });
  await expect(dialog.locator('.field', { hasText: 'Bilder' }).locator('.trigger')).toContainText('Alle Bilder');
  // Escape closes an open dropdown, not the whole print dialog
  await dialog.locator('.field', { hasText: 'Papierformat' }).locator('.trigger').click();
  await page.keyboard.press('Escape');
  await expect(dialog.locator('.panel')).toHaveCount(0);
  await expect(dialog).toBeVisible();
  await expect(dialog.getByLabel('Letzte Prüfung mit Prüfwerten')).toBeChecked();
  await dialog.getByRole('button', { name: 'Drucken', exact: true }).click();
  await expect.poll(() => page.evaluate(() => (window as unknown as { printed: number }).printed)).toBe(1);

  await page.emulateMedia({ media: 'print' });
  const pages = page.locator('body > .print-document.active .print-pages');
  await expect(pages.locator('h1')).toHaveText('Notebook Max');
  const meta = pages.locator('.doc-meta');
  await expect(meta).toContainText('INV-0042');
  await expect(meta).toContainText('Wien / Büro 2');
  await expect(meta).toContainText('10.10.2026 · Mangel');
  await expect(pages.locator('.print-details').first()).toContainText('SN-123');
  await expect(pages.locator('.print-details').first()).toContainText('RAM');
  await expect(pages.locator('.print-figure img')).toHaveCount(1);
  await expect(pages.locator('.print-gallery img')).toHaveCount(2);
  await expect(pages).toContainText('E-Check Oktober');
  await expect(pages).toContainText('Netzteil-Kabel beschädigt');
  await expect(pages).toContainText('Isolationswiderstand ok');
  await expect(pages).not.toContainText('Inventur 2025');
  await expect(pages).toContainText('10.10.2027');
  await expect(pages).toContainText('Dockingstation');
  await expect(pages.locator('.print-page').first().locator('.print-page-footer')).toContainText('Seite 1 von');
  const pdf = await page.pdf({ preferCSSPageSize: true, printBackground: true });
  await testInfo.attach('asset.pdf', { body: pdf, contentType: 'application/pdf' });

  // second print without images and without the inspection; the header still names the last result
  await page.emulateMedia({ media: 'screen' });
  await page.evaluate(() => window.dispatchEvent(new Event('afterprint')));
  await page.getByRole('button', { name: 'Drucken', exact: true }).click();
  await choose(dialog, 'Bilder', 'Keine Bilder');
  await dialog.getByLabel('Letzte Prüfung mit Prüfwerten').uncheck();
  await dialog.getByRole('button', { name: 'Drucken', exact: true }).click();
  await expect.poll(() => page.evaluate(() => (window as unknown as { printed: number }).printed)).toBe(2);
  await expect(pages.locator('img:not(.logo)')).toHaveCount(0);
  await expect(pages).not.toContainText('Netzteil-Kabel beschädigt');
  await expect(meta).toContainText('10.10.2026 · Mangel');
});
