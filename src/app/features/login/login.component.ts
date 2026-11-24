import { ChangeDetectionStrategy, Component, inject, input, signal } from '@angular/core';
import { Router } from '@angular/router';
import { AuthService } from '../../core/auth/auth.service';
import { DEMO_USERS } from '../../core/auth/demo-users';

/** Accepts in-app paths only, so ?returnUrl= cannot be turned into an open redirect. */
export const safeReturnUrl = (url: string | undefined): string =>
  url && /^\/(?![/\\])/.test(url) ? url : '/applications';

/** Demo login: pick a fictional user. There are no passwords or secrets in this repo. */
@Component({
  selector: 'app-login',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="row justify-content-center">
      <div class="col-md-6 col-lg-4">
        <h1 class="h3 mb-3">Sign in (demo)</h1>
        <p id="login-hint" class="text-body-secondary">
          Choose a demo user to see role-based behaviour.
        </p>
        <div
          class="list-group"
          role="group"
          aria-describedby="login-hint"
          [attr.aria-busy]="busy()"
        >
          @for (u of users; track u.id) {
            <button
              type="button"
              class="list-group-item list-group-item-action d-flex justify-content-between"
              [disabled]="busy()"
              (click)="login(u.id)"
            >
              {{ u.name }} <span class="badge text-bg-primary">{{ u.role }}</span>
            </button>
          }
        </div>
        @if (error(); as message) {
          <div class="alert alert-danger mt-3" role="alert">{{ message }}</div>
        }
      </div>
    </div>
  `,
})
export class LoginComponent {
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);

  /** Bound from ?returnUrl= (set by authGuard) via withComponentInputBinding. */
  readonly returnUrl = input<string>();

  protected readonly users = inject(DEMO_USERS);
  protected readonly busy = signal(false);
  protected readonly error = signal<string | null>(null);

  protected login(username: string): void {
    this.busy.set(true);
    this.error.set(null);
    this.auth.login(username).subscribe({
      next: () => void this.router.navigateByUrl(safeReturnUrl(this.returnUrl())),
      error: () => {
        this.busy.set(false);
        this.error.set('Sign-in failed. Please try again.');
      },
    });
  }
}
