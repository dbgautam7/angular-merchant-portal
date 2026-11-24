import { Routes } from '@angular/router';
import { authGuard, roleGuard } from './core/auth/guards';

/**
 * Every feature page is lazy-loaded with loadComponent, so each one ships as its own chunk.
 * Guards run before a chunk is fetched, so a blocked user never downloads the page.
 */
export const routes: Routes = [
  {
    path: 'login',
    loadComponent: () => import('./features/login/login.component').then((m) => m.LoginComponent),
  },
  {
    path: 'applications',
    canActivate: [authGuard],
    children: [
      {
        path: '',
        loadComponent: () =>
          import('./features/dashboard/dashboard.component').then((m) => m.DashboardComponent),
      },
      {
        path: 'new',
        canActivate: [roleGuard('SALES')],
        loadComponent: () =>
          import('./features/application/application-wizard.component').then(
            (m) => m.ApplicationWizardComponent,
          ),
      },
      {
        path: ':id/edit',
        canActivate: [roleGuard('SALES')],
        loadComponent: () =>
          import('./features/application/application-wizard.component').then(
            (m) => m.ApplicationWizardComponent,
          ),
      },
      {
        path: ':id',
        loadComponent: () =>
          import('./features/detail/application-detail.component').then(
            (m) => m.ApplicationDetailComponent,
          ),
      },
    ],
  },
  { path: '', pathMatch: 'full', redirectTo: 'applications' },
  { path: '**', redirectTo: 'applications' },
];
