import { expect, test } from '@playwright/test';
import { join } from 'node:path';

/**
 * The camera is fed a still image of a small Data Matrix code lasered into black plastic: light
 * modules on a dark, uneven background with little contrast, slight blur and sensor noise
 * (e2e/fixtures/laser-datamatrix.mjpeg, content "FW-2026-0042"). The old reader did not find it.
 */
const frame = join(__dirname, 'fixtures', 'laser-datamatrix.mjpeg');

test.use({
  permissions: ['camera'],
  launchOptions: {
    args: [
      '--use-fake-ui-for-media-stream',
      '--use-fake-device-for-media-stream',
      `--use-file-for-fake-video-capture=${frame}`,
    ],
  },
});

test('a lasered Data Matrix code on black plastic is read from the camera', async ({ page }) => {
  const scanned: string[] = [];
  await page.route('**/api/**', async (route) => {
    const url = new URL(route.request().url());
    if (url.pathname === '/api/scan') {
      scanned.push(url.searchParams.get('code') ?? '');
      return route.fulfill({ json: { code: url.searchParams.get('code'), matchedBy: null, assets: [], locations: [] } });
    }
    const json = url.pathname === '/api/auth/me'
      ? { authenticated: true, username: 'admin', role: 'ADMIN', permissions: [] }
      : url.pathname === '/api/customization' ? {} : [];
    await route.fulfill({ json });
  });

  await page.goto('/scan');
  await page.getByRole('tab', { name: /Kamera/ }).click();
  await expect.poll(() => scanned, { timeout: 20_000 }).toContain('FW-2026-0042');
});
