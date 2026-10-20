import { AsyncPipe } from '@angular/common';
import { Component, ElementRef, HostListener, OnInit } from '@angular/core';
import { LucideCheck, LucideChevronsUpDown, LucideLayers } from '@lucide/angular';

import { t, tn } from '../../../core/i18n/i18n';
import { TranslatePipe } from '../../../core/i18n/translate.pipe';
import { AreaItem, AreaService } from '../../../core/service/area.service';
import { DropdownPosition } from '../dropdown-position.directive';

/**
 * Global area filter in the sidebar. Narrows all overviews to the chosen areas;
 * it does not change any permission.
 */
@Component({
  selector: 'app-area-switcher',
  imports: [
    DropdownPosition,
    AsyncPipe,
    TranslatePipe,
    LucideCheck,
    LucideChevronsUpDown,
    LucideLayers,
  ],
  templateUrl: './area-switcher.html',
  styleUrl: './area-switcher.scss',
})
export class AreaSwitcher implements OnInit {
  protected open = false;

  constructor(
    protected readonly areaService: AreaService,
    private readonly host: ElementRef<HTMLElement>,
  ) {}

  ngOnInit(): void {
    this.areaService.load().subscribe();
  }

  protected label(areas: AreaItem[], selected: string[]): string {
    if (!selected.length) {
      return t('components.areaSwitcher.allAreas');
    }
    if (selected.length === 1) {
      return (
        areas.find((area) => area.uuid === selected[0])?.name ??
        tn('components.areaSwitcher.areaCount', 1)
      );
    }
    return tn('components.areaSwitcher.areaCount', selected.length);
  }

  protected isSelected(uuid: string): boolean {
    return this.areaService.selected.includes(uuid);
  }

  protected toggle(uuid: string): void {
    const selected = this.areaService.selected;
    this.areaService.setSelected(
      selected.includes(uuid) ? selected.filter((entry) => entry !== uuid) : [...selected, uuid],
    );
  }

  /** Shows only this one area. */
  protected only(uuid: string, event: Event): void {
    event.stopPropagation();
    this.areaService.setSelected([uuid]);
  }

  protected selectAll(): void {
    this.areaService.setSelected([]);
  }

  @HostListener('document:mousedown', ['$event'])
  protected onDocumentClick(event: MouseEvent): void {
    if (this.open && !this.host.nativeElement.contains(event.target as Node)) {
      this.open = false;
    }
  }

  @HostListener('document:keydown.escape')
  protected onEscape(): void {
    this.open = false;
  }
}
