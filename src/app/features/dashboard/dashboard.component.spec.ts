import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter, Router, withComponentInputBinding } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { Observable, of, Subject, throwError } from 'rxjs';
import type { Mock } from 'vitest';
import { ApplicationApi } from '../../core/api/application.api';
import { AuthService } from '../../core/auth/auth.service';
import { seed } from '../../core/mock/mock-db';
import {
  ApplicationDto,
  ApplicationQuery,
  ApplicationSummary,
  Page,
  Role,
  User,
} from '../../core/models';
import { asSeenBy, DEMO_USER } from '../../../testing/fixtures';
import { DashboardComponent, PAGE_SIZE, pageList, SEARCH_DEBOUNCE_MS } from './dashboard.component';

/**
 * 42 fictional applications. On page 1, app-005 (Sita's) and app-010 (Sam's) are drafts.
 * Rows come back as the current viewer would see them, with allowedActions from the real policy.
 */
const ROWS = seed();
let viewer: User;
const pageFor = (q: ApplicationQuery, rows = ROWS): Page<ApplicationDto> => ({
  items: rows.slice((q.page - 1) * q.size, q.page * q.size).map((a) => asSeenBy(viewer, a)),
  total: rows.length,
  page: q.page,
  size: q.size,
});

@Component({ template: 'Detail' })
class StubPage {}
let gate: Observable<boolean> = of(true);

describe('DashboardComponent', () => {
  let list: Mock<(q: ApplicationQuery) => Observable<Page<ApplicationDto>>>;
  let summary: Mock<(q: string) => Observable<ApplicationSummary>>;
  let harness: RouterTestingHarness;

  async function open(url: string, role: Role = 'SALES'): Promise<void> {
    viewer = DEMO_USER[role];
    TestBed.configureTestingModule({
      providers: [
        provideRouter(
          [
            { path: 'applications', component: DashboardComponent },
            // A detail page whose guard the test can hold open, to keep a navigation in flight.
            { path: 'applications/:id', component: StubPage, canActivate: [() => gate] },
          ],
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

  it('shows "New application" to SALES, and Edit only where the server allows it', async () => {
    await open('/applications'); // as Sita
    expect(text()).toContain('New application');
    expect(el().querySelectorAll('tbody tr')).toHaveLength(PAGE_SIZE);
    // app-010 is also a draft, but Sam's: its allowedActions has no 'edit', so no Edit link.
    expect(links('Edit').map((a) => a.getAttribute('href'))).toEqual([
      '/applications/app-005/edit',
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

  it('drops a pending search once the user has clicked through to another page', async () => {
    await open('/applications');
    const release = new Subject<boolean>();
    gate = release; // the detail navigation waits here
    vi.useFakeTimers();
    const box = el().querySelector<HTMLInputElement>('#search')!;
    box.value = 'demo';
    box.dispatchEvent(new Event('input'));

    const leaving = TestBed.inject(Router).navigateByUrl('/applications/app-001');
    await vi.advanceTimersByTimeAsync(SEARCH_DEBOUNCE_MS); // the search fires mid-navigation
    release.next(true);
    release.complete();
    vi.useRealTimers();
    await leaving;
    gate = of(true);

    expect(url()).toBe('/applications/app-001'); // not pulled back to /applications?q=demo
    expect(list).not.toHaveBeenCalledWith(expect.objectContaining({ q: 'demo' }));
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
    const nextPage = new Subject<Page<ApplicationDto>>();
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
