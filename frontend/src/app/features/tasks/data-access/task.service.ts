import { HttpClient } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { Observable } from 'rxjs';

import { environment } from '../../../../environments/environment';
import { Page, pageParams } from '../../../shared/util/paged-list';
import { IntervalUnit } from '../../inspections/data-access/inspection.service';

export type TaskRunStatus = 'OPEN' | 'COMPLETED';
/** Result of one checklist point: not worked on yet, done, or not done. */
export type TaskEntryStatus = 'PENDING' | 'DONE' | 'NOT_DONE';
/** Tabs of the run list; MINE = open runs assigned to the current user. */
export type TaskRunTab = 'MINE' | 'OPEN' | 'OVERDUE' | 'COMPLETED' | 'ALL';

/** Assets of the task's area that match every given criterion (like the inspection filters). */
export interface TaskAssetFilter {
  locationUuids: string[];
  includeSubLocations: boolean;
  tagUuids: string[];
  assetTypeUuids: string[];
}

export interface TaskPoint {
  uuid: string | null;
  name: string;
  description: string | null;
  /** worked on once per affected asset; otherwise once per run */
  perAsset: boolean;
}

export interface TaskAssignee {
  type: 'USER' | 'GROUP';
  uuid: string;
  name: string;
}

export interface TaskAssigneeOptions {
  users: TaskAssignee[];
  groups: TaskAssignee[];
}

export interface TaskAsset {
  uuid: string;
  name: string;
  invId: string | null;
  assetTypeName: string | null;
  locationName: string | null;
}

/**
 * `onDemand` = no schedule, started by hand whenever needed; otherwise `intervalValue`/`intervalUnit`
 * null = once on `startDate`. `filter` null = only the chosen assets.
 */
export interface TaskRequest {
  title: string;
  description: string | null;
  areaUuid: string | null;
  intervalValue: number | null;
  intervalUnit: IntervalUnit | null;
  startDate: string;
  active: boolean;
  assignedUserUuids: string[];
  assignedGroupUuids: string[];
  points: TaskPoint[];
  assetUuids: string[];
  filter: TaskAssetFilter | null;
  onDemand: boolean;
}

export interface Task {
  uuid: string;
  title: string;
  description: string | null;
  areaUuid: string;
  areaName: string;
  intervalValue: number | null;
  intervalUnit: IntervalUnit | null;
  startDate: string;
  nextDueDate: string | null;
  onDemand: boolean;
  active: boolean;
  assignees: TaskAssignee[];
  points: TaskPoint[];
  /** individually chosen assets the reader may see */
  assets: TaskAsset[];
  filter: TaskAssetFilter | null;
  scopeSummary: string;
  openRunUuid: string | null;
  lastCompletedAt: string | null;
  runCount: number;
  createdAt: string;
  createdByName: string | null;
  assignedToMe: boolean;
  /** may start a run now */
  canStart: boolean;
  canEdit: boolean;
  canDelete: boolean;
}

export interface TaskPreview {
  count: number;
  assets: TaskAsset[];
}

export interface TaskRunCounts {
  total: number;
  done: number;
  notDone: number;
  pending: number;
}

export interface TaskRunSummary {
  uuid: string;
  taskUuid: string | null;
  title: string;
  areaUuid: string;
  areaName: string;
  dueDate: string;
  status: TaskRunStatus;
  overdue: boolean;
  recurring: boolean;
  assigneeNames: string | null;
  assignedToMe: boolean;
  scopeSummary: string | null;
  assetCount: number;
  counts: TaskRunCounts;
  createdAt: string;
  completedAt: string | null;
  completedByName: string | null;
  canDelete: boolean;
}

export interface TaskRunEntry {
  uuid: string;
  pointUuid: string;
  pointName: string;
  pointDescription: string | null;
  /** null for points of the whole run */
  assetUuid: string | null;
  assetName: string | null;
  invId: string | null;
  assetTypeName: string | null;
  locationName: string | null;
  /** the reader may open the asset */
  assetVisible: boolean;
  status: TaskEntryStatus;
  comment: string | null;
  checkedAt: string | null;
  checkedByName: string | null;
}

