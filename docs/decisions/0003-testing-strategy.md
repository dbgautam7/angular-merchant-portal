# 3. Testing: unit tests for rules, end-to-end tests for journeys

- **Status:** accepted

## Context

Unit tests (Vitest and TestBed) check components, services and the mock server's rules in
isolation, quickly. They can't see what only appears when real pieces run together in a real
browser: overlapping navigations, the CSP, focus, layout and accessibility.

## Decision

- **Unit tests** (`npm test`) cover every rule and state:
  - the interceptor's single-flight refresh;
  - server permissions, validation and mass-assignment protection;
  - auto-save ordering;
  - form validation and focus;
  - role-aware controls.
- **End-to-end tests** (`npm run e2e`, Playwright) cover the critical journeys on the production
  build:
  - a SALES user fills in every step and submits;
  - a reviewer reveals and approves, then the author sees the result;
  - ADMIN assigns, and the new reviewer gets it;
  - guards and deep links;
  - a phone-sized check.

  Every test fails on a console error, a CSP violation or a request to another origin, and axe
  checks each page against WCAG 2.1 AA.

- The end-to-end tests serve `dist/` through Playwright's request routing instead of a web server.
  That tests exactly the bundle that ships, with its CSP. The demo's backend runs inside the page,
  so no server process is needed. Set `E2E_BASE_URL` to run them against a deployed environment.
- **Mutation checks:** important fixes are verified by reverting them and confirming that the
  test written for them fails.

## Consequences

- The first end-to-end run found two real bugs that every unit test missed, both navigations
  fighting each other:
  - leaving the form during its first save kept the user on the form;
  - a search applied just after clicking a row pulled the user back to the list.

  Both are fixed, and both now have a unit test as well.

- End-to-end tests need a browser: `npx playwright install chromium` once, or point
  `E2E_BROWSER` at any installed Chromium-based browser.
