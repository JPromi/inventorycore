import { Component, OnInit } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { LucideClipboardList, LucidePencil, LucidePlus, LucideTrash2 } from '@lucide/angular';

import { ConfirmDialogService } from '../../../components/confirm-dialog/confirm-dialog.service';
import { InspectionService, InspectionType, intervalText } from '../../../service/inspection.service';
import { AreaService } from '../../../service/area.service';
import { PermissionService } from '../../../service/permission.service';

/** Configuration list of the inspection types. */
@Component({
  selector: 'app-inspection-types-page',
  imports: [RouterLink, LucideClipboardList, LucidePencil, LucidePlus, LucideTrash2],
  templateUrl: './inspection-types-page.html',
  styleUrl: './inspection-types-page.scss',
})
export class InspectionTypesPage implements OnInit {
  protected types: InspectionType[] = [];
  protected loading = false;
  protected error = '';

  constructor(
    private readonly api: InspectionService,
    private readonly router: Router,
    private readonly permissions: PermissionService,
    private readonly confirmDialog: ConfirmDialogService,
    private readonly areaService: AreaService,
  ) {}

  ngOnInit(): void {
    this.loading = true;
    this.api.types().subscribe({
      next: (types) => {
        this.types = types;
        this.loading = false;
      },
      error: () => {
        this.error = 'Prüfungsarten konnten nicht geladen werden.';
        this.loading = false;
      },
    });
  }

  /** Types of the areas chosen in the sidebar (types without areas are for all). */
  protected get visibleTypes(): InspectionType[] {
    return this.types.filter((type) => this.areaService.overlapsSelection(type.areaUuids));
  }

  protected get canEdit(): boolean {
    return this.permissions.can('ASSET_TYPE', 'edit');
  }

  protected readonly intervalText = intervalText;

  protected generalFieldCount(type: InspectionType): number {
    return type.fields.filter((field) => !field.assetTypeUuid).length;
  }

  /** "Laptop (2), Fahrzeug (5)" */
  protected typeFieldSummary(type: InspectionType): string[] {
    const counts = new Map<string, number>();
    for (const field of type.fields) {
      if (field.assetTypeUuid) {
        const name = field.assetTypeName ?? 'Typ';
        counts.set(name, (counts.get(name) ?? 0) + 1);
      }
    }
    return [...counts.entries()].map(([name, count]) => `${name} (${count})`);
  }

  protected edit(type: InspectionType): void {
    this.router.navigate(['/config/inspection-types', type.uuid]);
  }

  protected async remove(type: InspectionType, event: Event): Promise<void> {
    event.stopPropagation();
    const confirmed = await this.confirmDialog.confirm({
      title: 'Prüfungsart löschen?',
      message: type.inspectionCount
        ? `„${type.name}“ wird gelöscht. Die ${type.inspectionCount} Prüfungen dieser Art bleiben mit allen Werten erhalten.`
        : `„${type.name}“ wird gelöscht.`,
      confirmLabel: 'Löschen',
      danger: true,
    });
    if (!confirmed) {
      return;
    }
    this.api.deleteType(type.uuid).subscribe({
      next: () => (this.types = this.types.filter((entry) => entry !== type)),
      error: () => (this.error = 'Prüfungsart konnte nicht gelöscht werden.'),
    });
  }
}
