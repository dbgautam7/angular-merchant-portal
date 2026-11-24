# Merchant Payments Portal — Senior Angular Take-Home

Angular 20 app for merchant applications, with role-based access (SALES / REVIEWER / ADMIN).
It runs fully offline: an in-memory mock API is built in, so you only need `npm start`.
It is built in stages. **This stage adds the multi-step application wizard**: reactive forms with custom validators, debounced auto-save into a server draft, and saving before you leave. The detail and review page is still a placeholder.

```bash
npm install
npm start        # http://localhost:4200, then pick a demo user on the login screen
npm test         # Vitest + Angular TestBed
npm run build
```

## Roadmap

| Stage | Scope                                                                              | Status  |
| ----- | ---------------------------------------------------------------------------------- | ------- |
| 1     | Architecture: workspace, tooling, domain model, app shell, lazy routes, test setup | ✅ done |
| 2     | Mock backend (interceptor) and typed API client                                    | ✅ done |
| 3     | Auth: login, route guards, bearer-token interceptor with single-flight refresh     | ✅ done |
| 4     | Dashboard: server-side pagination, filtering, loading/error/retry                  | ✅ done |
| 5     | Multi-step wizard: reactive forms, custom validators, debounced auto-save          | ✅ done |
| 6     | Detail & review: risk history, role-aware controls, sensitive-field masking, CSP   | planned |

## Tech stack

| Requirement                          | Implementation                                                                                                                                                                          |
| ------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Angular 20+, standalone, `@if/@for`  | Standalone components only, no NgModules, built-in control flow only                                                                                                                    |
| Signals + `inject()`                 | Session state in signals (`user`, `isLoggedIn`, `role`); route params as `input()`; `inject()` everywhere                                                                               |
| Router, lazy features, guards        | Each page loaded with `loadComponent`; functional `authGuard` and `roleGuard(...)`                                                                                                      |
| HTTP interceptor with single refresh | `core/auth/auth.interceptor.ts` + `AuthService.refresh()`: N concurrent 401s → **one** `POST /api/auth/refresh`                                                                         |
| RxJS for async flows                 | Dashboard: `toObservable(query)` → `switchMap` (cancels stale requests) → `scan` (view state) → `toSignal`; debounced search. Wizard: auto-save queue with `debounceTime` + `concatMap` |
| Reactive Forms, custom validation    | Typed `NonNullableFormBuilder` form, one group per step; custom validators in `shared/validators.ts`; draft auto-save in `shared/auto-save.ts`                                          |
| Change detection                     | New components use `OnPush`; signals tell Angular exactly what changed. Form fields turn `AbstractControl.events` into signals                                                          |
| Mock API                             | `core/mock/mock-api.interceptor.ts`, the last interceptor in the chain, acting as the server                                                                                            |
| Bootstrap 5 + SCSS, responsive       | Bootstrap grid, table and utilities; global overrides in `styles.scss`, component SCSS; secondary columns hidden below `md`                                                             |
| Vitest + TestBed                     | Angular's `@angular/build:unit-test` builder with `runner: vitest` and jsdom                                                                                                            |
| Type safety                          | `strict` TypeScript plus `strictTemplates`, `strictInjectionParameters`, `typeCheckHostBindings`                                                                                        |

## Structure

```
src/app/
  app.ts          shell: skip link, role-aware navbar, <router-outlet>
  app.config.ts   providers: router (input binding), HttpClient + interceptors, demo-user wiring
  app.routes.ts   lazy route table with guards
  core/
    models.ts     domain types
    api/          ApplicationApi, the typed HTTP client (one method per endpoint)
    auth/         AuthService (session), authInterceptor, guards, DEMO_USERS token
    mock/         in-memory backend (interceptor) and fictional seed data
  shared/         reusable UI and logic: StatusBadge, form field, validators, auto-save, unsaved-changes guard (masking comes next)
  features/       one folder per lazy route: login, dashboard, application (wizard), detail
```

Dependencies flow one way: `features → shared → core`. `core` never imports from features.

## Mock backend

`mockApiInterceptor` answers every `/api/*` request in memory, with 250 ms of simulated latency. **It enforces permissions itself.** Hiding a button in the UI only improves the UX; it is not the security boundary.

