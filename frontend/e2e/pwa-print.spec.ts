import { expect, Page, test } from '@playwright/test';
import { writeFile } from 'node:fs/promises';
import { pageOf } from './support/paging';

async function setup(
  page: Page,
  options: { ipad?: boolean; share?: boolean; sheet?: boolean } = {},
) {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.addInitScript(({ ipad, share }) => {
    Object.defineProperty(navigator, 'userAgent', {
      get: () =>
        ipad
          ? 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15) AppleWebKit/605.1.15 Safari/605.1.15'
          : 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148',
    });
    Object.defineProperty(navigator, 'platform', { get: () => (ipad ? 'MacIntel' : 'iPhone') });
    Object.defineProperty(navigator, 'maxTouchPoints', { get: () => 5 });
    Object.defineProperty(navigator, 'standalone', { get: () => true });
    (window as any).printed = 0;
    (window as any).pdfRasters = [];
    const toDataURL = HTMLCanvasElement.prototype.toDataURL;
    HTMLCanvasElement.prototype.toDataURL = function (...args) {
      const data = toDataURL.apply(this, args);
      if (args[0] === 'image/png' && this.width > 200 && this.height > 80) {
        const pixels = this.getContext('2d')!.getImageData(0, 0, this.width, this.height).data;
        let ink = 0;
        for (let index = 0; index < pixels.length; index += 64) {
          if (
            pixels[index + 3] > 0 &&
            Math.min(pixels[index], pixels[index + 1], pixels[index + 2]) < 200
          )
            ink++;
        }
        (window as any).pdfRasters.push({ data, ink });
      }
      return data;
    };
    (window as any).shares = [];
    window.print = () => {
      (window as any).printed++;
    };
    Object.defineProperty(navigator, 'canShare', { value: () => share !== false });
    Object.defineProperty(navigator, 'share', {
      value: async (data: ShareData) => {
        if ((window as any).shareError) throw new DOMException('test', (window as any).shareError);
        (window as any).shares.push({
          name: data.files?.[0].name,
          type: data.files?.[0].type,
          size: data.files?.[0].size,
          active: navigator.userActivation.isActive,
        });
      },
    });
  }, options);
  const assets = ['one', 'two'].map((uuid, index) => ({
    uuid,
    name: `Atemschutzgerät ${index + 1}`,
    invId: `FW-${index + 1}`,
    areaUuids: ['area'],
    description: 'Einsatzgerät',
    fieldValues: [],
    images: [{ kind: 'THUMBNAIL', sortOrder: 0, url: '/icons/icon-192x192.png' }],
  }));
  await page.route('**/api/**', (route) => {
    const url = new URL(route.request().url());
    const path = url.pathname;
    const asset = assets.find((entry) => path === `/api/assets/${entry.uuid}`);
    return route.fulfill({
      json:
        path === '/api/auth/me'
          ? { authenticated: true, username: 'admin', role: 'ADMIN', permissions: [] }
          : path === '/api/areas'
            ? [{ uuid: 'area', name: 'Feuerwehr', defaultArea: true }]
            : path === '/api/customization'
              ? { brandName: 'Feuerwehr', logoUrl: '/icons/icon-192x192.png' }
              : path === '/api/assets/page'
                ? pageOf(assets, url)
                : path === '/api/assets'
                  ? assets
                  : asset
                    ? asset
                    : path === '/api/label-templates'
                      ? [
                          {
                            uuid: 'label',
                            name: 'Standard',
                            areaUuid: 'area',
                            defaultForArea: true,
                            widthMm: 62,
                            heightMm: 29,
                            safeAreaMm: 0,
                            // 3 × 9 labels on A4
                            sheet: options.sheet
                              ? {
                                  paperWidthMm: 210,
                                  paperHeightMm: 297,
                                  columns: 3,
                                  rows: 9,
                                  marginTopMm: 18,
                                  marginLeftMm: 12,
                                  gapXMm: 0,
                                  gapYMm: 0,
                                }
                              : null,
                            elementsJson: JSON.stringify([
                              {
                                id: 'name',
                                type: 'text',
                                x: 2,
                                y: 2,
                                width: 58,
                                height: 10,
                                content: '{name}',
                                fontSize: 12,
                              },
                            ]),
                          },
                        ]
                      : [],
    });
  });
}

