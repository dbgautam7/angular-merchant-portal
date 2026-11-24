import { seed } from './mock/mock-db';
import { ApplicationForm } from './models';
import { ageOn, submissionProblems } from './application-rules';

const TODAY = new Date(2026, 10, 24); // 24 Nov 2026, local time

describe('application rules', () => {
  it('accepts a complete application', () => {
    const { business, owner, banking } = seed()[4]; // a fictional draft
    expect(submissionProblems({ business, owner, banking }, TODAY)).toEqual([]);
  });

  it('lists every problem with an incomplete application', () => {
    const empty: ApplicationForm = {
      business: {
        legalName: '  ',
        registrationNumber: '',
        category: '',
        website: 'http://x.example',
      },
      owner: { fullName: 'Al', email: 'not-an-email', dateOfBirth: '2010-01-01', taxId: 'TAX1' },
      banking: { bankName: '', accountNumber: '12 34', monthlyVolume: null },
    };
    expect(submissionProblems(empty, TODAY)).toEqual([
      'Legal name needs at least 3 characters.',
      'Registration number must look like REG-123456.',
      'Category is required.',
      'Website must start with https://.',
      'Owner name needs at least 3 characters.',
      'Owner email is not a valid address.',
      'The owner must be at least 18.',
      'Tax ID must be TAX followed by 9 digits.',
      'Bank name is required.',
      'Account number must be 10 to 18 digits.',
      'Monthly volume must be at least 1.',
    ]);
  });

  it('counts age in whole years from a local calendar date', () => {
    expect(ageOn('2008-11-24', TODAY)).toBe(18); // the 18th birthday itself
    expect(ageOn('2008-11-25', TODAY)).toBe(17);
    expect(ageOn('2003-02-30', TODAY)).toBeNull(); // not a real date
    expect(ageOn('24/11/2008', TODAY)).toBeNull();
  });
});
