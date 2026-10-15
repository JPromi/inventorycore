import { Component, EventEmitter, Input, Output } from '@angular/core';
import { LucideLocateFixed, LucideMapPinned } from '@lucide/angular';

import { GeocodingResult, GeocodingService } from '../../service/geocoding.service';
import { LocationMap } from '../location-map/location-map';

/** Address parts and coordinates as entered in the form. */
export interface LocationPosition {
  street?: string | null;
  postalCode?: string | null;
  city?: string | null;
  country?: string | null;
  latitude?: number | null;
  longitude?: number | null;
}

/**
 * Lookups for the position fields of the location form (which stay in the form itself):
 * coordinates from the address, or the address from the coordinates, plus a map preview.
 */
@Component({
  selector: 'app-location-lookup',
  imports: [LocationMap, LucideLocateFixed, LucideMapPinned],
  templateUrl: './location-lookup.html',
  styleUrl: './location-lookup.scss',
})
export class LocationLookup {
  @Input({ required: true }) position!: LocationPosition;
  /** set when the coordinates cannot be saved; no reverse lookup or map then */
  @Input() coordinatesError = '';
  /** a match for the address: take over its coordinates */
  @Output() readonly coordinatesFound = new EventEmitter<GeocodingResult>();
  /** a match for the coordinates: take over its address parts */
  @Output() readonly addressFound = new EventEmitter<GeocodingResult>();

  protected busy: 'search' | 'reverse' | null = null;
  protected message = '';
  protected error = '';
  protected matches: GeocodingResult[] = [];

  constructor(private readonly geocoding: GeocodingService) {}

  protected get query(): string {
    const { street, postalCode, city, country } = this.position;
    return [street, [postalCode, city].filter((part) => part?.trim()).join(' '), country]
      .map((part) => part?.trim())
      .filter(Boolean)
      .join(', ');
  }

  protected get hasCoordinates(): boolean {
    return this.position.latitude != null && this.position.longitude != null && !this.coordinatesError;
  }

  protected findCoordinates(): void {
    const query = this.query;
    if (!query || this.busy) return;
    this.start('search');
    this.geocoding.search(query).subscribe({
      next: (results) => {
        this.busy = null;
        if (!results.length) {
          this.error = 'Zu dieser Adresse wurden keine Koordinaten gefunden.';
        } else if (results.length === 1) {
          this.choose(results[0]);
        } else {
          this.matches = results;
          this.message = 'Mehrere Treffer – bitte den passenden Ort wählen:';
        }
      },
      error: (error) => this.fail(error),
    });
  }

  protected findAddress(): void {
    if (!this.hasCoordinates || this.busy) return;
    this.start('reverse');
    this.geocoding.reverse(this.position.latitude!, this.position.longitude!).subscribe({
      next: (result) => {
        this.busy = null;
        this.addressFound.emit(result);
        this.message = `Adresse übernommen: ${result.label}`;
      },
      error: (error) => this.fail(error, 'Zu diesen Koordinaten wurde keine Adresse gefunden.'),
    });
  }

  protected choose(match: GeocodingResult): void {
    this.matches = [];
    this.coordinatesFound.emit(match);
    this.message = `Koordinaten übernommen: ${match.label}`;
  }

  private start(kind: 'search' | 'reverse'): void {
    this.busy = kind;
    this.error = '';
    this.message = '';
    this.matches = [];
  }

  private fail(error: { status?: number }, notFound = 'Nichts gefunden.'): void {
    this.busy = null;
    this.error = error?.status === 404 ? notFound
      : error?.status === 403 ? 'Keine Berechtigung für die Adresssuche.'
      : 'Der Kartendienst ist gerade nicht erreichbar. Bitte später erneut versuchen.';
  }
}
