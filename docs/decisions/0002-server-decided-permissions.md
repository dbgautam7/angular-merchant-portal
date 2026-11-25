# 2. The server decides permissions; the UI only displays them

- **Status:** accepted

## Context

Several pages ask "may this user do X with this application?": edit, submit, decide, assign,
reveal. The answer depends on the role, the record (whose it is, who it's assigned to) and the
status. Earlier, the detail page re-derived it from roles in the browser, while the mock API
checked its own copy of the rules. Two copies can drift apart, and a drifted UI copy either hides
a legitimate action or shows one the server refuses.

## Decision

- One policy function on the server, `allowedActions(user, application)` in `core/mock/policy.ts`,
  is the single source of truth.
- The API **enforces** it on every request (403 otherwise) and **returns** it with every
  application as `allowedActions`.
- The UI shows controls from `allowedActions` and never re-implements the rules. Role checks
  remain only for things that aren't about a record, such as the "New application" link and the
  SALES-only route guard.

The rules follow the brief:

- SALES edits and submits their own drafts.
- The _assigned_ REVIEWER records decisions while the application is under review.
- ADMIN assigns reviewers but does not decide.
- The assigned reviewer and ADMIN can reveal masked values (audited).

## Consequences

- A rule change happens in one place, and the UI follows automatically, even mid-session: after
  a decision, the response no longer allows `decide`, so the panel disappears.
- `policy.spec.ts` tests every role and status as a table. The API and UI tests use the real
  policy to build their fixtures, so they can't drift from it either.
