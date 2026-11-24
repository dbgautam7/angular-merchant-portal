import { ApplicationForm } from './models';

/**
 * The business rules for a merchant application, as plain functions. The form validators
 * (shared/validators.ts) and the server's submit check (the mock API) both use them, so the
 * browser and the server can never disagree about what a valid application is.
 * The formats are fictional and exist only for this demo.
 */
export const PATTERNS = {
  registrationNumber: /^REG-\d{6}$/,
  taxId: /^TAX\d{9}$/,
  accountNumber: /^\d{10,18}$/,
} as const;

export const MIN_NAME_LENGTH = 3;
export const MIN_OWNER_AGE = 18;

/** One "@", something on each side, no spaces. Never stricter than Angular's Validators.email. */
const EMAIL = /^[^\s@]+@[^\s@]+$/;

/** An absolute https:// address with a dotted host name. Parsed with URL rather than a regex. */
export function isHttpsUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === 'https:' && url.hostname.includes('.');
  } catch {
    return false;
  }
}

/**
 * Whole years between a yyyy-mm-dd date (as from <input type="date">) and `today`; null when
 * it is not a real date. The date is read as a local calendar date: `new Date('2008-11-24')`
 * would parse as UTC midnight, the previous day west of Greenwich, and be off by one.
 */
export function ageOn(dateText: string, today: Date): number | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateText);
  if (!match) return null;
  const [year, month, day] = match.slice(1).map(Number);
  const date = new Date(year, month - 1, day);
  // Rejects impossible dates such as 2023-02-30, which Date silently rolls over to March 2.
  if (date.getFullYear() !== year || date.getMonth() !== month - 1 || date.getDate() !== day) {
    return null;
  }
  const hadBirthday =
    today.getMonth() > month - 1 || (today.getMonth() === month - 1 && today.getDate() >= day);
  return today.getFullYear() - year - (hadBirthday ? 0 : 1);
}

/** Text that is present, not just spaces, and at least `min` characters long (like the form). */
const filled = (value: string, min = 1) => value.trim() !== '' && value.length >= min;

/**
 * Everything that stops this application being submitted; empty when it is complete and valid.
 * The same rules as the form, checked again on the server, because a client can skip the form.
 */
export function submissionProblems(form: ApplicationForm, today: Date = new Date()): string[] {
  const { business, owner, banking } = form;
  const age = ageOn(owner.dateOfBirth, today);
  const checks: [ok: boolean, problem: string][] = [
    [
      filled(business.legalName, MIN_NAME_LENGTH),
      `Legal name needs at least ${MIN_NAME_LENGTH} characters.`,
    ],
    [
      PATTERNS.registrationNumber.test(business.registrationNumber),
      'Registration number must look like REG-123456.',
    ],
    [filled(business.category), 'Category is required.'],
    [!business.website || isHttpsUrl(business.website), 'Website must start with https://.'],
    [
      filled(owner.fullName, MIN_NAME_LENGTH),
      `Owner name needs at least ${MIN_NAME_LENGTH} characters.`,
    ],
    [EMAIL.test(owner.email), 'Owner email is not a valid address.'],
    [age !== null && age >= MIN_OWNER_AGE, `The owner must be at least ${MIN_OWNER_AGE}.`],
    [PATTERNS.taxId.test(owner.taxId), 'Tax ID must be TAX followed by 9 digits.'],
    [filled(banking.bankName), 'Bank name is required.'],
    [PATTERNS.accountNumber.test(banking.accountNumber), 'Account number must be 10 to 18 digits.'],
    [
      typeof banking.monthlyVolume === 'number' && banking.monthlyVolume >= 1,
      'Monthly volume must be at least 1.',
    ],
  ];
  return checks.filter(([ok]) => !ok).map(([, problem]) => problem);
}
