import { HttpErrorResponse } from '@angular/common/http';
import { TestBed } from '@angular/core/testing';
import { provideRouter, withComponentInputBinding } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { of, Subject, throwError } from 'rxjs';
import { ApplicationApi } from '../../core/api/application.api';
import { AuthService } from '../../core/auth/auth.service';
import { seed } from '../../core/mock/mock-db';
import { MerchantApplication, Role, User } from '../../core/models';
import { ApplicationDetailComponent } from './application-detail.component';

/** Fictional seed data, masked the way the server sends it to reviewers. */
const ROWS = seed().map((a) => ({
  ...a,
  owner: { ...a.owner, taxId: '••••••••' + a.owner.taxId.slice(-4) },
  banking: { ...a.banking, accountNumber: '••••••••' + a.banking.accountNumber.slice(-4) },
}));
const REVIEWERS: User[] = [
  { id: 'u-rev-1', name: 'Rita Reviewer', role: 'REVIEWER' },
  { id: 'u-rev-2', name: 'Ravi Reviewer', role: 'REVIEWER' },
];
const USER_IDS: Record<Role, string> = {
  SALES: 'u-sales-2',
  REVIEWER: 'u-rev-2',
  ADMIN: 'u-admin',
};

describe('ApplicationDetailComponent', () => {
  let harness: RouterTestingHarness;
  let api: Record<'get' | 'reviewers' | 'decide' | 'assign' | 'reveal', ReturnType<typeof vi.fn>>;

  async function open(id: string, role: Role): Promise<void> {
    TestBed.configureTestingModule({
      providers: [
        provideRouter(
          [{ path: 'applications/:id', component: ApplicationDetailComponent }],
          withComponentInputBinding(),
        ),
        { provide: ApplicationApi, useValue: api },
        {
          provide: AuthService,
          useValue: {
            hasRole: (...roles: Role[]) => roles.includes(role),
            user: () => ({ id: USER_IDS[role], name: role, role }),
          },
        },
      ],
    });
    harness = await RouterTestingHarness.create();
    await harness.navigateByUrl(`/applications/${id}`);
    await settle();
  }

  async function settle(): Promise<void> {
    harness.detectChanges();
    await harness.fixture.whenStable();
    harness.detectChanges();
  }

  const el = () => harness.routeNativeElement as HTMLElement;
  const text = () => el().textContent?.replace(/\s+/g, ' ') ?? '';
  const button = (label: string) =>
    Array.from(el().querySelectorAll('button')).find((b) => b.textContent?.trim() === label);
  const comment = () => el().querySelector<HTMLTextAreaElement>('textarea')!;
  const badge = () => el().querySelector('h1 + app-status-badge')?.textContent?.trim();

  beforeEach(() => {
    api = {
      get: vi.fn((id: string) => of(structuredClone(ROWS.find((a) => a.id === id)!))),
      reviewers: vi.fn(() => of(REVIEWERS)),
      decide: vi.fn(),
      assign: vi.fn(),
      reveal: vi.fn(() => of({ value: 'TAX900000001' })),
    };
  });

  it('shows SALES their application read-only: masked values, no review controls', async () => {
    await open('app-001', 'SALES'); // SUBMITTED
    expect(el().querySelector('h1')?.textContent).toContain('Demo Merchant 1 Pvt Ltd');
    expect(badge()).toBe('Submitted');
    expect(text()).toContain('Retail'); // category label, not the RETAIL code
    expect(text()).toContain('••••••••0001');
    expect(text()).not.toMatch(/Approve|Reject|Assignment|Reveal|Reviewer:/);
    expect(api.reviewers).not.toHaveBeenCalled(); // the API would answer 403
    expect(text()).toContain('No risk decisions yet.');
  });

  it('offers SALES "Continue editing" on a draft, still masking its own sensitive values', async () => {
    api.get.mockReturnValueOnce(of(seed().find((a) => a.id === 'app-005')!)); // unmasked, as the API sends it
    await open('app-005', 'SALES');
    const edit = Array.from(el().querySelectorAll('a')).find((a) =>
      a.textContent?.includes('Continue'),
    );
    expect(edit?.getAttribute('href')).toBe('/applications/app-005/edit');
    expect(text()).not.toContain('TAX900000005');
    expect(text()).toContain('••••••••0005');
  });

  it('gives REVIEWER the decision panel and Reveal, but not assignment', async () => {
    await open('app-001', 'REVIEWER');
    expect(button('Approve')).toBeDefined();
    expect(button('Reject')).toBeDefined();
    expect(text()).not.toContain('Assignment');
    expect(text()).toContain('Reviewer: You');
    expect(text()).toContain('Reveal tax ID');
    expect(text()).toContain('Reveal account number');
  });

  it('requires a comment before deciding, and focuses it', async () => {
    await open('app-001', 'REVIEWER');
    button('Approve')!.click();
    await settle();
    expect(api.decide).not.toHaveBeenCalled();
    expect(text()).toContain('This field is required.');
    expect(document.activeElement).toBe(comment());
  });

  it('records a decision and shows the updated application without reloading it', async () => {
    const app = ROWS[0];
    api.decide.mockReturnValueOnce(
      of({
        ...app,
        status: 'REJECTED',
        riskHistory: [
          {
            at: '2026-11-01T09:00:00Z',
            by: 'Rita Reviewer',
            decision: 'NOTE',
            comment: 'Older note',
          },
          {
            at: '2026-11-02T09:00:00Z',
            by: 'Ravi Reviewer',
            decision: 'REJECTED',
            comment: 'Missing documents',
          },
        ],
      }),
    );
    await open('app-001', 'REVIEWER');
    comment().value = '  Missing documents  ';
    comment().dispatchEvent(new Event('input'));
    button('Reject')!.click();
    await settle();

    expect(api.decide).toHaveBeenCalledWith('app-001', 'REJECTED', 'Missing documents');
    expect(api.get).toHaveBeenCalledTimes(1);
    expect(badge()).toBe('Rejected');
    expect(button('Approve')).toBeUndefined(); // decided: the panel is gone
    const notice = el().querySelector('#action-notice')!;
    expect(notice.textContent).toContain('Application rejected.');
    expect(document.activeElement).toBe(notice);
    const events = Array.from(
      el().querySelectorAll('section[aria-labelledby="history-heading"] li'),
    );
    expect(events.map((li) => li.textContent?.replace(/\s+/g, ' '))).toEqual([
      expect.stringContaining('Rejected by Ravi Reviewer'),
      expect.stringContaining('Note by Rita Reviewer'),
    ]);
  });

  it('runs one action at a time', async () => {
    const pending = new Subject<MerchantApplication>();
    api.decide.mockReturnValueOnce(pending);
    await open('app-001', 'REVIEWER');
    comment().value = 'Looks good';
    comment().dispatchEvent(new Event('input'));
    button('Approve')!.click();
    await settle();
    expect(button('Approve')!.disabled).toBe(true);
    button('Reject')!.click();
    expect(api.decide).toHaveBeenCalledTimes(1);
  });

  it('reloads when the server refuses because the application changed', async () => {
    api.decide.mockReturnValueOnce(throwError(() => new HttpErrorResponse({ status: 403 })));
    await open('app-001', 'REVIEWER');
    api.get.mockReturnValueOnce(of({ ...ROWS[0], status: 'APPROVED' })); // decided by someone else
    comment().value = 'Looks good';
    comment().dispatchEvent(new Event('input'));
    button('Approve')!.click();
    await settle();

    expect(api.get).toHaveBeenCalledTimes(2);
    expect(badge()).toBe('Approved');
    expect(text()).toContain('changed since you opened it');
    expect(button('Approve')).toBeUndefined();
  });

  it('lets ADMIN assign a reviewer', async () => {
    const app = ROWS.find((a) => a.id === 'app-006')!; // SUBMITTED, assigned to u-rev-1
    api.assign.mockReturnValueOnce(of({ ...app, status: 'IN_REVIEW', assignedTo: 'u-rev-2' }));
    await open('app-006', 'ADMIN');
    expect(text()).toContain('Reviewer: Rita Reviewer');
    const assign = button('Assign')!;
    expect(assign.disabled).toBe(true);

    const select = el().querySelector<HTMLSelectElement>('select')!;
    select.value = 'u-rev-1'; // the current reviewer: nothing to do
    select.dispatchEvent(new Event('change'));
    await settle();
    expect(assign.disabled).toBe(true);

    select.value = 'u-rev-2';
    select.dispatchEvent(new Event('change'));
    await settle();
    assign.click();
    await settle();

    expect(api.assign).toHaveBeenCalledWith('app-006', 'u-rev-2');
    expect(badge()).toBe('In review');
    expect(text()).toContain('Reviewer: Ravi Reviewer');
    expect(text()).toContain('Assigned to Ravi Reviewer.');
  });

  it('hides review actions once an application is decided', async () => {
    await open('app-003', 'ADMIN'); // APPROVED
    expect(text()).toContain('Approved by Rita Reviewer');
    expect(text()).not.toMatch(/Assignment|Risk decision/);
  });

  it('tells "not found" apart from errors that Retry can fix', async () => {
    api.get.mockReturnValueOnce(throwError(() => new HttpErrorResponse({ status: 404 })));
    await open('app-999', 'SALES');
    expect(text()).toContain("doesn't exist, or you don't have access");
    expect(button('Retry')).toBeUndefined();

    api.get.mockReturnValueOnce(throwError(() => new HttpErrorResponse({ status: 500 })));
    await harness.navigateByUrl('/applications/app-001');
    await settle();
    expect(text()).toContain('Could not load the application.');
    button('Retry')!.click();
    await settle();
    expect(el().querySelector('h1')?.textContent).toContain('Demo Merchant 1 Pvt Ltd');
  });
});
