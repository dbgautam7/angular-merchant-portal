import { Routes } from '@angular/router';

/** Every feature page is lazy-loaded with loadComponent, so each one ships as its own chunk. */
export const routes: Routes = [
  {
    path: 'login',
    loadComponent: () => import('./features/login/login.component').then((m) => m.LoginComponent),
  },
  {
    path: 'applications',
    children: [
      {
        path: '',
        loadComponent: () =>
          import('./features/dashboard/dashboard.component').then((m) => m.DashboardComponent),
      },
      {
        path: 'new',
        loadComponent: () =>
          import('./features/application/application-wizard.component').then(
            (m) => m.ApplicationWizardComponent,
          ),
      },
      {
        path: ':id/edit',
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
