import { HttpClient } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { Observable } from 'rxjs';

import { environment } from '../../../environments/environment';

/** A place from the geocoder (Nominatim through the backend). */
export interface GeocodingResult {
  /** short postal address for the address field */
  address: string;
  /** full name, to tell several matches apart */
  label: string;
  street: string | null;
  postalCode: string | null;
  city: string | null;
  country: string | null;
  latitude: number;
  longitude: number;
}

@Injectable({ providedIn: 'root' })
export class GeocodingService {
  private readonly url = `${environment.apiUrl}/geocoding`;
  private readonly options = { withCredentials: true };

  constructor(private readonly http: HttpClient) {}

  search(address: string): Observable<GeocodingResult[]> {
    return this.http.get<GeocodingResult[]>(`${this.url}/search`, { ...this.options, params: { q: address } });
  }

  reverse(latitude: number, longitude: number): Observable<GeocodingResult> {
    return this.http.get<GeocodingResult>(`${this.url}/reverse`, { ...this.options, params: { lat: latitude, lon: longitude } });
  }
}