| Method & path                              | Who                  | Notes                                                                           |
| ------------------------------------------ | -------------------- | ------------------------------------------------------------------------------- |
| `POST /api/auth/login`                     | anyone               | `{ username }` (a demo user id) returns the user plus access and refresh tokens |
| `POST /api/auth/refresh`                   | refresh-token holder | rotates the pair; each refresh token works **once**                             |
| `GET /api/applications?page&size&status&q` | all roles            | server-side paging and filtering, scoped by role; `q=error` simulates a 500     |
| `POST /api/applications`                   | SALES                | creates an empty draft                                                          |
| `GET /api/applications/:id`                | anyone in scope      | sensitive fields come back masked                                               |
| `PUT /api/applications/:id`                | SALES (own draft)    | saves a draft; 403 once submitted                                               |
| `POST /api/applications/:id/submit`        | SALES (own draft)    | DRAFT → SUBMITTED                                                               |
| `POST /api/applications/:id/decision`      | REVIEWER, ADMIN      | `{ decision, comment }` on SUBMITTED / IN_REVIEW; appended to risk history      |
| `PUT /api/applications/:id/assign`         | ADMIN                | `{ reviewerId }`; SUBMITTED → IN_REVIEW                                         |
| `GET /api/applications/:id/reveal/:field`  | REVIEWER, ADMIN      | unmasked `taxId` / `accountNumber`, audit-logged                                |
| `GET /api/users/reviewers`                 | ADMIN                | reviewer list for assignment                                                    |

- **Scope.** SALES sees only applications they created, REVIEWER only those assigned to them, ADMIN everything. Anything out of scope returns **404, not 403**, so its existence isn't leaked.
- **Tokens.** Access tokens live 30 s on purpose, so the refresh flow below is easy to trigger. Requests without a valid token get 401.
- **Masking.** Tax ID and account number leave the "server" as `••••••••6789`. The only exception is the author's own draft, which they need to edit.
- **Demo data.** 42 seeded applications and 5 users (`u-sales-1`, `u-sales-2`, `u-rev-1`, `u-rev-2`, `u-admin`). All names, numbers and `example.com` addresses are fictional.

## Authentication & token refresh

- **Login.** The demo login lists fictional users (no passwords exist). The list comes from the `DEMO_USERS` injection token, which `app.config.ts` fills from the mock seed data, so the login feature never imports mock code.
- **Session.** `AuthService` holds the user in signals and keeps tokens **in memory only**, never in `localStorage`, so an XSS bug cannot read them from storage. A page reload means signing in again. In production, the refresh token would live in an httpOnly cookie.
- **Guards.** `authGuard` sends anonymous users to `/login?returnUrl=…` and the login page returns them there afterwards. `safeReturnUrl` accepts in-app paths only, so the parameter can't become an open redirect. `roleGuard('SALES')` protects the create and edit routes. Guards run before a lazy chunk is fetched. They are UX only: the API enforces the same roles.
- **Interceptor** (`authInterceptor`):
  - attaches `Authorization: Bearer …` to our own `/api/*` calls only, never to auth endpoints or third-party origins;
  - on a 401, calls `AuthService.refresh()`. That call is **single-flight** (`shareReplay` plus an in-flight reference), so every concurrent 401 shares one `POST /api/auth/refresh`, and each request is then retried **once** with the new token;
  - for a 401 that lands after another request already refreshed, reuses the new token instead of refreshing again;
  - performs the retry outside `catchError`, so a second 401 goes straight to the caller and cannot loop;
  - if the refresh fails, ends the session **once** (not once per waiting request), and every waiting request fails.

## Dashboard

