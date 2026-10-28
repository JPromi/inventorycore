import { Routes } from '@angular/router';
import { LucideBoxes, LucideMapPin, LucideShapes } from '@lucide/angular';

import { adminGuard } from './core/guards/admin.guard';
import { configGuard } from './core/guards/config.guard';
import { t } from './core/i18n/i18n';
import { AuthGuard } from './core/guards/auth.guard';
import { LoginRedirectGuard } from './core/guards/login-redirect.guard';
import { InventoryFormPage } from './features/inventory/pages/inventory-form-page/inventory-form-page';
import { InventoryPage } from './features/inventory/pages/inventory-page/inventory-page';
import { LoginPage } from './features/auth/pages/login-page/login-page';
import { PlaceholderPage } from './shared/pages/placeholder-page/placeholder-page';
import { MainRoute } from './layout/navigation/main-route';
import {
  ASSET_DETAIL_CONFIG,
  LOCATION_DETAIL_CONFIG,
} from './features/inventory/pages/inventory-detail-page/detail-configs';

const assetFormConfig = {
  title: t('terms.asset'),
  createTitle: t('inventory.assets.createTitle'),
  editTitle: t('inventory.assets.editTitle'),
  endpoint: 'assets',
  listRoute: '/assets',
  detailRoutePrefix: '/assets',
  resourceType: 'ASSET',
  icon: LucideBoxes,
  autoInvId: true,
  selectAssetType: true,
  selectLocation: true,
  customFields: true,
  images: true,
  tags: true,
  fields: [
    { key: 'name', label: t('common.name'), type: 'text', required: true },
    { key: 'description', label: t('common.description'), type: 'textarea' },
    { key: 'serialNumber', label: t('terms.serialNumber'), type: 'text' },
    { key: 'inventoryNumber', label: t('terms.inventoryNumber'), type: 'text' },
  ],
};

const locationFormConfig = {
  title: t('terms.location'),
  createTitle: t('inventory.locations.createTitle'),
  editTitle: t('inventory.locations.editTitle'),
  endpoint: 'locations',
  listRoute: '/locations',
  detailRoutePrefix: '/locations',
  resourceType: 'LOCATION',
  icon: LucideMapPin,
  selectParentLocation: true,
  locationType: true,
  coordinates: true,
  images: true,
  fields: [
    { key: 'name', label: t('common.name'), type: 'text', required: true },
    { key: 'description', label: t('common.description'), type: 'textarea' },
  ],
};

const assetTypeFormConfig = {
  title: t('terms.assetType'),
  createTitle: t('inventory.assetTypes.createTitle'),
  editTitle: t('inventory.assetTypes.editTitle'),
  endpoint: 'asset-types',
  listRoute: '/config/types',
  detailRoutePrefix: '/config/types',
  resourceType: 'ASSET_TYPE',
  icon: LucideShapes,
  customFields: true,
  images: true,
  tags: true,
  fields: [
    { key: 'name', label: t('common.name'), type: 'text', required: true },
    { key: 'description', label: t('common.description'), type: 'textarea' },
  ],
};

