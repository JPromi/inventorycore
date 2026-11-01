import { HttpClient, HttpEvent } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { defer, from, Observable, switchMap } from 'rxjs';
import { prepareImage } from './prepare-image';
export { ACCEPTED_IMAGE_TYPES, isAcceptedImage } from './prepare-image';

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

@Injectable({ providedIn: 'root' })
export class FileApiService {
  private readonly apiUrl = `${environment.apiUrl}/files`;
  // Decode one full-resolution phone photo at a time to limit mobile memory use.
  private preparation: Promise<unknown> = Promise.resolve();

  constructor(private readonly http: HttpClient) {}

  /** Uploads one image; the events report the upload progress. */
  uploadImage(file: File): Observable<HttpEvent<StoredFileInfo>> {
    return defer(() => {
      const prepared = this.preparation.then(() => prepareImage(file));
      this.preparation = prepared.catch(() => undefined);
      return from(prepared).pipe(switchMap(image => {
        const body = new FormData();
        body.append('file', image, image.name);
        return this.http.post<StoredFileInfo>(this.apiUrl, body, {
          withCredentials: true,
          reportProgress: true,
          observe: 'events',
        });
      }));
    });
  }

  info(uuid: string): Observable<StoredFileInfo> {
    return this.http.get<StoredFileInfo>(`${this.apiUrl}/${uuid}/info`, { withCredentials: true });
  }
}
