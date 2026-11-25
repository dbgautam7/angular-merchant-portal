import {
  HttpClient,
  HttpErrorResponse,
  HttpInterceptorFn,
  provideHttpClient,
  withInterceptors,
} from '@angular/common/http';
import { TestBed } from '@angular/core/testing';
import { Observable } from 'rxjs';
import { ApplicationApi } from '../api/application.api';
import { ApplicationForm, ApplicationQuery, AuthResponse, MerchantApplication } from '../models';
import { expireAllAccessTokens, mockApiInterceptor, resetMockDb } from './mock-api.interceptor';

/**
 * The mock backend is the security boundary, so its rules are tested through the typed client.
 * A minimal bearer interceptor stands in for the real auth interceptor.
 */
/** A complete, valid (fictional) application. */
const COMPLETE: ApplicationForm = {
  business: {
    legalName: 'Acme Demo Ltd',
    registrationNumber: 'REG-123456',
    category: 'RETAIL',
    website: 'https://acme.example.com',
  },
  owner: {
    fullName: 'Alex Example',
    email: 'alex@example.com',
    dateOfBirth: '1985-06-15',
    taxId: 'TAX123456789',
  },
  banking: { bankName: 'Example Bank', accountNumber: '123456789012', monthlyVolume: 25000 },
};

