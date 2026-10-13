import { Routes } from '@angular/router';
import { LoginPage } from './components/pages/login-page/login-page';
import { StartPage } from './components/pages/start-page/start-page';

export const routes: Routes = [
  { path: '', redirectTo: 'login', pathMatch: 'full' },
  { path: 'login', component: LoginPage },
  { path: 'start', component: StartPage },
];
