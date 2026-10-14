import { Routes } from '@angular/router';
import { LucideBoxes, LucideMapPin, LucideShapes } from '@lucide/angular';

import { adminGuard } from './core/guards/admin.guard';
import { AuthGuard } from './core/guards/auth.guard';
import { LoginRedirectGuard } from './core/guards/login-redirect.guard';
import { InventoryFormPage } from './core/pages/inventory-form-page/inventory-form-page';
import { InventoryPage } from './core/pages/inventory-page/inventory-page';
import { LoginPage } from './core/pages/login-page/login-page';
import { PlaceholderPage } from './core/pages/placeholder-page/placeholder-page';
import { MainRoute } from './core/routes/main-route/main-route';
import { ASSET_DETAIL_CONFIG, LOCATION_DETAIL_CONFIG } from './core/pages/inventory-detail-page/detail-configs';

const assetFormConfig = {
  title: 'Asset',
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
    { key: 'name', label: 'Name', type: 'text', required: true },
    { key: 'description', label: 'Beschreibung', type: 'textarea' },
    { key: 'serialNumber', label: 'Seriennummer', type: 'text' },
    { key: 'inventoryNumber', label: 'Inventarnummer', type: 'text' },
    { key: 'inspectionIntervalDays', label: 'Prüfintervall Tage', type: 'number' },
  ],
};

const locationFormConfig = {
  title: 'Standort',
  endpoint: 'locations',
  listRoute: '/locations',
  detailRoutePrefix: '/locations',
  resourceType: 'LOCATION',
  icon: LucideMapPin,
  selectParentLocation: true,
  images: true,
  fields: [
    { key: 'name', label: 'Name', type: 'text', required: true },
    { key: 'address', label: 'Adresse', type: 'text' },
    { key: 'description', label: 'Beschreibung', type: 'textarea' },
  ],
};

