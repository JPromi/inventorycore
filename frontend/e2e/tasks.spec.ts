import { expect, test, type Page } from '@playwright/test';

const area = { uuid: 'area-1', name: 'Atemschutz', description: null, color: null, defaultArea: true };
const counts = (done: number, notDone: number, pending: number) => ({
  total: done + notDone + pending, done, notDone, pending,
});
const summary = (status: 'OPEN' | 'COMPLETED') => ({
  uuid: 'run-1', taskUuid: 'task-1', title: 'Atemschutz-Kontrolle', areaUuid: area.uuid, areaName: area.name,
  dueDate: '2026-10-29', status, overdue: false, recurring: true, assigneeNames: 'Gerätewart',
  assignedToMe: true, scopeSummary: '1 einzeln gewähltes Asset · 1 Asset', assetCount: 1,
  counts: counts(0, 0, 2), createdAt: '2026-10-29T06:00:00Z',
  completedAt: status === 'COMPLETED' ? '2026-10-29T09:00:00Z' : null,
  completedByName: status === 'COMPLETED' ? 'Gerätewart' : null, canDelete: false,
});
const entry = (uuid: string, point: string, asset: boolean) => ({
  uuid, pointUuid: `point-${uuid}`, pointName: point, pointDescription: null,
  assetUuid: asset ? 'asset-1' : null, assetName: asset ? 'Atemschutzgerät 1' : null,
  invId: asset ? 'AS-1' : null, assetTypeName: null, locationName: asset ? 'Gerätehaus' : null,
  assetVisible: asset, status: 'PENDING', comment: null as string | null, checkedAt: null as string | null,
  checkedByName: null as string | null,
});

