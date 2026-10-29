import { DatePipe } from '@angular/common';
import { Component, OnDestroy, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import {
  LucideCalendarClock,
  LucideListChecks,
  LucidePause,
  LucidePlay,
  LucidePlus,
  LucideRepeat,
  LucideSearch,
  LucideUsers,
  LucideX,
} from '@lucide/angular';
import { Subject, Subscription, debounceTime, skip } from 'rxjs';

import { AreaService } from '../../../../core/service/area.service';
import { PermissionService } from '../../../../core/service/permission.service';
import { t } from '../../../../core/i18n/i18n';
import { TranslatePipe } from '../../../../core/i18n/translate.pipe';
import { InfiniteScroll } from '../../../../shared/components/infinite-scroll.directive';
import { ViewSwitch } from '../../../../shared/components/view-switch/view-switch';
import { ListView, storedListView } from '../../../../shared/util/list-view';
import { Page, PagedList, SEARCH_DELAY_MS } from '../../../../shared/util/paged-list';
import { intervalText } from '../../../inspections/data-access/inspection.service';
import {
  Task,
  TaskRunPage,
  TaskRunSummary,
  TaskRunTab,
  TaskService,
} from '../../data-access/task.service';

type Tab = TaskRunTab | 'TASKS';

/** Runs to carry out (mine, open, overdue, completed) and the planned tasks themselves. */
@Component({
  selector: 'app-tasks-page',
  imports: [
    DatePipe,
    FormsModule,
    InfiniteScroll,
    RouterLink,
    TranslatePipe,
    ViewSwitch,
    LucideCalendarClock,
    LucideListChecks,
    LucidePause,
    LucidePlay,
    LucidePlus,
    LucideRepeat,
    LucideSearch,
    LucideUsers,
    LucideX,
  ],
  templateUrl: './tasks-page.html',
  styleUrl: './tasks-page.scss',
})
export class TasksPage implements OnInit, OnDestroy {
  /** overdue runs come first in OPEN, so they need no tab of their own */
  protected readonly runTabs: TaskRunTab[] = ['MINE', 'OPEN', 'COMPLETED'];
  /** the page always starts with all tasks */
  protected tab: Tab = 'TASKS';
  protected search = '';
  protected view: ListView = storedListView('tasks');
  protected loading = false;
  protected error = '';
  protected counts: Record<TaskRunTab, number> = {
    MINE: 0,
    OPEN: 0,
    OVERDUE: 0,
    COMPLETED: 0,
    ALL: 0,
  };
  protected taskCount = 0;
  protected readonly intervalText = intervalText;

  protected readonly runs = new PagedList<TaskRunSummary, TaskRunPage>((page, size) =>
    this.api.runPage(
      {
        q: this.search,
        tab: this.tab === 'TASKS' ? 'ALL' : this.tab,
        areas: this.areaService.selected,
      },
      page,
      size,
    ),
  );
  protected readonly tasks = new PagedList<Task, Page<Task>>((page, size) =>
    this.api.taskPage({ q: this.search, areas: this.areaService.selected }, page, size),
  );

  private readonly searchChanges = new Subject<void>();
  private readonly subscriptions = new Subscription();

  constructor(
    private readonly api: TaskService,
    private readonly router: Router,
    private readonly areaService: AreaService,
    private readonly permissions: PermissionService,
  ) {}

  ngOnInit(): void {
    this.subscriptions.add(
      this.areaService.selected$.pipe(skip(1)).subscribe(() => this.reload(true)),
    );
    this.subscriptions.add(
      this.searchChanges.pipe(debounceTime(SEARCH_DELAY_MS)).subscribe(() => this.reload()),
    );
    this.subscriptions.add(this.runs.loadedPages.subscribe((page) => this.setCounts(page)));
    this.subscriptions.add(
      this.tasks.loadedPages.subscribe((page) => {
        if (!this.search.trim()) {
          this.taskCount = page.total;
        }
      }),
    );
    this.loadCounts();
    this.tasks.reload();
  }

  ngOnDestroy(): void {
    this.subscriptions.unsubscribe();
    this.runs.destroy();
    this.tasks.destroy();
  }

  protected get canCreate(): boolean {
    return this.permissions.can('TASK', 'create');
  }

  protected get showTasks(): boolean {
    return this.tab === 'TASKS';
  }

  protected setTab(tab: Tab): void {
    this.tab = tab;
    this.reload();
  }

  protected onSearchChange(): void {
    this.searchChanges.next();
  }

  protected clearSearch(): void {
    this.search = '';
    this.reload();
  }

  protected tabLabel(tab: TaskRunTab): string {
    return t(`tasks.list.tabs.${tab}`);
  }

  protected open(run: TaskRunSummary): void {
    this.router.navigate(['/tasks', run.uuid]);
  }

  /** Starts the task (or opens its open run). */
  protected start(task: Task): void {
    if (task.openRunUuid) {
      this.router.navigate(['/tasks', task.openRunUuid]);
      return;
    }
    this.api.start(task.uuid).subscribe({
      next: (run) => this.router.navigate(['/tasks', run.uuid]),
      error: () => (this.error = t('tasks.errors.start')),
    });
  }

  protected openTask(task: Task): void {
    this.router.navigate(['/tasks/definitions', task.uuid]);
  }

  /** Share of the checklist that was worked on. */
  protected progress(run: TaskRunSummary): number {
    const { total, pending } = run.counts;
    return total ? Math.round(((total - pending) / total) * 100) : 100;
  }

  protected assigneeText(task: Task): string {
    return task.assignees
      .map((assignee) =>
        assignee.type === 'GROUP'
          ? t('tasks.assigneeGroup', { name: assignee.name })
          : assignee.name,
      )
      .join(', ');
  }

  /** New sidebar areas change the counts; search and tabs only the list. */
  private reload(counts = false): void {
    if (counts) {
      this.loadCounts();
    }
    if (this.showTasks) {
      this.tasks.reload();
    } else {
      this.runs.reload();
    }
  }

  /** Tab counts (one entry is enough). */
  private loadCounts(): void {
    this.api.runPage({ tab: 'ALL', areas: this.areaService.selected }, 0, 1).subscribe({
      next: (page) => this.setCounts(page),
      error: () => (this.error = t('tasks.list.loadError')),
    });
    this.api.taskPage({ areas: this.areaService.selected }, 0, 1).subscribe({
      next: (page) => (this.taskCount = page.total),
      error: () => (this.taskCount = 0),
    });
  }

  private setCounts(page: TaskRunPage): void {
    this.counts = {
      MINE: page.mineCount,
      OPEN: page.openCount,
      OVERDUE: page.overdueCount,
      COMPLETED: page.completedCount,
      ALL: page.openCount + page.completedCount,
    };
  }
}