export const routes: Routes = [
  // must stay before the main route, whose '**' child would otherwise catch '/login'
  {
    path: 'login',
    component: LoginPage,
    canActivate: [LoginRedirectGuard],
  },
  {
    path: '',
    component: MainRoute,
    canActivate: [AuthGuard],
    children: [
      {
        path: 'dashboard',
        loadComponent: () =>
          import('./features/dashboard/pages/dashboard-page/dashboard-page').then((m) => m.DashboardPage),
      },
      {
        path: 'profile',
        loadComponent: () =>
          import('./features/profile/pages/profile-page/profile-page').then((m) => m.ProfilePage),
      },
      {
        path: '',
        pathMatch: 'full',
        redirectTo: 'dashboard',
      },

      // Inventar
      {
        path: 'assets',
        component: InventoryPage,
        data: {
          inventoryConfig: {
            title: t('inventory.assets.listTitle'),
            endpoint: 'assets',
            resourceType: 'ASSET',
            icon: LucideBoxes,
            createRoute: '/assets/new',
            editRoutePrefix: '/assets',
            detailRoutePrefix: '/assets',
            filter: {
              searchFields: ['name', 'description', 'tags'],
              searchPlaceholder: t('inventory.assets.searchPlaceholder'),
              areas: true,
              tags: true,
              locations: true,
              assetTypes: true,
              statuses: true,
            },
            fields: assetFormConfig.fields,
          },
        },
      },
      {
        path: 'assets/new',
        component: InventoryFormPage,
        data: { inventoryFormConfig: assetFormConfig },
      },
      {
        path: 'assets/:uuid/edit',
        component: InventoryFormPage,
        data: { inventoryFormConfig: assetFormConfig },
      },
      {
        path: 'assets/:uuid',
        loadComponent: () =>
          import('./features/inventory/pages/inventory-detail-page/inventory-detail-page').then(
            (m) => m.InventoryDetailPage,
          ),
        data: { inventoryDetailConfig: ASSET_DETAIL_CONFIG },
      },
      {
        path: 'assets/:uuid/history',
        loadComponent: () =>
          import('./features/audit/pages/object-log-page/object-log-page').then(
            (m) => m.ObjectLogPage,
          ),
        data: { endpoint: 'assets', view: 'history' },
      },
      {
        path: 'assets/:uuid/status-history',
        loadComponent: () =>
          import('./features/asset-statuses/pages/asset-status-history-page/asset-status-history-page').then(
            (m) => m.AssetStatusHistoryPage,
          ),
      },
      {
        path: 'assets/:uuid/inspections',
        loadComponent: () =>
          import('./features/audit/pages/object-log-page/object-log-page').then(
            (m) => m.ObjectLogPage,
          ),
        data: { endpoint: 'assets', view: 'inspections' },
      },

      // Standorte
      {
        path: 'locations',
        component: InventoryPage,
        data: {
          inventoryConfig: {
            title: t('terms.locations'),
            endpoint: 'locations',
            resourceType: 'LOCATION',
            icon: LucideMapPin,
            createRoute: '/locations/new',
            editRoutePrefix: '/locations',
            detailRoutePrefix: '/locations',
            filter: {
              searchFields: ['name', 'address'],
              searchPlaceholder: t('inventory.locations.searchPlaceholder'),
              areas: true,
            },
            fields: locationFormConfig.fields,
          },
        },
      },
      {
        path: 'locations/new',
        component: InventoryFormPage,
        data: { inventoryFormConfig: locationFormConfig },
      },
      {
        path: 'locations/:uuid/edit',
        component: InventoryFormPage,
        data: { inventoryFormConfig: locationFormConfig },
      },
      {
        path: 'locations/:uuid',
        loadComponent: () =>
          import('./features/inventory/pages/inventory-detail-page/inventory-detail-page').then(
            (m) => m.InventoryDetailPage,
          ),
        data: { inventoryDetailConfig: LOCATION_DETAIL_CONFIG },
      },
      {
        path: 'locations/:uuid/history',
        loadComponent: () =>
          import('./features/audit/pages/object-log-page/object-log-page').then(
            (m) => m.ObjectLogPage,
          ),
        data: { endpoint: 'locations', view: 'history' },
      },

      // Konfiguration
      {
        path: 'config/types',
        canActivate: [configGuard],
        component: InventoryPage,
        data: {
          inventoryConfig: {
            title: t('terms.assetTypes'),
            endpoint: 'asset-types',
            resourceType: 'ASSET_TYPE',
            icon: LucideShapes,
            createRoute: '/config/types/new',
            editRoutePrefix: '/config/types',
            detailRoutePrefix: '/config/types',
            filter: {
              searchFields: ['name', 'description', 'tags'],
              searchPlaceholder: t('inventory.assetTypes.searchPlaceholder'),
              areas: true,
            },
            fields: assetTypeFormConfig.fields,
          },
        },
      },
      {
        path: 'config/types/new',
        canActivate: [configGuard],
        component: InventoryFormPage,
        data: { inventoryFormConfig: assetTypeFormConfig },
      },
      {
        path: 'config/types/:uuid/edit',
        canActivate: [configGuard],
        component: InventoryFormPage,
        data: { inventoryFormConfig: assetTypeFormConfig },
      },
      {
        path: 'config/types/:uuid',
        loadComponent: () =>
          import('./features/inventory/pages/inventory-detail-page/inventory-detail-page').then(
            (m) => m.InventoryDetailPage,
          ),
        data: {
          inventoryDetailConfig: {
            title: t('terms.assetType'),
            endpoint: 'asset-types',
            listRoute: '/config/types',
            editRoutePrefix: '/config/types',
            resourceType: 'ASSET_TYPE',
            icon: LucideShapes,
            fields: [{ key: 'description', label: t('common.description') }],
          },
        },
      },
      // Prüfungen
      {
        path: 'inspections',
        loadComponent: () =>
          import('./features/inspections/pages/inspections-page/inspections-page').then(
            (m) => m.InspectionsPage,
          ),
      },
      {
        path: 'inspections/new',
        loadComponent: () =>
          import('./features/inspections/pages/inspection-new-page/inspection-new-page').then(
            (m) => m.InspectionNewPage,
          ),
      },
      {
        path: 'inspections/:uuid',
        loadComponent: () =>
          import('./features/inspections/pages/inspection-page/inspection-page').then(
            (m) => m.InspectionPage,
          ),
      },
      {
        path: 'config/inspection-templates',
        canActivate: [configGuard],
        loadComponent: () =>
          import('./features/inspections/pages/inspection-types-page/inspection-types-page').then(
            (m) => m.InspectionTypesPage,
          ),
      },
      {
        path: 'config/inspection-types',
        redirectTo: 'config/inspection-templates',
        pathMatch: 'full',
      },
      {
        path: 'config/inspection-types/new',
        redirectTo: 'config/inspection-templates/new',
        pathMatch: 'full',
      },
      {
        path: 'config/inspection-types/:uuid',
        redirectTo: 'config/inspection-templates/:uuid',
        pathMatch: 'full',
      },
      {
        path: 'config/inspection-templates/new',
        canActivate: [configGuard],
        loadComponent: () =>
          import('./features/inspections/pages/inspection-type-editor-page/inspection-type-editor-page').then(
            (m) => m.InspectionTypeEditorPage,
          ),
      },
      {
        path: 'config/inspection-templates/:uuid',
        canActivate: [configGuard],
        loadComponent: () =>
          import('./features/inspections/pages/inspection-type-editor-page/inspection-type-editor-page').then(
            (m) => m.InspectionTypeEditorPage,
          ),
      },
      {
        path: 'scan',
        loadComponent: () =>
          import('./features/scanning/pages/scan-page/scan-page').then((m) => m.ScanPage),
      },
      {
        path: 'config/statuses',
        canActivate: [configGuard],
        loadComponent: () =>
          import('./features/asset-statuses/pages/asset-statuses-page/asset-statuses-page').then(
            (m) => m.AssetStatusesPage,
          ),
      },
      {
        path: 'config/tags',
        canActivate: [configGuard],
        loadComponent: () =>
          import('./features/tags/pages/tags-page/tags-page').then((m) => m.TagsPage),
      },

      {
        path: 'config/labels',
        canActivate: [configGuard],
        loadComponent: () =>
          import('./features/labels/pages/label-templates-page/label-templates-page').then(
            (m) => m.LabelTemplatesPage,
          ),
      },
      {
        path: 'config/labels/new',
        canActivate: [configGuard],
        loadComponent: () =>
          import('./features/labels/pages/label-editor-page/label-editor-page').then(
            (m) => m.LabelEditorPage,
          ),
      },
      {
        path: 'config/labels/:uuid/edit',
        canActivate: [configGuard],
        loadComponent: () =>
          import('./features/labels/pages/label-editor-page/label-editor-page').then(
            (m) => m.LabelEditorPage,
          ),
      },

      // Administration
      {
        path: 'admin',
        canActivate: [adminGuard],
        children: [
          { path: '', pathMatch: 'full', redirectTo: 'users' },
          {
            path: 'customization',
            loadComponent: () =>
              import('./features/admin/pages/customization-page/customization-page').then(
                (m) => m.CustomizationPage,
              ),
          },
          {
            path: 'areas',
            loadComponent: () =>
              import('./features/admin/pages/areas-page/areas-page').then((m) => m.AreasPage),
          },
          {
            path: 'labels',
            loadComponent: () =>
              import('./features/admin/pages/label-settings-page/label-settings-page').then(
                (m) => m.LabelSettingsPage,
              ),
          },
          {
            path: 'users',
            loadComponent: () =>
              import('./features/admin/pages/users-page/users-page').then((m) => m.UsersPage),
          },
          {
            path: 'users/new',
            loadComponent: () =>
              import('./features/admin/pages/user-form-page/user-form-page').then(
                (m) => m.UserFormPage,
              ),
          },
          {
            path: 'users/:uuid/edit',
            loadComponent: () =>
              import('./features/admin/pages/user-form-page/user-form-page').then(
                (m) => m.UserFormPage,
              ),
          },
          {
            path: 'groups',
            loadComponent: () =>
              import('./features/admin/pages/groups-page/groups-page').then((m) => m.GroupsPage),
          },
          {
            path: 'groups/new',
            loadComponent: () =>
              import('./features/admin/pages/group-form-page/group-form-page').then(
                (m) => m.GroupFormPage,
              ),
          },
          {
            path: 'groups/:uuid/edit',
            loadComponent: () =>
              import('./features/admin/pages/group-form-page/group-form-page').then(
                (m) => m.GroupFormPage,
              ),
          },
          {
            path: 'group-permissions',
            loadComponent: () =>
              import('./features/admin/pages/permissions-page/permissions-page').then(
                (m) => m.PermissionsPage,
              ),
          },
          {
            path: 'ldap',
            loadComponent: () =>
              import('./features/admin/pages/ldap-settings-page/ldap-settings-page').then(
                (m) => m.LdapSettingsPage,
              ),
          },
          {
            path: 'oidc',
            loadComponent: () =>
              import('./features/admin/pages/oidc-settings-page/oidc-settings-page').then(
                (m) => m.OidcSettingsPage,
              ),
          },
          {
            path: 'storage',
            loadComponent: () =>
              import('./features/admin/pages/storage-page/storage-page').then((m) => m.StoragePage),
          },
          {
            path: 'logs',
            loadComponent: () =>
              import('./features/admin/pages/audit-log-page/audit-log-page').then(
                (m) => m.AuditLogPage,
              ),
          },
        ],
      },

      {
        path: '**',
        component: PlaceholderPage,
        data: { title: t('inventory.pageNotFound') },
      },
    ],
  },
];
