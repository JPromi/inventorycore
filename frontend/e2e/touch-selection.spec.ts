import { expect, test } from '@playwright/test';
import { pageOf } from './support/paging';

test.use({ hasTouch: true, viewport: { width: 390, height: 844 } });

const assets = Array.from({ length: 20 }, (_, index) => ({ uuid: `asset-${index}`,
  name: `Asset ${String(index + 1).padStart(2, '0')}`, areaUuids: ['area'], description: 'Touch-Auswahl' }));

test.beforeEach(async ({ page }) => {
  await page.route('**/api/**', async route => {
    const path = new URL(route.request().url()).pathname;
    const body = path === '/api/auth/me' ? { authenticated: true, username: 'admin', role: 'ADMIN', permissions: [] }
      : path === '/api/areas' ? [{ uuid: 'area', name: 'EDV', defaultArea: true }]
      : path === '/api/assets/page' ? pageOf(assets, route.request().url()) : [];
    return route.fulfill({ json: body });
  });
  await page.goto('/assets');
  await page.getByRole('button', { name: 'Auswählen', exact: true }).click();
});

for (const grid of [false, true]) {
  test(`hold, paint selection, reverse and edge auto-scroll (${grid ? 'grid' : 'list'})`, async ({ page, context }, testInfo) => {
    if (grid) await page.getByRole('button', { name: 'Kachelansicht', exact: true }).click();
    const cdp = await context.newCDPSession(page);
    const first = await page.locator('.item').first().boundingBox();
    const x = first!.x + first!.width / 2;
    const y = Math.min(600, first!.y + first!.height / 2);
    const move = (clientY: number) => cdp.send('Input.dispatchTouchEvent', {
      type: 'touchMove', touchPoints: [{ x, y: clientY, id: 1 }],
    });
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y, id: 1 }] });
    await expect(page.locator('.touch-selecting')).toHaveCount(1);
    await expect(page.locator('app-selection-checkbox input:checked')).toHaveCount(1);
    if (!grid) {
      const fourth = await page.locator('.item').nth(3).boundingBox();
      await move(fourth!.y + fourth!.height / 2);
      await expect(page.locator('app-selection-checkbox input:checked')).toHaveCount(4);
      const second = await page.locator('.item').nth(1).boundingBox();
      await move(second!.y + second!.height / 2);
      await expect(page.locator('app-selection-checkbox input:checked')).toHaveCount(2);
    }
    const scroller = page.locator('.page');
    const before = await scroller.evaluate(element => element.scrollTop);
    await move(834);
    await expect.poll(() => scroller.evaluate(element => element.scrollTop)).toBeGreaterThan(before + 120);
    await expect.poll(() => page.locator('app-selection-checkbox input:checked').count()).toBeGreaterThan(grid ? 1 : 2);
    const down = await scroller.evaluate(element => element.scrollTop);
    await move(60);
    await expect.poll(() => scroller.evaluate(element => element.scrollTop)).toBeLessThan(down - 60);
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    await expect(page.locator('.touch-selecting')).toHaveCount(0);
    const after = await scroller.evaluate(element => element.scrollTop);
    await page.waitForTimeout(150);
    expect(await scroller.evaluate(element => element.scrollTop)).toBe(after);
    await page.screenshot({ path: testInfo.outputPath('touch-selection.png') });
  });
}

test('quick swipe still scrolls without selecting', async ({ page, context }) => {
  const cdp = await context.newCDPSession(page);
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: 200, y: 550, id: 1 }] });
  for (let y = 525; y >= 250; y -= 25) {
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: 200, y, id: 1 }] });
  }
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await expect.poll(() => page.locator('.page').evaluate(element => element.scrollTop)).toBeGreaterThan(50);
  await expect(page.locator('.touch-selecting')).toHaveCount(0);
  await expect(page.locator('app-selection-checkbox input:checked')).toHaveCount(0);
});

test('touch cancellation stops the gesture and auto-scroll', async ({ page, context }) => {
  const cdp = await context.newCDPSession(page);
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: 200, y: 450, id: 1 }] });
  await expect(page.locator('.touch-selecting')).toHaveCount(1);
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchCancel', touchPoints: [] });
  await expect(page.locator('.touch-selecting')).toHaveCount(0);
  await expect(page.locator('app-selection-checkbox input:checked')).toHaveCount(1);
});

test('a gesture starting on selected rows deselects and a new tap works immediately', async ({ page, context }) => {
  await page.getByRole('checkbox', { name: 'Alle geladenen auswählen' }).check();
  const cdp = await context.newCDPSession(page);
  const first = await page.locator('.item').first().boundingBox();
  const fourth = await page.locator('.item').nth(3).boundingBox();
  const x = first!.x + first!.width / 2;
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y: first!.y + first!.height / 2, id: 1 }] });
  await expect(page.locator('.touch-selecting')).toHaveCount(1);
  // all 20 entries are loaded (one page of 50)
  await expect(page.locator('app-selection-checkbox input:checked')).toHaveCount(19);
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x, y: fourth!.y + fourth!.height / 2, id: 1 }] });
  await expect(page.locator('app-selection-checkbox input:checked')).toHaveCount(16);
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await page.locator('.item').nth(3).tap();
  await expect(page.locator('app-selection-checkbox input:checked')).toHaveCount(17);
});
