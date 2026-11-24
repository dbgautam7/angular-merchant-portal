import { ApplicationForm, ApplicationStatus, MerchantApplication, User } from '../models';

/** Fictional demo data only — no real people, businesses or card/bank numbers. */
export const USERS: User[] = [
  { id: 'u-sales-1', name: 'Sam Sales', role: 'SALES' },
  { id: 'u-sales-2', name: 'Sita Sales', role: 'SALES' },
  { id: 'u-rev-1', name: 'Rita Reviewer', role: 'REVIEWER' },
  { id: 'u-rev-2', name: 'Ravi Reviewer', role: 'REVIEWER' },
  { id: 'u-admin', name: 'Ada Admin', role: 'ADMIN' },
];

export const emptyForm = (): ApplicationForm => ({
  business: { legalName: '', registrationNumber: '', category: '', website: '' },
  owner: { fullName: '', email: '', dateOfBirth: '', taxId: '' },
  banking: { bankName: '', accountNumber: '', monthlyVolume: null },
});

const statuses: ApplicationStatus[] = ['SUBMITTED', 'IN_REVIEW', 'APPROVED', 'REJECTED', 'DRAFT'];

export function seed(): MerchantApplication[] {
  return Array.from({ length: 42 }, (_, i) => {
    const n = i + 1;
    const status = statuses[i % statuses.length];
    return {
      id: `app-${String(n).padStart(3, '0')}`,
      status,
      createdBy: i % 2 ? 'u-sales-1' : 'u-sales-2',
      assignedTo: status === 'DRAFT' ? null : i % 3 ? 'u-rev-1' : 'u-rev-2',
      updatedAt: new Date(Date.UTC(2026, 9, 1 + (i % 28))).toISOString(),
      business: {
        legalName: `Demo Merchant ${n} Pvt Ltd`,
        registrationNumber: `REG-${100000 + n}`,
        category: ['RETAIL', 'TRAVEL', 'FOOD', 'DIGITAL'][i % 4],
        website: `https://merchant${n}.example.com`,
      },
      owner: {
        fullName: `Test Owner ${n}`,
        email: `owner${n}@example.com`,
        dateOfBirth: '1990-01-01',
        taxId: `TAX${900000000 + n}`,
      },
      banking: {
        bankName: 'Example Bank',
        accountNumber: `00001111${String(2000 + n)}`,
        monthlyVolume: 5000 * n,
      },
      riskHistory:
        status === 'APPROVED' || status === 'REJECTED'
          ? [
              {
                at: '2026-10-15T10:00:00Z',
                by: 'Rita Reviewer',
                decision: status,
                comment: 'Demo decision',
              },
            ]
          : [],
    };
  });
}
