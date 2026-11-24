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
import { ApplicationQuery, AuthResponse } from '../models';
import { expireAllAccessTokens, mockApiInterceptor, resetMockDb } from './mock-api.interceptor';
import { emptyForm } from './mock-db';

/**
 * The mock backend is the security boundary, so its rules are tested through the typed client.
 * A minimal bearer interceptor stands in for the real auth interceptor.
 */
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

  it('answers 404 (not 403) outside the user scope so existence is not leaked', () => {
    loginAs('u-sales-1'); // app-001 belongs to u-sales-2
    expect(call(api.get('app-001')).status).toBe(404);
    loginAs('u-sales-2');
    expect(call(api.get('app-001')).value?.id).toBe('app-001');
  });

  it('masks sensitive fields and reveals them only to REVIEWER/ADMIN, with an audit log', () => {
    const audit = vi.spyOn(console, 'info').mockImplementation(() => {});
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

    const form = { ...emptyForm(), business: { ...emptyForm().business, legalName: 'Acme Demo' } };
    expect(call(api.saveDraft(draft.id, form)).value?.business.legalName).toBe('Acme Demo');
    expect(call(api.submit(draft.id)).value?.status).toBe('SUBMITTED');
    expect(call(api.saveDraft(draft.id, form)).status).toBe(403);
  });

  it('allows decisions only to REVIEWER/ADMIN and assignment only to ADMIN', () => {
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