- **The URL is the single source of truth.** `?page`, `?status` and `?q` are bound to signal `input()`s via `withComponentInputBinding()`. Filters survive a reload, Back and Forward work, and any view can be shared as a link. Query params are untrusted, so invalid values (`page=-3`, `status=toString`) fall back to defaults before reaching the API.
- **Data flow.** `query` is a `computed` of the inputs. `toObservable(query)` plus a Retry subject feed `switchMap`, which cancels a stale request when the filters change. `scan` folds request, success and failure into one `ListState`, exposed with `toSignal`. The trimmed search term is its own `computed`, so typing a trailing space doesn't refetch.
- **No flicker.** While the next page loads, the current rows stay on screen, dimmed and marked `aria-busy`. The full spinner shows only when there are no rows to show yet. I chose this over `rxResource` because a resource resets `value()` when its params change (blanking the table) and throws from `value()` in the error state; it is also still `@experimental` in Angular 20.
- **Search** is debounced (300 ms), resets to page 1, and uses `replaceUrl` so typing doesn't flood the history. It is compared with the URL rather than with `distinctUntilChanged`, so it stays correct after Back or Forward. Type `error` to simulate a 500 and try Retry.
- **States.** Loading, an error with Retry (filters are kept), an empty result with "Clear filters", and Previous/Next, which are disabled at the ends and clamp to the valid range (so Previous on `?page=99` goes to the last page).
- **Permission-aware.** "New application" is shown to SALES only, and Edit only to SALES on drafts; View is shown to everyone. This is UX only, since the API scopes the rows and rejects other edits.
- **Accessibility.** The search form is labelled with `role="search"`, every control has a label, the table has a caption and `scope` headers, row actions carry aria-labels ("Edit Demo Merchant 5 Pvt Ltd"), and a polite live region announces "42 applications found".

## Application wizard

Four steps (Business, Owner, Banking, Review) over one typed reactive form. Each step is a `FormGroup`, and the form's shape matches `ApplicationForm`, so `getRawValue()` is the API payload.

- **Validation.** Built-in validators plus custom ones in `shared/validators.ts`: registration number, tax ID and account number formats, `https://` URLs (parsed with `URL`, not a regex), whitespace-only text, and `minAge(18)`. Custom validators ignore empty values and leave that to `Validators.required`, so each error says one thing. `minAge` reads the date as a local calendar date: `new Date('2008-11-24')` parses as UTC midnight, which is the previous day west of Greenwich, so the birthday check would be off by one. I checked it by running the suite with `TZ=America/Los_Angeles` and `TZ=Asia/Kathmandu`.
- **Errors appear when they help.** A message shows after the field is touched (blur) or when the user tries to move on. Next, Enter, and jumping ahead in the stepper all stop at the first invalid step, mark it touched and focus its first invalid field. Going back is always allowed. Enter on a data step means Next and never submits the application.
- **Accessible fields.** `<app-form-field>` renders the label, hint and error. Its `appFieldControl` directive gives the input a matching `id`, `aria-invalid`, `aria-required` and `aria-describedby` (hint plus error), so a screen reader reads the error when the field gets focus. Errors are not live regions, so ten errors don't interrupt ten times. Each step change moves focus to the step heading.
- **OnPush-safe errors.** A field's inputs never change while the user types, so `FormFieldComponent` subscribes to the control's `events` stream (value, status and touched changes, Angular 18+) and keeps the message in a signal. It updates even when the change comes from code, such as `markAllAsTouched()`.
- **Auto-save** (`shared/auto-save.ts`) is a small `autoSave()` function, called in a field initializer like `toSignal`:
  - debounced (800 ms), and a save is skipped when the value equals the last saved one (typing and then undoing sends nothing);
  - one save at a time, in order (`concatMap`). Saves never overlap or arrive out of order, and a queued save reads the form when it starts, so it never sends stale data;
  - the first save on `/new` creates the server draft, so an untouched form never creates an empty draft. The URL then switches to `/:id/edit` with `replaceUrl`, so a reload reopens the draft;
  - status shown in a polite live region: Unsaved changes, Saving, Draft saved at 10:42, or Draft not saved with Retry. A failed save keeps the form exactly as it is.
- **One route for `/new` and `/:id/edit`** (`wizardMatcher` in `app.routes.ts`). Angular reuses a component only within the same route, so switching the URL to the new draft keeps the wizard mounted: no reload, and the cursor stays where it was. It also means "New application" from an open draft gives a blank form instead of the old answers, a bug that two separate routes plus `Location.replaceState` would have.
- **Nothing is lost on the way out.** `unsavedChangesGuard` (canDeactivate) saves pending changes before the router leaves; if that save fails, it asks before leaving. Closing the tab with unsaved changes triggers the browser's own "Leave site?" prompt (`beforeunload`). Submit also goes through the save queue, so the server always submits the latest answers.
- **Drafts only.** Loading an application that is no longer a draft opens its read-only page. Someone else's draft is a 404 from the server, shown as an error. The edit routes are SALES-only (`roleGuard`), and the API enforces the same rules.
- **Sensitive values.** Tax ID and account number are plain text while typing, so the author can check them; a password field would also trigger password managers. They are masked everywhere they are displayed, starting with the review step (`••••••••6789`, the same format the server uses).

