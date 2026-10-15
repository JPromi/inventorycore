import {
  LucideArchive,
  LucideBuilding,
  LucideDoorOpen,
  LucideLandPlot,
  LucideLayers,
  LucideLibraryBig,
  LucideMapPin,
  LucidePackage,
  LucideServer,
  LucideTrees,
  LucideTruck,
  LucideWarehouse,
  type LucideIcon,
} from '@lucide/angular';

import { t } from '../i18n/i18n';

/** Fixed kinds of locations (backend enum `LocationType`). */
export type LocationType =
  | 'SITE'
  | 'BUILDING'
  | 'FLOOR'
  | 'ROOM'
  | 'WAREHOUSE'
  | 'SHELF'
  | 'CABINET'
  | 'RACK'
  | 'CONTAINER'
  | 'VEHICLE'
  | 'OUTDOOR'
  | 'OTHER';

export interface LocationTypeInfo {
  value: LocationType;
  label: string;
  hint: string;
  icon: LucideIcon;
}

/** Roughly from large to small, as they are usually nested. */
export const LOCATION_TYPES: LocationTypeInfo[] = [
  { value: 'SITE', label: t('locationTypes.SITE'), hint: t('locationTypes.hints.SITE'), icon: LucideLandPlot },
  { value: 'BUILDING', label: t('locationTypes.BUILDING'), hint: t('locationTypes.hints.BUILDING'), icon: LucideBuilding },
  { value: 'FLOOR', label: t('locationTypes.FLOOR'), hint: t('locationTypes.hints.FLOOR'), icon: LucideLayers },
  { value: 'ROOM', label: t('locationTypes.ROOM'), hint: t('locationTypes.hints.ROOM'), icon: LucideDoorOpen },
  { value: 'WAREHOUSE', label: t('locationTypes.WAREHOUSE'), hint: t('locationTypes.hints.WAREHOUSE'), icon: LucideWarehouse },
  { value: 'SHELF', label: t('locationTypes.SHELF'), hint: t('locationTypes.hints.SHELF'), icon: LucideLibraryBig },
  { value: 'CABINET', label: t('locationTypes.CABINET'), hint: t('locationTypes.hints.CABINET'), icon: LucideArchive },
  { value: 'RACK', label: t('locationTypes.RACK'), hint: t('locationTypes.hints.RACK'), icon: LucideServer },
  { value: 'CONTAINER', label: t('locationTypes.CONTAINER'), hint: t('locationTypes.hints.CONTAINER'), icon: LucidePackage },
  { value: 'VEHICLE', label: t('locationTypes.VEHICLE'), hint: t('locationTypes.hints.VEHICLE'), icon: LucideTruck },
  { value: 'OUTDOOR', label: t('locationTypes.OUTDOOR'), hint: t('locationTypes.hints.OUTDOOR'), icon: LucideTrees },
  { value: 'OTHER', label: t('locationTypes.OTHER'), hint: t('locationTypes.hints.OTHER'), icon: LucideMapPin },
];

const OTHER = LOCATION_TYPES[LOCATION_TYPES.length - 1];

export function locationTypeInfo(type: LocationType | null | undefined): LocationTypeInfo {
  return LOCATION_TYPES.find((entry) => entry.value === type) ?? OTHER;
}
