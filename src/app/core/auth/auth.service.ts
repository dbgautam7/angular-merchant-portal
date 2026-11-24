import { HttpClient } from '@angular/common/http';
import { computed, inject, Injectable, signal } from '@angular/core';
import { Router } from '@angular/router';
import { finalize, map, Observable, shareReplay, tap } from 'rxjs';
import { API_BASE_URL } from '../config';
import { AuthResponse, Role, User } from '../models';

/**
 * Owns the session. The user is a signal so the UI reacts to login and logout. Tokens are
 * kept in memory only (never localStorage), so an injected script cannot read them from
 * storage. The trade-off is that a page reload means signing in again.
 */
@Injectable({ providedIn: 'root' })
export class AuthService {
  private readonly http = inject(HttpClient);
  private readonly router = inject(Router);
  private readonly apiBase = inject(API_BASE_URL);

  private readonly _user = signal<User | null>(null);
  private accessToken: string | null = null;
  private refreshToken: string | null = null;
  private refresh$: Observable<string> | null = null;

  readonly user = this._user.asReadonly();
  readonly isLoggedIn = computed(() => this._user() !== null);
  readonly role = computed(() => this._user()?.role ?? null);

  /** Current access token, read by the auth interceptor. */
  get token(): string | null {
    return this.accessToken;
  }

  /** Reads the role signal, so it is reactive inside templates, computed() and effects. */
  hasRole(...roles: Role[]): boolean {
    const role = this.role();
    return role !== null && roles.includes(role);
  }

  login(username: string): Observable<User> {
    return this.http.post<AuthResponse>(`${this.apiBase}/auth/login`, { username }).pipe(
      tap((res) => this.setSession(res)),
      map((res) => res.user),
    );
  }

  /**
   * Single-flight refresh: callers that arrive while a refresh is in flight share it, so a
   * burst of concurrent 401s sends exactly one POST /api/auth/refresh. If the refresh fails,
   * the session ends once, not once per waiting request.
   */
  refresh(): Observable<string> {
    this.refresh$ ??= this.http
      .post<AuthResponse>(`${this.apiBase}/auth/refresh`, { refreshToken: this.refreshToken })
      .pipe(
        tap({ next: (res) => this.setSession(res), error: () => this.logout() }),
        map((res) => res.accessToken),
        finalize(() => (this.refresh$ = null)),
        shareReplay({ bufferSize: 1, refCount: false }),
      );
    return this.refresh$;
  }

  logout(): void {
    this._user.set(null);
    this.accessToken = this.refreshToken = null;
    void this.router.navigate(['/login']);
  }

  private setSession({ user, accessToken, refreshToken }: AuthResponse): void {
    this._user.set(user);
    this.accessToken = accessToken;
    this.refreshToken = refreshToken;
  }
}