## Architecture decisions

- **Domain model first.** `core/models.ts` defines roles, statuses, the three-part application form (business, owner, banking), risk events and the paging/query contracts. Every later layer is typed against it.
- **Mock backend as an interceptor**, not json-server. It needs no extra process, and every permission rule lives in one file. Swapping in a real API means removing `mockApiInterceptor` and the `DEMO_USERS` provider from `app.config.ts`; `ApplicationApi` and every feature stay the same.
- **Lazy features.** Each route ships as its own chunk; `@angular/forms` is only in the wizard's chunk. The wizard route is declared before `/:id`, so `/applications/new` never matches as an id.
- **Route params as inputs.** With `withComponentInputBinding()`, `:id` arrives as a signal `input()`, with no `ActivatedRoute` subscriptions.
- **OnPush and `protected` template members** (Angular style guide). Components react to signals; members used only by the template are `protected`, so a component's public API is just its inputs.
- **Placeholders keep their final paths and class names.** Later stages replace the files without touching the route table.

## Tests (`npm test`)

- `app.routes.spec`: every page is lazy-loaded; one wizard route matches `new` and `:id/edit`, sits before `:id` and carries both guards; root and unknown URLs redirect.
- `mock-api.interceptor.spec`: the server rules, tested through `ApplicationApi`. Covers 401 for missing or expired tokens, refresh-token rotation, role-scoped lists, server-side paging and filtering, 404 for out-of-scope records, masking with audited reveal, the draft lifecycle, and role checks on decisions and assignment.
- `auth.interceptor.spec`: bearer header on API calls only; **3 concurrent 401s → exactly 1 refresh → 3 retries with the new token**; a late 401 reuses the new token; no second retry; one logout when the refresh fails; non-401 errors and signed-out requests pass through. One end-to-end test does the same against the real mock `POST /api/auth/refresh`.
- `guards.spec`: anonymous users go to `/login` with `returnUrl`; role blocking and multi-role access.
- `login.component.spec`: `safeReturnUrl` rejects external, protocol-relative and `javascript:` URLs; sign-in returns to the intercepted page; failures show an error and re-enable the buttons.
- `app.spec`: the navbar is hidden while signed out, "New application" shows for SALES only, and logout works.
- `dashboard.component.spec` (real router via `RouterTestingHarness`): the URL drives the API query; invalid params fall back; role-aware actions for SALES and REVIEWER; debounced search resets the page and replaces history; the status filter syncs both ways; paging and its disabled ends; error → Retry recovers with the same filters; rows stay visible and busy while the next page loads; Clear filters on an empty result.
- `validators.spec`: each format, empty values left to `required`, `https` only, whitespace-only text, the 18th-birthday boundary, impossible dates, and the error messages.
- `form-field.spec` (OnPush host): label/`id` link, required marker and `aria-required`, no error before touch, error and hint in `aria-describedby`, updates from code under OnPush.
- `auto-save.spec` (fake timers): one debounced save of the latest value; no request for unchanged values; saves never overlap and a queued save sends the newest value; failure, then retry via `flush()`; `flush()` waits for a running save; `reset()` after load.
- `application-wizard.component.spec` (real router): Next and Enter stop at invalid steps and focus the first error; jumping ahead only through valid steps; the first auto-save creates the draft once, switches the URL and keeps the wizard mounted; "New application" then starts blank; loading a draft doesn't save it; submitted applications open read-only; masked review values; submit saves pending changes first; submit and save failures with Retry; saving before leaving, and asking when that fails.

## AI assistance disclosure

AI assistance was used for scaffolding and drafting code. I review every file, and each stage is checked with the test suite and a production build before it is pushed.
