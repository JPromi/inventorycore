import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { Observable } from 'rxjs';

import { environment } from '../../../../environments/environment';
import { InventoryItem } from '../../inventory/data-access/inventory-api.service';

/** LINK = url to an object, UUID = its id, CODE = inventory id / inventory number / serial number. */
export type ScanMatch = 'LINK' | 'UUID' | 'CODE' | 'NONE';

export interface ScanResult {
  code: string;
  matchedBy: ScanMatch;
  assets: InventoryItem[];
  locations: InventoryItem[];
}

@Injectable({ providedIn: 'root' })
export class ScanService {
  private readonly apiUrl = `${environment.apiUrl}/scan`;

  constructor(private readonly http: HttpClient) {}

  /** Finds the assets or locations a scanned code belongs to (only those the user may see). */
  lookup(code: string): Observable<ScanResult> {
    return this.http.get<ScanResult>(this.apiUrl, {
      params: new HttpParams().set('code', code),
      withCredentials: true,
    });
  }
}
