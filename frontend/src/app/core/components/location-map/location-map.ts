import { AfterViewInit, Component, ElementRef, Input, NgZone, OnChanges, OnDestroy, ViewChild, ViewEncapsulation } from '@angular/core';
import { LucideExternalLink } from '@lucide/angular';
import type * as Leaflet from 'leaflet';

import { t } from '../../i18n/i18n';
import { TranslatePipe } from '../../i18n/translate.pipe';

const ZOOM = 16;
/** Coordinates typed into a form: move the map only after a short pause. */
const SETTLE_MS = 700;
const TILES = 'https://tile.openstreetmap.org/{z}/{x}/{y}.png';

/**
 * OpenStreetMap with a marker, drawn with Leaflet (loaded on demand). New coordinates move the
 * marker and the view; nothing else (titles, other form fields) touches the map.
 */
@Component({
  selector: 'app-location-map',
  imports: [TranslatePipe, LucideExternalLink],
  templateUrl: './location-map.html',
  styleUrl: './location-map.scss',
  // Leaflet builds its own DOM; the styles are scoped by .location-map instead
  encapsulation: ViewEncapsulation.None,
  host: { class: 'location-map' },
})
export class LocationMap implements AfterViewInit, OnChanges, OnDestroy {
  @Input({ required: true }) latitude!: number;
  @Input({ required: true }) longitude!: number;
  @Input() title = t('terms.location');
  /** false while the coordinates are being typed (form preview): wait for a pause before showing them */
  @Input() immediate = true;

  @ViewChild('map', { static: true }) private element!: ElementRef<HTMLElement>;

  /** coordinates the map currently shows */
  protected shown: { latitude: number; longitude: number } | null = null;
  private map?: Leaflet.Map;
  private marker?: Leaflet.Marker;
  private timer?: ReturnType<typeof setTimeout>;
  private resize?: ResizeObserver;
  private destroyed = false;

  constructor(private readonly zone: NgZone) {}

  protected get linkUrl(): string {
    if (!this.shown) return '';
    const lat = this.shown.latitude.toFixed(6);
    const lon = this.shown.longitude.toFixed(6);
    return `https://www.openstreetmap.org/?mlat=${lat}&mlon=${lon}#map=17/${lat}/${lon}`;
  }

  ngAfterViewInit(): void {
    this.schedule(this.immediate ? 0 : SETTLE_MS);
  }

  ngOnChanges(): void {
    if (this.shown) {
      this.schedule(SETTLE_MS);
    }
  }

  ngOnDestroy(): void {
    this.destroyed = true;
    clearTimeout(this.timer);
    this.resize?.disconnect();
    this.map?.remove();
  }

  private schedule(delay: number): void {
    clearTimeout(this.timer);
    if (this.shown?.latitude === this.latitude && this.shown?.longitude === this.longitude) {
      return;
    }
    this.timer = setTimeout(() => void this.show(), delay);
  }

  private async show(): Promise<void> {
    const position: [number, number] = [this.latitude, this.longitude];
    if (!this.map) {
      const L = await import('leaflet');
      if (this.destroyed || this.map) return;
      this.zone.runOutsideAngular(() => this.create(L, position));
    } else {
      this.zone.runOutsideAngular(() => {
        this.marker!.setLatLng(position);
        this.map!.setView(position, this.map!.getZoom());
      });
    }
    this.shown = { latitude: position[0], longitude: position[1] };
  }

  private create(L: typeof Leaflet, position: [number, number]): void {
    const map = L.map(this.element.nativeElement, {
      scrollWheelZoom: false,
      // one finger scrolls the page on phones; dragging the map needs a desktop pointer
      dragging: !L.Browser.mobile,
    });
    map.attributionControl.setPrefix(false);
    L.tileLayer(TILES, { maxZoom: 19, attribution: '© OpenStreetMap' }).addTo(map);
    this.marker = L.marker(position, {
      icon: L.divIcon({ className: 'location-map-marker', iconSize: [18, 18] }),
      keyboard: false,
      title: this.title,
    }).addTo(map);
    map.setView(position, ZOOM);
    this.map = map;
    // the container can change size (cards, dialogs, phones)
    this.resize = new ResizeObserver(() => map.invalidateSize());
    this.resize.observe(this.element.nativeElement);
  }
}
