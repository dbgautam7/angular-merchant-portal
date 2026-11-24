import {
  HttpErrorResponse,
  HttpInterceptorFn,
  HttpRequest,
  HttpResponse,
} from '@angular/common/http';
import { delay, dematerialize, materialize, Observable, of, throwError } from 'rxjs';
import { ApplicationForm, MerchantApplication, Role, User } from '../models';
import { emptyForm, seed, USERS } from './mock-db';

/**
 * In-memory mock backend (last interceptor in the chain). Lets the app run with
 * `ng serve` and no server. It ENFORCES permissions itself — the UI hiding a button
 * is never the security boundary.
 */
const ACCESS_TTL_MS = 30_000; // short on purpose so the refresh flow is easy to see
const db = { apps: seed() };
const accessTokens = new Map<string, { userId: string; exp: number }>();
const refreshTokens = new Map<string, string>();

export function resetMockDb(): void {
  db.apps = seed();
  accessTokens.clear();
  refreshTokens.clear();
}

/** Test/demo hook: expire every access token so the next requests get 401. */
export function expireAllAccessTokens(): void {
  accessTokens.forEach((t) => (t.exp = 0));
}

const rnd = () => Math.random().toString(36).slice(2);
const ok = <T>(body: T) => of(new HttpResponse({ status: 200, body })).pipe(delay(250));
const fail = (status: number, message: string, url: string) =>
  throwError(() => new HttpErrorResponse({ status, error: { message }, url })).pipe(
    materialize(),
    delay(250),
    dematerialize(),
  );

function issue(user: User) {
  const accessToken = `at_${rnd()}`;
  const refreshToken = `rt_${rnd()}`;
  accessTokens.set(accessToken, { userId: user.id, exp: Date.now() + ACCESS_TTL_MS });
  refreshTokens.set(refreshToken, user.id);
  return { user, accessToken, refreshToken };
}

function currentUser(req: HttpRequest<unknown>): User | null {
  const token = req.headers.get('Authorization')?.replace('Bearer ', '') ?? '';
  const t = accessTokens.get(token);
  if (!t || t.exp < Date.now()) return null;
  return USERS.find((u) => u.id === t.userId) ?? null;
}

const canView = (u: User, a: MerchantApplication) =>
  u.role === 'ADMIN' ||
  (u.role === 'SALES' && a.createdBy === u.id) ||
  (u.role === 'REVIEWER' && a.assignedTo === u.id);

const mask = (v: string) => (v ? '•'.repeat(Math.max(0, v.length - 4)) + v.slice(-4) : '');

/** Sensitive values never leave the "server" unmasked except via /reveal. */
const toDto = (a: MerchantApplication, u: User): MerchantApplication => {
  const own = u.role === 'SALES' && a.createdBy === u.id && a.status === 'DRAFT';
  if (own) return a; // the author editing their own draft needs real values
  return {
    ...a,
    owner: { ...a.owner, taxId: mask(a.owner.taxId) },
    banking: { ...a.banking, accountNumber: mask(a.banking.accountNumber) },
  };
};

