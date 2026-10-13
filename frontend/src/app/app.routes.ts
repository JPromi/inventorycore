import { Routes } from '@angular/router';

import { AuthGuard } from './core/guards/auth.guard';
import { LoginRedirectGuard } from './core/guards/login-redirect.guard';
import { LoginPage } from './core/pages/login-page/login-page';
import { MainRoute } from './core/routes/main-route/main-route';

export const routes: Routes = [
  {
    path: '',
    component: MainRoute,
    canActivate: [AuthGuard],
    children: [
      {
        path: 'dashboard',
        component: MainRoute,
      },
    ],
  },
  {
    path: 'login',
    component: LoginPage,
    canActivate: [LoginRedirectGuard],
  },
];

