import { expect, test } from '@playwright/test';

for (const completed of [false, true]) {
  test(`inspection photos open in viewer (${completed ? 'protocol' : 'editor'})`, async ({ page }) => {
    const item = { uuid: 'item', assetUuid: 'asset', assetName: 'Atemschutzgerät', invId: 'FW-1',
      expected: true, status: 'PRESENT', method: 'MANUAL', condition: null, values: [],
      inspectionPolicy: 'STANDARD', photos: [{ uuid: 'photo', url: '/icons/icon-512x512.png',
        thumbnailUrl: '/icons/icon-192x192.png', takenByName: 'Admin' }] };
    const detail = {
      summary: { uuid: 'run', title: 'Inventur', typeName: 'Inventur', mode: 'INVENTORY',
        status: completed ? 'COMPLETED' : 'OPEN', checkFunction: false, areaUuids: [], areaNames: [],
        createdAt: '2026-10-15T08:00:00Z', createdByName: 'Admin',
        counts: { expected: 1, present: 1, missing: 0, pending: 0, passed: 0, failed: 0, unexpected: 0, defect: 0, functionUnchecked: 0 } },
      filter: { tagUuids: [], assetTypeUuids: [], areaUuids: [] }, fields: [], items: [item],
    };
    await page.route('**/api/**', route => route.fulfill({ json:
      new URL(route.request().url()).pathname === '/api/auth/me'
        ? { authenticated: true, username: 'admin', role: 'ADMIN', permissions: [] }
        : new URL(route.request().url()).pathname === '/api/inspections/run' ? detail : [] }));
    await page.goto('/inspections/run');
    if (!completed) await page.locator('.fields-toggle').first().click();
    await page.locator(completed ? '.report-photos button' : '.photo-open').first().click();
    await expect(page.getByRole('dialog', { name: 'Bildansicht', exact: true })).toBeVisible();
    await page.keyboard.press('Escape');
  });
}

