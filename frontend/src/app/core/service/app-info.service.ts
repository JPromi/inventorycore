import { HttpClient } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { catchError, of, shareReplay } from 'rxjs';
import { environment } from '../../../environments/environment';

export interface AppInfo {
  name: string;
  version: string;
  githubUrl: string;
}

@Injectable({ providedIn: 'root' })
export class AppInfoService {
  readonly info$;

  constructor(http: HttpClient) {
    this.info$ = http.get<AppInfo>(`${environment.apiUrl}/app-info`).pipe(
      catchError(() => of(null)),
      shareReplay({ bufferSize: 1, refCount: false }),
    );
  }
}
