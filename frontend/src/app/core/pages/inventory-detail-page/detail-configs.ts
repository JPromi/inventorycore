import { LucideBoxes, LucideMapPin, type LucideIcon } from '@lucide/angular';

import { PermissionResourceType } from '../../entities/user.entity';
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
  title: 'Asset',
  endpoint: 'assets',
  listRoute: '/assets',
  editRoutePrefix: '/assets',
  resourceType: 'ASSET',
  icon: LucideBoxes,
  fields: [
    { key: 'serialNumber', label: 'Seriennummer' },
    { key: 'inventoryNumber', label: 'Inventarnummer' },
    { key: 'inspectionIntervalDays', label: 'Prüfintervall', suffix: ' Tage' },
    { key: 'description', label: 'Beschreibung' },
  ],
};

export const LOCATION_DETAIL_CONFIG: DetailConfig = {
  title: 'Standort',
  endpoint: 'locations',
  listRoute: '/locations',
  editRoutePrefix: '/locations',
  resourceType: 'LOCATION',
  icon: LucideMapPin,
  fields: [
    { key: 'address', label: 'Adresse' },
    { key: 'description', label: 'Beschreibung' },
  ],
};