async function mockApi(page: Page) {
  const entries = [entry('e-general', 'Fahrzeugbuch geprüft', false), entry('e-asset', 'Flaschendruck', true)];
  const state = { status: 'OPEN' as 'OPEN' | 'COMPLETED', comment: null as string | null };
  const patches: unknown[] = [];
  const created: unknown[] = [];
  const started: string[] = [];
  const detail = () => {
    const run = summary(state.status);
    run.counts = counts(
      entries.filter((e) => e.status === 'DONE').length,
      entries.filter((e) => e.status === 'NOT_DONE').length,
      entries.filter((e) => e.status === 'PENDING').length,
    );
    return {
      summary: run, description: null, comment: state.comment, canWork: state.status === 'OPEN',
      canRestart: state.status === 'COMPLETED', entries,
    };
  };
  await page.route('**/api/**', async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const path = url.pathname;
    if (path === '/api/auth/me') {
      return route.fulfill({ json: {
        authenticated: true, uuid: 'user-1', username: 'leitung', displayName: 'Leitung', role: 'USER',
        permissions: [{ resourceType: 'TASK', areaUuid: area.uuid, canView: true, canCreate: true, canEdit: true,
          canDelete: true, canInspect: true, admin: false }],
      } });
    }
    if (path === '/api/areas') {
      return route.fulfill({ json: [area] });
    }
    if (path === '/api/task-runs/page') {
      const tab = url.searchParams.get('tab');
      const run = detail().summary;
      const items = tab === 'COMPLETED' ? (state.status === 'COMPLETED' ? [run] : [])
        : state.status === 'OPEN' || tab === 'ALL' ? [run] : [];
      return route.fulfill({ json: {
        items, total: items.length, page: 0, size: 50, hasMore: false,
        mineCount: state.status === 'OPEN' ? 1 : 0, openCount: state.status === 'OPEN' ? 1 : 0,
        overdueCount: 0, completedCount: state.status === 'COMPLETED' ? 1 : 0,
      } });
    }
    if (path === '/api/tasks/page') {
      const task = {
        uuid: 'task-1', title: 'Atemschutz-Kontrolle', description: null, areaUuid: area.uuid, areaName: area.name,
        intervalValue: null, intervalUnit: null, startDate: '2026-10-01', nextDueDate: null, onDemand: true,
        active: true, assignees: [], points: [], assets: [], filter: null, scopeSummary: 'Ohne Assets',
        openRunUuid: null, lastCompletedAt: '2026-10-20T09:00:00Z', runCount: 3, createdAt: '2026-10-01T09:00:00Z',
        createdByName: 'Leitung', assignedToMe: false, canStart: true, canEdit: true, canDelete: true,
      };
      return route.fulfill({ json: { items: [task], total: 1, page: 0, size: 50, hasMore: false } });
    }
    if (path === '/api/tasks/task-1/runs' && request.method() === 'POST') {
      started.push(path);
      state.status = 'OPEN';
      return route.fulfill({ json: detail().summary });
    }
    if (path === '/api/task-runs/run-1') {
      return route.fulfill({ json: detail() });
    }
    if (path.startsWith('/api/task-runs/run-1/entries/') && request.method() === 'PATCH') {
      if (state.status === 'COMPLETED') {
        return route.fulfill({ status: 409, json: {} });
      }
      const body = request.postDataJSON();
      patches.push(body);
      const target = entries.find((candidate) => path.endsWith(candidate.uuid))!;
      if (body.status) {
        target.status = body.status;
        target.checkedByName = body.status === 'PENDING' ? null : 'Leitung';
        target.checkedAt = body.status === 'PENDING' ? null : '2026-10-29T08:00:00Z';
      }
      if (body.comment !== null) {
        target.comment = body.comment || null;
      }
      return route.fulfill({ json: target });
    }
    if (path === '/api/task-runs/run-1/complete') {
      state.status = 'COMPLETED';
      state.comment = request.postDataJSON().comment;
      return route.fulfill({ json: detail() });
    }
    if (path === '/api/tasks/assignees') {
      return route.fulfill({ json: {
        users: [{ type: 'USER', uuid: 'user-2', name: 'Gerätewart' }],
        groups: [{ type: 'GROUP', uuid: 'group-1', name: 'Atemschutz' }],
      } });
    }
    if (path === '/api/tasks/preview') {
      return route.fulfill({ json: { count: 0, assets: [] } });
    }
    if (path === '/api/tasks' && request.method() === 'POST') {
      created.push(request.postDataJSON());
      return route.fulfill({ status: 201, json: { uuid: 'task-2' } });
    }
    if (path === '/api/tasks/task-2/runs') {
      return route.fulfill({ json: [{ ...summary('OPEN'), uuid: 'run-1' }] });
    }
    return route.fulfill({ json: [] });
  });
  return { patches, created, started };
}

