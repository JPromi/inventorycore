import { HttpClient } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { BehaviorSubject, Observable, of, tap } from 'rxjs';
import { catchError } from 'rxjs/operators';

import { environment } from '../../../environments/environment';
import { InventoryItem } from '../../features/inventory/data-access/inventory-api.service';
import { t } from '../i18n/i18n';

export interface AreaItem {
  uuid: string;
  name: string;
  description?: string | null;
  color?: string | null;
  defaultArea: boolean;
  assetCount?: number | null;
  locationCount?: number | null;
  assetTypeCount?: number | null;
}

const STORAGE_KEY = 'inventorycore.selectedAreas';

/**
 * Areas the current user can access, plus the global area filter from the sidebar.
 * The filter only narrows what is shown; permissions are not affected.
 */
@Injectable({ providedIn: 'root' })
export class AreaService {
  private readonly areasSubject = new BehaviorSubject<AreaItem[]>([]);
  private readonly selectedSubject = new BehaviorSubject<string[]>(this.readSelection());

  readonly areas$ = this.areasSubject.asObservable();
  /** Selected area uuids; empty means "all areas". */
  readonly selected$ = this.selectedSubject.asObservable();

  constructor(private readonly http: HttpClient) {}

  get areas(): AreaItem[] {
    return this.areasSubject.value;
  }

  get selected(): string[] {
    return this.selectedSubject.value;
  }

  get defaultArea(): AreaItem | undefined {
    return this.areas.find((area) => area.defaultArea);
  }

  load(): Observable<AreaItem[]> {
    return this.http.get<AreaItem[]>(`${environment.apiUrl}/areas`, { withCredentials: true }).pipe(
      tap((areas) => {
        this.areasSubject.next(areas);
        // drop selections of areas that are gone or no longer accessible
        const known = new Set(areas.map((area) => area.uuid));
        const selection = this.selected.filter((uuid) => known.has(uuid));
        if (selection.length !== this.selected.length) {
          this.setSelected(selection);
        }
      }),
      catchError(() => of([])),
    );
  }

  setSelected(uuids: string[]): void {
    this.selectedSubject.next(uuids);
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(uuids));
    } catch {
      // storage is optional
    }
  }

  /**
   * Whether something bound to these areas fits the sidebar selection. Nothing selected or no
   * areas (= valid everywhere) always fits.
   */
  overlapsSelection(areaUuids: string[] | null | undefined): boolean {
    const selected = this.selected;
    return (
      !selected.length || !areaUuids?.length || areaUuids.some((uuid) => selected.includes(uuid))
    );
  }

  name(uuid: string): string {
    return this.areas.find((area) => area.uuid === uuid)?.name ?? t('services.unknownArea');
  }

  /**
   * Whether an object belongs to the selected areas. Assets and locations also count as
   * belonging to an area when one of their (parent) locations is in it, like the view permission.
   */
  matchesSelection(item: InventoryItem, locations: InventoryItem[] = []): boolean {
    return !this.selected.length || this.matchesAreas(item, this.selected, locations);
  }

  /** Same rule as {@link matchesSelection}, for an explicit list of areas. */
  matchesAreas(item: InventoryItem, selected: string[], locations: InventoryItem[] = []): boolean {
    const inSelection = (entry: InventoryItem) =>
      (entry.areaUuids ?? []).some((uuid) => selected.includes(uuid));
    if (inSelection(item)) {
      return true;
    }
    const byUuid = new Map(locations.map((location) => [location.uuid, location]));
    const visited = new Set<string>();
    let locationUuid = item.locationUuid ?? item.parentLocationUuid ?? null;
    while (locationUuid && !visited.has(locationUuid)) {
      visited.add(locationUuid);
      const location = byUuid.get(locationUuid);
      if (!location) {
        return false;
      }
      if (inSelection(location)) {
        return true;
      }
      locationUuid = location.parentLocationUuid ?? null;
    }
    return false;
  }

  private readSelection(): string[] {
    try {
      const value = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '[]');
      return Array.isArray(value) ? value.filter((entry) => typeof entry === 'string') : [];
    } catch {
      return [];
    }
  }
}