export interface TaskRunDetail {
  summary: TaskRunSummary;
  description: string | null;
  comment: string | null;
  /** may set results and complete */
  canWork: boolean;
  /** completed, and the reader may start its task again */
  canRestart: boolean;
  entries: TaskRunEntry[];
}

export interface TaskRunPage extends Page<TaskRunSummary> {
  mineCount: number;
  openCount: number;
  overdueCount: number;
  completedCount: number;
}

@Injectable({ providedIn: 'root' })
export class TaskService {
  private readonly apiUrl = environment.apiUrl;
  private readonly options = { withCredentials: true };

  constructor(private readonly http: HttpClient) {}

  taskPage(
    filter: { q?: string; areas?: string[] },
    page: number,
    size: number,
  ): Observable<Page<Task>> {
    return this.http.get<Page<Task>>(`${this.apiUrl}/tasks/page`, {
      ...this.options,
      params: pageParams(filter, page, size),
    });
  }

  task(uuid: string): Observable<Task> {
    return this.http.get<Task>(`${this.apiUrl}/tasks/${uuid}`, this.options);
  }

  runsOfTask(uuid: string): Observable<TaskRunSummary[]> {
    return this.http.get<TaskRunSummary[]>(`${this.apiUrl}/tasks/${uuid}/runs`, this.options);
  }

  assignees(): Observable<TaskAssigneeOptions> {
    return this.http.get<TaskAssigneeOptions>(`${this.apiUrl}/tasks/assignees`, this.options);
  }

  /** Assets a task with this selection would currently include. */
  preview(
    areaUuid: string,
    assetUuids: string[],
    filter: TaskAssetFilter | null,
  ): Observable<TaskPreview> {
    return this.http.post<TaskPreview>(
      `${this.apiUrl}/tasks/preview`,
      { areaUuid, assetUuids, filter },
      this.options,
    );
  }

  /** Starts the task now; answers with the open run if there already is one. */
  start(uuid: string): Observable<TaskRunSummary> {
    return this.http.post<TaskRunSummary>(`${this.apiUrl}/tasks/${uuid}/runs`, {}, this.options);
  }

  create(request: TaskRequest): Observable<Task> {
    return this.http.post<Task>(`${this.apiUrl}/tasks`, request, this.options);
  }

  update(uuid: string, request: TaskRequest): Observable<Task> {
    return this.http.put<Task>(`${this.apiUrl}/tasks/${uuid}`, request, this.options);
  }

  delete(uuid: string): Observable<void> {
    return this.http.delete<void>(`${this.apiUrl}/tasks/${uuid}`, this.options);
  }

  runPage(
    filter: { q?: string; tab?: TaskRunTab; areas?: string[] },
    page: number,
    size: number,
  ): Observable<TaskRunPage> {
    return this.http.get<TaskRunPage>(`${this.apiUrl}/task-runs/page`, {
      ...this.options,
      params: pageParams(filter, page, size),
    });
  }

  run(uuid: string): Observable<TaskRunDetail> {
    return this.http.get<TaskRunDetail>(`${this.apiUrl}/task-runs/${uuid}`, this.options);
  }

  /** `status` null = unchanged; `comment` null = unchanged, empty clears. */
  updateEntry(
    runUuid: string,
    entryUuid: string,
    change: { status?: TaskEntryStatus | null; comment?: string | null },
  ): Observable<TaskRunEntry> {
    return this.http.patch<TaskRunEntry>(
      `${this.apiUrl}/task-runs/${runUuid}/entries/${entryUuid}`,
      { status: change.status ?? null, comment: change.comment ?? null },
      this.options,
    );
  }

  complete(uuid: string, comment: string): Observable<TaskRunDetail> {
    return this.http.post<TaskRunDetail>(
      `${this.apiUrl}/task-runs/${uuid}/complete`,
      { comment },
      this.options,
    );
  }

  deleteRun(uuid: string): Observable<void> {
    return this.http.delete<void>(`${this.apiUrl}/task-runs/${uuid}`, this.options);
  }
}
