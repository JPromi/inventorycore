import { DatePipe, NgTemplateOutlet } from '@angular/common';
import { Component, DestroyRef, OnInit } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import {
  LucideArrowDown,
  LucideArrowLeft,
  LucideArrowUp,
  LucideExternalLink,
  LucideListChecks,
  LucideMessageSquare,
  LucidePlay,
  LucidePlus,
  LucideSave,
  LucideTrash2,
} from '@lucide/angular';
import { Subject, forkJoin, of } from 'rxjs';
import { catchError, debounceTime, switchMap } from 'rxjs/operators';

import { AreaService } from '../../../../core/service/area.service';
import { PermissionService } from '../../../../core/service/permission.service';
import { t } from '../../../../core/i18n/i18n';
import { TranslateCountPipe, TranslatePipe } from '../../../../core/i18n/translate.pipe';
import { ConfirmDialogService } from '../../../../shared/components/confirm-dialog/confirm-dialog.service';
import { MultiSelect } from '../../../../shared/components/multi-select/multi-select';
import {
  SearchSelect,
  SelectOption,
} from '../../../../shared/components/search-select/search-select';
import { locationPath } from '../../../../shared/util/location-utils';
import {
  INTERVAL_UNITS,
  IntervalUnit,
  intervalText,
} from '../../../inspections/data-access/inspection.service';
import {
  InventoryApiService,
  InventoryItem,
  TagItem,
} from '../../../inventory/data-access/inventory-api.service';
import {
  Task,
  TaskAssigneeOptions,
  TaskAssetFilter,
  TaskPoint,
  TaskPreview,
  TaskRequest,
  TaskRunSummary,
  TaskService,
} from '../../data-access/task.service';

/** ON_DEMAND = started by hand whenever needed; ONCE = due on one date; RECURRING = due every interval. */
export type ScheduleMode = 'ON_DEMAND' | 'ONCE' | 'RECURRING';
/** NONE = the checklist is for the task only; PICK = chosen assets; FILTER = assets of the area matching filters. */
export type AssetMode = 'NONE' | 'PICK' | 'FILTER';
type PointList = 'general' | 'asset';

/** Create or edit a task: assignees, schedule, affected assets and checklist; read only without the right to edit. */
@Component({
  selector: 'app-task-form-page',
  imports: [
    DatePipe,
    FormsModule,
    NgTemplateOutlet,
    RouterLink,
    MultiSelect,
    SearchSelect,
    TranslatePipe,
    TranslateCountPipe,
    LucideArrowDown,
    LucideArrowLeft,
    LucideArrowUp,
    LucideExternalLink,
    LucideListChecks,
    LucideMessageSquare,
    LucidePlay,
    LucidePlus,
    LucideSave,
    LucideTrash2,
  ],
  templateUrl: './task-form-page.html',
  styleUrl: './task-form-page.scss',
})
export class TaskFormPage implements OnInit {
  protected task: Task | null = null;
  protected runs: TaskRunSummary[] = [];

  protected title = '';
  protected description = '';
  protected areaUuid: string | null = null;
  protected active = true;
  protected schedule: ScheduleMode = 'ON_DEMAND';
  protected readonly scheduleModes: ScheduleMode[] = ['ON_DEMAND', 'ONCE', 'RECURRING'];
  protected starting = false;
  protected intervalValue = 10;
  protected intervalUnit: IntervalUnit = 'DAYS';
  protected startDate = today();
  protected assignedUserUuids: string[] = [];
  protected assignedGroupUuids: string[] = [];
  /** points worked on once per run */
  protected generalPoints: TaskPoint[] = [newPoint(false)];
  /** points worked on for every affected asset */
  protected assetPoints: TaskPoint[] = [newPoint(true)];
  /** points whose note field is shown */
  protected openNotes = new Set<TaskPoint>();
  protected assetMode: AssetMode = 'NONE';
  protected readonly assetModes: AssetMode[] = ['NONE', 'PICK', 'FILTER'];
  protected assetUuids: string[] = [];
  protected filter: TaskAssetFilter = emptyFilter();

  protected assigneeOptions: TaskAssigneeOptions = { users: [], groups: [] };
  protected assets: InventoryItem[] = [];
  protected locations: InventoryItem[] = [];
  protected assetTypes: InventoryItem[] = [];
  protected tags: TagItem[] = [];
  protected preview: TaskPreview | null = null;
  protected previewLoading = false;
  protected showPreviewList = false;

