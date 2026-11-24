import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { AuthService } from './core/auth/auth.service';

/** App shell: skip link, role-aware navigation and the routed outlet. */
@Component({
  selector: 'app-root',
  imports: [RouterOutlet, RouterLink, RouterLinkActive],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <a class="visually-hidden-focusable" href="#main">Skip to content</a>
    <nav class="navbar navbar-expand navbar-dark bg-dark" aria-label="Main">
      <div class="container">
        <a class="navbar-brand" routerLink="/">Merchant Portal</a>
        @if (auth.user(); as user) {
          <ul class="navbar-nav me-auto">
            <li class="nav-item">
              <a
                class="nav-link"
                routerLink="/applications"
                routerLinkActive="active"
                ariaCurrentWhenActive="page"
                [routerLinkActiveOptions]="{ exact: true }"
                >Applications</a
              >
            </li>
            @if (auth.hasRole('SALES')) {
              <li class="nav-item">
                <a
                  class="nav-link"
                  routerLink="/applications/new"
                  routerLinkActive="active"
                  ariaCurrentWhenActive="page"
                  >New application</a
                >
              </li>
            }
          </ul>
          <span class="navbar-text me-3 d-none d-sm-inline">{{ user.name }} · {{ user.role }}</span>
          <button type="button" class="btn btn-outline-light btn-sm" (click)="auth.logout()">
            Log out
          </button>
        }
      </div>
    </nav>
    <main id="main" class="container py-4"><router-outlet /></main>
  `,
})
export class App {
  protected readonly auth = inject(AuthService);
}
