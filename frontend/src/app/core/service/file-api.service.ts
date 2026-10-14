import { HttpClient, HttpEvent } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { Observable } from 'rxjs';

import { environment } from '../../../environments/environment';

/** Metadata of an uploaded file. `url` and `thumbnailUrl` can be used directly as image source. */
export interface StoredFileInfo {
  uuid: string;
  url: string;
  thumbnailUrl: string;
  originalName?: string | null;
  contentType: string;
  size: number;
  originalSize: number;
  width?: number | null;
  height?: number | null;
  uploadedAt: string;
  uploadedByUuid?: string | null;
  uploadedByName?: string | null;
}

/** Same limits as the backend (spring.servlet.multipart.max-file-size). */
export const MAX_UPLOAD_BYTES = 25 * 1024 * 1024;
export const ACCEPTED_IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/gif', 'image/webp', 'image/bmp', 'image/tiff'];

@Injectable({ providedIn: 'root' })
export class FileApiService {
  private readonly apiUrl = `${environment.apiUrl}/files`;

  constructor(private readonly http: HttpClient) {}

  /** Uploads one image; the events report the upload progress. */
  uploadImage(file: File): Observable<HttpEvent<StoredFileInfo>> {
    const body = new FormData();
    body.append('file', file, file.name);
    return this.http.post<StoredFileInfo>(this.apiUrl, body, {
      withCredentials: true,
      reportProgress: true,
      observe: 'events',
    });
  }

  info(uuid: string): Observable<StoredFileInfo> {
    return this.http.get<StoredFileInfo>(`${this.apiUrl}/${uuid}/info`, { withCredentials: true });
  }
}
