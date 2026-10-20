import { Component } from '@angular/core';
import { NgComponentOutlet } from '@angular/common';
import { LucideMonitor, LucideMoon, LucideSun, type LucideIcon } from '@lucide/angular';
import { ThemePreference, ThemeService } from '../../../core/service/theme.service';
import { TranslatePipe } from '../../../core/i18n/translate.pipe';

@Component({
  selector: 'app-theme-selector',
  imports: [NgComponentOutlet, TranslatePipe],
  templateUrl: './theme-selector.html',
  styleUrl: './theme-selector.scss',
})
export class ThemeSelector {
  protected readonly options: { value: ThemePreference; label: string; icon: LucideIcon }[] = [
    { value: 'system', label: 'theme.system', icon: LucideMonitor },
    { value: 'light', label: 'theme.light', icon: LucideSun },
    { value: 'dark', label: 'theme.dark', icon: LucideMoon },
  ];
  protected readonly iconInputs = { size: 17 };

  constructor(protected readonly theme: ThemeService) {}
}
