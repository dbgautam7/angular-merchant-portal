# Merchant Payments Portal — Senior Angular Take-Home

Angular 20 app for merchant applications, with role-based access (SALES / REVIEWER / ADMIN).
It is built in stages. **This stage sets up the architecture**: the workspace, tooling, domain model, app shell and lazy route table. The feature pages are placeholders for now.

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
| 2 | Mock backend (interceptor) and typed API client | planned |
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
| HTTP | `provideHttpClient()` ready for functional interceptors (`withInterceptors`) |
| Bootstrap 5 + SCSS | Bootstrap loaded globally in `angular.json`; overrides in `styles.scss` |
| Vitest + TestBed | Angular's `@angular/build:unit-test` builder with `runner: vitest` and jsdom |
| Type safety | `strict` TypeScript plus `strictTemplates`, `strictInjectionParameters`, `typeCheckHostBindings` |

## Structure
```
src/app/
  app.ts          shell: skip link, navbar, <router-outlet>
  app.config.ts   providers: router (input binding), HttpClient, zone change detection
  app.routes.ts   lazy route table
  core/           singletons. models.ts defines the domain types; api, auth and mock backend come next
  shared/         reusable UI and pure logic (validators, auto-save, masking); added with the features
  features/       one folder per lazy route: login, dashboard, application (wizard), detail
```
Dependencies flow one way: `features → shared → core`. `core` never imports from features.

## Architecture decisions
- **Domain model first.** `core/models.ts` defines roles, statuses, the three-part application form (business, owner, banking), risk events and the paging/query contracts. Every later layer is typed against it.
- **Lazy features.** Each route ships as its own chunk. `/applications/new` is declared before `/:id` so it never matches as an id (covered in `app.routes.spec.ts`).
- **Route params as inputs.** With `withComponentInputBinding()`, `:id` arrives as a signal `input()`, with no `ActivatedRoute` subscriptions.
- **Placeholders keep their final paths and class names.** Later stages replace the files without touching the route table.

## AI assistance disclosure
AI assistance was used for scaffolding and drafting code. I review every file, and each stage is checked with the test suite and a production build before it is pushed.
