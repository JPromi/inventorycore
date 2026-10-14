import { Routes } from '@angular/router';

import { AuthGuard } from './core/guards/auth.guard';
import { LoginRedirectGuard } from './core/guards/login-redirect.guard';
import { InventoryFormPage } from './core/pages/inventory-form-page/inventory-form-page';
import { InventoryPage } from './core/pages/inventory-page/inventory-page';
import { LoginPage } from './core/pages/login-page/login-page';
import { PlaceholderPage } from './core/pages/placeholder-page/placeholder-page';
import { MainRoute } from './core/routes/main-route/main-route';
import { LucideBoxes, LucideMapPin, LucideShapes, LucideTags } from '@lucide/angular';

export const routes: Routes = [
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
      {
        path: 'assets/new',
        component: InventoryFormPage,
        data: {
          inventoryFormConfig: {
            title: 'Asset',
            endpoint: 'assets',
            listRoute: '/assets',
            resourceType: 'ASSET',
            icon: LucideBoxes,
            autoInvId: true,
            selectAssetType: true,
            customFields: true,
            images: true,
            fields: [
              { key: 'name', label: 'Name', type: 'text', required: true },
              { key: 'description', label: 'Beschreibung', type: 'textarea' },
              { key: 'serialNumber', label: 'Seriennummer', type: 'text' },
              { key: 'inventoryNumber', label: 'Inventarnummer', type: 'text' },
              { key: 'inspectionIntervalDays', label: 'Prüfintervall Tage', type: 'number' },
            ],
          },
        },
      },
      {
        path: 'assets/:uuid/edit',
        component: InventoryFormPage,
        data: {
          inventoryFormConfig: {
            title: 'Asset',
            endpoint: 'assets',
            listRoute: '/assets',
            resourceType: 'ASSET',
            icon: LucideBoxes,
            autoInvId: true,
            selectAssetType: true,
            customFields: true,
            images: true,
            fields: [
              { key: 'name', label: 'Name', type: 'text', required: true },
              { key: 'description', label: 'Beschreibung', type: 'textarea' },
              { key: 'serialNumber', label: 'Seriennummer', type: 'text' },
              { key: 'inventoryNumber', label: 'Inventarnummer', type: 'text' },
              { key: 'inspectionIntervalDays', label: 'Prüfintervall Tage', type: 'number' },
            ],
          },
        },
      },
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
            fields: [
              { key: 'invId', label: 'Inventar-ID', type: 'text', required: true },
              { key: 'name', label: 'Name', type: 'text', required: true },
              { key: 'description', label: 'Beschreibung', type: 'textarea' },
              { key: 'serialNumber', label: 'Seriennummer', type: 'text' },
              { key: 'inventoryNumber', label: 'Inventarnummer', type: 'text' },
              { key: 'inspectionIntervalDays', label: 'Prüfintervall Tage', type: 'number' },
            ],
          },
        },
      },
      {
        path: 'locations',
        component: InventoryPage,
        data: {
          inventoryConfig: {
            title: 'Standorte',
            endpoint: 'locations',
            resourceType: 'LOCATION',
            icon: LucideMapPin,
            fields: [
              { key: 'name', label: 'Name', type: 'text', required: true },
              { key: 'address', label: 'Adresse', type: 'text' },
              { key: 'description', label: 'Beschreibung', type: 'textarea' },
            ],
          },
        },
      },
      {
        path: 'categories/new',
        component: InventoryFormPage,
        data: {
          inventoryFormConfig: {
            title: 'Kategorie',
            endpoint: 'asset-types',
            listRoute: '/categories',
            resourceType: 'CATEGORY',
            icon: LucideShapes,
            customFields: true,
            images: true,
            fields: [
              { key: 'name', label: 'Name', type: 'text', required: true },
              { key: 'description', label: 'Beschreibung', type: 'textarea' },
              { key: 'inspectionIntervalDays', label: 'Prüfintervall Tage', type: 'number' },
            ],
          },
        },
      },
      {
        path: 'categories/:uuid/edit',
        component: InventoryFormPage,
        data: {
          inventoryFormConfig: {
            title: 'Kategorie',
            endpoint: 'asset-types',
            listRoute: '/categories',
            resourceType: 'CATEGORY',
            icon: LucideShapes,
            customFields: true,
            images: true,
            fields: [
              { key: 'name', label: 'Name', type: 'text', required: true },
              { key: 'description', label: 'Beschreibung', type: 'textarea' },
              { key: 'inspectionIntervalDays', label: 'Prüfintervall Tage', type: 'number' },
            ],
          },
        },
      },
      {
        path: 'categories',
        component: InventoryPage,
        data: {
          inventoryConfig: {
            title: 'Kategorien',
            endpoint: 'asset-types',
            resourceType: 'CATEGORY',
            icon: LucideShapes,
            createRoute: '/categories/new',
            editRoutePrefix: '/categories',
            fields: [
              { key: 'name', label: 'Name', type: 'text', required: true },
              { key: 'description', label: 'Beschreibung', type: 'textarea' },
              { key: 'inspectionIntervalDays', label: 'Prüfintervall Tage', type: 'number' },
            ],
          },
        },
      },
      {
        path: 'config/types/new',
        component: InventoryFormPage,
        data: {
          inventoryFormConfig: {
            title: 'Typ',
            endpoint: 'asset-types',
            listRoute: '/config/types',
            resourceType: 'CATEGORY',
            icon: LucideShapes,
            customFields: true,
            images: true,
            fields: [
              { key: 'name', label: 'Name', type: 'text', required: true },
              { key: 'description', label: 'Beschreibung', type: 'textarea' },
              { key: 'inspectionIntervalDays', label: 'Prüfintervall Tage', type: 'number' },
            ],
          },
        },
      },
      {
        path: 'config/types/:uuid/edit',
        component: InventoryFormPage,
        data: {
          inventoryFormConfig: {
            title: 'Typ',
            endpoint: 'asset-types',
            listRoute: '/config/types',
            resourceType: 'CATEGORY',
            icon: LucideShapes,
            customFields: true,
            images: true,
            fields: [
              { key: 'name', label: 'Name', type: 'text', required: true },
              { key: 'description', label: 'Beschreibung', type: 'textarea' },
              { key: 'inspectionIntervalDays', label: 'Prüfintervall Tage', type: 'number' },
            ],
          },
        },
      },
      {
        path: 'config/types',
        component: InventoryPage,
        data: {
          inventoryConfig: {
            title: 'Typen',
            endpoint: 'asset-types',
            resourceType: 'CATEGORY',
            icon: LucideShapes,
            createRoute: '/config/types/new',
            editRoutePrefix: '/config/types',
            fields: [
              { key: 'name', label: 'Name', type: 'text', required: true },
              { key: 'description', label: 'Beschreibung', type: 'textarea' },
              { key: 'inspectionIntervalDays', label: 'Prüfintervall Tage', type: 'number' },
            ],
          },
        },
      },
      {
        path: 'config/tags',
        component: InventoryPage,
        data: {
          inventoryConfig: {
            title: 'Tags',
            endpoint: 'tags',
            resourceType: 'CATEGORY',
            icon: LucideTags,
            fields: [
              { key: 'name', label: 'Name', type: 'text', required: true },
              { key: 'color', label: 'Farbe', type: 'color' },
            ],
          },
        },
      },
      {
        path: '**',
        component: PlaceholderPage,
        data: { title: 'Placeholder' },
      },
    ],
  },
  {
    path: 'login',
    component: LoginPage,
    canActivate: [LoginRedirectGuard],
  },
];

