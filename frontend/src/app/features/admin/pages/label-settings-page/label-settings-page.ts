import { Component, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
import {
  LucideChevronDown,
  LucideChevronUp,
  LucidePlus,
  LucideRuler,
  LucideSave,
  LucideTrash2,
} from '@lucide/angular';

import { t } from '../../../../core/i18n/i18n';
import { TranslatePipe } from '../../../../core/i18n/translate.pipe';
import { LabelTemplateService } from '../../../labels/label-template.service';
import { LabelSettings } from '../../../labels/label.model';

/** Label editor defaults: the safe area of new templates and the offered label sizes. */
@Component({
  selector: 'app-label-settings-page',
  imports: [
    FormsModule,
    TranslatePipe,
    LucideChevronDown,
    LucideChevronUp,
    LucidePlus,
    LucideRuler,
    LucideSave,
    LucideTrash2,
  ],
  templateUrl: './label-settings-page.html',
  styleUrl: './label-settings-page.scss',
})
export class LabelSettingsPage implements OnInit {
  protected settings: LabelSettings | null = null;
  protected loading = false;
  protected saving = false;
  protected saved = false;
  protected error = '';

  constructor(private readonly api: LabelTemplateService) {}

  ngOnInit(): void {
    this.loading = true;
    this.api.settings().subscribe({
      next: (settings) => {
        this.settings = settings;
        this.loading = false;
      },
      error: () => {
        this.error = t('adminLabels.errors.load');
        this.loading = false;
      },
    });
  }

  protected changed(): void {
    this.saved = false;
  }

  protected addPreset(): void {
    this.settings?.sizePresets.push({ name: '', widthMm: 62, heightMm: 29, safeAreaMm: null });
    this.changed();
  }

  protected removePreset(index: number): void {
    this.settings?.sizePresets.splice(index, 1);
    this.changed();
  }

  protected movePreset(index: number, direction: -1 | 1): void {
    const presets = this.settings?.sizePresets;
    const target = index + direction;
    if (!presets || target < 0 || target >= presets.length) {
      return;
    }
    [presets[index], presets[target]] = [presets[target], presets[index]];
    this.changed();
  }

  /** Name suggestion from the size, e.g. "62 × 29 mm". */
  protected suggestName(index: number): void {
    const preset = this.settings?.sizePresets[index];
    if (preset && !preset.name.trim() && preset.widthMm > 0 && preset.heightMm > 0) {
      preset.name = `${preset.widthMm} × ${preset.heightMm} mm`;
    }
  }

  protected save(): void {
    if (!this.settings || this.saving) {
      return;
    }
    const presets = this.settings.sizePresets;
    // an emptied number field means "general default"
    for (const preset of presets) {
      if (preset.safeAreaMm === null || String(preset.safeAreaMm) === '') {
        preset.safeAreaMm = null;
      }
    }
    if (
      presets.some(
        (preset) => !preset.name.trim() || !(preset.widthMm > 0) || !(preset.heightMm > 0),
      )
    ) {
      this.error = t('adminLabels.errors.invalidPreset');
      return;
    }
    this.saving = true;
    this.error = '';
    this.api.saveSettings(this.settings).subscribe({
      next: (settings) => {
        this.settings = settings;
        this.saving = false;
        this.saved = true;
      },
      error: (error) => {
        this.saving = false;
        this.error = error?.error?.message || t('common.errors.save');
      },
    });
  }
}
