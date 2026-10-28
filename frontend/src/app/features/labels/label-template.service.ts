import { HttpClient } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { Observable } from 'rxjs';

import { environment } from '../../../environments/environment';
import { Page, pageParams } from '../../shared/util/paged-list';
import { LabelSettings, LabelTemplate, LabelTemplateRequest } from './label.model';

@Injectable({ providedIn: 'root' })
export class LabelTemplateService {
  private readonly url = `${environment.apiUrl}/label-templates`;
  private readonly options = { withCredentials: true };

  constructor(private readonly http: HttpClient) {}

  /** Searched and paged, grouped by area (default area first). */
  page(query: string, page: number, size: number): Observable<Page<LabelTemplate>> {
    return this.http.get<Page<LabelTemplate>>(`${this.url}/page`, {
      ...this.options,
      params: pageParams({ q: query }, page, size),
    });
  }

  list(): Observable<LabelTemplate[]> {
    return this.http.get<LabelTemplate[]>(this.url, this.options);
  }

  get(uuid: string): Observable<LabelTemplate> {
    return this.http.get<LabelTemplate>(`${this.url}/${uuid}`, this.options);
  }

  create(request: LabelTemplateRequest): Observable<LabelTemplate> {
    return this.http.post<LabelTemplate>(this.url, request, this.options);
  }

  update(uuid: string, request: LabelTemplateRequest): Observable<LabelTemplate> {
    return this.http.patch<LabelTemplate>(`${this.url}/${uuid}`, request, this.options);
  }

  delete(uuid: string): Observable<void> {
    return this.http.delete<void>(`${this.url}/${uuid}`, this.options);
  }

  /** Safe area and label sizes the editor starts with (maintained by admins). */
  settings(): Observable<LabelSettings> {
    return this.http.get<LabelSettings>(`${environment.apiUrl}/label-settings`, this.options);
  }

  saveSettings(settings: LabelSettings): Observable<LabelSettings> {
    return this.http.put<LabelSettings>(
      `${environment.apiUrl}/admin/label-settings`,
      settings,
      this.options,
    );
  }
}
