# Merchant Payments Portal — Senior Angular Take-Home

Angular 20 app for merchant applications, with role-based access (SALES / REVIEWER / ADMIN).
It runs fully offline: an in-memory mock API is built in, so you only need `npm start`.
It was built in six stages, one commit each. **This last stage adds the detail and review page**: risk history, approve/reject and assignment for reviewers and admins only, masked sensitive values with an audited reveal, and a Content Security Policy.

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
| 6     | Detail & review: risk history, role-aware controls, sensitive-field masking, CSP   | ✅ done |

## Tech stack

| Requirement                          | Implementation                                                                                                                                                                          |
| ------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Angular 20+, standalone, `@if/@for`  | Standalone components only, no NgModules, built-in control flow only                                                                                                                    |
| Signals + `inject()`                 | Session state in signals (`user`, `isLoggedIn`, `role`); route params as `input()`; `computed` view rules; `linkedSignal` for server updates; `inject()` everywhere                     |
| Router, lazy features, guards        | Each page loaded with `loadComponent`; functional `authGuard` and `roleGuard(...)`                                                                                                      |
| HTTP interceptor with single refresh | `core/auth/auth.interceptor.ts` + `AuthService.refresh()`: N concurrent 401s → **one** `POST /api/auth/refresh`                                                                         |
| RxJS for async flows                 | Dashboard: `toObservable(query)` → `switchMap` (cancels stale requests) → `scan` (view state) → `toSignal`; debounced search. Wizard: auto-save queue with `debounceTime` + `concatMap` |
| Reactive Forms, custom validation    | Typed `NonNullableFormBuilder` form, one group per step; custom validators in `shared/validators.ts`; draft auto-save in `shared/auto-save.ts`                                          |
| Change detection                     | New components use `OnPush`; signals tell Angular exactly what changed. Form fields turn `AbstractControl.events` into signals                                                          |
| Mock API                             | `core/mock/mock-api.interceptor.ts`, the last interceptor in the chain, acting as the server                                                                                            |
| Bootstrap 5 + SCSS, responsive       | Bootstrap built from Sass with a theme (`src/styles/`): tokens, light and dark mode, only the modules used; layouts tested at phone and desktop widths                                  |
| Vitest + TestBed                     | Angular's `@angular/build:unit-test` builder with `runner: vitest` and jsdom                                                                                                            |
| Masking, role-based reveal, CSP      | `SensitiveValueComponent` (masked always, audited reveal for REVIEWER/ADMIN); CSP with Trusted Types in `src/index.html`; see [Security](#security)                                     |
| Type safety                          | `strict` TypeScript plus `strictTemplates`, `strictInjectionParameters`, `typeCheckHostBindings`                                                                                        |

## Structure

```
src/app/
  app.ts          shell: skip link, sticky role-aware navbar (collapses on phones), <router-outlet>
  core/title-strategy.ts  "Applications · Merchant Portal" page titles
  app.config.ts   providers: router (input binding), HttpClient + interceptors, demo-user wiring
  app.routes.ts   lazy route table with guards
  core/
    models.ts     domain types
    api/          ApplicationApi, the typed HTTP client (one method per endpoint)
    auth/         AuthService (session), authInterceptor, guards, DEMO_USERS token
    mock/         in-memory backend (interceptor) and fictional seed data
  shared/         reusable UI and logic: icons, status badge, form field, sensitive value, validators,
                  auto-save, masking, roles and category labels, focus helper, unsaved-changes guard
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
| `GET /api/applications/summary?q`          | all roles            | counts per status in the same scope, for the dashboard tabs                     |
| `POST /api/applications`                   | SALES                | creates an empty draft                                                          |
| `GET /api/applications/:id`                | anyone in scope      | sensitive fields come back masked                                               |
| `PUT /api/applications/:id`                | SALES (own draft)    | saves a draft; 403 once submitted                                               |
| `POST /api/applications/:id/submit`        | SALES (own draft)    | DRAFT → SUBMITTED                                                               |
| `POST /api/applications/:id/decision`      | REVIEWER, ADMIN      | `{ decision, comment }` on SUBMITTED / IN_REVIEW; validated; added to history   |
| `PUT /api/applications/:id/assign`         | ADMIN                | `{ reviewerId }`, only while under review; SUBMITTED → IN_REVIEW                |
| `GET /api/applications/:id/reveal/:field`  | REVIEWER, ADMIN      | unmasked `taxId` / `accountNumber`, audit-logged                                |
| `GET /api/users/reviewers`                 | ADMIN                | reviewer list for assignment                                                    |

- **Scope.** SALES sees only applications they created, REVIEWER only those assigned to them, ADMIN everything. Anything out of scope returns **404, not 403**, so its existence isn't leaked.
- **Tokens.** Access tokens live 30 s on purpose, so the refresh flow below is easy to trigger. Requests without a valid token get 401.
- **Masking.** Tax ID and account number leave the "server" as `••••••••6789`. The only exception is the author's own draft, which they need to edit.
- **Validation.** The server checks what it is sent, not just who sends it: a decision must be `APPROVED` or `REJECTED` with a non-blank comment (400 otherwise), so a client can't send `DRAFT` to reopen an application. A decided application can't be decided again, and only applications under review can be assigned; assigning a draft would show it to a reviewer before submission.
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

## Detail & review

- **One page, three views.** SALES sees their application read-only, with "Continue editing" on a draft. REVIEWER sees the risk decision panel for applications assigned to them. ADMIN also gets the assignment panel. Who sees which control is one `computed` (`can`) in `application-detail.component.ts`, so the policy can be reviewed in one place; the API enforces the same rules.
- **Loading.** `toObservable(id)` plus a Retry subject feed `switchMap`, as on the dashboard. "Not found" (a 404, which is also what the API answers outside your scope) is shown differently from errors that Retry can fix.
- **Actions update in place.** Approve, Reject and Assign return the updated application. It goes into a `linkedSignal`, which follows each load but can also be set locally, so the page shows the new status and history without a refetch. One action runs at a time, and focus moves to the confirmation because the panel that had focus is gone. If the server refuses because the application changed (someone else decided, or it was reassigned), the page reloads and says so.
- **Decisions need a comment** (5 to 500 characters, not just spaces), using the same `<app-form-field>` as the wizard; the API checks it again. Comments are saved to the risk history with the reviewer's name, newest first.
- **Sensitive values** (`shared/sensitive-value.component.ts`):
  - always shown masked. The value is masked in the browser too, so it is never shown in full by accident, even when the API sends it unmasked (the author's own draft);
  - screen readers hear "Hidden, ends in 6789", not eight "bullet"s;
  - REVIEWER and ADMIN get "Reveal tax ID" / "Reveal account number". Each reveal is a fresh `GET /reveal/:field` that the server checks and audit-logs, and the value hides itself after 30 seconds. The reveal is an RxJS flow (request → show → timer → hide) in `switchMap`, so Hide cancels the timer and leaving the page cleans it up.

## Security

- **The server is the authority.** Every rule the UI applies (scope, roles, states, validation) is enforced again by the mock API, and the tests check both sides. Out-of-scope records are 404, so their existence isn't leaked.
- **Content Security Policy** (`src/index.html`):
  ```
  default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:;
  font-src 'self'; connect-src 'self'; object-src 'none'; base-uri 'self'; form-action 'self';
  require-trusted-types-for 'script'; trusted-types angular angular#bundler
  ```
  - `script-src 'self'`: only our own bundles run. An injected `<script>` or `onerror=` attribute is blocked even if an XSS bug slips through.
  - `connect-src 'self'`: a script that did run still can't send data to another origin.
  - `object-src 'none'`, `base-uri 'self'`, `form-action 'self'`: no plugins, no `<base>` hijacking of relative URLs, no forms posting elsewhere.
  - Trusted Types (`require-trusted-types-for 'script'`): DOM sinks such as `innerHTML` only accept values from a named policy. Angular registers its policy as `angular`, so a stray `innerHTML = userInput` fails instead of injecting markup. Enforced in Chromium browsers.
  - `img-src data:`: Bootstrap draws icons (select arrows, validation marks) as `data:` SVGs.
  - `style-src 'unsafe-inline'`: Angular adds component styles as `<style>` tags. Removing it needs a per-request nonce (`ngCspNonce`), which requires a server to render `index.html`.
- **One build change was needed for the CSP.** Angular's production build inlines critical CSS and loads the full stylesheet with `<link media="print" onload="this.media='all'">`. That `onload` is an inline script, which `script-src 'self'` blocks, so only the small inlined critical CSS would ever apply. Critical-CSS inlining is off in `angular.json`; the stylesheet is a plain `<link>`.
- **Checked in a browser.** I drove the production build in headless Chromium: sign in, dashboard, detail, reveal, approve, then the wizard's auto-save. It produced no CSP or Trusted Types violations and no console errors.
- **In production**, send the policy as an HTTP header. A header can also carry `frame-ancestors 'none'` (clickjacking) and `report-to`, which a meta tag can't.
- **Angular's own protection.** Templates escape interpolated values and sanitize bound URLs, so a merchant website of `javascript:…` would never run. The code never uses `bypassSecurityTrust*` or `innerHTML`.
- **Tokens** live in memory only (see Authentication). **No secrets or real data**: all users and merchants are fictional (`example.com`, made-up numbers).

## UI & design

- **Theme.** Bootstrap 5 is compiled from its Sass source (`src/styles/_bootstrap.scss`) with the app's design tokens (`_theme.scss`): an indigo brand colour, slate neutrals, the system font (nothing to download, so the CSP stays `font-src 'self'`), softer radii and shadows. Only the Bootstrap modules the app uses are compiled; the global CSS went from 231 kB to 171 kB (23 kB → 18 kB over the wire). Bootstrap 5.3 has no `@use` API yet, so its documented `@import` theming is used and that single Sass deprecation is silenced in `angular.json`.
- **Light and dark mode** follow the operating system (`prefers-color-scheme`), with no toggle or script. Every custom style uses Bootstrap's CSS variables, so both modes come from the same rules.
- **Shared patterns** (`src/styles/_app.scss`): page header, cards, data table, soft status badges with a dot, empty and error states, a thin loading bar, label-above-value detail grids, and section titles with icon tiles.
- **Icons** are a small set drawn for the app (`shared/icon.component.ts`) and rendered as inline SVG through Angular bindings: no icon font, nothing extra for the CSP to allow, and no `innerHTML`. They are decorative (`aria-hidden`); every control has a text label.
- **Pages:**
  - _Shell_: sticky, translucent top bar with the brand mark, active-page highlight and a user chip. On phones the links fold into a menu button (`aria-expanded`), which closes after navigating.
  - _Sign in_: a two-panel card. Each demo user shows their role and what it can do, and the chosen one shows a spinner.
  - _Applications_: status tabs with live counts (links, so every filter has a URL), a search field, and a table whose merchant name opens the row (the link stretches over the whole row). Skeleton rows on first load, a thin bar plus dimmed rows on later loads, real empty and error states, and numbered pagination ("Showing 11–20 of 42"). Secondary columns fold into the merchant cell on phones.
  - _Application form_: a stepper (vertical beside the form on desktop, horizontal above it on phones) whose markers show the current step, completed steps with a check, and visited steps with errors with a "!". The form card has a step count, intro text, and a sticky Back/Next bar. The review step groups answers in sections with Change buttons. Save status sits in a pill in the header.
  - _Application details_: a lifecycle tracker (Draft → Submitted → In review → Approved/Rejected), section cards, the risk history as a timeline, and decision and assignment panels in a sticky column. Masked values show a lock, and a revealed one shows an eye and when it will hide.
- **Accessibility** carried through the redesign: one `h1` per page, labelled landmarks, `aria-current` on the active nav link, filter tab, page number and step, visually hidden text wherever an icon carries meaning, and visible focus rings. Motion respects `prefers-reduced-motion`. The skip link moves focus to the page content directly: a plain `href="#main"` resolves against `<base href="/">` to `/#main` and would reload the app at the root (a bug since stage 1, fixed here).
- **Checked visually.** Every page was screenshotted in headless Chromium at 1280 px and 390 px, in light and dark mode, with no CSP violations or console errors.

## Architecture decisions

- **Domain model first.** `core/models.ts` defines roles, statuses, the three-part application form (business, owner, banking), risk events and the paging/query contracts. Every later layer is typed against it.
- **Mock backend as an interceptor**, not json-server. It needs no extra process, and every permission rule lives in one file. Swapping in a real API means removing `mockApiInterceptor` and the `DEMO_USERS` provider from `app.config.ts`; `ApplicationApi` and every feature stay the same.
- **Lazy features.** Each route ships as its own chunk; `@angular/forms` is loaded only with the wizard and detail pages, never in the initial bundle. The wizard route is declared before `/:id`, so `/applications/new` never matches as an id.
- **Route params as inputs.** With `withComponentInputBinding()`, `:id` arrives as a signal `input()`, with no `ActivatedRoute` subscriptions.
- **OnPush and `protected` template members** (Angular style guide). Components react to signals; members used only by the template are `protected`, so a component's public API is just its inputs.
- **Placeholders kept their final paths and class names**, so each stage replaced files without touching the route table.

## Tests (`npm test`)

- `app.routes.spec`: every page is lazy-loaded; one wizard route matches `new` and `:id/edit`, sits before `:id` and carries both guards; every page has a title; root and unknown URLs redirect.
- `mock-api.interceptor.spec`: the server rules, tested through `ApplicationApi`. Covers per-status counts within the user's scope and search, 401 for missing or expired tokens, refresh-token rotation, role-scoped lists, server-side paging and filtering, 404 for out-of-scope records, masking with audited reveal, the draft lifecycle, role checks on decisions and assignment, and server-side validation of decisions (no unknown values, no blank comments, no deciding twice) and assignment (only while under review).
- `auth.interceptor.spec`: bearer header on API calls only; **3 concurrent 401s → exactly 1 refresh → 3 retries with the new token**; a late 401 reuses the new token; no second retry; one logout when the refresh fails; non-401 errors and signed-out requests pass through. One end-to-end test does the same against the real mock `POST /api/auth/refresh`.
- `guards.spec`: anonymous users go to `/login` with `returnUrl`; role blocking and multi-role access.
- `login.component.spec`: `safeReturnUrl` rejects external, protocol-relative and `javascript:` URLs; sign-in returns to the intercepted page; failures show an error and re-enable the buttons.
- `app.spec`: the navbar is hidden while signed out, "New application" shows for SALES only, logout works, the phone menu opens and closes with `aria-expanded`, and the skip link moves focus without leaving the page.
- `dashboard.component.spec` (real router via `RouterTestingHarness`): the URL drives the API query; invalid params fall back; role-aware actions for SALES and REVIEWER; debounced search resets the page and replaces history; status tabs are links that keep the search, reset the page and mark the current tab; tabs show counts and still work if counts fail; numbered pagination and the page-gap algorithm; paging and its disabled ends; error → Retry recovers with the same filters; rows stay visible and busy while the next page loads; Clear filters on an empty result.
- `validators.spec`: each format, empty values left to `required`, `https` only, whitespace-only text, the 18th-birthday boundary, impossible dates, and the error messages.
- `form-field.spec` (OnPush host): label/`id` link, required marker and `aria-required`, no error before touch, error and hint in `aria-describedby`, updates from code under OnPush.
- `auto-save.spec` (fake timers): one debounced save of the latest value; no request for unchanged values; saves never overlap and a queued save sends the newest value; failure, then retry via `flush()`; `flush()` waits for a running save; `reset()` after load.
- `application-wizard.component.spec` (real router): Next and Enter stop at invalid steps and focus the first error; jumping ahead only through valid steps; the first auto-save creates the draft once, switches the URL and keeps the wizard mounted; "New application" then starts blank; loading a draft doesn't save it; submitted applications open read-only; masked review values; submit saves pending changes first; submit and save failures with Retry; saving before leaving, and asking when that fails.
- `sensitive-value.component.spec`: masked even when the API sends the full value; screen-reader text; no Reveal without permission; reveal then hide; auto-hide after 30 s; a refused reveal stays masked.
- `application-detail.component.spec` (real router): SALES read-only with masked values and no review controls or reviewer call; Continue editing on a draft; REVIEWER gets decisions and Reveal but not assignment; a comment is required and focused; a decision updates status and history in place (no refetch) and focuses the confirmation; one action at a time; a 403 reloads the changed application; ADMIN assignment; no actions once decided; not found vs Retry.

## Next steps

- A real backend: remove `mockApiInterceptor` and the `DEMO_USERS` provider; send the CSP as a header with a nonce, plus `frame-ancestors`.
- End-to-end tests (Playwright) for the main journeys, including the CSP check above.

## AI assistance disclosure

AI assistance was used for scaffolding and drafting code. I review every file, and each stage is checked with the test suite and a production build before it is pushed.
