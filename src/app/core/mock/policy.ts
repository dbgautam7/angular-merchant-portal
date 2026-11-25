import { ApplicationAction, MerchantApplication, User } from '../models';

/**
 * Record-level authorization: the single place that decides who may do what with one
 * application. The mock API enforces it on every request and returns the result to the UI as
 * `allowedActions`, so the UI never re-implements these rules.
 *
 * - SALES edits and submits their own drafts.
 * - REVIEWER records risk decisions on applications assigned to them, while under review.
 * - ADMIN assigns reviewers while an application is under review; deciding stays with the
 *   assigned reviewer, as the brief gives decisions to REVIEWER only.
 * - The assigned reviewer and ADMIN may reveal masked values (audited).
 */
export function allowedActions(user: User, app: MerchantApplication): ApplicationAction[] {
  const ownDraft = user.role === 'SALES' && app.createdBy === user.id && app.status === 'DRAFT';
  const assignedReviewer = user.role === 'REVIEWER' && app.assignedTo === user.id;
  const underReview = app.status === 'SUBMITTED' || app.status === 'IN_REVIEW';
  const rules: Record<ApplicationAction, boolean> = {
    edit: ownDraft,
    submit: ownDraft,
    decide: assignedReviewer && underReview,
    assign: user.role === 'ADMIN' && underReview,
    reveal: assignedReviewer || user.role === 'ADMIN',
  };
  return (Object.keys(rules) as ApplicationAction[]).filter((action) => rules[action]);
}

/** Who may see an application at all. Anything else answers 404, so existence isn't leaked. */
export function canView(user: User, app: MerchantApplication): boolean {
  return (
    user.role === 'ADMIN' ||
    (user.role === 'SALES' && app.createdBy === user.id) ||
    (user.role === 'REVIEWER' && app.assignedTo === user.id)
  );
}