export const mockApiInterceptor: HttpInterceptorFn = (req, next) => {
  if (!req.url.startsWith('/api/')) return next(req);
  const { url, method } = req;
  const path = url.split('?')[0];
  const body = req.body as Record<string, unknown>;

  // ---- auth ----
  if (path === '/api/auth/login' && method === 'POST') {
    const user = USERS.find((u) => u.id === body['username']);
    return user ? ok(issue(user)) : fail(401, 'Unknown user', url);
  }
  if (path === '/api/auth/refresh' && method === 'POST') {
    const userId = refreshTokens.get(String(body['refreshToken']));
    const user = USERS.find((u) => u.id === userId);
    if (!user) return fail(401, 'Invalid refresh token', url);
    refreshTokens.delete(String(body['refreshToken'])); // rotation: one-time use
    return ok(issue(user));
  }

  const user = currentUser(req);
  if (!user) return fail(401, 'Token missing or expired', url);
  const forbid = () => fail(403, 'Forbidden', url);
  const need = (...roles: Role[]) => roles.includes(user.role);

  if (path === '/api/users/reviewers' && method === 'GET') {
    return need('ADMIN') ? ok(USERS.filter((u) => u.role === 'REVIEWER')) : forbid();
  }

  // ---- list ----
  if (path === '/api/applications' && method === 'GET') {
    const p = req.params;
    const q = (p.get('q') ?? '').toLowerCase();
    if (q === 'error') return fail(500, 'Simulated server error', url); // demo the retry state
    const status = p.get('status') ?? '';
    const page = Number(p.get('page') ?? 1);
    const size = Number(p.get('size') ?? 10);
    const rows = db.apps
      .filter((a) => canView(user, a))
      .filter((a) => !status || a.status === status)
      .filter((a) => !q || a.business.legalName.toLowerCase().includes(q) || a.id.includes(q));
    const items = rows.slice((page - 1) * size, page * size).map((a) => toDto(a, user));
    return ok({ items, total: rows.length, page, size });
  }
  if (path === '/api/applications' && method === 'POST') {
    if (!need('SALES')) return forbid();
    const app: MerchantApplication = {
      id: `app-${rnd().slice(0, 6)}`,
      status: 'DRAFT',
      createdBy: user.id,
      assignedTo: null,
      updatedAt: new Date().toISOString(),
      riskHistory: [],
      ...emptyForm(),
    };
    db.apps.unshift(app);
    return ok(app);
  }

  // ---- single application ----
  const m = path.match(/^\/api\/applications\/([\w-]+)(?:\/(\w+))?(?:\/(\w+))?$/);
  if (!m) return fail(404, 'Not found', url);
  const [, id, action, field] = m;
  const app = db.apps.find((a) => a.id === id);
  if (!app || !canView(user, app)) return fail(404, 'Not found', url); // 404 hides existence
  const touch = () => (app.updatedAt = new Date().toISOString());

  if (!action && method === 'GET') return ok(toDto(app, user));

  if (!action && method === 'PUT') {
    if (!need('SALES') || app.status !== 'DRAFT') return forbid();
    Object.assign(app, body as unknown as ApplicationForm);
    touch();
    return ok(app);
  }
  if (action === 'submit' && method === 'POST') {
    if (!need('SALES') || app.status !== 'DRAFT') return forbid();
    app.status = 'SUBMITTED';
    touch();
    return ok(toDto(app, user));
  }
  const open = app.status === 'SUBMITTED' || app.status === 'IN_REVIEW';

  if (action === 'decision' && method === 'POST') {
    if (!need('REVIEWER', 'ADMIN') || !open) return forbid();
    // Validated here too: a client could send any status, e.g. DRAFT to reopen the application.
    const decision = body['decision'];
    if (decision !== 'APPROVED' && decision !== 'REJECTED') {
      return fail(400, 'Decision must be APPROVED or REJECTED', url);
    }
    const comment = typeof body['comment'] === 'string' ? body['comment'].trim() : '';
    if (!comment) return fail(400, 'A comment is required', url);
    app.status = decision;
    app.riskHistory.push({ at: new Date().toISOString(), by: user.name, decision, comment });
    touch();
    return ok(toDto(app, user));
  }
  if (action === 'assign' && method === 'PUT') {
    // Only while under review: assigning a draft would show it to a reviewer before submission.
    if (!need('ADMIN') || !open) return forbid();
    const reviewer = USERS.find((u) => u.id === body['reviewerId'] && u.role === 'REVIEWER');
    if (!reviewer) return fail(400, 'Invalid reviewer', url);
    app.assignedTo = reviewer.id;
    if (app.status === 'SUBMITTED') app.status = 'IN_REVIEW';
    touch();
    return ok(toDto(app, user));
  }
  if (action === 'reveal' && method === 'GET') {
    if (!need('REVIEWER', 'ADMIN')) return forbid();
    const value =
      field === 'taxId'
        ? app.owner.taxId
        : field === 'accountNumber'
          ? app.banking.accountNumber
          : null;
    if (value === null) return fail(400, 'Unknown field', url);
    console.info(`[audit] ${user.id} revealed ${field} on ${app.id}`);
    return ok({ value });
  }
  return fail(404, 'Not found', url) as Observable<never>;
};
