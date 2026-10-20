import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { Observable } from 'rxjs';

import { environment } from '../../../../environments/environment';
import { InspectionDue, InspectionSummary } from '../../inspections/data-access/inspection.service';

/** Mirrors `DashboardResponse.CountEntry`; an entry without uuid/name stands for "without type". */
export interface DashboardCount {
  uuid: string | null;
  name: string | null;
  color: string | null;
  count: number;
}

/** Mirrors `DashboardResponse`: everything is limited to the user's rights and the sidebar areas. */
export interface Dashboard {
  assetCount: number;
  locationCount: number;
  assetTypeCount: number;
  tagCount: number;
  canInspect: boolean;
  due: { overdue: number; dueSoon: number; ok: number };
  nextDue: InspectionDue[];
  openInspectionCount: number;
  /** completed within the last 30 days */
  completedInspectionCount: number;
  recentInspections: InspectionSummary[];
  /** results of the inspections completed within the last 90 days */
  results: { ok: number; defect: number; missing: number; failed: number };
  topTags: DashboardCount[];
  assetsByType: DashboardCount[];
  otherTypeAssetCount: number;
}

@Injectable({ providedIn: 'root' })
export class DashboardService {
  private readonly apiUrl = environment.apiUrl;

  constructor(private readonly http: HttpClient) {}

  /** `areas`: the sidebar selection, empty = all areas. */
  dashboard(areas: string[]): Observable<Dashboard> {
    let params = new HttpParams();
    for (const area of areas) {
      params = params.append('areas', area);
    }
    return this.http.get<Dashboard>(`${this.apiUrl}/dashboard`, { withCredentials: true, params });
  }
}
