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
  { value: 'SITE', label: 'Gelände', hint: 'Grundstück, Campus, Werk', icon: LucideLandPlot },
  { value: 'BUILDING', label: 'Gebäude', hint: 'Haus, Bürogebäude, Halle', icon: LucideBuilding },
  { value: 'FLOOR', label: 'Etage', hint: 'Stockwerk, Geschoss', icon: LucideLayers },
  { value: 'ROOM', label: 'Raum', hint: 'Büro, Besprechungsraum, Werkstatt', icon: LucideDoorOpen },
  { value: 'WAREHOUSE', label: 'Lager', hint: 'Lagerraum, Depot', icon: LucideWarehouse },
  { value: 'SHELF', label: 'Regal', hint: 'Regal, Regalfach', icon: LucideLibraryBig },
  { value: 'CABINET', label: 'Schrank', hint: 'Schrank, Spind, Schublade', icon: LucideArchive },
  { value: 'RACK', label: 'Serverschrank', hint: 'Rack, Verteiler', icon: LucideServer },
  { value: 'CONTAINER', label: 'Behälter', hint: 'Kiste, Box, Koffer', icon: LucidePackage },
  { value: 'VEHICLE', label: 'Fahrzeug', hint: 'Auto, Transporter, Lkw', icon: LucideTruck },
  { value: 'OUTDOOR', label: 'Außenbereich', hint: 'Hof, Parkplatz, Garten', icon: LucideTrees },
  { value: 'OTHER', label: 'Anderes', hint: 'Sonstiger Standort', icon: LucideMapPin },
];

const OTHER = LOCATION_TYPES[LOCATION_TYPES.length - 1];

export function locationTypeInfo(type: LocationType | null | undefined): LocationTypeInfo {
  return LOCATION_TYPES.find((entry) => entry.value === type) ?? OTHER;
}
