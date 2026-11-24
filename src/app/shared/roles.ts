import { Role } from '../core/models';

/** How each role is named in the UI. A Record keeps it exhaustive. */
export const ROLE_LABELS: Record<Role, string> = {
  SALES: 'Sales',
  REVIEWER: 'Risk reviewer',
  ADMIN: 'Administrator',
};

/** What each role can do, shown on the sign-in page. */
export const ROLE_DESCRIPTIONS: Record<Role, string> = {
  SALES: 'Creates merchant applications and submits them for review.',
  REVIEWER: 'Reviews assigned applications and approves or rejects them.',
  ADMIN: 'Sees every application, assigns reviewers and can decide.',
};

/** "Rita Reviewer" → "RR". */
export const initials = (name: string): string =>
  name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0].toUpperCase())
    .join('');
