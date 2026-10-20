import { InventoryItem } from '../../features/inventory/data-access/inventory-api.service';

/** Full path of a location, e.g. "Gebäude A / Raum 1". */
export function locationPath(locations: InventoryItem[], location: InventoryItem): string {
  const byUuid = new Map(locations.map((entry) => [entry.uuid, entry]));
  const names: string[] = [];
  const visited = new Set<string>();
  let current: InventoryItem | undefined = location;
  while (current && !visited.has(current.uuid)) {
    visited.add(current.uuid);
    names.unshift(current.name);
    current = current.parentLocationUuid ? byUuid.get(current.parentLocationUuid) : undefined;
  }
  return names.join(' / ');
}

/** The location itself plus all of its (nested) child locations. */
export function locationWithDescendants(locations: InventoryItem[], uuid: string): Set<string> {
  const result = new Set<string>([uuid]);
  let added = true;
  while (added) {
    added = false;
    for (const location of locations) {
      if (
        location.parentLocationUuid &&
        result.has(location.parentLocationUuid) &&
        !result.has(location.uuid)
      ) {
        result.add(location.uuid);
        added = true;
      }
    }
  }
  return result;
}
