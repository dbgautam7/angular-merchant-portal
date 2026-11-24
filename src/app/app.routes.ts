import { Routes, UrlMatcher } from '@angular/router';
import { authGuard, roleGuard } from './core/auth/guards';
import { unsavedChangesGuard } from './shared/unsaved-changes.guard';

/**
 * Matches both wizard URLs, `new` and `:id/edit`, with ONE route. The router reuses a component
 * only within the same route, so when the first auto-save creates a draft on /new, the wizard
 * can switch the URL to /:id/edit (replaceUrl) and stay mounted: no reload, no lost focus.
 */
export const wizardMatcher: UrlMatcher = (segments) => {
  if (segments.length === 1 && segments[0].path === 'new') return { consumed: segments };
  if (segments.length === 2 && segments[1].path === 'edit') {
    return { consumed: segments, posParams: { id: segments[0] } };
  }
  return null;
};

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
        // Declared before ':id', so /applications/new is never read as an id.
        matcher: wizardMatcher,
        canActivate: [roleGuard('SALES')],
        // Saves pending changes before the user leaves the wizard.
        canDeactivate: [unsavedChangesGuard],
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
