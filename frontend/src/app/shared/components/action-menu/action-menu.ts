import { NgComponentOutlet } from '@angular/common';
import { Component, ElementRef, HostListener, Input, ViewChild } from '@angular/core';
import { LucideEllipsis, type LucideIcon } from '@lucide/angular';
import { TranslatePipe } from '../../../core/i18n/translate.pipe';
import { DropdownPosition } from '../dropdown-position.directive';

export interface MenuAction {
  id: string;
  label: string;
  icon: LucideIcon;
  danger?: boolean;
  run: () => void;
}

@Component({
  selector: 'app-action-menu',
  imports: [NgComponentOutlet, LucideEllipsis, TranslatePipe, DropdownPosition],
  templateUrl: './action-menu.html',
  styleUrl: './action-menu.scss',
})
export class ActionMenu {
  @Input({ required: true }) actions: MenuAction[] = [];
  @ViewChild('trigger') private trigger?: ElementRef<HTMLButtonElement>;
  @ViewChild('panel') private set panel(value: ElementRef<HTMLElement> | undefined) {
    this.menu = value;
  }
  protected open = false;
  protected readonly iconInputs = { size: 17 };
  private menu?: ElementRef<HTMLElement>;

  protected focusFirst(): void {
    if (this.open) {
      this.menu?.nativeElement.querySelector<HTMLButtonElement>('button')?.focus();
    }
  }

  protected choose(action: MenuAction): void {
    this.close();
    action.run();
  }

  @HostListener('document:pointerdown', ['$event'])
  protected outside(event: PointerEvent): void {
    if (!this.open) {
      return;
    }
    const target = event.target as Node;
    if (
      !this.menu?.nativeElement.contains(target) &&
      !this.trigger?.nativeElement.contains(target)
    ) {
      this.open = false;
    }
  }

  protected key(event: KeyboardEvent): void {
    if (event.key === 'Escape') {
      event.stopPropagation();
      event.preventDefault();
      this.close();
      return;
    }
    const buttons = Array.from(
      this.menu?.nativeElement.querySelectorAll<HTMLButtonElement>('button') ?? [],
    );
    const current = buttons.indexOf(event.target as HTMLButtonElement);
    let index: number;
    if (event.key === 'ArrowDown') {
      index = (current + 1) % buttons.length;
    } else if (event.key === 'ArrowUp') {
      index = (current - 1 + buttons.length) % buttons.length;
    } else if (event.key === 'Home') {
      index = 0;
    } else if (event.key === 'End') {
      index = buttons.length - 1;
    } else if (event.key === 'Tab') {
      this.close();
      return;
    } else {
      return;
    }
    event.preventDefault();
    buttons[index]?.focus();
  }

  private close(): void {
    this.open = false;
    this.trigger?.nativeElement.focus();
  }
}
