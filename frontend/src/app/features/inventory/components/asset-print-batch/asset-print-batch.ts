import {
  AfterViewInit,
  Component,
  DestroyRef,
  EventEmitter,
  Input,
  OnInit,
  Output,
  QueryList,
  ViewChildren,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { HttpErrorResponse } from '@angular/common/http';
import {
  catchError,
  forkJoin,
  from,
  map,
  mergeMap,
  Observable,
  of,
  switchMap,
  throwError,
  toArray,
} from 'rxjs';

import { TranslatePipe } from '../../../../core/i18n/translate.pipe';
import { AreaService } from '../../../../core/service/area.service';
import { PermissionService } from '../../../../core/service/permission.service';
import { locationPath } from '../../../../shared/util/location-utils';
import {
  AssetInspection,
  InspectionDue,
  InspectionService,
} from '../../../inspections/data-access/inspection.service';
import { InventoryApiService, InventoryItem } from '../../data-access/inventory-api.service';
import { AssetPrint } from '../../pages/inventory-detail-page/asset-print/asset-print';
import { assetPrintDetails } from '../../util/asset-print-details';

@Component({
  selector: 'app-asset-print-batch',
  imports: [AssetPrint, TranslatePipe],
  templateUrl: './asset-print-batch.html',
})
export class AssetPrintBatch implements OnInit, AfterViewInit {
  @Input({ required: true }) assets: InventoryItem[] = [];
  @Output() readonly closed = new EventEmitter<void>();
  @ViewChildren(AssetPrint) private sheets!: QueryList<AssetPrint>;
  protected loading = true;
  protected failed = false;
  protected models: {
    asset: InventoryItem;
    details: ReturnType<typeof assetPrintDetails>;
    typeName: string | null;
    location: string | null;
    areaNames: string[];
    inspections: AssetInspection[];
    schedules: InspectionDue[];
    parent: InventoryItem | null;
    children: InventoryItem[];
  }[] = [];

  constructor(
    private readonly api: InventoryApiService,
    private readonly inspections: InspectionService,
    private readonly areas: AreaService,
    private readonly permissions: PermissionService,
    private readonly destroyRef: DestroyRef,
  ) {}

  ngOnInit(): void {
    this.load();
  }

  ngAfterViewInit(): void {
    this.sheets.changes.pipe(takeUntilDestroyed(this.destroyRef)).subscribe(() => {
      if (this.sheets.length) {
        setTimeout(() => {
          if (!this.destroyRef.destroyed) {
            const [first, ...rest] = this.sheets.toArray();
            first?.openBatch(rest);
          }
        });
      }
    });
  }

  // Missing permissions omit optional context; operational errors stop the whole print job.
  private optional<T>(request: Observable<T>, empty: T): Observable<T> {
    return request.pipe(
      catchError((error: HttpErrorResponse) =>
        error.status === 403 || error.status === 404 ? of(empty) : throwError(() => error),
      ),
    );
  }

  protected load(): void {
    this.loading = true;
    this.failed = false;
    forkJoin({
      locations: this.permissions.can('LOCATION', 'view')
        ? this.optional(this.api.list<InventoryItem>('locations'), [])
        : of([] as InventoryItem[]),
      types: this.optional(this.api.list<InventoryItem>('asset-types'), []),
      linkedAssets: this.optional(this.api.list<InventoryItem>('assets'), []),
    })
      .pipe(
        switchMap((context) => {
          const types = new Map(context.types.map((type) => [type.uuid, type]));
          const linked = new Map(context.linkedAssets.map((asset) => [asset.uuid, asset]));
          const children = new Map<string, InventoryItem[]>();
          for (const asset of context.linkedAssets) {
            if (asset.parentAssetUuid) {
              const entries = children.get(asset.parentAssetUuid) ?? [];
              entries.push(asset);
              children.set(asset.parentAssetUuid, entries);
            }
          }
          return from(this.assets.map((asset, index) => ({ asset, index }))).pipe(
            mergeMap(
              ({ asset, index }) =>
                this.api.get<InventoryItem>('assets', asset.uuid).pipe(
                  switchMap((full) =>
                    forkJoin({
                      inspections: this.permissions.can('ASSET', 'inspect', full.areaUuids ?? [])
                        ? this.optional(this.inspections.inspectionsOfAsset(full.uuid), [])
                        : of([] as AssetInspection[]),
                      schedules: this.optional(this.inspections.schedulesOfAsset(full.uuid), []),
                    }).pipe(
                      map((inspectionData) => {
                        const type = types.get(full.assetTypeUuid ?? '') ?? null;
                        const location = context.locations.find(
                          (entry) => entry.uuid === full.locationUuid,
                        );
                        return {
                          index,
                          model: {
                            asset: {
                              ...full,
                              images: [...(full.images ?? [])].sort((a, b) =>
                                a.kind === b.kind
                                  ? a.sortOrder - b.sortOrder
                                  : a.kind === 'THUMBNAIL'
                                    ? -1
                                    : 1,
                              ),
                            },
                            details: assetPrintDetails(full, type),
                            typeName: type?.name ?? null,
                            location: location ? locationPath(context.locations, location) : null,
                            areaNames: (full.areaUuids ?? []).map((uuid) => this.areas.name(uuid)),
                            ...inspectionData,
                            parent: linked.get(full.parentAssetUuid ?? '') ?? null,
                            children: children.get(full.uuid) ?? [],
                          },
                        };
                      }),
                    ),
                  ),
                ),
              4,
            ),
            toArray(),
            map((results) =>
              results.sort((a, b) => a.index - b.index).map((result) => result.model),
            ),
          );
        }),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe({
        next: (models) => {
          this.models = models;
          this.loading = false;
        },
        error: () => {
          this.failed = true;
          this.loading = false;
        },
      });
  }
}
