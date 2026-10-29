/** How a list page shows its entries; the tree only exists where entries have parents. */
export type ListView = 'list' | 'grid' | 'tree';

/** Chosen view per list page, kept in this browser. */
const STORAGE_KEY = 'inventorycore.listViews';

function readViews(): Record<string, ListView> {
  try {
    const value = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '{}');
    return value && typeof value === 'object' ? value : {};
  } catch {
    // no storage (private mode, blocked) or broken value: start with the list
    return {};
  }
}

/** The view last used on this page if the page offers it, otherwise the list. */
export function storedListView(page: string, offered: ListView[] = ['list', 'grid']): ListView {
  const stored = readViews()[page];
  return offered.includes(stored) ? stored : 'list';
}

export function storeListView(page: string, view: ListView): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ ...readViews(), [page]: view }));
  } catch {
    // the view still changes, it is just not remembered
  }
}
