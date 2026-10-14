import { Routes } from '@angular/router';

import { AuthGuard } from './core/guards/auth.guard';
import { LoginRedirectGuard } from './core/guards/login-redirect.guard';
import { LoginPage } from './core/pages/login-page/login-page';
import { PlaceholderPage } from './core/pages/placeholder-page/placeholder-page';
import { MainRoute } from './core/routes/main-route/main-route';

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