describe('mockApiInterceptor (server rules)', () => {
  const query: ApplicationQuery = { page: 1, size: 10, status: '', q: '' };
  let token = '';
  const bearer: HttpInterceptorFn = (req, next) =>
    next(token ? req.clone({ setHeaders: { Authorization: `Bearer ${token}` } }) : req);

  let http: HttpClient;
  let api: ApplicationApi;

  /** Subscribes, lets the simulated 250 ms latency pass, and returns the value or error status. */
  function call<T>(obs: Observable<T>): { value?: T; status?: number } {
    const out: { value?: T; status?: number } = {};
    obs.subscribe({
      next: (value) => (out.value = value),
      error: (e: HttpErrorResponse) => (out.status = e.status),
    });
    vi.advanceTimersByTime(300);
    return out;
  }

  function loginAs(username: string): AuthResponse {
    const res = call(http.post<AuthResponse>('/api/auth/login', { username })).value!;
    token = res.accessToken;
    return res;
  }

  beforeEach(() => {
    vi.useFakeTimers();
    resetMockDb();
    token = '';
    TestBed.configureTestingModule({
      providers: [provideHttpClient(withInterceptors([bearer, mockApiInterceptor]))],
    });
    http = TestBed.inject(HttpClient);
    api = TestBed.inject(ApplicationApi);
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('answers 401 for unknown users, missing tokens and expired tokens', () => {
    expect(call(http.post('/api/auth/login', { username: 'nobody' })).status).toBe(401);
    expect(call(api.list(query)).status).toBe(401);

    loginAs('u-admin');
    expect(call(api.list(query)).value?.total).toBe(42);
    expireAllAccessTokens();
    expect(call(api.list(query)).status).toBe(401);
  });

  it('rotates refresh tokens so each one works only once', () => {
    const { refreshToken } = loginAs('u-sales-1');
    const refreshed = call(http.post<AuthResponse>('/api/auth/refresh', { refreshToken })).value;
    expect(refreshed?.user.id).toBe('u-sales-1');
    expect(refreshed?.refreshToken).not.toBe(refreshToken);
    expect(call(http.post('/api/auth/refresh', { refreshToken })).status).toBe(401);
  });

  it('scopes the list by role: SALES sees own, REVIEWER assigned, ADMIN all', () => {
    loginAs('u-sales-1');
    const sales = call(api.list({ ...query, size: 50 })).value!;
    expect(sales.total).toBe(21);
    expect(sales.items.every((a) => a.createdBy === 'u-sales-1')).toBe(true);

    loginAs('u-rev-1');
    const reviewer = call(api.list({ ...query, size: 50 })).value!;
    expect(reviewer.items.length).toBeGreaterThan(0);
    expect(reviewer.items.every((a) => a.assignedTo === 'u-rev-1')).toBe(true);

    loginAs('u-admin');
    expect(call(api.list(query)).value?.total).toBe(42);
  });

  it('paginates and filters on the server, and can simulate a 500', () => {
    loginAs('u-admin');
    const page2 = call(api.list({ ...query, page: 2 })).value!;
    expect(page2).toMatchObject({ page: 2, size: 10, total: 42 });
    expect(page2.items[0].id).toBe('app-011');

    const approved = call(api.list({ ...query, status: 'APPROVED', size: 50 })).value!;
    expect(approved.items.length).toBeGreaterThan(0);
    expect(approved.items.every((a) => a.status === 'APPROVED')).toBe(true);

    expect(call(api.list({ ...query, q: 'app-007' })).value?.items.map((a) => a.id)).toEqual([
      'app-007',
    ]);
    expect(call(api.list({ ...query, q: 'error' })).status).toBe(500);
  });

  it('counts applications per status within the user scope and search term', () => {
    loginAs('u-rev-1');
    const summary = call(api.summary('')).value!;
    const assigned = call(api.list({ ...query, size: 100 })).value!;
    expect(summary.total).toBe(assigned.total);
    expect(Object.values(summary.byStatus).reduce((a, b) => a + b, 0)).toBe(summary.total);
    expect(summary.byStatus.DRAFT).toBe(0); // drafts are never assigned

    loginAs('u-admin');
    expect(call(api.summary('')).value).toEqual({
      total: 42,
      byStatus: { DRAFT: 8, SUBMITTED: 9, IN_REVIEW: 9, APPROVED: 8, REJECTED: 8 },
    });
    expect(call(api.summary('merchant 4')).value?.total).toBe(4); // 4, 40, 41, 42
  });

  it('answers 404 (not 403) outside the user scope so existence is not leaked', () => {
    loginAs('u-sales-1'); // app-001 belongs to u-sales-2
    expect(call(api.get('app-001')).status).toBe(404);
    loginAs('u-sales-2');
    expect(call(api.get('app-001')).value?.id).toBe('app-001');
  });

  it('masks sensitive fields and reveals them only to REVIEWER/ADMIN, with an audit log', () => {
    const audit = vi.spyOn(console, 'info').mockImplementation(() => undefined);
    loginAs('u-sales-2');
    expect(call(api.get('app-001')).value?.owner.taxId).toBe('••••••••0001');
    expect(call(api.reveal('app-001', 'taxId')).status).toBe(403);

    loginAs('u-admin');
    expect(call(api.get('app-001')).value?.banking.accountNumber).toBe('••••••••2001');
    expect(call(api.reveal('app-001', 'taxId')).value).toEqual({ value: 'TAX900000001' });
    expect(audit).toHaveBeenCalledWith('[audit] u-admin revealed taxId on app-001');
  });

  it('lets SALES create, save and submit a draft, then locks it against edits', () => {
    loginAs('u-sales-1');
    const draft = call(api.createDraft()).value!;
    expect(draft).toMatchObject({ status: 'DRAFT', createdBy: 'u-sales-1' });

    expect(call(api.saveDraft(draft.id, COMPLETE)).value?.business.legalName).toBe('Acme Demo Ltd');
    expect(call(api.submit(draft.id)).value?.status).toBe('SUBMITTED');
    expect(call(api.saveDraft(draft.id, COMPLETE)).status).toBe(403);
  });

  it('saves only the form fields: status, owner, assignment and history cannot be written', () => {
    loginAs('u-sales-2'); // app-005 is u-sales-2's draft
    const forged = {
      ...COMPLETE,
      id: 'app-999',
      status: 'APPROVED',
      createdBy: 'u-sales-1',
      assignedTo: 'u-rev-1',
      riskHistory: [{ at: 'now', by: 'Rita Reviewer', decision: 'APPROVED', comment: 'forged' }],
    };
    const saved = call(http.put<MerchantApplication>('/api/applications/app-005', forged)).value!;
    expect(saved).toMatchObject({
      id: 'app-005',
      status: 'DRAFT',
      createdBy: 'u-sales-2',
      assignedTo: null,
      riskHistory: [],
    });
    expect(saved.business.legalName).toBe('Acme Demo Ltd'); // the form fields were saved

    // Still the author's draft, still hidden from everyone else's scope.
    loginAs('u-sales-1');
    expect(call(api.get('app-005')).status).toBe(404);
  });

  it('rejects a malformed draft without applying any of it', () => {
    loginAs('u-sales-2');
    const put = (body: unknown) => call(http.put('/api/applications/app-005', body));
    expect(put('not an object').status).toBe(400);
    expect(put({ business: 'Acme' }).status).toBe(400);
    expect(
      put({ business: { legalName: 'Changed' }, banking: { monthlyVolume: '5000' } }).status,
    ).toBe(400);
    expect(call(api.get('app-005')).value?.business.legalName).toBe('Demo Merchant 5 Pvt Ltd');

    // A partial save keeps the other fields.
    expect(put({ owner: { fullName: 'New Owner' } }).value).toMatchObject({
      owner: { fullName: 'New Owner', email: 'owner5@example.com' },
    });
  });

  it('refuses to submit an incomplete or invalid application, saying why', () => {
    loginAs('u-sales-1');
    const draft = call(api.createDraft()).value!;
    const invalid = { ...COMPLETE, owner: { ...COMPLETE.owner, taxId: 'TAX12' } };
    call(api.saveDraft(draft.id, invalid));

    let error: HttpErrorResponse | undefined;
    api.submit(draft.id).subscribe({ error: (e: HttpErrorResponse) => (error = e) });
    vi.advanceTimersByTime(300);
    expect(error?.status).toBe(422);
    expect(error?.error.problems).toEqual(['Tax ID must be TAX followed by 9 digits.']);
    expect(call(api.get(draft.id)).value?.status).toBe('DRAFT');

    call(api.saveDraft(draft.id, COMPLETE));
    expect(call(api.submit(draft.id)).value?.status).toBe('SUBMITTED');
  });

  it('allows decisions only to the assigned reviewer and assignment only to ADMIN', () => {
    loginAs('u-sales-2');
    expect(call(api.decide('app-001', 'APPROVED', 'Looks good')).status).toBe(403);
    expect(call(api.reviewers()).status).toBe(403);

    loginAs('u-rev-2'); // app-001 is SUBMITTED and assigned to u-rev-2
    expect(call(api.assign('app-001', 'u-rev-1')).status).toBe(403);
    const decided = call(api.decide('app-001', 'APPROVED', 'Looks good')).value!;
    expect(decided.status).toBe('APPROVED');
    expect(decided.riskHistory.at(-1)).toMatchObject({ by: 'Ravi Reviewer', decision: 'APPROVED' });

    loginAs('u-admin'); // app-006 is SUBMITTED; assigning moves it to IN_REVIEW
    expect(call(api.reviewers()).value?.map((u) => u.id)).toEqual(['u-rev-1', 'u-rev-2']);
    expect(call(api.assign('app-006', 'u-rev-2')).value).toMatchObject({
      assignedTo: 'u-rev-2',
      status: 'IN_REVIEW',
    });
    expect(call(api.assign('app-006', 'u-sales-1')).status).toBe(400);
  });

  it('returns each caller their allowed actions, and refuses everything else', () => {
    loginAs('u-sales-2');
    expect(call(api.get('app-005')).value?.allowedActions).toEqual(['edit', 'submit']); // her draft
    expect(call(api.get('app-001')).value?.allowedActions).toEqual([]); // hers, submitted

    loginAs('u-rev-2'); // app-001 is SUBMITTED and assigned to u-rev-2
    expect(call(api.get('app-001')).value?.allowedActions).toEqual(['decide', 'reveal']);

    loginAs('u-admin');
    expect(call(api.get('app-001')).value?.allowedActions).toEqual(['assign', 'reveal']);
    // Deciding belongs to the assigned reviewer: ADMIN assigns, but cannot approve or reject.
    expect(call(api.decide('app-001', 'APPROVED', 'Looks fine')).status).toBe(403);
    expect(call(api.get('app-001')).value?.status).toBe('SUBMITTED');
  });

  it('validates decisions and assignments on the server, not just in the UI', () => {
    loginAs('u-rev-2'); // app-001 is SUBMITTED and assigned to u-rev-2
    const post = (body: object) => call(http.post('/api/applications/app-001/decision', body));
    expect(post({ decision: 'DRAFT', comment: 'Reopen it' }).status).toBe(400);
    expect(post({ decision: 'APPROVED', comment: '   ' }).status).toBe(400);
    expect(post({ decision: 'APPROVED' }).status).toBe(400);

    const decided = call(api.decide('app-001', 'REJECTED', '  Missing documents  ')).value!;
    expect(decided.riskHistory.at(-1)?.comment).toBe('Missing documents');
    expect(call(api.decide('app-001', 'APPROVED', 'Changed my mind')).status).toBe(403);

    loginAs('u-admin'); // app-005 is a DRAFT; app-003 is already APPROVED
    expect(call(api.assign('app-005', 'u-rev-1')).status).toBe(403);
    expect(call(api.assign('app-003', 'u-rev-1')).status).toBe(403);
  });
});
