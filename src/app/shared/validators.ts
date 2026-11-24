import { ValidationErrors, ValidatorFn } from '@angular/forms';

/**
 * Custom validators for the application form. Each one ignores empty values, so a field is
 * optional unless it also has Validators.required. That keeps "required" and "format" errors
 * separate, and lets the form field show a required marker from Validators.required alone.
 * The formats are fictional and exist only for this demo.
 */
const isEmpty = (value: unknown): boolean => value === null || value === undefined || value === '';

const matches =
  (pattern: RegExp, key: string): ValidatorFn =>
  (control) =>
    isEmpty(control.value) || pattern.test(String(control.value)) ? null : { [key]: true };

/** "REG-" followed by 6 digits. */
export const registrationNumber = matches(/^REG-\d{6}$/, 'registrationNumber');

/** "TAX" followed by 9 digits. */
export const taxId = matches(/^TAX\d{9}$/, 'taxId');

/** 10 to 18 digits. */
export const accountNumber = matches(/^\d{10,18}$/, 'accountNumber');

/** Rejects text that is only whitespace, which Validators.required lets through. */
export const notBlank: ValidatorFn = (control) =>
  typeof control.value === 'string' && control.value !== '' && control.value.trim() === ''
    ? { required: true }
    : null;

/** An absolute https:// address with a dotted host name. Parsed with URL rather than a regex. */
export const httpsUrl: ValidatorFn = (control) => {
  if (isEmpty(control.value)) return null;
  try {
    const url = new URL(String(control.value));
    return url.protocol === 'https:' && url.hostname.includes('.') ? null : { httpsUrl: true };
  } catch {
    return { httpsUrl: true };
  }
};

/**
 * The person must be at least `years` old on `today()`. Reads the yyyy-mm-dd value of
 * <input type="date"> as a local calendar date: `new Date('2008-11-24')` would parse as UTC
 * midnight and land on the previous day west of Greenwich, so the birthday check would be off by one.
 */
export const minAge =
  (years: number, today: () => Date = () => new Date()): ValidatorFn =>
  (control): ValidationErrors | null => {
    if (isEmpty(control.value)) return null;
    const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(control.value));
    if (!match) return { date: true };
    const [year, month, day] = match.slice(1).map(Number);
    const date = new Date(year, month - 1, day);
    // Rejects impossible dates such as 2023-02-30, which Date silently rolls over to March 2.
    if (date.getFullYear() !== year || date.getMonth() !== month - 1 || date.getDate() !== day) {
      return { date: true };
    }
    const now = today();
    const hadBirthday =
      now.getMonth() > month - 1 || (now.getMonth() === month - 1 && now.getDate() >= day);
    const age = now.getFullYear() - year - (hadBirthday ? 0 : 1);
    return age >= years ? null : { minAge: { required: years, actual: age } };
  };

/** One message per error key. Angular's built-in validators put their limits in the error value. */
const MESSAGES: Record<string, (error: ValidationErrors) => string> = {
  required: () => 'This field is required.',
  email: () => 'Enter an email address like name@example.com.',
  minlength: (error) => `Enter at least ${error['requiredLength']} characters.`,
  maxlength: (error) => `Enter at most ${error['requiredLength']} characters.`,
  min: (error) => `Enter ${error['min']} or more.`,
  max: (error) => `Enter ${error['max']} or less.`,
  date: () => 'Enter a real date.',
  minAge: (error) => `The owner must be at least ${error['required']} years old.`,
  registrationNumber: () => 'Enter REG- followed by 6 digits, like REG-123456.',
  taxId: () => 'Enter TAX followed by 9 digits, like TAX123456789.',
  accountNumber: () => 'Enter 10 to 18 digits, with no spaces.',
  httpsUrl: () => 'Enter a full web address starting with https://.',
};

/** The message for the first error, in validator order; null when the control is valid. */
export function errorMessage(errors: ValidationErrors | null): string | null {
  const [first] = Object.entries(errors ?? {});
  if (!first) return null;
  const [key, error] = first;
  return MESSAGES[key]?.(error) ?? 'Enter a valid value.';
}
