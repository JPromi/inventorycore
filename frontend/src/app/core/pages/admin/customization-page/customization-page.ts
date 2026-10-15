import { Component, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { LucidePalette, LucideSave, LucideTrash2, LucideUpload } from '@lucide/angular';
import { ColorPicker } from '../../../components/color-picker/color-picker';
import { Customization, CustomizationService } from '../../../service/customization.service';

@Component({
  selector: 'app-customization-page',
  imports: [FormsModule, ColorPicker, LucidePalette, LucideSave, LucideTrash2, LucideUpload],
  templateUrl: './customization-page.html', styleUrl: './customization-page.scss',
})
export class CustomizationPage implements OnInit {
  protected form!: Customization;
  protected loading = true;
  protected saving = false;
  protected uploading = false;
  protected error = '';
  protected success = '';
  protected readonly links = [
    { key: 'imprintUrl', label: 'Impressum' }, { key: 'privacyUrl', label: 'Datenschutz' },
    { key: 'websiteUrl', label: 'Website' }, { key: 'supportUrl', label: 'Support' },
  ] as const;

  constructor(protected readonly customization: CustomizationService) {}

  ngOnInit(): void {
    this.customization.load(false).subscribe({
      next: value => { this.form = { ...value }; this.loading = false; },
      error: () => { this.error = 'Anpassungen konnten nicht geladen werden.'; this.loading = false; },
    });
  }

  protected save(): void {
    if (this.saving || this.uploading) return;
    this.saving = true;
    this.error = this.success = '';
    this.customization.save(this.form).subscribe({
      next: value => { this.form = { ...value }; this.saving = false; this.success = 'Anpassungen gespeichert.'; },
      error: error => { this.saving = false; this.error = error?.error?.message || 'Speichern fehlgeschlagen.'; },
    });
  }

  protected upload(event: Event): void {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    input.value = '';
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) { this.error = 'Das Logo darf maximal 5 MB groß sein.'; return; }
    this.changeLogo(file);
  }

  protected changeLogo(file?: File): void {
    if (this.uploading || this.saving) return;
    this.uploading = true;
    this.error = this.success = '';
    const request = file ? this.customization.uploadLogo(file) : this.customization.removeLogo();
    request.subscribe({
      next: value => { this.form.logoUrl = value.logoUrl; this.uploading = false; this.success = file ? 'Logo gespeichert.' : 'Logo entfernt.'; },
      error: error => { this.uploading = false; this.error = error?.error?.message || 'Logo konnte nicht gespeichert werden.'; },
    });
  }
}
