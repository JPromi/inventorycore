import { Component, OnInit } from '@angular/core';
import { NavigationEnd, Router, RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';

import { filter } from 'rxjs';

import { AreaSwitcher } from '../../components/area-switcher/area-switcher';
import { ConfirmDialog } from '../../components/confirm-dialog/confirm-dialog';
import { UserEntity } from '../../entities/user.entity';
import { AuthStateService } from '../../service/auth-state.service';
import { CommonModule } from '@angular/common';
import {
  LucideAlarmClock,
  LucideBox,
  LucideBoxes,
  LucideCalendarDays,
  LucideChartColumn,
  LucideChevronDown,
  LucideClipboardCheck,
  LucideFileText,
  LucideHouse,
  LucideKeyRound,
  LucideLayers,
  LucideMapPin,
  LucideQrCode,
  LucideSettings,
  LucideShapes,
  LucideShield,
  LucideTags,
  LucideUser,
  LucideUsers,
  type LucideIcon,
} from '@lucide/angular';

type NavChild = {
  label: string;
  route?: string;
  icon?: LucideIcon;
};

type NavItem = NavChild & {
  icon?: LucideIcon;
  disabled?: boolean;
  adminOnly?: boolean;
  children?: NavChild[];
  items?: NavChild[];
};

@Component({
  selector: 'app-main-route',
  imports: [
    RouterOutlet,
    CommonModule,
    RouterLink,
    RouterLinkActive,
    ConfirmDialog,
    AreaSwitcher,
    LucideChevronDown
  ],
  templateUrl: './main-route.html',
  styleUrl: './main-route.scss',
})
export class MainRoute implements OnInit {
  protected user: UserEntity | null = null;
  protected currentUrl = '';
  protected readonly expandedGroups = new Set<string>();
  protected readonly navIconInputs = { size: 17 };
  protected readonly primaryNavItems: NavItem[] = [
    { label: 'Dashboard', route: '/dashboard', icon: LucideHouse },
    { label: 'Inventar', route: '/assets', icon: LucideBoxes },
    { label: 'Standorte', route: '/locations', icon: LucideMapPin },
    { label: 'Prüfungen', route: '/reports', icon: LucideClipboardCheck },
    {
      label: 'Konfiguration',
      icon: LucideSettings,
      disabled: false,
      children: [
        { label: 'Standorte', route: '/config/locations', icon: LucideMapPin },
        { label: 'Tags', route: '/config/tags', icon: LucideTags },
        { label: 'Typen', route: '/config/types', icon: LucideShapes },
        { label: 'Labels', route: '/config/labels', icon: LucideQrCode },
        { label: 'Protokolle', route: '/config/reports', icon: LucideClipboardCheck },
      ],
    },
    {
      label: 'Administration',
      icon: LucideUsers,
      disabled: false,
      adminOnly: true,
      children: [
        { label: 'Bereiche', route: '/admin/areas', icon: LucideLayers },
        { label: 'Benutzer', route: '/admin/users', icon: LucideUser },
        { label: 'Gruppen', route: '/admin/groups', icon: LucideUsers },
        { label: 'Gruppen Berechtigungen', route: '/admin/group-permissions', icon: LucideShield },
        { label: 'Authentifizierung', route: '/admin/auth', icon: LucideKeyRound },
      ],
    },
  ];

  protected get visibleNavItems(): NavItem[] {
    const isAdmin = this.user?.role?.toUpperCase() === 'ADMIN';
    return this.primaryNavItems.filter((item) => !item.adminOnly || isAdmin);
  }

  constructor(
    private readonly authStateService: AuthStateService,
    private readonly router: Router,
  ) {}

  ngOnInit(): void {
    this.authStateService.currentUser$.subscribe((user) => {
      this.user = user;
    });

    this.currentUrl = this.router.url;
    this.expandActiveGroups();

    this.router.events
      .pipe(filter((event): event is NavigationEnd => event instanceof NavigationEnd))
      .subscribe((event) => {
        this.currentUrl = event.urlAfterRedirects;
        this.expandActiveGroups();
      });
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
    const items = group.items ?? group.children ?? [];
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
