import { HttpErrorResponse, HttpInterceptorFn, HttpRequest } from '@angular/common/http';
import { inject } from '@angular/core';
import { catchError, of, switchMap, throwError } from 'rxjs';
import { API_BASE_URL } from '../config';
import { AuthService } from './auth.service';

const withToken = (req: HttpRequest<unknown>, token: string) =>
  req.clone({ setHeaders: { Authorization: `Bearer ${token}` } });

/**
 * Attaches the access token and recovers from an expired one:
 * - On a 401 it calls AuthService.refresh(). That call is single-flight, so N concurrent 401s
 *   share ONE refresh, and each request is then retried once with the new token.
 * - A 401 that lands after another request has already refreshed reuses the new token
 *   instead of refreshing again.
 * - The retry runs outside catchError, so a second 401 goes straight to the caller (no loop).
 */
export const authInterceptor: HttpInterceptorFn = (req, next) => {
  // The bearer token is only ever sent to our own API (never to third-party origins), and not
  // to the auth endpoints, which take credentials or a refresh token instead. The trailing "/"
  // stops a look-alike host such as "https://api.example.com.evil.test" from matching.
  const api = inject(API_BASE_URL);
  if (!req.url.startsWith(`${api}/`) || req.url.startsWith(`${api}/auth/`)) return next(req);

  const auth = inject(AuthService);
  const sentToken = auth.token;
  if (!sentToken) return next(req); // signed out: nothing to attach or refresh

  return next(withToken(req, sentToken)).pipe(
    catchError((err: unknown) => {
      if (!(err instanceof HttpErrorResponse) || err.status !== 401) return throwError(() => err);

      const current = auth.token;
      if (!current) return throwError(() => err); // the session ended meanwhile
      const token$ = current !== sentToken ? of(current) : auth.refresh();
      return token$.pipe(switchMap((token) => next(withToken(req, token))));
    }),
  );
};
