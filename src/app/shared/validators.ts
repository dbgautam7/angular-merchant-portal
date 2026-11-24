import { ValidationErrors, ValidatorFn } from '@angular/forms';
import { ageOn, isHttpsUrl, PATTERNS } from '../core/application-rules';

/**
 * Angular validators over the shared application rules (core/application-rules.ts), which the
 * server checks again on submit. Each one ignores empty values, so a field is optional unless
 * it also has Validators.required. That keeps "required" and "format" errors separate, and lets
 * the form field show a required marker from Validators.required alone.
 */
const isEmpty = (value: unknown): boolean => value === null || value === undefined || value === '';

const matches =
  (pattern: RegExp, key: string): ValidatorFn =>
  (control) =>
    isEmpty(control.value) || pattern.test(String(control.value)) ? null : { [key]: true };

/** "REG-" followed by 6 digits. */
export const registrationNumber = matches(PATTERNS.registrationNumber, 'registrationNumber');

/** "TAX" followed by 9 digits. */
export const taxId = matches(PATTERNS.taxId, 'taxId');

/** 10 to 18 digits. */
export const accountNumber = matches(PATTERNS.accountNumber, 'accountNumber');

/** Rejects text that is only whitespace, which Validators.required lets through. */
export const notBlank: ValidatorFn = (control) =>
  typeof control.value === 'string' && control.value !== '' && control.value.trim() === ''
    ? { required: true }
    : null;

/** An absolute https:// address with a dotted host name. */
export const httpsUrl: ValidatorFn = (control) =>
  isEmpty(control.value) || isHttpsUrl(String(control.value)) ? null : { httpsUrl: true };

/** The person must be at least `years` old on `today()`; impossible dates are rejected. */
export const minAge =
  (years: number, today: () => Date = () => new Date()): ValidatorFn =>
  (control): ValidationErrors | null => {
    if (isEmpty(control.value)) return null;
    const age = ageOn(String(control.value), today());
    if (age === null) return { date: true };
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
