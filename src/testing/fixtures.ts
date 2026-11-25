import { toDto } from '../app/core/mock/mock-api.interceptor';
import { USERS } from '../app/core/mock/mock-db';
import { ApplicationDto, MerchantApplication, Role, User } from '../app/core/models';

/** Test-only helpers. Nothing here is imported by app code, so none of it ships. */

const user = (id: string): User => USERS.find((u) => u.id === id)!;

/** One fictional demo user per role, from the seed data. */
export const DEMO_USER: Record<Role, User> = {
  SALES: user('u-sales-2'),
  REVIEWER: user('u-rev-2'),
  ADMIN: user('u-admin'),
};

/**
 * An application exactly as the API would return it to `viewer`: sensitive values masked
 * unless it is their own draft, and their allowedActions from the real policy.
 */
export const asSeenBy = (viewer: User, app: MerchantApplication): ApplicationDto =>
  toDto(app, viewer);
