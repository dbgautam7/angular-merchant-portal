# 1. Where the session tokens live

- **Status:** accepted for this demo; the production design is in "Decision for production"
- **Context date:** November 2026

## Context

The app calls its API with a bearer access token and renews it with a refresh token
(`authInterceptor` plus `AuthService.refresh()`, single-flight on concurrent 401s). Where these
two tokens are kept decides three things:

- **XSS:** what an injected script can steal or keep using.
- **CSRF:** whether another site can make the browser use the session.
- **Continuity:** whether the session survives a page reload, and how it behaves across tabs.

The backend here is an in-browser mock (an HTTP interceptor). It cannot set real cookies, and its
database is rebuilt from seed data on every page load.

## Options considered

| Option                                                                                          | XSS                                                                                                                        | CSRF                                                                                      | Survives reload                      | Verdict                                                     |
| ----------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------- | ------------------------------------ | ----------------------------------------------------------- |
| **A. `localStorage` / `sessionStorage`**                                                        | Any injected script can read both tokens and send them anywhere; a stolen refresh token keeps working after the tab closes | None (nothing sent automatically)                                                         | Yes                                  | Rejected: one XSS bug becomes a long-lived account takeover |
| **B. Memory only** (both tokens in `AuthService`)                                               | A script running in the page can use the session while the page is open, but finds nothing in storage to steal or keep     | None                                                                                      | No                                   | **Chosen for this demo**                                    |
| **C. Access token in memory, refresh token in an `httpOnly` cookie**                            | Script can't read the refresh token; it can use the short-lived access token only while the page is open                   | Mitigated: `SameSite=Strict`, cookie scoped to `/api/auth`, rotation with reuse detection | Yes, by a silent refresh on start-up | **Chosen for production**                                   |
| **D. Backend-for-frontend (BFF)**: a server-side session cookie; tokens never reach the browser | No token exposed at all                                                                                                    | Needs CSRF protection (SameSite plus a CSRF token or custom header)                       | Yes                                  | Strongest; worth it when the team owns a server tier        |

## Decision for this demo: B, memory only

- Option C needs a server that sets an `httpOnly` cookie. The in-browser mock can't, and faking it
  with JavaScript-readable storage would just be option A with extra steps.
- A restored session would be meaningless anyway, since the mock's data resets on every reload.
- Option B keeps the important property: nothing in storage that an XSS payload can exfiltrate.
  The CSP (`script-src 'self'`, Trusted Types) makes injecting that payload hard in the first place.

**Consequences:**

- A reload signs the user out.
- Each tab has its own session.
- Deep links still work: `authGuard` sends the user to sign in, then back via `returnUrl`.

## Decision for production: C, with a path to D

1. **Access token:** short-lived (5 to 15 minutes), memory only, as today.
2. **Refresh token:** an `HttpOnly; Secure; SameSite=Strict; Path=/api/auth` cookie, rotated
   on every use. A reused refresh token revokes the whole token family, which catches stolen
   copies. The refresh response carries only the new access token in its body.
3. **Start-up:** an app initializer calls `POST /api/auth/refresh` (with credentials). If it
   succeeds, the session is restored silently; if not, the user sees the sign-in page.
4. **Tabs:** a `BroadcastChannel` shares sign-out, and optionally the fresh access token, so
   tabs don't race to rotate the same cookie; the server allows a few seconds of grace on rotation.
5. **Sign-out:** the server revokes the refresh token and clears the cookie.

**What changes in the code:**

- `AuthService.refresh()` stops sending a refresh token in the body and sets `withCredentials`.
- The `refreshToken` field is removed, and a `restoreSession()` app initializer is added.
- `authInterceptor`, the single-flight refresh and every feature stay as they are.
