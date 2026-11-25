import {
  HttpClient,
  HttpErrorResponse,
  HttpInterceptorFn,
  provideHttpClient,
  withInterceptors,
} from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import { forkJoin } from 'rxjs';
import { ApplicationApi } from '../api/application.api';
import { API_BASE_URL } from '../config';
import {
  expireAllAccessTokens,
  mockApiInterceptor,
  resetMockDb,
} from '../mock/mock-api.interceptor';
import { AuthResponse } from '../models';
import { authInterceptor } from './auth.interceptor';
import { AuthService } from './auth.service';

const session = (accessToken: string, refreshToken: string): AuthResponse => ({
  user: { id: 'u-sales-1', name: 'Sam Sales', role: 'SALES' },
  accessToken,
  refreshToken,
});
const unauthorized = { status: 401, statusText: 'Unauthorized' };

describe('authInterceptor', () => {
  let http: HttpClient;
  let ctrl: HttpTestingController;
  let auth: AuthService;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        provideRouter([]),
        provideHttpClient(withInterceptors([authInterceptor])),
        provideHttpClientTesting(),
      ],
    });
    http = TestBed.inject(HttpClient);
    ctrl = TestBed.inject(HttpTestingController);
    auth = TestBed.inject(AuthService);
    vi.spyOn(TestBed.inject(Router), 'navigate').mockResolvedValue(true);

    auth.login('u-sales-1').subscribe();
    ctrl.expectOne('/api/auth/login').flush(session('old', 'rt-1'));
  });

  afterEach(() => ctrl.verify());

  it('attaches the bearer token to API requests', () => {
    http.get('/api/applications').subscribe();
    const req = ctrl.expectOne('/api/applications');
    expect(req.request.headers.get('Authorization')).toBe('Bearer old');
    req.flush([]);
  });

  it('never sends the token to auth endpoints or other origins', () => {
    http.get('https://cdn.example.com/lib.js').subscribe();
    http.post('/api/auth/refresh', {}).subscribe();
    for (const url of ['https://cdn.example.com/lib.js', '/api/auth/refresh']) {
      const req = ctrl.expectOne(url);
      expect(req.request.headers.has('Authorization')).toBe(false);
      req.flush({});
    }
  });

  it('refreshes ONCE when several concurrent requests get 401, then retries each with the new token', () => {
    const results: unknown[] = [];
    forkJoin([http.get('/api/a'), http.get('/api/b'), http.get('/api/c')]).subscribe((r) =>
      results.push(...r),
    );
    for (const url of ['/api/a', '/api/b', '/api/c']) ctrl.expectOne(url).flush(null, unauthorized);

    const refresh = ctrl.match('/api/auth/refresh');
    expect(refresh).toHaveLength(1); // single-flight
    expect(refresh[0].request.body).toEqual({ refreshToken: 'rt-1' });
    refresh[0].flush(session('new', 'rt-2'));

    for (const url of ['/api/a', '/api/b', '/api/c']) {
      const retry = ctrl.expectOne(url);
      expect(retry.request.headers.get('Authorization')).toBe('Bearer new');
      retry.flush({ url });
    }
    expect(results).toEqual([{ url: '/api/a' }, { url: '/api/b' }, { url: '/api/c' }]);
    expect(auth.token).toBe('new');
  });

  it('reuses an already-refreshed token for a 401 that arrives late, without refreshing again', () => {
    http.get('/api/a').subscribe();
    http.get('/api/b').subscribe();
    const [a, b] = [ctrl.expectOne('/api/a'), ctrl.expectOne('/api/b')];

    a.flush(null, unauthorized);
    ctrl.expectOne('/api/auth/refresh').flush(session('new', 'rt-2'));
    ctrl.expectOne('/api/a').flush({});

    b.flush(null, unauthorized); // was sent with the old token, fails after the refresh finished
    expect(ctrl.match('/api/auth/refresh')).toHaveLength(0);
    const retryB = ctrl.expectOne('/api/b');
    expect(retryB.request.headers.get('Authorization')).toBe('Bearer new');
    retryB.flush({});
  });

  it('retries only once: a second 401 reaches the caller instead of looping', () => {
    let status = 0;
    http.get('/api/a').subscribe({ error: (e: HttpErrorResponse) => (status = e.status) });
    ctrl.expectOne('/api/a').flush(null, unauthorized);
    ctrl.expectOne('/api/auth/refresh').flush(session('new', 'rt-2'));
    ctrl.expectOne('/api/a').flush(null, unauthorized);

    expect(status).toBe(401);
    expect(ctrl.match('/api/auth/refresh')).toHaveLength(0);
  });

  it('ends the session once when the refresh fails, and fails every waiting request', () => {
    const logout = vi.spyOn(auth, 'logout');
    const statuses: number[] = [];
    for (const url of ['/api/a', '/api/b', '/api/c']) {
      http.get(url).subscribe({ error: (e: HttpErrorResponse) => statuses.push(e.status) });
    }
    for (const url of ['/api/a', '/api/b', '/api/c']) ctrl.expectOne(url).flush(null, unauthorized);
    ctrl.expectOne('/api/auth/refresh').flush(null, unauthorized);

    expect(logout).toHaveBeenCalledTimes(1);
    expect(auth.isLoggedIn()).toBe(false);
    expect(statuses).toEqual([401, 401, 401]);
  });

  it('passes non-401 errors straight through without refreshing', () => {
    let status = 0;
    http.get('/api/a').subscribe({ error: (e: HttpErrorResponse) => (status = e.status) });
    ctrl.expectOne('/api/a').flush(null, { status: 500, statusText: 'Server Error' });
    expect(status).toBe(500);
    expect(ctrl.match('/api/auth/refresh')).toHaveLength(0);
  });

  it('does not attach a token or try to refresh once signed out', () => {
    auth.logout();
    http.get('/api/a').subscribe({ error: () => undefined }); // expected to fail
    const req = ctrl.expectOne('/api/a');
    expect(req.request.headers.has('Authorization')).toBe(false);
    req.flush(null, unauthorized);
    expect(ctrl.match('/api/auth/refresh')).toHaveLength(0);
  });
});