  protected readonly intervalUnits = INTERVAL_UNITS;
  protected readonly intervalText = intervalText;
  protected loading = false;
  protected saving = false;
  protected error = '';
  private readonly previewRequests = new Subject<void>();

  constructor(
    private readonly destroyRef: DestroyRef,
    private readonly api: TaskService,
    private readonly inventory: InventoryApiService,
    private readonly areaService: AreaService,
    private readonly permissions: PermissionService,
    private readonly confirm: ConfirmDialogService,
    private readonly route: ActivatedRoute,
    private readonly router: Router,
  ) {}

  ngOnInit(): void {
    this.previewRequests
      .pipe(
        debounceTime(300),
        switchMap(() =>
          this.areaUuid && this.editable && this.assetMode !== 'NONE'
            ? this.api
                .preview(
                  this.areaUuid,
                  this.assetMode === 'PICK' ? this.assetUuids : [],
                  this.assetMode === 'FILTER' ? { ...this.filter } : null,
                )
                .pipe(catchError(() => of(null)))
            : of(null),
        ),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe((preview) => {
        this.preview = preview;
        this.previewLoading = false;
      });

    const uuid = this.route.snapshot.paramMap.get('uuid');
    const optional = <T>(request: ReturnType<InventoryApiService['list']>) =>
      request.pipe(catchError(() => of([] as T[])));
    this.loading = true;
    forkJoin({
      task: uuid ? this.api.task(uuid) : of(null),
      runs: uuid ? this.api.runsOfTask(uuid).pipe(catchError(() => of([]))) : of([]),
      assignees: this.api
        .assignees()
        .pipe(catchError(() => of({ users: [], groups: [] } as TaskAssigneeOptions))),
      assets: optional<InventoryItem>(this.inventory.list('assets')),
      locations: optional<InventoryItem>(this.inventory.list('locations')),
      assetTypes: optional<InventoryItem>(this.inventory.list('asset-types')),
      tags: optional<TagItem>(this.inventory.list('tags')),
      areas: this.areaService.load(),
    })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: ({ task, runs, assignees, assets, locations, assetTypes, tags }) => {
          this.assigneeOptions = assignees;
          this.assets = assets;
          this.locations = locations;
          this.assetTypes = assetTypes;
          this.tags = tags;
          this.runs = runs;
          if (task) {
            this.fill(task);
          } else {
            this.areaUuid =
              this.areaOptions.find((option) => this.areaService.selected.includes(option.value))
                ?.value ??
              this.areaOptions.find((option) => option.value === this.areaService.defaultArea?.uuid)
                ?.value ??
              this.areaOptions[0]?.value ??
              null;
          }
          this.loading = false;
          this.selectionChanged();
        },
        error: () => {
          this.error = t('common.errors.load');
          this.loading = false;
        },
      });
  }

  protected get isNew(): boolean {
    return !this.task;
  }

  /** New tasks need the right to create; existing ones the right to edit. */
  protected get editable(): boolean {
    return this.task ? this.task.canEdit : this.permissions.can('TASK', 'create');
  }

  /** Areas the task can be in: where the user may create (new) or edit tasks; the current one stays. */
  protected get areaOptions(): SelectOption[] {
    return this.areaService.areas
      .filter(
        (area) =>
          area.uuid === this.task?.areaUuid ||
          this.permissions.canInArea('TASK', this.task ? 'edit' : 'create', area.uuid) ||
          (!!this.task && this.permissions.canInArea('TASK', 'create', area.uuid)),
      )
      .map((area) => ({ value: area.uuid, label: area.name, color: area.color }));
  }

  protected get areaName(): string {
    return this.areaOptions.find((option) => option.value === this.areaUuid)?.label ?? '';
  }

  protected get userOptions(): SelectOption[] {
    return this.withKnown(
      this.assigneeOptions.users.map((user) => ({ value: user.uuid, label: user.name })),
      'USER',
    );
  }

  protected get groupOptions(): SelectOption[] {
    return this.withKnown(
      this.assigneeOptions.groups.map((group) => ({ value: group.uuid, label: group.name })),
      'GROUP',
    );
  }

  protected get assetOptions(): SelectOption[] {
    const known = new Map(this.assets.map((asset) => [asset.uuid, asset]));
    const options = this.assets.map((asset) => ({
      value: asset.uuid,
      label: asset.invId ? `${asset.name} · ${asset.invId}` : asset.name,
    }));
    // chosen assets that are not in the list (e.g. not visible) keep their name from the task
    for (const asset of this.task?.assets ?? []) {
      if (!known.has(asset.uuid)) {
        options.push({ value: asset.uuid, label: asset.name });
      }
    }
    return options.sort((a, b) => a.label.localeCompare(b.label));
  }

  protected get locationOptions(): SelectOption[] {
    return this.locations
      .map((location) => ({
        value: location.uuid,
        label: locationPath(this.locations, location),
        hint: location.address ?? undefined,
      }))
      .sort((a, b) => a.label.localeCompare(b.label));
  }

  protected get assetTypeOptions(): SelectOption[] {
    return this.assetTypes
      .map((type) => ({ value: type.uuid, label: type.name }))
      .sort((a, b) => a.label.localeCompare(b.label));
  }

  protected get tagOptions(): SelectOption[] {
    return this.tags
      .map((tag) => ({ value: tag.uuid, label: tag.name, color: tag.color }))
      .sort((a, b) => a.label.localeCompare(b.label));
  }

  protected get openRun(): TaskRunSummary | undefined {
    return this.runs.find((run) => run.status === 'OPEN');
  }

  protected isSet(value: string | null): boolean {
    return !!value;
  }

  protected scheduleLabel(mode: ScheduleMode): string {
    return t(`tasks.form.scheduleMode.${mode}`);
  }

  /** Starts a run now (or opens the one that is open) and goes there. */
  protected startRun(): void {
    const task = this.task;
    if (!task || this.starting) {
      return;
    }
    this.starting = true;
    this.api.start(task.uuid).subscribe({
      next: (run) => this.router.navigate(['/tasks', run.uuid]),
      error: (error) => {
        this.starting = false;
        this.error =
          error?.status === 403 ? t('common.errors.forbidden') : t('tasks.errors.start');
      },
    });
  }

  protected modeLabel(mode: AssetMode): string {
    return t(`tasks.form.assetMode.${mode}`);
  }

  protected setAssetMode(mode: AssetMode): void {
    this.assetMode = mode;
    this.showPreviewList = false;
    this.selectionChanged();
  }

  protected points(list: PointList): TaskPoint[] {
    return list === 'general' ? this.generalPoints : this.assetPoints;
  }

  protected addPoint(list: PointList): void {
    this.setPoints(list, [...this.points(list), newPoint(list === 'asset')]);
  }

  protected removePoint(list: PointList, index: number): void {
    const points = this.points(list).filter((_, position) => position !== index);
    this.setPoints(list, points.length ? points : [newPoint(list === 'asset')]);
  }

  protected movePoint(list: PointList, index: number, offset: number): void {
    const points = [...this.points(list)];
    const target = index + offset;
    if (target < 0 || target >= points.length) {
      return;
    }
    [points[index], points[target]] = [points[target], points[index]];
    this.setPoints(list, points);
  }

  protected toggleNote(point: TaskPoint): void {
    if (this.openNotes.has(point)) {
      this.openNotes.delete(point);
      point.description = null;
    } else {
      this.openNotes.add(point);
    }
  }

  protected selectionChanged(): void {
    this.previewLoading = this.editable && !!this.areaUuid && this.assetMode !== 'NONE';
    this.previewRequests.next();
  }

  protected save(): void {
    if (this.saving || !this.editable) {
      return;
    }
    const named = (points: TaskPoint[]) => points.filter((point) => point.name.trim());
    const assetPoints = this.assetMode === 'NONE' ? [] : named(this.assetPoints);
    const error = !this.title.trim()
      ? 'titleRequired'
      : !this.areaUuid
        ? 'areaRequired'
        : this.schedule === 'RECURRING' && !(this.intervalValue > 0)
          ? 'intervalRequired'
          : this.assetMode === 'PICK' && !this.assetUuids.length
            ? 'assetRequired'
            : this.assetMode !== 'NONE' && !assetPoints.length
              ? 'assetPointRequired'
              : !named(this.generalPoints).length && !assetPoints.length
                ? 'pointRequired'
                : null;
    if (error) {
      this.error = t(`tasks.form.errors.${error}`);
      return;
    }
    const request: TaskRequest = {
      title: this.title.trim(),
      description: this.description.trim() || null,
      areaUuid: this.areaUuid,
      intervalValue: this.schedule === 'RECURRING' ? this.intervalValue : null,
      intervalUnit: this.schedule === 'RECURRING' ? this.intervalUnit : null,
      onDemand: this.schedule === 'ON_DEMAND',
      startDate: this.startDate || today(),
      active: this.active,
      assignedUserUuids: this.assignedUserUuids,
      assignedGroupUuids: this.assignedGroupUuids,
      points: [
        ...named(this.generalPoints).map((point) => ({ ...point, perAsset: false })),
        ...assetPoints.map((point) => ({ ...point, perAsset: true })),
      ],
      assetUuids: this.assetMode === 'PICK' ? this.assetUuids : [],
      filter: this.assetMode === 'FILTER' ? this.filter : null,
    };
    this.saving = true;
    this.error = '';
    const request$ = this.task
      ? this.api.update(this.task.uuid, request)
      : this.api.create(request);
    request$.subscribe({
      next: (task) => {
        this.saving = false;
        // a new task that is due today already has its run: go there
        this.api.runsOfTask(task.uuid).subscribe({
          next: (runs) => {
            const open = runs.find((run) => run.status === 'OPEN');
            if (this.isNew && open) {
              this.router.navigate(['/tasks', open.uuid]);
            } else if (this.isNew) {
              this.router.navigate(['/tasks/definitions', task.uuid], { replaceUrl: true });
            } else {
              this.runs = runs;
              this.fill(task);
            }
          },
          error: () => this.router.navigate(['/tasks']),
        });
      },
      error: (error) => {
        this.saving = false;
        this.error =
          error?.status === 403 ? t('common.errors.forbidden') : t('tasks.form.errors.save');
      },
    });
  }

  protected async remove(): Promise<void> {
    const task = this.task;
    if (!task || !(await this.confirm.confirmDelete(task.title))) {
      return;
    }
    this.api.delete(task.uuid).subscribe({
      next: () => this.router.navigate(['/tasks']),
      error: () => (this.error = t('common.errors.delete')),
    });
  }

  private setPoints(list: PointList, points: TaskPoint[]): void {
    if (list === 'general') {
      this.generalPoints = points;
    } else {
      this.assetPoints = points;
    }
  }

  private fill(task: Task): void {
    this.task = task;
    this.title = task.title;
    this.description = task.description ?? '';
    this.areaUuid = task.areaUuid;
    this.active = task.active;
    this.schedule = task.onDemand ? 'ON_DEMAND' : task.intervalValue ? 'RECURRING' : 'ONCE';
    this.intervalValue = task.intervalValue ?? 10;
    this.intervalUnit = task.intervalUnit ?? 'DAYS';
    this.startDate = task.startDate;
    this.assignedUserUuids = task.assignees
      .filter((assignee) => assignee.type === 'USER')
      .map((assignee) => assignee.uuid);
    this.assignedGroupUuids = task.assignees
      .filter((assignee) => assignee.type === 'GROUP')
      .map((assignee) => assignee.uuid);
    const points = task.points.map((point) => ({ ...point }));
    const general = points.filter((point) => !point.perAsset);
    const perAsset = points.filter((point) => point.perAsset);
    this.generalPoints = general.length ? general : [newPoint(false)];
    this.assetPoints = perAsset.length ? perAsset : [newPoint(true)];
    this.openNotes = new Set(points.filter((point) => point.description));
    this.assetUuids = task.assets.map((asset) => asset.uuid);
    this.filter = task.filter ? { ...task.filter } : emptyFilter();
    this.assetMode = task.filter ? 'FILTER' : task.assets.length || perAsset.length ? 'PICK' : 'NONE';
  }

  /** Assignees of the task stay selectable even if the options could not be loaded (read only). */
  private withKnown(options: SelectOption[], type: 'USER' | 'GROUP'): SelectOption[] {
    for (const assignee of this.task?.assignees ?? []) {
      if (assignee.type === type && !options.some((option) => option.value === assignee.uuid)) {
        options.push({ value: assignee.uuid, label: assignee.name });
      }
    }
    return options;
  }
}

function newPoint(perAsset: boolean): TaskPoint {
  return { uuid: null, name: '', description: null, perAsset };
}

function emptyFilter(): TaskAssetFilter {
  return { locationUuids: [], includeSubLocations: true, tagUuids: [], assetTypeUuids: [] };
}

/** Local date as yyyy-MM-dd. */
function today(): string {
  const now = new Date();
  const pad = (value: number) => String(value).padStart(2, '0');
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}
