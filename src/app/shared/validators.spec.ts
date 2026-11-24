import { FormControl, ValidatorFn, Validators } from '@angular/forms';
import {
  accountNumber,
  errorMessage,
  httpsUrl,
  minAge,
  notBlank,
  registrationNumber,
  taxId,
} from './validators';

const errors = (value: unknown, ...validators: ValidatorFn[]) =>
  new FormControl(value, validators).errors;

describe('validators', () => {
  it('leaves empty values to Validators.required', () => {
    for (const validator of [registrationNumber, taxId, accountNumber, httpsUrl, minAge(18)]) {
      expect(errors('', validator)).toBeNull();
      expect(errors(null, validator)).toBeNull();
    }
  });

  it('checks the registration number, tax ID and account number formats', () => {
    expect(errors('REG-123456', registrationNumber)).toBeNull();
    expect(errors('REG-12345', registrationNumber)).toEqual({ registrationNumber: true });
    expect(errors('reg-123456', registrationNumber)).toEqual({ registrationNumber: true });

    expect(errors('TAX123456789', taxId)).toBeNull();
    expect(errors('TAX12345678', taxId)).toEqual({ taxId: true });

    expect(errors('1234567890', accountNumber)).toBeNull();
    expect(errors('123456789012345678', accountNumber)).toBeNull();
    expect(errors('123456789', accountNumber)).toEqual({ accountNumber: true });
    expect(errors('12345 67890', accountNumber)).toEqual({ accountNumber: true });
  });

  it('accepts only absolute https addresses', () => {
    expect(errors('https://shop.example.com/path', httpsUrl)).toBeNull();
    for (const bad of [
      'http://shop.example.com',
      'javascript:alert(1)',
      'https://localhost',
      'shop',
    ]) {
      expect(errors(bad, httpsUrl)).toEqual({ httpsUrl: true });
    }
  });

  it('treats whitespace-only text as missing', () => {
    expect(errors('   ', Validators.required, notBlank)).toEqual({ required: true });
    expect(errors(' Acme ', Validators.required, notBlank)).toBeNull();
  });

  describe('minAge', () => {
    const adult = minAge(18, () => new Date(2026, 10, 24)); // 24 Nov 2026, local time

    it('turns 18 on the birthday itself (a local date, no UTC shift)', () => {
      expect(errors('2008-11-24', adult)).toBeNull();
      expect(errors('2008-11-25', adult)).toEqual({ minAge: { required: 18, actual: 17 } });
    });

    it('rejects impossible and malformed dates', () => {
      expect(errors('2003-02-30', adult)).toEqual({ date: true });
      expect(errors('24/11/2008', adult)).toEqual({ date: true });
    });
  });

  describe('errorMessage', () => {
    it('describes the first error, with the limit from the error value', () => {
      expect(errorMessage({ minlength: { requiredLength: 3, actualLength: 1 } })).toBe(
        'Enter at least 3 characters.',
      );
      expect(errorMessage({ required: true, minlength: { requiredLength: 3 } })).toBe(
        'This field is required.',
      );
      expect(errorMessage({ minAge: { required: 18, actual: 17 } })).toContain('at least 18');
    });

    it('returns null for no errors and a fallback for unknown keys', () => {
      expect(errorMessage(null)).toBeNull();
      expect(errorMessage({})).toBeNull();
      expect(errorMessage({ somethingNew: true })).toBe('Enter a valid value.');
    });
  });
});
