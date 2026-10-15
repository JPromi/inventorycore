import { LucideBoxes, LucideMapPin, type LucideIcon } from '@lucide/angular';

import { PermissionResourceType } from '../../entities/user.entity';
import { t } from '../../i18n/i18n';
import { InventoryItem } from '../../service/inventory-api.service';

export interface DetailConfig {
  title: string;
  endpoint: 'assets' | 'locations' | 'asset-types';
  listRoute: string;
  editRoutePrefix?: string;
  resourceType: PermissionResourceType;
  icon: LucideIcon;
  fields: DetailField[];
}

export interface DetailField {
  key: keyof InventoryItem;
  label: string;
  suffix?: string;
}

/** Used by the asset route and the scan page, which shows the same view next to the scanner. */
export const ASSET_DETAIL_CONFIG: DetailConfig = {
  title: t('terms.asset'),
  endpoint: 'assets',
  listRoute: '/assets',
  editRoutePrefix: '/assets',
  resourceType: 'ASSET',
  icon: LucideBoxes,
  fields: [
    { key: 'serialNumber', label: t('terms.serialNumber') },
    { key: 'inventoryNumber', label: t('terms.inventoryNumber') },
    { key: 'inspectionPolicy', label: t('inventoryDetail.fields.inspectionPolicy') },
    { key: 'description', label: t('common.description') },
  ],
};

export const LOCATION_DETAIL_CONFIG: DetailConfig = {
  title: t('terms.location'),
  endpoint: 'locations',
  listRoute: '/locations',
  editRoutePrefix: '/locations',
  resourceType: 'LOCATION',
  icon: LucideMapPin,
  fields: [
    { key: 'address', label: t('inventoryDetail.fields.address') },
    { key: 'description', label: t('common.description') },
  ],
};
