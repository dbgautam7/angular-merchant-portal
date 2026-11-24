# Merchant Payments Portal — Senior Angular Take-Home

Angular 20 app for merchant applications, with role-based access (SALES / REVIEWER / ADMIN).
It runs fully offline: an in-memory mock API is built in, so you only need `npm start`.
It is built in stages. **This stage adds the mock backend and the typed API client.** The feature pages are still placeholders, and login arrives in stage 3.

```bash
npm install
npm start        # http://localhost:4200
npm test         # Vitest + Angular TestBed
npm run build
```

## Roadmap
| Stage | Scope | Status |
|---|---|---|
| 1 | Architecture: workspace, tooling, domain model, app shell, lazy routes, test setup | ✅ done |
| 2 | Mock backend (interceptor) and typed API client | ✅ done |
| 3 | Auth: login, route guards, bearer-token interceptor with single-flight refresh | planned |
| 4 | Dashboard: server-side pagination, filtering, loading/error/retry | planned |
| 5 | Multi-step wizard: reactive forms, custom validators, debounced auto-save | planned |
| 6 | Detail & review: risk history, role-aware controls, sensitive-field masking, CSP | planned |

## Tech stack
| Requirement | Implementation |
|---|---|
| Angular 20+, standalone, `@if/@for` | Standalone components only, no NgModules, built-in control flow only |
| Signals + `inject()` | Route params arrive as `input()` signals; services use `inject()`, not constructor injection |
| Router, lazy features | Each page loaded with `loadComponent`; `withComponentInputBinding()` binds `:id` to `input()` |
| HTTP | Functional interceptors via `provideHttpClient(withInterceptors([...]))` |
| Mock API | `core/mock/mock-api.interceptor.ts`, the last interceptor in the chain, acting as the server |
| Bootstrap 5 + SCSS | Bootstrap loaded globally in `angular.json`; overrides in `styles.scss` |
| Vitest + TestBed | Angular's `@angular/build:unit-test` builder with `runner: vitest` and jsdom |
| Type safety | `strict` TypeScript plus `strictTemplates`, `strictInjectionParameters`, `typeCheckHostBindings` |

## Structure
```
src/app/
  app.ts          shell: skip link, navbar, <router-outlet>
  app.config.ts   providers: router (input binding), HttpClient + interceptors, zone change detection
  app.routes.ts   lazy route table
  core/
    models.ts     domain types
    api/          ApplicationApi, the typed HTTP client (one method per endpoint)
    mock/         in-memory backend (interceptor) and fictional seed data
  shared/         reusable UI and pure logic (validators, auto-save, masking); added with the features
  features/       one folder per lazy route: login, dashboard, application (wizard), detail
```
Dependencies flow one way: `features → shared → core`. `core` never imports from features.

## Mock backend
`mockApiInterceptor` answers every `/api/*` request in memory, with 250 ms of simulated latency. **It enforces permissions itself.** Hiding a button in the UI only improves the UX; it is not the security boundary.

| Method & path | Who | Notes |
|---|---|---|
| `POST /api/auth/login` | anyone | `{ username }` (a demo user id) returns the user plus access and refresh tokens |
| `POST /api/auth/refresh` | refresh-token holder | rotates the pair; each refresh token works **once** |
| `GET /api/applications?page&size&status&q` | all roles | server-side paging and filtering, scoped by role; `q=error` simulates a 500 |
| `POST /api/applications` | SALES | creates an empty draft |
| `GET /api/applications/:id` | anyone in scope | sensitive fields come back masked |
| `PUT /api/applications/:id` | SALES (own draft) | saves a draft; 403 once submitted |
| `POST /api/applications/:id/submit` | SALES (own draft) | DRAFT → SUBMITTED |
| `POST /api/applications/:id/decision` | REVIEWER, ADMIN | `{ decision, comment }` on SUBMITTED / IN_REVIEW; appended to risk history |
| `PUT /api/applications/:id/assign` | ADMIN | `{ reviewerId }`; SUBMITTED → IN_REVIEW |
| `GET /api/applications/:id/reveal/:field` | REVIEWER, ADMIN | unmasked `taxId` / `accountNumber`, audit-logged |
| `GET /api/users/reviewers` | ADMIN | reviewer list for assignment |

- **Scope.** SALES sees only applications they created, REVIEWER only those assigned to them, ADMIN everything. Anything out of scope returns **404, not 403**, so its existence isn't leaked.
- **Tokens.** Access tokens live 30 s on purpose, so the refresh flow (stage 3) is easy to see. Requests without a valid token get 401.
- **Masking.** Tax ID and account number leave the "server" as `••••••••6789`. The only exception is the author's own draft, which they need to edit.
- **Demo data.** 42 seeded applications and 5 users (`u-sales-1`, `u-sales-2`, `u-rev-1`, `u-rev-2`, `u-admin`). All names, numbers and `example.com` addresses are fictional.

## Architecture decisions
- **Domain model first.** `core/models.ts` defines roles, statuses, the three-part application form (business, owner, banking), risk events and the paging/query contracts. Every later layer is typed against it.
- **Mock backend as an interceptor**, not json-server. It needs no extra process, and every permission rule lives in one file. Swapping in a real API means removing one interceptor; `ApplicationApi` stays the same.
- **Lazy features.** Each route ships as its own chunk. `/applications/new` is declared before `/:id` so it never matches as an id.
- **Route params as inputs.** With `withComponentInputBinding()`, `:id` arrives as a signal `input()`, with no `ActivatedRoute` subscriptions.
- **Placeholders keep their final paths and class names.** Later stages replace the files without touching the route table.

## Tests (`npm test`)
- `app.routes.spec`: every page is lazy-loaded; `new` is declared before `:id`; root and unknown URLs redirect.
- `mock-api.interceptor.spec`: the server rules, tested through `ApplicationApi`. Covers 401 for missing or expired tokens, refresh-token rotation, role-scoped lists, server-side paging and filtering, 404 for out-of-scope records, masking with audited reveal, the draft lifecycle, and role checks on decisions and assignment.

## AI assistance disclosure
AI assistance was used for scaffolding and drafting code. I review every file, and each stage is checked with the test suite and a production build before it is pushed.
