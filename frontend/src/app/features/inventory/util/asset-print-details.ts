import { t } from '../../../core/i18n/i18n';
import { formatCheckValue } from '../../inspections/data-access/inspection.service';
import { ASSET_INSPECTION_POLICIES, InventoryItem } from '../data-access/inventory-api.service';
import { ASSET_DETAIL_CONFIG } from '../pages/inventory-detail-page/detail-configs';
import type { AssetPrintDetail } from '../pages/inventory-detail-page/asset-print/asset-print';

export function assetPrintDetails(
  asset: InventoryItem,
  type: InventoryItem | null,
): AssetPrintDetail[] {
  const fields = ASSET_DETAIL_CONFIG.fields.map((field) => ({
    label: field.label,
    value:
      field.key === 'inspectionPolicy'
        ? ASSET_INSPECTION_POLICIES[asset.inspectionPolicy ?? 'STANDARD']
        : String(asset[field.key] ?? ''),
    wide: field.key === 'description',
  }));
  const values = [...(asset.fieldValues ?? [])];
  const typed = [...(type?.fieldDefinitions ?? [])]
    .sort((a, b) => a.sortOrder - b.sortOrder)
    .flatMap((definition) => {
      const index = values.findIndex((value) =>
        definition.fieldKey && value.fieldKey
          ? definition.fieldKey === value.fieldKey
          : definition.name === value.name,
      );
      return index < 0
        ? []
        : [
            {
              value: { ...values.splice(index, 1)[0], name: definition.name },
              fieldType: definition.fieldType,
            },
          ];
    });
  const custom = [...typed, ...values.map((value) => ({ value, fieldType: null }))].map(
    ({ value, fieldType }) => {
      return {
        label: value.name,
        value: value.value ? formatCheckValue(value.value, fieldType) : '',
      };
    },
  );
  const tags = new Map(
    [...(asset.tags ?? []), ...(type?.tags ?? [])].map((tag) => [tag.uuid, tag.name]),
  );
  return [
    ...fields,
    ...custom,
    { label: t('terms.tags'), value: [...tags.values()].join(', '), wide: true },
  ].filter((field) => !!field.value);
}
