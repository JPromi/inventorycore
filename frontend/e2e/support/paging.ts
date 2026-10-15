/**
 * Answers a mocked `/…/page` request like the backend list endpoints: every search word must
 * occur in a name-like field, `status` filters protocols, and the page is cut by `page` / `size`.
 */
export function pageOf<T extends object>(entries: T[], url: string | URL): object {
  const params = new URL(url).searchParams;
  const terms = (params.get('q') ?? '').toLowerCase().split(/\s+/).filter(Boolean);
  const status = params.get('status');
  const text = (entry: T) => ['name', 'title', 'username', 'displayName', 'email', 'typeName', 'description']
    .map((key) => String((entry as Record<string, unknown>)[key] ?? ''))
    .join(' ')
    .toLowerCase();
  const matches = entries.filter((entry) => terms.every((term) => text(entry).includes(term))
    && (!status || (entry as Record<string, unknown>)['status'] === status));
  const page = Number(params.get('page') ?? 0);
  const size = Number(params.get('size') ?? 50);
  const items = matches.slice(page * size, page * size + size);
  const statusCount = (value: string) => entries.filter((entry) => (entry as Record<string, unknown>)['status'] === value).length;
  return {
    items, total: matches.length, page, size, hasMore: page * size + items.length < matches.length,
    // protocols: tab counts
    openCount: statusCount('OPEN'), completedCount: statusCount('COMPLETED'),
  };
}
