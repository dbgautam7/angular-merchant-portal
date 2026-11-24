import { TestBed } from '@angular/core/testing';
import { provideRouter, Router, withComponentInputBinding } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { Observable, of, Subject, throwError } from 'rxjs';
import type { Mock } from 'vitest';
import { ApplicationApi } from '../../core/api/application.api';
import { AuthService } from '../../core/auth/auth.service';
import { seed } from '../../core/mock/mock-db';
import {
  ApplicationQuery,
  ApplicationSummary,
  MerchantApplication,
  Page,
  Role,
} from '../../core/models';
import { DashboardComponent, PAGE_SIZE, pageList, SEARCH_DEBOUNCE_MS } from './dashboard.component';

/** 42 fictional applications; on page 1, app-005 and app-010 are drafts. */
const ROWS = seed();
const pageFor = (q: ApplicationQuery, rows = ROWS): Page<MerchantApplication> => ({
  items: rows.slice((q.page - 1) * q.size, q.page * q.size),
  total: rows.length,
  page: q.page,
  size: q.size,
});

describe('DashboardComponent', () => {
  let list: Mock<(q: ApplicationQuery) => Observable<Page<MerchantApplication>>>;
  let summary: Mock<(q: string) => Observable<ApplicationSummary>>;
  let harness: RouterTestingHarness;

  async function open(url: string, role: Role = 'SALES'): Promise<void> {
    TestBed.configureTestingModule({
      providers: [
        provideRouter(
          [{ path: 'applications', component: DashboardComponent }],
          withComponentInputBinding(),
        ),
        { provide: ApplicationApi, useValue: { list, summary } },
        { provide: AuthService, useValue: { hasRole: (...roles: Role[]) => roles.includes(role) } },
      ],
    });
    harness = await RouterTestingHarness.create();
    await harness.navigateByUrl(url, DashboardComponent);
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
    Array.from(el().querySelectorAll('button')).find((b) => b.textContent?.trim() === label)!;
  const links = (label: string) =>
    Array.from(el().querySelectorAll('a')).filter((a) => a.textContent?.trim() === label);
  const url = () => TestBed.inject(Router).url;
  const lastQuery = () => list.mock.lastCall?.[0];

  const merchantLinks = () =>
    Array.from(el().querySelectorAll<HTMLAnchorElement>('a.merchant-link'));
  const tab = (label: string) =>
    Array.from(el().querySelectorAll<HTMLAnchorElement>('.status-tab')).find(
      (a) => a.firstChild?.textContent?.trim() === label,
    )!;

  beforeEach(() => {
    list = vi.fn((q: ApplicationQuery) => of(pageFor(q)));
    summary = vi.fn(() =>
      of({
        total: 42,
        byStatus: { DRAFT: 8, SUBMITTED: 9, IN_REVIEW: 9, APPROVED: 8, REJECTED: 8 },
      }),
    );
  });

  afterEach(() => vi.useRealTimers());

  it('loads the page described by the URL and announces the result count', async () => {
    await open('/applications?page=2&status=APPROVED&q=%20demo%20');
    expect(list).toHaveBeenCalledTimes(1);
    expect(lastQuery()).toEqual({ page: 2, size: PAGE_SIZE, status: 'APPROVED', q: 'demo' });
    expect(el().querySelector('[role="status"]')?.textContent).toContain('42 applications found');
  });

  it('ignores invalid query params instead of sending them to the API', async () => {
    await open('/applications?page=-3&status=toString&q=');
    expect(lastQuery()).toEqual({ page: 1, size: PAGE_SIZE, status: '', q: '' });
  });

  it('shows "New application" and draft-only Edit links to SALES', async () => {
    await open('/applications');
    expect(text()).toContain('New application');
    expect(el().querySelectorAll('tbody tr')).toHaveLength(PAGE_SIZE);
    expect(links('Edit').map((a) => a.getAttribute('href'))).toEqual([
      '/applications/app-005/edit',
      '/applications/app-010/edit',
    ]);
  });

  it('hides create and edit actions from REVIEWER, who can still open every row', async () => {
    await open('/applications', 'REVIEWER');
    expect(text()).not.toContain('New application');
    expect(links('Edit')).toHaveLength(0);
    expect(merchantLinks()).toHaveLength(PAGE_SIZE);
    expect(merchantLinks()[0].getAttribute('href')).toBe('/applications/app-001');
    expect(text()).toContain('Applications assigned to you for review.');
  });

  it('debounces search, resets to page 1 and replaces the history entry', async () => {
    await open('/applications?page=3');
    const navigate = vi.spyOn(TestBed.inject(Router), 'navigate');
    vi.useFakeTimers();
    const box = el().querySelector<HTMLInputElement>('#search')!;
    for (const value of ['d', 'de', 'demo']) {
      box.value = value;
      box.dispatchEvent(new Event('input'));
    }

    await vi.advanceTimersByTimeAsync(SEARCH_DEBOUNCE_MS - 1);
    expect(navigate).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1);
    vi.useRealTimers();
    await settle();

    expect(navigate).toHaveBeenCalledTimes(1);
    expect(navigate).toHaveBeenCalledWith([], expect.objectContaining({ replaceUrl: true }));
    expect(url()).toBe('/applications?q=demo');
    expect(lastQuery()).toEqual({ page: 1, size: PAGE_SIZE, status: '', q: 'demo' });
  });

  it('filters by status with tab links that reset to page 1 and mark the current tab', async () => {
    await open('/applications?page=2&q=demo');
    expect(tab('All').getAttribute('aria-current')).toBe('true');
    expect(tab('Draft').getAttribute('href')).toBe('/applications?q=demo&status=DRAFT');

    tab('Draft').click();
    await settle();
    expect(url()).toBe('/applications?q=demo&status=DRAFT');
    expect(lastQuery()).toMatchObject({ page: 1, status: 'DRAFT', q: 'demo' });
    expect(tab('Draft').getAttribute('aria-current')).toBe('true');
    expect(tab('All').hasAttribute('aria-current')).toBe(false);
  });

  it('shows per-status counts for the current search, and still works without them', async () => {
    await open('/applications?q=%20demo');
    expect(summary).toHaveBeenCalledWith('demo');
    expect(tab('All').textContent).toContain('42');
    expect(tab('In review').textContent).toContain('9');

    TestBed.resetTestingModule();
    summary.mockReturnValue(throwError(() => new Error('500')));
    await open('/applications');
    expect(tab('All').textContent?.trim()).toBe('All');
    expect(el().querySelectorAll('tbody tr')).toHaveLength(PAGE_SIZE);
  });

  it('pages through results via the URL and disables the ends', async () => {
    await open('/applications');
    expect(button('Previous').disabled).toBe(true);
    expect(text()).toContain('Showing 1–10 of 42');

    button('Next').click();
    await settle();
    expect(url()).toBe('/applications?page=2');
    expect(lastQuery()).toMatchObject({ page: 2 });
    expect(text()).toContain('Showing 11–20 of 42');
    expect(el().querySelector('[aria-current="page"]')?.textContent?.trim()).toBe('2');

    button('Previous').click();
    await settle();
    expect(url()).toBe('/applications');

    el().querySelector<HTMLButtonElement>('[aria-label="Page 5"]')!.click();
    await settle();
    expect(url()).toBe('/applications?page=5');
    expect(text()).toContain('Showing 41–42 of 42');
    expect(button('Next').disabled).toBe(true);
  });

  it('lists page numbers with gaps around the current page', () => {
    expect(pageList(1, 5)).toEqual([1, 2, 3, 4, 5]);
    expect(pageList(1, 12)).toEqual([1, 2, null, 12]);
    expect(pageList(6, 12)).toEqual([1, null, 5, 6, 7, null, 12]);
    expect(pageList(11, 12)).toEqual([1, null, 10, 11, 12]);
  });

  it('shows an error with Retry and recovers with the same filters', async () => {
    list.mockReturnValueOnce(throwError(() => new Error('500')));
    await open('/applications?status=SUBMITTED');
    expect(el().querySelector('[role="alert"]')?.textContent).toContain(
      'Could not load applications.',
    );

    button('Retry').click();
    await settle();
    expect(el().querySelector('[role="alert"]')).toBeNull();
    expect(el().querySelectorAll('tbody tr')).toHaveLength(PAGE_SIZE);
    expect(list).toHaveBeenCalledTimes(2);
    expect(lastQuery()).toMatchObject({ status: 'SUBMITTED' });
  });

  it('keeps the current rows on screen, marked busy, while the next page loads', async () => {
    await open('/applications');
    const nextPage = new Subject<Page<MerchantApplication>>();
    list.mockReturnValueOnce(nextPage);

    button('Next').click();
    await settle();
    const table = el().querySelector('.dashboard-table')!;
    expect(table.getAttribute('aria-busy')).toBe('true');
    expect(text()).toContain('app-001');

    nextPage.next(pageFor({ page: 2, size: PAGE_SIZE, status: '', q: '' }));
    await settle();
    expect(table.getAttribute('aria-busy')).toBe('false');
    expect(text()).toContain('app-011');
    expect(text()).not.toContain('app-001');
  });

  it('offers "Clear filters" when a filtered search finds nothing', async () => {
    list.mockImplementation((q: ApplicationQuery) => of(pageFor(q, [])));
    await open('/applications?q=zzz&status=DRAFT');
    expect(text()).toContain('No applications found');

    button('Clear filters').click();
    await settle();
    expect(url()).toBe('/applications');
  });
});