for (const width of [1280, 390]) {
  test(`gallery viewer supports navigation, zoom and closing (${width}px)`, async ({ page }) => {
    await page.setViewportSize({ width, height: 844 });
    const images = [
      { url: '/icons/icon-192x192.png', fileName: 'Fahrzeughalle.png', kind: 'THUMBNAIL', sortOrder: 0 },
      { url: '/icons/icon-512x512.png', fileName: 'Atemschutz.png', kind: 'GALLERY', sortOrder: 1 },
      { url: '/missing-photo.png', fileName: 'missing.png', kind: 'GALLERY', sortOrder: 2 },
    ];
    const asset = { uuid: 'asset', name: 'Atemschutzgerät', images, areaUuids: ['area'], locationUuid: 'hall' };
    await page.route('**/api/**', async route => {
      const path = new URL(route.request().url()).pathname;
      await route.fulfill({ json: path === '/api/auth/me'
        ? { authenticated: true, username: 'admin', role: 'ADMIN', permissions: [] }
        : path === '/api/areas' ? [{ uuid: 'area', name: 'Allgemein', defaultArea: true }]
        : path === '/api/locations' ? [{ uuid: 'hall', name: 'Fahrzeughalle' }]
        : path === '/api/assets/asset' ? asset : path === '/api/assets' ? [asset] : [] });
    });
    await page.goto('/assets/asset');
    const preview = page.locator('.main-image .image-preview');
    await expect(page.locator('.breadcrumb a')).toHaveCSS('text-decoration-line', 'none');
    expect(await page.locator('.breadcrumb a').evaluate(element => getComputedStyle(element).color))
      .toBe(await page.locator('.breadcrumb').evaluate(element => getComputedStyle(element).color));
    await expect(preview).toHaveCSS('border-top-width', '0px');
    await expect(preview).toHaveCSS('padding-top', '0px');
    const frame = await page.locator('.main-image').boundingBox();
    const trigger = await preview.boundingBox();
    expect(trigger!.width).toBeCloseTo(frame!.width, 0);
    expect(trigger!.height).toBeCloseTo(frame!.height, 0);
    await page.screenshot({ path: test.info().outputPath('detail-gallery.png') });
    await page.locator('.main-image button').click();
    const dialog = page.getByRole('dialog', { name: 'Bildansicht', exact: true });
    await expect(dialog).toBeVisible();
    expect(await dialog.evaluate(element => element.matches(':modal'))).toBe(true);
    const image = dialog.locator('.stage img');
    await expect(image).toHaveJSProperty('complete', true);
    expect(await image.evaluate((element: HTMLImageElement) => element.naturalWidth)).toBeGreaterThan(0);
    await image.click();
    await expect(dialog).toBeVisible();
    await dialog.getByRole('button', { name: 'Vergrößern', exact: true }).click();
    await expect(dialog.locator('.zoom-value')).toHaveText('125 %');
    await dialog.getByRole('button', { name: 'Bild einpassen', exact: true }).click();
    await expect(dialog.locator('.zoom-value')).toHaveText('100 %');
    await dialog.getByRole('button', { name: 'Nächstes Bild', exact: true }).click();
    await expect(dialog).toContainText('Atemschutz.png');
    await expect(image).toHaveJSProperty('complete', true);
    const rect = await image.boundingBox();
    expect(rect!.height).toBeLessThan(844);
    expect(rect!.width).toBeLessThanOrEqual(width);
    await page.screenshot({ path: test.info().outputPath('viewer.png') });
    if (width === 390) {
      const cdp = await page.context().newCDPSession(page);
      const touch = async (type: 'touchStart' | 'touchMove' | 'touchEnd', points: { x: number; y: number; id: number }[]) =>
        cdp.send('Input.dispatchTouchEvent', { type, touchPoints: points });
      await touch('touchStart', [{ x: 90, y: 450, id: 1 }]);
      await touch('touchMove', [{ x: 280, y: 450, id: 1 }]);
      await touch('touchEnd', []);
      await expect(dialog).toContainText('Fahrzeughalle.png');
      await touch('touchStart', [{ x: 160, y: 450, id: 1 }, { x: 220, y: 450, id: 2 }]);
      await touch('touchMove', [{ x: 60, y: 450, id: 1 }, { x: 320, y: 450, id: 2 }]);
      await touch('touchEnd', []);
      expect(await dialog.locator('.zoom-value').innerText()).not.toBe('100 %');
      await dialog.getByRole('button', { name: 'Bild einpassen', exact: true }).click();
      await page.keyboard.press('ArrowRight');
      await cdp.detach();
    } else {
      await image.hover();
      await page.mouse.wheel(0, -400);
      await expect(dialog.locator('.zoom-value')).not.toHaveText('100 %');
      await dialog.getByRole('button', { name: 'Bild einpassen', exact: true }).click();
    }
    for (let index = 0; index < 8; index++) await page.keyboard.press('+');
    const before = await image.getAttribute('style');
    await image.hover();
    const box = (await image.boundingBox())!;
    const center = { x: Math.min(width - 80, Math.max(80, box.x + box.width / 2)), y: 450 };
    await page.mouse.move(center.x, center.y);
    await page.mouse.down();
    await page.mouse.move(center.x + 40, center.y + 40, { steps: 5 });
    await page.mouse.up();
    expect(await image.getAttribute('style')).not.toBe(before);
    await page.keyboard.press('0');
    await page.keyboard.press('ArrowRight');
    await expect(dialog.getByRole('alert')).toContainText('Bild konnte nicht geladen werden.');
    await page.keyboard.press('ArrowLeft');
    await expect(dialog.locator('.stage img')).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(dialog).not.toBeVisible();
    await page.locator('.thumbs button').nth(1).click();
    await expect(dialog).not.toBeVisible();
    await expect(page.locator('.thumbs button').nth(1)).toHaveAttribute('aria-pressed', 'true');
    await expect(preview.locator('img')).toHaveAttribute('src', '/icons/icon-512x512.png');
    await preview.click();
    await expect(dialog).toContainText('Atemschutz.png');
    await dialog.getByRole('button', { name: 'Schließen', exact: true }).click();
    await page.goto('/assets/asset/edit');
    await page.locator('app-image-upload .image-preview').first().click();
    await expect(dialog).toBeVisible();
    await page.keyboard.press('Escape');
  });
}
