import { HttpClient } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { Observable } from 'rxjs';

import { environment } from '../../../../environments/environment';
import { Page, pageParams } from '../../../shared/util/paged-list';
import type { LocationType } from '../../../shared/util/location-types';
import { t } from '../../../core/i18n/i18n';
import type { AssetStatus } from '../../asset-statuses/data-access/asset-status.service';

export interface InventoryItem {
  inspectionPolicy?: AssetInspectionPolicy;
  uuid: string;
  name: string;
  description?: string | null;
  invId?: string | null;
  address?: string | null;
  /** locations: fixed kind, decides the icon */
  locationType?: LocationType | null;
  /** locations: parts of the address; `address` is formatted from them */
  street?: string | null;
  postalCode?: string | null;
  city?: string | null;
  country?: string | null;
  /** WGS 84, locations only; both set or both null */
  latitude?: number | null;
  longitude?: number | null;
  color?: string | null;
  serialNumber?: string | null;
  inventoryNumber?: string | null;
  inspectionIntervalDays?: number | null;
  assetTypeUuid?: string | null;
  locationUuid?: string | null;
  parentLocationUuid?: string | null;
  parentAssetUuid?: string | null;
  parentAssetNote?: string | null;
  fieldDefinitions?: CustomFieldDefinition[];
  fieldValues?: CustomFieldValue[];
  images?: InventoryImage[];
  tags?: TagItem[];
  childLocationUuids?: string[];
  assetUuids?: string[];
  createdAt?: string | null;
  areaUuids?: string[];
  /** assets: current status; the history is loaded separately */
  status?: AssetStatus | null;
  statusChangedAt?: string | null;
}

export interface InventoryRequest {
  inspectionPolicy?: AssetInspectionPolicy;
  parentAssetUuid?: string | null;
  parentAssetNote?: string | null;
  invId?: string;
  name: string;
  description?: string | null;
  address?: string | null;
  /** locations: fixed kind, decides the icon */
  locationType?: LocationType | null;
  /** locations: parts of the address; `address` is formatted from them */
  street?: string | null;
  postalCode?: string | null;
  city?: string | null;
  country?: string | null;
  /** WGS 84, locations only; both set or both null */
  latitude?: number | null;
  longitude?: number | null;
  color?: string | null;
  serialNumber?: string | null;
  inventoryNumber?: string | null;
  inspectionIntervalDays?: number | null;
  assetTypeUuid?: string | null;
  locationUuid?: string | null;
  parentLocationUuid?: string | null;
  fieldDefinitions?: CustomFieldDefinition[];
  fieldValues?: CustomFieldValue[];
  images?: InventoryImage[];
  tagUuids?: string[];
  areaUuids?: string[];
  /** assets: new status (null keeps it) and the comment for its history */
  statusUuid?: string | null;
  statusComment?: string | null;
}

export type AssetFieldType =
  'TEXT' | 'NUMBER' | 'BOOLEAN' | 'DATE' | 'DATETIME' | 'URL' | 'EMAIL' | 'SELECT';
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
  /** Uploaded file (see FileApiService); null for images that only have an external url. */
  fileUuid?: string | null;
  /** Full size image; for uploads the file endpoint. */
  url?: string | null;
  /** Small preview, falls back to `url`. */
  thumbnailUrl?: string | null;
  fileName?: string | null;
  contentType?: string | null;
  sortOrder: number;
}

export interface TagItem {
  uuid: string;
  name: string;
  color?: string | null;
}

export type AssetInspectionPolicy = 'STANDARD' | 'MANUAL' | 'EXCLUDED';

export const ASSET_INSPECTION_POLICIES: Record<AssetInspectionPolicy, string> = {
  STANDARD: t('services.inspectionPolicies.STANDARD'),
  MANUAL: t('services.inspectionPolicies.MANUAL'),
  EXCLUDED: t('services.inspectionPolicies.EXCLUDED'),
};

@Injectable({ providedIn: 'root' })
export class InventoryApiService {
  private readonly apiUrl = environment.apiUrl;

  constructor(private readonly http: HttpClient) {}

  list<T extends InventoryItem>(endpoint: string): Observable<T[]> {
    return this.http.get<T[]>(`${this.apiUrl}/${endpoint}`, { withCredentials: true });
  }

  /** One searched page of a list (`/{endpoint}/page`); see the backend list controllers for the filters. */
  page<T>(
    endpoint: string,
    filter: Record<string, string | string[] | null | undefined>,
    page: number,
    size: number,
  ): Observable<Page<T>> {
    return this.http.get<Page<T>>(`${this.apiUrl}/${endpoint}/page`, {
      withCredentials: true,
      params: pageParams(filter, page, size),
    });
  }

  get<T extends InventoryItem>(endpoint: string, uuid: string): Observable<T> {
    return this.http.get<T>(`${this.apiUrl}/${endpoint}/${uuid}`, { withCredentials: true });
  }

  create<T extends InventoryItem>(endpoint: string, request: InventoryRequest): Observable<T> {
    return this.http.post<T>(`${this.apiUrl}/${endpoint}`, request, { withCredentials: true });
  }

  update<T extends InventoryItem>(
    endpoint: string,
    uuid: string,
    request: InventoryRequest,
  ): Observable<T> {
    return this.http.patch<T>(`${this.apiUrl}/${endpoint}/${uuid}`, request, {
      withCredentials: true,
    });
  }

  delete(endpoint: string, uuid: string): Observable<void> {
    return this.http.delete<void>(`${this.apiUrl}/${endpoint}/${uuid}`, { withCredentials: true });
  }
}