describe('authInterceptor with the mock backend', () => {
  afterEach(() => vi.useRealTimers());

  it('recovers from expired tokens with exactly one POST /api/auth/refresh', () => {
    vi.useFakeTimers();
    resetMockDb();
    const sent: string[] = [];
    const recorder: HttpInterceptorFn = (req, next) => {
      sent.push(`${req.method} ${req.url}`);
      return next(req);
    };
    TestBed.configureTestingModule({
      providers: [
        provideRouter([]),
        provideHttpClient(withInterceptors([authInterceptor, recorder, mockApiInterceptor])),
      ],
    });
    const auth = TestBed.inject(AuthService);
    const api = TestBed.inject(ApplicationApi);
    auth.login('u-admin').subscribe();
    vi.advanceTimersByTime(300);

    expireAllAccessTokens();
    const pages: number[] = [];
    for (const page of [1, 2, 3]) {
      api.list({ page, size: 10, status: '', q: '' }).subscribe((p) => pages.push(p.page));
    }
    vi.advanceTimersByTime(1_000);

    expect(sent.filter((s) => s === 'POST /api/auth/refresh')).toHaveLength(1);
    expect(sent.filter((s) => s === 'GET /api/applications')).toHaveLength(6); // 3 sent + 3 retries
    expect(pages.sort()).toEqual([1, 2, 3]);
  });
});

describe('authInterceptor with a configured API base URL', () => {
  const BASE = 'https://api.example.test/v1';
  let http: HttpClient;
  let ctrl: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        provideRouter([]),
        provideHttpClient(withInterceptors([authInterceptor])),
        provideHttpClientTesting(),
        { provide: API_BASE_URL, useValue: BASE },
      ],
    });
    http = TestBed.inject(HttpClient);
    ctrl = TestBed.inject(HttpTestingController);
    TestBed.inject(AuthService).login('u-sales-1').subscribe();
    ctrl.expectOne(`${BASE}/auth/login`).flush(session('old', 'rt-1')); // auth uses the base too
  });

  afterEach(() => ctrl.verify());

  it('sends the token only under the configured base, never to look-alike hosts', () => {
    TestBed.inject(ApplicationApi).reviewers().subscribe();
    const ours = ctrl.expectOne(`${BASE}/users/reviewers`);
    expect(ours.request.headers.get('Authorization')).toBe('Bearer old');
    ours.flush([]);

    for (const url of [
      '/api/applications', // no longer our API
      'https://api.example.test.evil.test/v1/applications',
      'https://api.example.test/v1evil/applications',
    ]) {
      http.get(url).subscribe();
      const req = ctrl.expectOne(url);
      expect(req.request.headers.has('Authorization')).toBe(false);
      req.flush({});
    }
  });
});
