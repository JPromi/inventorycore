import { expect, Page, test } from '@playwright/test';

async function mockApi(page: Page) {
  await page.route('**/api/**', async (route) => {
    const path = new URL(route.request().url()).pathname;
    const json = path === '/api/auth/me' ? { authenticated: true, username: 'admin', role: 'ADMIN', permissions: [] }
      : path.endsWith('/page') ? { items: [{ uuid: 'x', name: 'Atemschutzgerät PA 1', areaUuids: [] }], total: 1, page: 0, size: 50, hasMore: false }
      : path === '/api/customization' ? {} : [];
    await route.fulfill({ json });
  });
}

const pressed = (page: Page, title: string) =>
  page.getByRole('button', { name: title, exact: true });

test('each list page remembers its view', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await mockApi(page);
  await page.goto('/assets');
  await expect(pressed(page, 'Listenansicht')).toHaveAttribute('aria-pressed', 'true');
  await pressed(page, 'Kachelansicht').click();

  await page.goto('/locations');
  await expect(pressed(page, 'Listenansicht')).toHaveAttribute('aria-pressed', 'true');
  await pressed(page, 'Baumansicht').click();

  // back on the asset list and after a reload: the chosen views again
  await page.goto('/assets');
  await expect(pressed(page, 'Kachelansicht')).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('.items')).toHaveClass(/grid/);
  await page.reload();
  await expect(pressed(page, 'Kachelansicht')).toHaveAttribute('aria-pressed', 'true');
  await page.goto('/locations');
  await expect(pressed(page, 'Baumansicht')).toHaveAttribute('aria-pressed', 'true');

  // types have no tree; an unknown or broken value falls back to the list
  await page.evaluate(() => localStorage.setItem('inventorycore.listViews', JSON.stringify({ 'asset-types': 'tree' })));
  await page.goto('/config/types');
  await expect(pressed(page, 'Listenansicht')).toHaveAttribute('aria-pressed', 'true');
  await page.evaluate(() => localStorage.setItem('inventorycore.listViews', '{kaputt'));
  await page.goto('/assets');
  await expect(pressed(page, 'Listenansicht')).toHaveAttribute('aria-pressed', 'true');
});

test('inspections and tasks offer a remembered grid view', async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  const inspection = {
    uuid: 'run', title: 'Fahrzeugkontrolle HLF 20', inspectionTypeUuid: 'type', typeName: 'Fahrzeugkontrolle',
    areaUuids: [], areaNames: ['Fahrzeuge'], status: 'OPEN', mode: 'CHECK', checkFunction: false,
    filterSummary: 'Alle Assets', createdAt: '2026-10-29T08:00:00Z', createdByUuid: null, createdByName: 'Admin',
    completedAt: null, completedByName: null,
    counts: { expected: 4, present: 0, missing: 0, passed: 2, failed: 1, pending: 1, unexpected: 0, defect: 0, functionUnchecked: 0 },
  };
  const task = {
    uuid: 'task', title: 'Atemschutz-Kontrolle', description: null, areaUuid: 'area', areaName: 'Atemschutz',
    intervalValue: null, intervalUnit: null, startDate: '2026-10-01', nextDueDate: null, onDemand: true, active: true,
    assignees: [], points: [], assets: [], filter: null, scopeSummary: 'Ohne Assets', openRunUuid: null,
    lastCompletedAt: null, runCount: 0, createdAt: '2026-10-01T08:00:00Z', createdByName: 'Admin',
    assignedToMe: false, canStart: true, canEdit: true, canDelete: true,
  };
  await page.route('**/api/**', async (route) => {
    const path = new URL(route.request().url()).pathname;
    const page = (items: object[]) => ({ items, total: items.length, page: 0, size: 50, hasMore: false });
    const json = path === '/api/auth/me' ? { authenticated: true, username: 'admin', role: 'ADMIN', permissions: [] }
      : path === '/api/inspections/page' ? { ...page([inspection, { ...inspection, uuid: 'run2' }]), openCount: 2, completedCount: 0 }
      : path === '/api/tasks/page' ? page([task, { ...task, uuid: 'task2', title: 'Wasserführung prüfen' }])
      : path === '/api/task-runs/page' ? { ...page([]), mineCount: 0, openCount: 0, overdueCount: 0, completedCount: 0 }
      : path === '/api/customization' ? {} : [];
    await route.fulfill({ json });
  });

  await page.goto('/inspections');
  await expect(pressed(page, 'Listenansicht')).toHaveAttribute('aria-pressed', 'true');
  await pressed(page, 'Kachelansicht').click();
  await expect(page.locator('.inspection-list')).toHaveClass(/grid/);
  await page.screenshot({ path: testInfo.outputPath('inspections-grid.png') });

  // every page keeps its own choice
  await page.goto('/tasks');
  await expect(pressed(page, 'Listenansicht')).toHaveAttribute('aria-pressed', 'true');
  await pressed(page, 'Kachelansicht').click();
  await expect(page.locator('.task-list')).toHaveClass(/grid/);
  await expect(page.getByRole('button', { name: 'Jetzt durchführen' })).toHaveCount(2);
  await page.screenshot({ path: testInfo.outputPath('tasks-grid.png') });

  await page.reload();
  await expect(page.locator('.task-list')).toHaveClass(/grid/);
  await page.goto('/inspections');
  await expect(page.locator('.inspection-list')).toHaveClass(/grid/);
});
