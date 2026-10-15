import { expect, test } from '@playwright/test';

for (const viewport of [{ width: 1280, height: 800 }, { width: 390, height: 844 }]) {
  test(`edits asset links and shows parent/child notes (${viewport.width}px)`, async ({ page }) => {
    await page.setViewportSize(viewport);
    const pc = { uuid: 'pc', name: 'Computer', invId: 'INV-PC', areaUuids: ['area'] };
    let ram = { uuid: 'ram', name: 'RAM', invId: 'INV-RAM', areaUuids: ['area'], parentAssetUuid: 'pc', parentAssetNote: 'RAM Slot 1' };
    const chip = { uuid: 'chip', name: 'Chip', invId: 'INV-CHIP', areaUuids: ['area'], parentAssetUuid: 'ram', parentAssetNote: 'Modul A' };
    let saved: Record<string, unknown> | null = null;
    await page.route('**/api/**', async (route) => {
      const path = new URL(route.request().url()).pathname;
      if (path === '/api/assets/ram' && route.request().method() === 'PATCH') {
        saved = route.request().postDataJSON();
        ram = { ...ram, ...saved };
      }
      const body = path === '/api/auth/me'
        ? { authenticated: true, username: 'admin', displayName: 'Admin', role: 'ADMIN', permissions: [] }
        : path === '/api/areas' ? [{ uuid: 'area', name: 'Allgemein', defaultArea: true }]
        : path === '/api/assets' ? [pc, ram, chip]
        : path === '/api/assets/pc' ? pc : path === '/api/assets/ram' ? ram : [];
      await route.fulfill({ json: body });
    });
    await page.goto('/assets/ram/edit');
    const parentSelect = page.locator('app-search-select[name="parentAssetUuid"]');
    await expect(parentSelect).toContainText('Computer');
    await expect(page.locator('input[name="parentAssetNote"]')).toHaveValue('RAM Slot 1');
    const actions = page.locator('.sticky-editor-actions');
    await page.locator('.form-page').evaluate(element => { element.scrollTop = element.scrollHeight / 2; });
    const footer = await actions.evaluate(element => {
      const extension = getComputedStyle(element, '::after');
      const container = element.closest('.form-page')!;
      return { bottom: element.getBoundingClientRect().bottom + parseFloat(extension.height),
        viewportBottom: container.getBoundingClientRect().bottom,
        background: extension.backgroundColor, expected: getComputedStyle(container).getPropertyValue('--background').trim() };
    });
    expect(footer.bottom).toBeGreaterThanOrEqual(footer.viewportBottom - 1);
    expect(footer.background).not.toBe('rgba(0, 0, 0, 0)');
    await page.screenshot({ path: test.info().outputPath('sticky-actions.png') });
    await parentSelect.scrollIntoViewIfNeeded();
    await parentSelect.locator('.trigger').click();
    await expect(parentSelect.getByRole('option', { name: /^RAM/ })).toHaveCount(0);
    await expect(parentSelect.getByRole('option', { name: /^Chip/ })).toHaveCount(0);
    await parentSelect.getByRole('button', { name: 'Kein übergeordnetes Asset', exact: true }).click();
    await expect(page.locator('input[name="parentAssetNote"]')).toHaveCount(0);
    await parentSelect.locator('.trigger').click();
    await parentSelect.getByRole('option', { name: 'Computer INV-PC', exact: true }).click();
    await page.locator('input[name="parentAssetNote"]').fill('RAM Slot 2');
    await page.locator('select[name="inspectionPolicy"]').selectOption('MANUAL');
    await page.getByRole('button', { name: 'Speichern', exact: true }).click();
    await expect(page).toHaveURL(/\/assets\/ram$/);
    expect(saved).toMatchObject({ parentAssetUuid: 'pc', parentAssetNote: 'RAM Slot 2', inspectionPolicy: 'MANUAL' });
    await expect(page.getByRole('link', { name: 'Computer INV-PC RAM Slot 2', exact: true })).toBeVisible();
    await expect(page.getByRole('link', { name: 'Chip INV-CHIP Modul A', exact: true })).toBeVisible();
    await page.getByRole('link', { name: 'Computer INV-PC RAM Slot 2', exact: true }).click();
    await expect(page.getByRole('link', { name: 'RAM INV-RAM RAM Slot 2', exact: true })).toBeVisible();
  });
}
