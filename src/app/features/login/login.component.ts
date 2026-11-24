import { ChangeDetectionStrategy, Component, inject, input, signal } from '@angular/core';
import { Router } from '@angular/router';
import { AuthService } from '../../core/auth/auth.service';
import { DEMO_USERS } from '../../core/auth/demo-users';
import { Role } from '../../core/models';
import { IconComponent } from '../../shared/icon.component';
import { initials, ROLE_DESCRIPTIONS, ROLE_LABELS } from '../../shared/roles';

/** Accepts in-app paths only, so ?returnUrl= cannot be turned into an open redirect. */
export const safeReturnUrl = (url: string | undefined): string =>
  url && /^\/(?![/\\])/.test(url) ? url : '/applications';

/** Demo login: pick a fictional user. There are no passwords or secrets in this repo. */
@Component({
  selector: 'app-login',
  imports: [IconComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  styleUrl: './login.component.scss',
  template: `
    <div class="login card">
      <section class="login-intro" aria-labelledby="intro-heading">
        <span class="login-mark"><app-icon name="card" /></span>
        <h2 id="intro-heading" class="h4">Onboard merchants with confidence</h2>
        <ul class="login-features">
          <li><app-icon name="file" /> A guided application form that saves itself</li>
          <li><app-icon name="shield" /> Role-based review with a full risk history</li>
          <li><app-icon name="lock" /> Sensitive data masked, with audited reveal</li>
        </ul>
      </section>

      <section class="login-panel" aria-labelledby="login-heading">
        <h1 id="login-heading" class="h3 mb-1">Sign in</h1>
        <p id="login-hint" class="text-body-secondary mb-4">
          This is a demo. Choose a fictional user to explore what each role can do; there are no
          passwords.
        </p>
        <div
          class="login-users"
          role="group"
          aria-labelledby="login-heading"
          aria-describedby="login-hint"
          [attr.aria-busy]="pending() !== null"
        >
          @for (u of users; track u.id) {
            <button
              type="button"
              class="login-user"
              [disabled]="pending() !== null"
              (click)="login(u.id)"
            >
              <span class="avatar" aria-hidden="true">{{ initialsOf(u.name) }}</span>
              <span class="login-user-text">
                <span class="login-user-name">{{ u.name }}</span>
                <span class="login-user-role">{{ roleLabel(u.role) }}</span>
                <span class="login-user-description">{{ roleDescription(u.role) }}</span>
              </span>
              @if (pending() === u.id) {
                <span class="spinner-border spinner-border-sm" aria-hidden="true"></span>
              } @else {
                <app-icon class="login-user-arrow" name="chevronRight" />
              }
            </button>
          }
        </div>
        @if (error(); as message) {
          <div class="alert alert-danger d-flex gap-2 mt-3 mb-0" role="alert">
            <app-icon name="alert" /> {{ message }}
          </div>
        }
      </section>
    </div>
  `,
})
export class LoginComponent {
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);

  /** Bound from ?returnUrl= (set by authGuard) via withComponentInputBinding. */
  readonly returnUrl = input<string>();

  protected readonly users = inject(DEMO_USERS);
  /** The user being signed in; disables the other options meanwhile. */
  protected readonly pending = signal<string | null>(null);
  protected readonly error = signal<string | null>(null);

  protected initialsOf(name: string): string {
    return initials(name);
  }

  protected roleLabel(role: Role): string {
    return ROLE_LABELS[role];
  }

  protected roleDescription(role: Role): string {
    return ROLE_DESCRIPTIONS[role];
  }

  protected login(username: string): void {
    this.pending.set(username);
    this.error.set(null);
    this.auth.login(username).subscribe({
      next: () => void this.router.navigateByUrl(safeReturnUrl(this.returnUrl())),
      error: () => {
        this.pending.set(null);
        this.error.set('Sign-in failed. Please try again.');
      },
    });
  }
}