const assetTypeFormConfig = {
  title: 'Typ',
  endpoint: 'asset-types',
  listRoute: '/config/types',
  detailRoutePrefix: '/config/types',
  resourceType: 'ASSET_TYPE',
  icon: LucideShapes,
  customFields: true,
  images: true,
  tags: true,
  fields: [
    { key: 'name', label: 'Name', type: 'text', required: true },
    { key: 'description', label: 'Beschreibung', type: 'textarea' },
    { key: 'inspectionIntervalDays', label: 'Prüfintervall Tage', type: 'number' },
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
            title: 'Inventar',
            endpoint: 'assets',
            resourceType: 'ASSET',
            icon: LucideBoxes,
            createRoute: '/assets/new',
            editRoutePrefix: '/assets',
            detailRoutePrefix: '/assets',
            filter: {
              searchFields: ['name', 'description', 'tags'],
              searchPlaceholder: 'Name, Beschreibung oder Tag suchen...',
              areas: true,
              tags: true,
              locations: true,
              assetTypes: true,
            },
            fields: assetFormConfig.fields,
          },
        },
      },
      { path: 'assets/new', component: InventoryFormPage, data: { inventoryFormConfig: assetFormConfig } },
      { path: 'assets/:uuid/edit', component: InventoryFormPage, data: { inventoryFormConfig: assetFormConfig } },
      {
        path: 'assets/:uuid',
        loadComponent: () => import('./core/pages/inventory-detail-page/inventory-detail-page').then((m) => m.InventoryDetailPage),
        data: { inventoryDetailConfig: ASSET_DETAIL_CONFIG },
      },

      // Standorte
      {
        path: 'locations',
        component: InventoryPage,
        data: {
          inventoryConfig: {
            title: 'Standorte',
            endpoint: 'locations',
            resourceType: 'LOCATION',
            icon: LucideMapPin,
            createRoute: '/locations/new',
            editRoutePrefix: '/locations',
            detailRoutePrefix: '/locations',
            filter: {
              searchFields: ['name', 'address'],
              searchPlaceholder: 'Name oder Adresse suchen...',
              areas: true,
            },
            fields: locationFormConfig.fields,
          },
        },
      },
      { path: 'locations/new', component: InventoryFormPage, data: { inventoryFormConfig: locationFormConfig } },
      { path: 'locations/:uuid/edit', component: InventoryFormPage, data: { inventoryFormConfig: locationFormConfig } },
      {
        path: 'locations/:uuid',
        loadComponent: () => import('./core/pages/inventory-detail-page/inventory-detail-page').then((m) => m.InventoryDetailPage),
        data: { inventoryDetailConfig: LOCATION_DETAIL_CONFIG },
      },

      // Konfiguration
      {
        path: 'config/types',
        component: InventoryPage,
        data: {
          inventoryConfig: {
            title: 'Typen',
            endpoint: 'asset-types',
            resourceType: 'ASSET_TYPE',
            icon: LucideShapes,
            createRoute: '/config/types/new',
            editRoutePrefix: '/config/types',
            detailRoutePrefix: '/config/types',
            filter: {
              searchFields: ['name', 'description', 'tags'],
              searchPlaceholder: 'Typ oder Tag suchen...',
              areas: true,
            },
            fields: assetTypeFormConfig.fields,
          },
        },
      },
      { path: 'config/types/new', component: InventoryFormPage, data: { inventoryFormConfig: assetTypeFormConfig } },
      { path: 'config/types/:uuid/edit', component: InventoryFormPage, data: { inventoryFormConfig: assetTypeFormConfig } },
      {
        path: 'config/types/:uuid',
        loadComponent: () => import('./core/pages/inventory-detail-page/inventory-detail-page').then((m) => m.InventoryDetailPage),
        data: {
          inventoryDetailConfig: {
            title: 'Typ',
            endpoint: 'asset-types',
            listRoute: '/config/types',
            editRoutePrefix: '/config/types',
            resourceType: 'ASSET_TYPE',
            icon: LucideShapes,
            fields: [
              { key: 'inspectionIntervalDays', label: 'Prüfintervall', suffix: ' Tage' },
              { key: 'description', label: 'Beschreibung' },
            ],
          },
        },
      },
      {
        path: 'scan',
        loadComponent: () => import('./core/pages/scan-page/scan-page').then((m) => m.ScanPage),
      },
      {
        path: 'config/tags',
        loadComponent: () => import('./core/pages/tags-page/tags-page').then((m) => m.TagsPage),
      },

      {
        path: 'config/labels',
        loadComponent: () =>
          import('./core/pages/labels/label-templates-page/label-templates-page').then((m) => m.LabelTemplatesPage),
      },
      {
        path: 'config/labels/new',
        loadComponent: () => import('./core/pages/labels/label-editor-page/label-editor-page').then((m) => m.LabelEditorPage),
      },
      {
        path: 'config/labels/:uuid/edit',
        loadComponent: () => import('./core/pages/labels/label-editor-page/label-editor-page').then((m) => m.LabelEditorPage),
      },

      // Administration
      {
        path: 'admin',
        canActivate: [adminGuard],
        children: [
          { path: '', pathMatch: 'full', redirectTo: 'users' },
          {
            path: 'areas',
            loadComponent: () => import('./core/pages/admin/areas-page/areas-page').then((m) => m.AreasPage),
          },
          { path: 'users', loadComponent: () => import('./core/pages/admin/users-page/users-page').then((m) => m.UsersPage) },
          { path: 'users/new', loadComponent: () => import('./core/pages/admin/user-form-page/user-form-page').then((m) => m.UserFormPage) },
          { path: 'users/:uuid/edit', loadComponent: () => import('./core/pages/admin/user-form-page/user-form-page').then((m) => m.UserFormPage) },
          { path: 'groups', loadComponent: () => import('./core/pages/admin/groups-page/groups-page').then((m) => m.GroupsPage) },
          { path: 'groups/new', loadComponent: () => import('./core/pages/admin/group-form-page/group-form-page').then((m) => m.GroupFormPage) },
          { path: 'groups/:uuid/edit', loadComponent: () => import('./core/pages/admin/group-form-page/group-form-page').then((m) => m.GroupFormPage) },
          { path: 'group-permissions', loadComponent: () => import('./core/pages/admin/permissions-page/permissions-page').then((m) => m.PermissionsPage) },
          {
            path: 'ldap',
            loadComponent: () => import('./core/pages/admin/ldap-settings-page/ldap-settings-page').then((m) => m.LdapSettingsPage),
          },
          {
            path: 'oidc',
            loadComponent: () => import('./core/pages/admin/oidc-settings-page/oidc-settings-page').then((m) => m.OidcSettingsPage),
          },
        ],
      },

      {
        path: '**',
        component: PlaceholderPage,
        data: { title: 'Placeholder' },
      },
    ],
  },
];