async function printAsset(page: Page) {
  await page.goto('/assets/one');
  await page.getByRole('button', { name: 'Weitere Aktionen', exact: true }).click();
  await page.getByRole('menuitem', { name: 'Drucken', exact: true }).click();
  await page
    .getByRole('dialog', { name: 'Asset-Datenblatt drucken' })
    .getByRole('button', { name: 'Drucken', exact: true })
    .click();
}

async function checkPdf(page: Page, pages: number) {
  const dialog = page.getByRole('dialog', { name: 'PDF drucken oder speichern' });
  await expect(dialog).toBeVisible({ timeout: 30_000 });
  const href = await dialog.getByRole('link', { name: 'PDF herunterladen' }).getAttribute('href');
  const text = await page.evaluate(
    async (url) => new TextDecoder('latin1').decode(await (await fetch(url!)).arrayBuffer()),
    href,
  );
  expect(text.startsWith('%PDF-')).toBe(true);
  expect((text.match(/\/Type \/Page\b/g) ?? []).length).toBe(pages);
  const rasters = await page.evaluate(
    () => (window as any).pdfRasters as { data: string; ink: number }[],
  );
  expect(rasters.length).toBeGreaterThan(0);
  for (const raster of rasters) {
    expect(raster.ink).toBeGreaterThan(10);
  }
  await test.info().attach('pdf-page.png', {
    body: Buffer.from(rasters[0].data.split(',')[1], 'base64'),
    contentType: 'image/png',
  });
  await writeFile(
    test.info().outputPath('pdf-page.png'),
    Buffer.from(rasters[0].data.split(',')[1], 'base64'),
  );
  expect(await page.evaluate(() => (window as any).printed)).toBe(0);
  return dialog;
}

test('iPhone standalone prepares a PDF, shares directly from a tap and handles cancellation', async ({
  page,
}) => {
  await setup(page);
  await printAsset(page);
  const dialog = await checkPdf(page, 1);
  await page.evaluate(() => {
    (window as any).shareError = 'AbortError';
  });
  await dialog.getByRole('button', { name: 'PDF teilen' }).click();
  await expect(dialog.getByRole('alert')).toHaveCount(0);
  await page.evaluate(() => {
    (window as any).shareError = 'NotAllowedError';
  });
  await dialog.getByRole('button', { name: 'PDF teilen' }).click();
  await expect(dialog.getByRole('alert')).toBeVisible();
  await page.evaluate(() => {
    (window as any).shareError = '';
  });
  await dialog.getByRole('button', { name: 'PDF teilen' }).click();
  expect(await page.evaluate(() => (window as any).shares[0])).toMatchObject({
    type: 'application/pdf',
    active: true,
  });
  await page.screenshot({ path: test.info().outputPath('pdf-share.png') });
  await dialog.getByRole('button', { name: 'Schließen', exact: true }).click();
  await expect(dialog).not.toBeVisible();
});

test('iPad standalone batch preserves every page and supports download without file sharing', async ({
  page,
}) => {
  await setup(page, { ipad: true, share: false });
  await page.goto('/assets');
  await page.getByRole('button', { name: 'Auswählen', exact: true }).click();
  await page.locator('.select-page input').check();
  await page.getByRole('button', { name: 'Aktionen', exact: true }).click();
  await page.getByRole('menuitem', { name: 'Datenblätter drucken', exact: true }).click();
  await page
    .getByRole('dialog', { name: 'Asset-Datenblatt drucken' })
    .getByRole('button', { name: 'Drucken', exact: true })
    .click();
  const dialog = await checkPdf(page, 2);
  await expect(dialog.getByRole('button', { name: 'PDF teilen' })).toHaveCount(0);
  await expect(dialog.getByRole('link', { name: 'PDF herunterladen' })).toBeVisible();
  await page.goto('/assets');
  await expect(dialog).not.toBeVisible();
});