for (const viewport of [{ width: 1280, height: 800 }, { width: 390, height: 844 }]) {
  test(`task run is carried out and becomes a read-only protocol (${viewport.width}px)`, async ({ page }, testInfo) => {
    await page.setViewportSize(viewport);
    const { patches } = await mockApi(page);

    await page.goto('/tasks');
    await page.getByRole('tab', { name: /Mir zugewiesen/ }).click();
    await page.getByRole('button', { name: /Atemschutz-Kontrolle/ }).click();
    await expect(page).toHaveURL(/\/tasks\/run-1$/);

    const general = page.locator('.entry').filter({ hasText: 'Fahrzeugbuch geprüft' });
    const asset = page.locator('.entry').filter({ hasText: 'Flaschendruck' });
    await expect(page.getByRole('link', { name: 'Atemschutzgerät 1' })).toBeVisible();

    // a plain checklist: no comment fields until one is asked for
    await expect(page.getByRole('textbox', { name: 'Kommentar' })).toHaveCount(0);
    await page.screenshot({ path: testInfo.outputPath('task-checklist.png'), fullPage: true });

    await general.getByRole('checkbox', { name: 'Fahrzeugbuch geprüft' }).click();
    await expect(general).toHaveClass(/done/);
    await expect(general).toContainText('Leitung');
    await asset.getByRole('button', { name: 'Nicht erledigt', exact: true }).click();
    await expect(asset).toHaveClass(/not-done/);

    // the comment is saved after a pause in typing, without leaving the field
    await asset.getByRole('button', { name: 'Kommentar hinzufügen' }).click();
    await expect(asset.getByRole('textbox', { name: 'Kommentar' })).toBeFocused();
    await asset.getByRole('textbox', { name: 'Kommentar' }).fill('Flasche 2 unter 270 bar');
    await expect(asset).toContainText('Gespeichert');
    expect(patches).toContainEqual({ status: null, comment: 'Flasche 2 unter 270 bar' });

    await page.getByRole('button', { name: 'Abschließen', exact: true }).first().click();
    const dialog = page.getByRole('dialog');
    await expect(dialog).toContainText('1 von 2 Punkten erledigt');
    await dialog.getByRole('textbox').fill('Flasche zur Füllung gegeben');
    await dialog.getByRole('button', { name: 'Abschließen' }).click();

    await expect(page.locator('.protocol-meta')).toContainText('Flasche zur Füllung gegeben');
    await expect(page.locator('.report-section')).toContainText('Flasche 2 unter 270 bar');
    await expect(page.getByRole('button', { name: 'Drucken' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Erneut durchführen' })).toBeVisible();
    await expect(page.locator('.result-button')).toHaveCount(0);
    await page.screenshot({ path: testInfo.outputPath('task-protocol.png'), fullPage: true });
  });
}

test('a new task is saved with assignees, schedule and checklist', async ({ page }, testInfo) => {
  const { created } = await mockApi(page);
  await page.goto('/tasks/definitions/new');

  await page.getByRole('textbox', { name: 'Titel' }).fill('Atemschutz-Kontrolle');
  await page.getByRole('radio', { name: 'Wiederkehrend' }).click();
  await page.getByRole('spinbutton', { name: 'Anzahl' }).fill('10');
  // without assets there is one plain checklist
  await expect(page.getByRole('heading', { name: 'Für jedes Asset' })).toHaveCount(0);
  await page.getByRole('radio', { name: 'Nach Filter' }).click();
  await page.getByRole('textbox', { name: 'Checklistenpunkt', exact: true }).first().fill('Fahrzeugbuch geprüft');
  await page.getByRole('textbox', { name: 'Checklistenpunkt', exact: true }).nth(1).fill('Flaschendruck');
  await page.screenshot({ path: testInfo.outputPath('task-form.png'), fullPage: true });
  await page.getByRole('button', { name: 'Speichern' }).click();

  await expect(page).toHaveURL(/\/tasks\/run-1$/);
  expect(created).toHaveLength(1);
  expect(created[0]).toMatchObject({
    title: 'Atemschutz-Kontrolle',
    areaUuid: area.uuid,
    intervalValue: 10,
    intervalUnit: 'DAYS',
    assetUuids: [],
    filter: { locationUuids: [], includeSubLocations: true, tagUuids: [], assetTypeUuids: [] },
    points: [
      { name: 'Fahrzeugbuch geprüft', perAsset: false },
      { name: 'Flaschendruck', perAsset: true },
    ],
  });
});

test('a task is created once and started whenever needed', async ({ page }) => {
  const { started } = await mockApi(page);
  await page.goto('/tasks');
  // the page starts with all tasks
  await expect(page.getByRole('tab', { name: /Alle Aufgaben/ })).toHaveAttribute('aria-selected', 'true');
  const row = page.locator('.task-row').filter({ hasText: 'Atemschutz-Kontrolle' });
  await expect(row).toContainText('Bei Bedarf');
  await expect(row).toContainText('Zuletzt erledigt am 20.10.2026');
  await row.getByRole('button', { name: 'Jetzt durchführen' }).click();
  await expect(page).toHaveURL(/\/tasks\/run-1$/);
  expect(started).toEqual(['/api/tasks/task-1/runs']);
});
