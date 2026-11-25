import { ApplicationAction, ApplicationStatus, MerchantApplication, User } from '../models';
import { seed, USERS } from './mock-db';
import { allowedActions, canView } from './policy';

const user = (id: string): User => USERS.find((u) => u.id === id)!;
const sita = user('u-sales-2');
const sam = user('u-sales-1');
const ravi = user('u-rev-2');
const rita = user('u-rev-1');
const ada = user('u-admin');

/** One of Sita's applications, assigned to Ravi once it is out of draft. */
const app = (status: ApplicationStatus): MerchantApplication => ({
  ...seed()[0],
  createdBy: sita.id,
  assignedTo: status === 'DRAFT' ? null : ravi.id,
  status,
});

describe('record policy', () => {
  it.each<[string, User, ApplicationStatus, ApplicationAction[]]>([
    ['the author, on a draft', sita, 'DRAFT', ['edit', 'submit']],
    ['the author, once submitted', sita, 'SUBMITTED', []],
    ['the assigned reviewer, while submitted', ravi, 'SUBMITTED', ['decide', 'reveal']],
    ['the assigned reviewer, while in review', ravi, 'IN_REVIEW', ['decide', 'reveal']],
    ['the assigned reviewer, once decided', ravi, 'APPROVED', ['reveal']],
    ['ADMIN, while in review: assigns, never decides', ada, 'IN_REVIEW', ['assign', 'reveal']],
    ['ADMIN, on a draft', ada, 'DRAFT', ['reveal']],
    ['ADMIN, once decided', ada, 'REJECTED', ['reveal']],
    ['another salesperson', sam, 'DRAFT', []],
    ['a reviewer not assigned', rita, 'IN_REVIEW', []],
  ])('%s', (_, who, status, expected) => {
    expect(allowedActions(who, app(status))).toEqual(expected);
  });

  it('lets SALES see their own, REVIEWER their assigned, and ADMIN every application', () => {
    const submitted = app('SUBMITTED');
    expect([sita, ravi, ada].map((u) => canView(u, submitted))).toEqual([true, true, true]);
    expect([sam, rita].map((u) => canView(u, submitted))).toEqual([false, false]);
  });
});
