import { expect, test, type Locator } from '@playwright/test';

const areas = Array.from({ length: 24 }, (_, index) => ({ uuid: `area-${index}`, name: `Bereich ${index}`, defaultArea: index === 0 }));
const types = Array.from({ length: 24 }, (_, index) => ({ uuid: `type-${index}`, name: `Typ ${index}`, tags: [], fieldDefinitions: [], images: [], areaUuids: [] }));

test.beforeEach(async ({ page }) => {
  await page.route('**/api/**', (route) => {
    const path = new URL(route.request().url()).pathname;
    const body = path === '/api/auth/me'
      ? { authenticated: true, username: 'admin', displayName: 'Admin', role: 'ADMIN', sourceProvider: 'LOCAL', permissions: [] }
      : path === '/api/areas' ? areas : path === '/api/asset-types' ? types : [];
    return route.fulfill({ json: body });
  });
});

async function moveToBottomRight(host: Locator): Promise<void> {
  await host.evaluate((element) => {
    Object.assign((element as HTMLElement).style, { position: 'fixed', right: '4px', bottom: '12px', width: '160px', zIndex: '100' });
  });
}

async function expectWithinViewport(panel: Locator): Promise<void> {
  await expect(panel).toBeVisible();
  await expect.poll(() => panel.evaluate((element) => {
    const rect = element.getBoundingClientRect();
    return rect.left >= 0 && rect.top >= 0 && rect.right <= innerWidth && rect.bottom <= innerHeight;
  })).toBe(true);
  expect(await panel.evaluate((element) => {
    const rect = element.getBoundingClientRect();
    const hit = document.elementFromPoint(rect.left + rect.width / 2, rect.top + Math.min(20, rect.height / 2));
    return element.contains(hit);
  })).toBe(true);
}

for (const viewport of [{ width: 1280, height: 800 }, { width: 390, height: 844 }]) {
  test(`search and multi-select fit at screen edges (${viewport.width}px)`, async ({ page }, testInfo) => {
    await page.setViewportSize(viewport);
    await page.goto('/assets/new');
    const select = page.locator('app-search-select').first();
    await expect(select).toBeVisible();
    await moveToBottomRight(select);
    await select.locator('.trigger').click();
    const panel = select.locator('.panel');
    await expectWithinViewport(panel);
    const triggerBox = await select.locator('.trigger').boundingBox();
    const panelBox = await panel.boundingBox();
    expect(panelBox!.y + panelBox!.height).toBeLessThanOrEqual(triggerBox!.y);
    await page.screenshot({ path: testInfo.outputPath('dropdown.png') });
    await panel.locator('.options').hover();
    await page.mouse.wheel(0, 900);
    await expect.poll(() => panel.locator('.options').evaluate((element) => element.scrollTop)).toBeGreaterThan(0);
    await panel.getByRole('option', { name: 'Typ 23', exact: true }).click();
    await expect(select.locator('.trigger')).toContainText('Typ 23');

    const multi = page.locator('app-multi-select[name="areas"]');
    await moveToBottomRight(multi);
    await multi.locator('input').click();
    await expectWithinViewport(multi.locator('.panel'));
    await multi.getByRole('option', { name: 'Bereich 1', exact: true }).click();
    await expect(multi.locator('.chip')).toContainText(['Bereich 0', 'Bereich 1']);
  });

  test(`color and area panels fit at screen edges (${viewport.width}px)`, async ({ page }) => {
    await page.setViewportSize(viewport);
    await page.goto('/config/tags');
    const color = page.locator('app-color-picker').first();
    await moveToBottomRight(color);
    await color.locator('.trigger').click();
    await expectWithinViewport(color.locator('.popover'));
    await color.locator('.preset:not(.none)').first().click();
    await page.locator('h1').click();

    if (viewport.width < 900) await page.locator('.menu-button').click();
    const switcher = page.locator('app-area-switcher');
    await switcher.locator('.trigger').click();
    await expectWithinViewport(switcher.locator('.panel'));
    await switcher.getByRole('button', { name: /^Bereich 1(?: nur)?$/ }).click();
    await expect(switcher.locator('.trigger')).toContainText('Bereich 1');
  });
}
