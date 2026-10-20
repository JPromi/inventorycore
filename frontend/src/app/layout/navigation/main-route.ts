import { Component, DestroyRef, HostListener, OnInit } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { NavChild, NavItem, PRIMARY_NAV_ITEMS } from './navigation.config';
import { UserMenu } from './user-menu/user-menu';
import { NavigationEnd, Router, RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';

import { filter } from 'rxjs';

import { AreaSwitcher } from '../../shared/components/area-switcher/area-switcher';
import { ConfirmDialog } from '../../shared/components/confirm-dialog/confirm-dialog';
import { UserEntity } from '../../core/entities/user.entity';
import { AuthStateService } from '../../core/service/auth-state.service';
import { PermissionService } from '../../core/service/permission.service';
import { PwaService } from '../../core/service/pwa.service';
import { CustomizationService } from '../../core/service/customization.service';
import { CommonModule } from '@angular/common';
import { t } from '../../core/i18n/i18n';
import { TranslatePipe } from '../../core/i18n/translate.pipe';
import { LucideChevronDown, LucideDownload, LucideMenu, LucideX } from '@lucide/angular';

@Component({
  selector: 'app-main-route',
  imports: [
    RouterOutlet,
    CommonModule,
    RouterLink,
    RouterLinkActive,
    ConfirmDialog,
    AreaSwitcher,
    LucideChevronDown,
    LucideDownload,
    LucideMenu,
    LucideX,
    TranslatePipe,
    UserMenu,
  ],
  templateUrl: './main-route.html',
  styleUrl: './main-route.scss',
})
export class MainRoute implements OnInit {
  private user: UserEntity | null = null;
  /** Phones and tablets: the navigation is a drawer that slides in. */
  protected menuOpen = false;
  protected currentUrl = '';
  protected readonly expandedGroups = new Set<string>();
  protected readonly navIconInputs = { size: 17 };
  protected readonly primaryNavItems = PRIMARY_NAV_ITEMS;

  protected get visibleNavItems(): NavItem[] {
    const isAdmin = this.user?.role?.toUpperCase() === 'ADMIN';
    return this.primaryNavItems.filter(
      (item) =>
        (!item.adminOnly || isAdmin) && (!item.configOnly || this.permissions.canConfigure),
    );
  }

  constructor(
    private readonly destroyRef: DestroyRef,
    private readonly authStateService: AuthStateService,
    private readonly router: Router,
    protected readonly pwa: PwaService,
    protected readonly customization: CustomizationService,
    private readonly permissions: PermissionService,
  ) {}

  ngOnInit(): void {
    this.authStateService.currentUser$
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((user) => {
        this.user = user;
      });

    this.currentUrl = this.router.url;
    this.expandActiveGroups();

    this.router.events
      .pipe(
        filter((event): event is NavigationEnd => event instanceof NavigationEnd),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe((event) => {
        this.currentUrl = event.urlAfterRedirects;
        this.expandActiveGroups();
        // a link was chosen: close the drawer
        this.menuOpen = false;
      });
  }

  /** Title of the current section for the mobile top bar. */
  protected get currentTitle(): string {
    for (const item of this.visibleNavItems) {
      if (item.route && this.currentUrl.startsWith(item.route)) {
        return item.label;
      }
      const child = item.children?.find(
        (entry) => entry.route && this.currentUrl.startsWith(entry.route),
      );
      if (child) {
        return child.label;
      }
    }
    return t('nav.assets');
  }

  @HostListener('document:keydown.escape')
  protected closeMenu(): void {
    this.menuOpen = false;
  }

  protected toggleGroup(groupLabel: string): void {
    if (this.expandedGroups.has(groupLabel)) {
      this.expandedGroups.delete(groupLabel);
      return;
    }

    this.expandedGroups.add(groupLabel);
  }

  protected isGroupExpanded(group: NavItem): boolean {
    return this.expandedGroups.has(group.label) || this.isGroupActive(group);
  }

  protected isGroupActive(group: NavItem): boolean {
    const items = group.children ?? [];
    return items.some((item) => item.route && this.currentUrl.startsWith(item.route));
  }

  protected isItemActive(item: NavChild): boolean {
    return !!item.route && this.currentUrl.startsWith(item.route);
  }

  private expandActiveGroups(): void {
    [...this.primaryNavItems]
      .filter((group) => this.isGroupActive(group))
      .forEach((group) => this.expandedGroups.add(group.label));
  }
}
