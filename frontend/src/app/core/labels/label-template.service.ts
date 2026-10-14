import { HttpClient } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { Observable } from 'rxjs';

import { environment } from '../../../environments/environment';
import { LabelTemplate, LabelTemplateRequest } from './label.model';

@Injectable({ providedIn: 'root' })
export class LabelTemplateService {
  private readonly url = `${environment.apiUrl}/label-templates`;
  private readonly options = { withCredentials: true };

  constructor(private readonly http: HttpClient) {}

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
}