test('iOS standalone label printing creates a PDF with the requested copy count', async ({
  page,
}) => {
  await setup(page);
  await page.goto('/assets/one');
  await page.getByRole('button', { name: 'Weitere Aktionen', exact: true }).click();
  await page.getByRole('menuitem', { name: 'Label drucken', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Label drucken' });
  await dialog.getByRole('spinbutton').fill('3');
  await dialog.getByRole('button', { name: 'Drucken', exact: true }).click();
  await checkPdf(page, 3);
  await expect(page.locator('iframe')).toHaveCount(0);
});

test('label sheets fill A4 pages and leave the used positions empty', async ({ page }) => {
  await setup(page, { sheet: true });
  await page.goto('/assets/one');
  await page.getByRole('button', { name: 'Weitere Aktionen', exact: true }).click();
  await page.getByRole('menuitem', { name: 'Label drucken', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Label drucken' });
  await dialog.getByLabel('Anzahl').fill('26');
  // the first two positions of the sheet are already used
  await dialog.getByTitle('Platz 3', { exact: true }).click();
  await expect(dialog.getByLabel('Bereits benutzte Plätze')).toHaveValue('2');
  await expect(dialog.getByText(/2 Bögen \(210 × 297 mm\)/)).toBeVisible();
  await dialog.getByRole('button', { name: 'Drucken', exact: true }).click();
  const pdf = await checkPdf(page, 2);
  const href = await pdf.getByRole('link', { name: 'PDF herunterladen' }).getAttribute('href');
  const text = await page.evaluate(
    async (url) => new TextDecoder('latin1').decode(await (await fetch(url!)).arrayBuffer()),
    href,
  );
  // A4 in points
  expect(text).toMatch(/\/MediaBox \[0 0 595\.\d+ 841\.\d+\]/);
});

test('iOS standalone completed protocol uses the same PDF output', async ({ page }) => {
  await setup(page);
  await page.route('**/api/inspections/run', (route) =>
    route.fulfill({
      json: {
        summary: {
          uuid: 'run',
          title: 'Inventur Gerätehaus',
          typeName: 'Inventur',
          mode: 'INVENTORY',
          status: 'COMPLETED',
          checkFunction: false,
          areaUuids: [],
          areaNames: [],
          createdAt: '2026-10-20T08:00:00Z',
          completedAt: '2026-10-20T09:00:00Z',
          createdByName: 'Max Muster',
          counts: {
            expected: 0,
            present: 0,
            missing: 0,
            pending: 0,
            passed: 0,
            failed: 0,
            unexpected: 0,
            defect: 0,
            functionUnchecked: 0,
          },
        },
        filter: { tagUuids: [], assetTypeUuids: [], areaUuids: [] },
        fields: [],
        items: [],
      },
    }),
  );
  await page.goto('/inspections/run');
  await page.getByRole('button', { name: 'Drucken', exact: true }).click();
  await page
    .getByRole('dialog', { name: 'Prüfbericht drucken' })
    .getByRole('button', { name: 'Drucken', exact: true })
    .click();
  await checkPdf(page, 1);
});

test('PDF preparation failures remain visible and restore the print button', async ({ page }) => {
  await setup(page);
  await page.route('**/icons/icon-192x192.png', (route) =>
    route.fulfill({ status: 404, body: '' }),
  );
  await printAsset(page);
  const dialog = page.getByRole('dialog', { name: 'Asset-Datenblatt drucken' });
  await expect(dialog.getByRole('alert')).toContainText('Druckdatei konnte nicht erstellt werden');
  await expect(dialog.getByRole('button', { name: 'Drucken', exact: true })).toBeEnabled();
  await expect(page.getByRole('dialog', { name: 'PDF drucken oder speichern' })).not.toBeVisible();
});
