import { DOCUMENT } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { NavigationEnd, Router, RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { filter } from 'rxjs';
import { AuthService } from './core/auth/auth.service';
import { IconComponent } from './shared/icon.component';
import { initials, ROLE_LABELS } from './shared/roles';

/** App shell: skip link, sticky role-aware navbar (collapsible on phones) and the routed page. */
@Component({
  selector: 'app-root',
  imports: [RouterOutlet, RouterLink, RouterLinkActive, IconComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  styleUrl: './app.scss',
  template: `
    <a class="visually-hidden-focusable skip-link" href="#main" (click)="skipToMain($event)"
      >Skip to content</a
    >
    <header class="app-header">
      <nav class="navbar navbar-expand-md" aria-label="Main">
        <div class="container-xl">
          <a class="navbar-brand" routerLink="/">
            <span class="brand-mark"><app-icon name="card" /></span>
            Merchant Portal
          </a>
          @if (auth.user(); as user) {
            <button
              type="button"
              class="navbar-toggler"
              aria-controls="main-menu"
              [attr.aria-expanded]="menuOpen()"
              (click)="menuOpen.set(!menuOpen())"
            >
              <app-icon [name]="menuOpen() ? 'x' : 'menu'" />
              <span class="visually-hidden">Menu</span>
            </button>
            <div id="main-menu" class="collapse navbar-collapse" [class.show]="menuOpen()">
              <ul class="navbar-nav me-auto">
                <li class="nav-item">
                  <a
                    class="nav-link"
                    routerLink="/applications"
                    routerLinkActive="active"
                    ariaCurrentWhenActive="page"
                    [routerLinkActiveOptions]="{ exact: true }"
                  >
                    <app-icon name="file" /> Applications
                  </a>
                </li>
                @if (auth.hasRole('SALES')) {
                  <li class="nav-item">
                    <a
                      class="nav-link"
                      routerLink="/applications/new"
                      routerLinkActive="active"
                      ariaCurrentWhenActive="page"
                    >
                      <app-icon name="plus" /> New application
                    </a>
                  </li>
                }
              </ul>
              <div class="navbar-user">
                <span class="avatar" aria-hidden="true">{{ userInitials() }}</span>
                <span class="navbar-user-name">
                  <span class="d-block fw-semibold text-body-emphasis">{{ user.name }}</span>
                  <span class="d-block small text-body-secondary">{{ roleLabel() }}</span>
                </span>
                <button
                  type="button"
                  class="btn btn-sm btn-outline-secondary"
                  (click)="auth.logout()"
                >
                  <app-icon name="logOut" /> Log out
                </button>
              </div>
            </div>
          }
        </div>
      </nav>
    </header>
    <main id="main" class="container-xl py-4 py-lg-5" tabindex="-1">
      <router-outlet />
    </main>
  `,
})
export class App {
  protected readonly auth = inject(AuthService);
  private readonly document = inject(DOCUMENT);
  protected readonly menuOpen = signal(false);

  protected readonly userInitials = computed(() => initials(this.auth.user()?.name ?? ''));
  protected readonly roleLabel = computed(() => {
    const role = this.auth.user()?.role;
    return role ? ROLE_LABELS[role] : '';
  });

  /**
   * With <base href="/">, a plain href="#main" resolves to "/#main" and would reload the app at
   * the root. Moving focus directly keeps the user on the current page.
   */
  protected skipToMain(event: Event): void {
    event.preventDefault();
    this.document.getElementById('main')?.focus();
  }

  constructor() {
    // The phone menu closes once the user has picked a page.
    inject(Router)
      .events.pipe(
        filter((event) => event instanceof NavigationEnd),
        takeUntilDestroyed(),
      )
      .subscribe(() => this.menuOpen.set(false));
  }
}
