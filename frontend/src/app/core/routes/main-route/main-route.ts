import { Component, ElementRef, HostListener, OnInit, ViewChild } from '@angular/core';
import { DropdownPosition } from '../../components/dropdown-position.directive';
import { AppInfoService } from '../../service/app-info.service';
import { AuthService } from '../../service/auth.service';
import { NavigationEnd, Router, RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';

import { filter } from 'rxjs';

import { AreaSwitcher } from '../../components/area-switcher/area-switcher';
import { ConfirmDialog } from '../../components/confirm-dialog/confirm-dialog';
import { UserEntity } from '../../entities/user.entity';
import { AuthStateService } from '../../service/auth-state.service';
import { PwaService } from '../../service/pwa.service';
import { CustomizationService } from '../../service/customization.service';
import { CommonModule } from '@angular/common';
import { t } from '../../i18n/i18n';
import { TranslatePipe } from '../../i18n/translate.pipe';
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
  LucideEllipsis,
  LucideLogOut,
  LucideExternalLink,
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
    TranslatePipe,
    DropdownPosition,
    LucideEllipsis,
    LucideLogOut,
    LucideExternalLink,
    LucideUser,
  ],
  templateUrl: './main-route.html',
  styleUrl: './main-route.scss',
})
export class MainRoute implements OnInit {
  @ViewChild('userMenu') private userMenu?: ElementRef<HTMLElement>;
  @ViewChild('userMenuTrigger') private userMenuTrigger?: ElementRef<HTMLElement>;
  protected userMenuOpen = false;
  protected loggingOut = false;
  protected logoutError = false;
  protected user: UserEntity | null = null;
  protected profileImageFailed = false;
  /** Phones and tablets: the navigation is a drawer that slides in. */
  protected menuOpen = false;
  protected currentUrl = '';
  protected readonly expandedGroups = new Set<string>();
  protected readonly navIconInputs = { size: 17 };
  protected readonly primaryNavItems: NavItem[] = [
    { label: t('nav.dashboard'), route: '/dashboard', icon: LucideHouse },
    { label: t('nav.scan'), route: '/scan', icon: LucideScanBarcode },
    { label: t('nav.assets'), route: '/assets', icon: LucideBoxes },
    { label: t('nav.locations'), route: '/locations', icon: LucideMapPin },
    { label: t('nav.inspections'), route: '/inspections', icon: LucideClipboardCheck },
    {
      label: t('nav.config'),
      icon: LucideSettings,
      disabled: false,
      children: [
        { label: t('nav.tags'), route: '/config/tags', icon: LucideTags },
        { label: t('nav.types'), route: '/config/types', icon: LucideShapes },
        { label: t('nav.labels'), route: '/config/labels', icon: LucideQrCode },
        { label: t('nav.inspectionTemplates'), route: '/config/inspection-templates', icon: LucideClipboardList },
      ],
    },
    {
      label: t('nav.administration'),
      icon: LucideUsers,
      disabled: false,
      adminOnly: true,
      children: [
        { label: t('nav.areas'), route: '/admin/areas', icon: LucideLayers },
        { label: t('nav.customization'), route: '/admin/customization', icon: LucidePalette },
        { label: t('nav.users'), route: '/admin/users', icon: LucideUser },
        { label: t('nav.groups'), route: '/admin/groups', icon: LucideUsers },
        { label: t('nav.groupPermissions'), route: '/admin/group-permissions', icon: LucideShield },
        { label: t('nav.ldap'), route: '/admin/ldap', icon: LucideNetwork },
        { label: t('nav.oidc'), route: '/admin/oidc', icon: LucideKeyRound },
        { label: t('nav.logs'), route: '/admin/logs', icon: LucideHistory },
      ],
    },
  ];

  protected get visibleNavItems(): NavItem[] {
    const isAdmin = this.user?.role?.toUpperCase() === 'ADMIN';
    return this.primaryNavItems.filter((item) => !item.adminOnly || isAdmin);
  }

  constructor(
    protected readonly appInfo: AppInfoService,
    private readonly auth: AuthService,
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
        this.userMenuOpen = false;
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
    return t('nav.assets');
  }

  @HostListener('document:keydown.escape')
  protected closeMenu(): void {
    if (this.userMenuOpen) this.userMenuTrigger?.nativeElement.focus();
    this.userMenuOpen = false;
    this.menuOpen = false;
  }

  @HostListener('document:pointerdown', ['$event'])
  protected outsideUserMenu(event: PointerEvent): void {
    const target = event.target as Node;
    if (!this.userMenu?.nativeElement.contains(target) && !this.userMenuTrigger?.nativeElement.contains(target)) {
      this.userMenuOpen = false;
    }
  }

  protected logout(): void {
    if (this.loggingOut) return;
    this.loggingOut = true;
    this.logoutError = false;
    this.auth.logout().subscribe({
      next: () => { void this.router.navigate(['/login']); },
      error: () => { this.loggingOut = false; this.logoutError = true; },
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
