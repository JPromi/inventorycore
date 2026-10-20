import { AsyncPipe } from '@angular/common';
import { Component, DestroyRef, ElementRef, HostListener, OnInit, ViewChild } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { NavigationEnd, Router, RouterLink } from '@angular/router';
import { LucideEllipsis, LucideExternalLink, LucideLogOut, LucideUser } from '@lucide/angular';
import { filter } from 'rxjs';

import { DropdownPosition } from '../../../shared/components/dropdown-position.directive';
import { UserEntity } from '../../../core/entities/user.entity';
import { TranslatePipe } from '../../../core/i18n/translate.pipe';
import { AppInfoService } from '../../../core/service/app-info.service';
import { AuthService } from '../../../core/service/auth.service';
import { AuthStateService } from '../../../core/service/auth-state.service';

@Component({
  selector: 'app-user-menu',
  imports: [
    AsyncPipe,
    RouterLink,
    TranslatePipe,
    DropdownPosition,
    LucideEllipsis,
    LucideExternalLink,
    LucideLogOut,
    LucideUser,
  ],
  templateUrl: './user-menu.html',
  styleUrl: './user-menu.scss',
})
export class UserMenu implements OnInit {
  @ViewChild('userMenu') private userMenu?: ElementRef<HTMLElement>;
  @ViewChild('userMenuTrigger') private userMenuTrigger?: ElementRef<HTMLElement>;
  protected userMenuOpen = false;
  protected loggingOut = false;
  protected logoutError = false;
  protected user: UserEntity | null = null;
  protected profileImageFailed = false;

  constructor(
    private readonly destroyRef: DestroyRef,
    protected readonly appInfo: AppInfoService,
    private readonly auth: AuthService,
    private readonly authStateService: AuthStateService,
    private readonly router: Router,
  ) {}

  ngOnInit(): void {
    this.authStateService.currentUser$
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((user) => {
        this.profileImageFailed = false;
        this.user = user;
      });
    this.router.events
      .pipe(
        filter((event) => event instanceof NavigationEnd),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe(() => {
        this.userMenuOpen = false;
      });
  }

  @HostListener('document:keydown.escape')
  protected closeMenu(): void {
    if (this.userMenuOpen) {
      this.userMenuTrigger?.nativeElement.focus();
    }
    this.userMenuOpen = false;
  }

  @HostListener('document:pointerdown', ['$event'])
  protected outsideUserMenu(event: PointerEvent): void {
    const target = event.target as Node;
    if (
      !this.userMenu?.nativeElement.contains(target) &&
      !this.userMenuTrigger?.nativeElement.contains(target)
    ) {
      this.userMenuOpen = false;
    }
  }

  protected logout(): void {
    if (this.loggingOut) {
      return;
    }
    this.loggingOut = true;
    this.logoutError = false;
    this.auth.logout().subscribe({
      next: () => {
        void this.router.navigate(['/login']);
      },
      error: () => {
        this.loggingOut = false;
        this.logoutError = true;
      },
    });
  }
}
