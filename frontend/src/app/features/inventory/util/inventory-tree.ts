import { InventoryItem } from '../data-access/inventory-api.service';

export interface InventoryTreeRow {
  item: InventoryItem;
  depth: number;
  /** Ancestor continuation lines followed by the current branch. */
  guides: boolean[];
  last: boolean;
}

/** Stable, cycle-safe preorder of the loaded and authorized list entries only. */
export function inventoryTree(items: InventoryItem[], endpoint: string): InventoryTreeRow[] {
  const parentKey =
    endpoint === 'assets'
      ? 'parentAssetUuid'
      : endpoint === 'locations'
        ? 'parentLocationUuid'
        : null;
  const byUuid = new Map(items.map((item) => [item.uuid, item]));
  const children = new Map<string, InventoryItem[]>();
  const roots: InventoryItem[] = [];
  for (const item of items) {
    const parent = parentKey ? byUuid.get(item[parentKey] ?? '') : undefined;
    if (parent && parent !== item) {
      const entries = children.get(parent.uuid) ?? [];
      entries.push(item);
      children.set(parent.uuid, entries);
    } else {
      roots.push(item);
    }
  }
  const result: InventoryTreeRow[] = [];
  const visited = new Set<string>();
  const append = (item: InventoryItem) => {
    const stack: InventoryTreeRow[] = [{ item, depth: 0, guides: [], last: true }];
    while (stack.length) {
      const row = stack.pop()!;
      if (visited.has(row.item.uuid)) {
        continue;
      }
      visited.add(row.item.uuid);
      result.push(row);
      const nested = children.get(row.item.uuid) ?? [];
      const guides = row.depth ? [...row.guides.slice(0, -1), !row.last] : [];
      for (let index = nested.length - 1; index >= 0; index--) {
        stack.push({
          item: nested[index],
          depth: row.depth + 1,
          guides: [...guides, true],
          last: index === nested.length - 1,
        });
      }
    }
  };
  roots.forEach(append);
  // Broken historical cycles must not make otherwise visible items disappear.
  items.forEach(append);
  return result;
}
