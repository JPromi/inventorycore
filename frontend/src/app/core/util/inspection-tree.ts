import { InspectionItem } from '../service/inspection.service';

export interface InspectionTreeRow {
  item: InspectionItem;
  ancestors: string[];
  children: InspectionItem[];
}

export function inspectionTree(items: InspectionItem[]): InspectionTreeRow[] {
  const byAsset = new Map(items.filter((item) => item.assetUuid).map((item) => [item.assetUuid!, item]));
  const children = new Map<string, InspectionItem[]>();
  const roots: InspectionItem[] = [];
  for (const item of items) {
    const parent = item.parentAssetUuid ? byAsset.get(item.parentAssetUuid) : undefined;
    if (parent && parent !== item) {
      const list = children.get(parent.uuid) ?? [];
      list.push(item);
      children.set(parent.uuid, list);
    } else roots.push(item);
  }
  const result: InspectionTreeRow[] = [];
  const visited = new Set<string>();
  const append = (start: InspectionItem) => {
    const stack = [{ item: start, ancestors: [] as string[] }];
    while (stack.length) {
      const row = stack.pop()!;
      if (visited.has(row.item.uuid)) continue;
      visited.add(row.item.uuid);
      const nested = children.get(row.item.uuid) ?? [];
      result.push({ ...row, children: nested });
      for (const child of [...nested].reverse()) stack.push({ item: child, ancestors: [...row.ancestors, row.item.uuid] });
    }
  };
  roots.forEach(append);
  // Keep malformed historical hierarchies visible rather than losing items to a cycle.
  items.forEach(append);
  return result;
}
