import { HttpClient } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { Observable } from 'rxjs';

import { environment } from '../../../environments/environment';

export interface InventoryItem {
  uuid: string;
  name: string;
  description?: string | null;
  invId?: string | null;
  address?: string | null;
  color?: string | null;
  serialNumber?: string | null;
  inventoryNumber?: string | null;
  inspectionIntervalDays?: number | null;
  assetTypeUuid?: string | null;
  fieldDefinitions?: CustomFieldDefinition[];
  fieldValues?: CustomFieldValue[];
  images?: InventoryImage[];
}

export interface InventoryRequest {
  invId?: string;
  name: string;
  description?: string | null;
  address?: string | null;
  color?: string | null;
  serialNumber?: string | null;
  inventoryNumber?: string | null;
  inspectionIntervalDays?: number | null;
  assetTypeUuid?: string | null;
  fieldDefinitions?: CustomFieldDefinition[];
  fieldValues?: CustomFieldValue[];
  images?: InventoryImage[];
}

export type AssetFieldType = 'TEXT' | 'NUMBER' | 'BOOLEAN' | 'DATE' | 'DATETIME' | 'URL' | 'EMAIL' | 'SELECT';
export type ImageKind = 'THUMBNAIL' | 'GALLERY';

export interface CustomFieldDefinition {
  name: string;
  fieldKey?: string | null;
  fieldType: AssetFieldType;
  optionsJson?: string | null;
  required: boolean;
  typeField: boolean;
  sortOrder: number;
}

export interface CustomFieldValue {
  fieldKey?: string | null;
  name: string;
  value?: string | null;
  customAssetField: boolean;
}

export interface InventoryImage {
  kind: ImageKind;
  url: string;
  fileName?: string | null;
  contentType?: string | null;
  sortOrder: number;
}

@Injectable({ providedIn: 'root' })
export class InventoryApiService {
  private readonly apiUrl = environment.apiUrl;

  constructor(private readonly http: HttpClient) {}

  list<T extends InventoryItem>(endpoint: string): Observable<T[]> {
    return this.http.get<T[]>(`${this.apiUrl}/${endpoint}`, { withCredentials: true });
  }

  get<T extends InventoryItem>(endpoint: string, uuid: string): Observable<T> {
    return this.http.get<T>(`${this.apiUrl}/${endpoint}/${uuid}`, { withCredentials: true });
  }

  create<T extends InventoryItem>(endpoint: string, request: InventoryRequest): Observable<T> {
    return this.http.post<T>(`${this.apiUrl}/${endpoint}`, request, { withCredentials: true });
  }

  update<T extends InventoryItem>(endpoint: string, uuid: string, request: InventoryRequest): Observable<T> {
    return this.http.patch<T>(`${this.apiUrl}/${endpoint}/${uuid}`, request, { withCredentials: true });
  }

  delete(endpoint: string, uuid: string): Observable<void> {
    return this.http.delete<void>(`${this.apiUrl}/${endpoint}/${uuid}`, { withCredentials: true });
  }
}
