import { Component, HostListener, OnInit } from '@angular/core';
import { NavigationEnd, Router, RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';

import { filter } from 'rxjs';

import { AreaSwitcher } from '../../components/area-switcher/area-switcher';
import { ConfirmDialog } from '../../components/confirm-dialog/confirm-dialog';
import { UserEntity } from '../../entities/user.entity';
import { AuthStateService } from '../../service/auth-state.service';
import { PwaService } from '../../service/pwa.service';
import { CustomizationService } from '../../service/customization.service';
import { CommonModule } from '@angular/common';
import {
  LucideAlarmClock,
  LucideBox,
  LucideBoxes,
  LucideCalendarDays,
  LucideChartColumn,
  LucideChevronDown,
  LucideClipboardCheck,
  LucideClipboardList,
  LucideDownload,
  LucideFileText,
  LucideHistory,
  LucideHouse,
  LucideKeyRound,
  LucideLayers,
  LucideMenu,
  LucideMapPin,
  LucideNetwork,
  LucidePalette,
  LucideQrCode,
  LucideSettings,
  LucideShapes,
  LucideShield,
  LucideScanBarcode,
  LucideTags,
  LucideUser,
  LucideUsers,
  LucideX,
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
    LucideChevronDown,
    LucideDownload,
    LucideMenu,
    LucideX,
  ],
  templateUrl: './main-route.html',
  styleUrl: './main-route.scss',
})
export class MainRoute implements OnInit {
  protected user: UserEntity | null = null;
  protected profileImageFailed = false;
  /** Phones and tablets: the navigation is a drawer that slides in. */
  protected menuOpen = false;
  protected currentUrl = '';
  protected readonly expandedGroups = new Set<string>();
  protected readonly navIconInputs = { size: 17 };
  protected readonly primaryNavItems: NavItem[] = [
    { label: 'Dashboard', route: '/dashboard', icon: LucideHouse },
    { label: 'Scannen', route: '/scan', icon: LucideScanBarcode },
    { label: 'Inventar', route: '/assets', icon: LucideBoxes },
    { label: 'Standorte', route: '/locations', icon: LucideMapPin },
    { label: 'Prüfungen', route: '/inspections', icon: LucideClipboardCheck },
    {
      label: 'Konfiguration',
      icon: LucideSettings,
      disabled: false,
      children: [
        { label: 'Tags', route: '/config/tags', icon: LucideTags },
        { label: 'Typen', route: '/config/types', icon: LucideShapes },
        { label: 'Labels', route: '/config/labels', icon: LucideQrCode },
        { label: 'Prüfungsvorlagen', route: '/config/inspection-templates', icon: LucideClipboardList },
      ],
    },
    {
      label: 'Administration',
      icon: LucideUsers,
      disabled: false,
      adminOnly: true,
      children: [
        { label: 'Bereiche', route: '/admin/areas', icon: LucideLayers },
        { label: 'Customization', route: '/admin/customization', icon: LucidePalette },
        { label: 'Benutzer', route: '/admin/users', icon: LucideUser },
        { label: 'Gruppen', route: '/admin/groups', icon: LucideUsers },
        { label: 'Gruppen Berechtigungen', route: '/admin/group-permissions', icon: LucideShield },
        { label: 'LDAP', route: '/admin/ldap', icon: LucideNetwork },
        { label: 'OIDC', route: '/admin/oidc', icon: LucideKeyRound },
        { label: 'Protokoll', route: '/admin/logs', icon: LucideHistory },
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
    protected readonly pwa: PwaService,
    protected readonly customization: CustomizationService,
  ) {}

  ngOnInit(): void {
    this.authStateService.currentUser$.subscribe((user) => {
      this.profileImageFailed = false;
      this.user = user;
    });

    this.currentUrl = this.router.url;
    this.expandActiveGroups();

    this.router.events
      .pipe(filter((event): event is NavigationEnd => event instanceof NavigationEnd))
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
      const child = item.children?.find((entry) => entry.route && this.currentUrl.startsWith(entry.route));
      if (child) {
        return child.label;
      }
    }
    return 'Inventar';
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
