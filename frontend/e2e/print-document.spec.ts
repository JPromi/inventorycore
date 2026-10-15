import { expect, test } from '@playwright/test';

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
  await dialog.getByLabel('Papierformat').selectOption('A4');
  await dialog.getByLabel('Ausrichtung').selectOption('portrait');
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
