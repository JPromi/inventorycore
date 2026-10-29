import { InventoryItem, InventoryRequest } from '../../data-access/inventory-api.service';

/** Full replacement DTO: preserve fields the table does not expose. */
export function inventoryRequest(
  item: InventoryItem,
  inheritedTagUuids: string[] = [],
): InventoryRequest {
  return {
    name: item.name,
    description: item.description,
    invId: item.invId ?? undefined,
    serialNumber: item.serialNumber,
    inventoryNumber: item.inventoryNumber,
    inspectionIntervalDays: item.inspectionIntervalDays,
    assetTypeUuid: item.assetTypeUuid,
    locationUuid: item.locationUuid,
    parentAssetUuid: item.parentAssetUuid,
    parentAssetNote: item.parentAssetNote,
    inspectionPolicy: item.inspectionPolicy ?? 'STANDARD',
    address: item.address,
    locationType: item.locationType ?? 'OTHER',
    street: item.street,
    postalCode: item.postalCode,
    city: item.city,
    country: item.country,
    latitude: item.latitude,
    longitude: item.longitude,
    parentLocationUuid: item.parentLocationUuid,
    shared: item.shared ?? false,
    color: item.color,
    fieldDefinitions: structuredClone(item.fieldDefinitions ?? []),
    fieldValues: structuredClone(item.fieldValues ?? []),
    images: structuredClone(item.images ?? []),
    tagUuids:
      item.tags?.map((tag) => tag.uuid).filter((uuid) => !inheritedTagUuids.includes(uuid)) ?? [],
    areaUuids: [...(item.areaUuids ?? [])],
    statusUuid: null,
    statusComment: null,
  };
}

/** Excel-compatible tab-separated text, including quoted tabs/newlines and doubled quotes. */
export function parseTableText(text: string): string[][] {
  const rows: string[][] = [[]];
  let value = '',
    quoted = false;
  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    if (char === '"' && (quoted || value === '')) {
      if (quoted && text[i + 1] === '"') {
        value += '"';
        i++;
      } else quoted = !quoted;
    } else if (!quoted && (char === '\t' || char === '\n' || char === '\r')) {
      rows.at(-1)!.push(value);
      value = '';
      if (char !== '\t') {
        if (char === '\r' && text[i + 1] === '\n') i++;
        rows.push([]);
      }
    } else value += char;
  }
  if (quoted) throw new Error('Unclosed quoted cell');
  if (value !== '' || rows.at(-1)!.length || text === '') rows.at(-1)!.push(value);
  else if (rows.length > 1) rows.pop();
  return rows;
}

export function tableText(rows: string[][]): string {
  return rows
    .map((row) =>
      row
        .map((value) => (/[\t\n\r"]/.test(value) ? '"' + value.replaceAll('"', '""') + '"' : value))
        .join('\t'),
    )
    .join('\r\n');
}
