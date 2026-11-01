import { expect, test } from '@playwright/test';

test.beforeEach(async ({ page }) => {
  await page.route('**/api/**', route => {
    const path = new URL(route.request().url()).pathname;
    return route.fulfill({ json: path === '/api/auth/me'
      ? { authenticated: true, username: 'admin', role: 'ADMIN', permissions: [] }
      : path === '/api/areas' ? [{ uuid: 'area', name: 'Allgemein', defaultArea: true }]
      : path === '/api/customization' ? {} : [] });
  });
  await page.goto('/assets/new');
});

for (const mimeType of ['image/jpeg', 'image/heic', '']) {
  test(`phone photo is uploaded as resized JPEG (${mimeType || 'missing MIME type'})`, async ({ page }) => {
    let uploaded: { name: string; type: string; width: number; height: number } | undefined;
    await page.route('**/api/files', async route => {
      const request = route.request();
      const form = await new Response(request.postDataBuffer()!, {
        headers: { 'Content-Type': request.headers()['content-type'] },
      }).formData();
      const photo = form.get('file') as File;
      const dimensions = await page.evaluate(async bytes => {
        const image = await createImageBitmap(new Blob([new Uint8Array(bytes)]));
        const result = { width: image.width, height: image.height };
        image.close();
        return result;
      }, Array.from(new Uint8Array(await photo.arrayBuffer())));
      uploaded = { name: photo.name, type: photo.type, ...dimensions };
      await route.fulfill({ json: { uuid: 'photo', url: '/icons/icon-192x192.png',
        thumbnailUrl: '/icons/icon-192x192.png', contentType: 'image/jpeg', originalName: photo.name } });
    });
    const bytes = await page.evaluate(() => {
      const canvas = document.createElement('canvas');
      canvas.width = 4032;
      canvas.height = 3024;
      canvas.getContext('2d')!.fillRect(0, 0, canvas.width, canvas.height);
      return Array.from(Uint8Array.from(atob(canvas.toDataURL('image/jpeg').split(',')[1]), c => c.charCodeAt(0)));
    });
    // HEIC MIME exercises conversion routing, not native HEIC decoding in Edge.
    await page.locator('app-image-upload input[type=file]').setInputFiles({
      name: mimeType === 'image/heic' ? 'IMG_1234.HEIC' : 'IMG_1234.JPG',
      mimeType, buffer: Buffer.from(bytes),
    });
    await expect.poll(() => uploaded).toEqual({ name: 'IMG_1234.jpg', type: 'image/jpeg', width: 1920, height: 1440 });
    await expect(page.locator('app-image-upload figure')).toHaveCount(1);
    await expect(page.locator('app-image-upload .pending')).toHaveCount(0);
  });
}

test('unreadable HEIC shows an actionable error and allows a retry', async ({ page }) => {
  let writes = 0;
  await page.route('**/api/files', route => {
    writes++;
    return route.fulfill({ json: { uuid: 'photo', url: '/icons/icon-192x192.png', contentType: 'image/png' } });
  });
  const input = page.locator('app-image-upload input[type=file]');
  await input.setInputFiles({ name: 'IMG.HEIC', mimeType: 'image/heic', buffer: Buffer.from('invalid') });
  await expect(page.locator('.pending-error')).toContainText('als JPEG');
  expect(writes).toBe(0);
  await input.setInputFiles('public/icons/icon-192x192.png');
  await expect(page.locator('app-image-upload figure')).toHaveCount(1);
  expect(writes).toBe(1);
});
