import { Component, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { LucidePalette, LucideSave, LucideTrash2, LucideUpload } from '@lucide/angular';
import { ColorPicker } from '../../../../shared/components/color-picker/color-picker';
import { t } from '../../../../core/i18n/i18n';
import { TranslatePipe } from '../../../../core/i18n/translate.pipe';
import {
  Customization,
  CustomizationService,
} from '../../../../core/service/customization.service';

@Component({
  selector: 'app-customization-page',
  imports: [
    FormsModule,
    ColorPicker,
    TranslatePipe,
    LucidePalette,
    LucideSave,
    LucideTrash2,
    LucideUpload,
  ],
  templateUrl: './customization-page.html',
  styleUrl: './customization-page.scss',
})
export class CustomizationPage implements OnInit {
  protected form!: Customization;
  protected loading = true;
  protected saving = false;
  protected uploading = false;
  protected error = '';
  protected success = '';
  protected readonly links = [
    { key: 'imprintUrl', label: t('adminCustomization.links.imprint') },
    { key: 'privacyUrl', label: t('adminCustomization.links.privacy') },
    { key: 'websiteUrl', label: t('adminCustomization.links.website') },
    { key: 'supportUrl', label: t('adminCustomization.links.support') },
  ] as const;

  constructor(protected readonly customization: CustomizationService) {}

  ngOnInit(): void {
    this.customization.load(false).subscribe({
      next: (value) => {
        this.form = { ...value };
        this.loading = false;
      },
      error: () => {
        this.error = t('adminCustomization.loadError');
        this.loading = false;
      },
    });
  }

  protected save(): void {
    if (this.saving || this.uploading) return;
    this.saving = true;
    this.error = this.success = '';
    this.customization.save(this.form).subscribe({
      next: (value) => {
        this.form = { ...value };
        this.saving = false;
        this.success = t('adminCustomization.saved');
      },
      error: (error) => {
        this.saving = false;
        this.error = error?.error?.message || t('common.errors.save');
      },
    });
  }

  protected upload(event: Event): void {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    input.value = '';
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) {
      this.error = t('adminCustomization.logoTooLarge');
      return;
    }
    this.changeLogo(file);
  }

  protected changeLogo(file?: File): void {
    if (this.uploading || this.saving) return;
    this.uploading = true;
    this.error = this.success = '';
    const request = file ? this.customization.uploadLogo(file) : this.customization.removeLogo();
    request.subscribe({
      next: (value) => {
        this.form.logoUrl = value.logoUrl;
        this.uploading = false;
        this.success = t(file ? 'adminCustomization.logoSaved' : 'adminCustomization.logoRemoved');
      },
      error: (error) => {
        this.uploading = false;
        this.error = error?.error?.message || t('adminCustomization.logoSaveFailed');
      },
    });
  }
}
