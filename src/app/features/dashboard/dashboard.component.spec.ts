import { TestBed } from '@angular/core/testing';
import { provideRouter, Router, withComponentInputBinding } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { Observable, of, Subject, throwError } from 'rxjs';
import type { Mock } from 'vitest';
import { ApplicationApi } from '../../core/api/application.api';
import { AuthService } from '../../core/auth/auth.service';
import { seed } from '../../core/mock/mock-db';
import { ApplicationQuery, MerchantApplication, Page, Role } from '../../core/models';
import { DashboardComponent, PAGE_SIZE, SEARCH_DEBOUNCE_MS } from './dashboard.component';

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
  let harness: RouterTestingHarness;

  async function open(url: string, role: Role = 'SALES'): Promise<void> {
    TestBed.configureTestingModule({
      providers: [
        provideRouter(
          [{ path: 'applications', component: DashboardComponent }],
          withComponentInputBinding(),
        ),
        { provide: ApplicationApi, useValue: { list } },
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

  beforeEach(() => {
    list = vi.fn((q: ApplicationQuery) => of(pageFor(q)));
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

  it('hides create and edit actions from REVIEWER', async () => {
    await open('/applications', 'REVIEWER');
    expect(text()).not.toContain('New application');
    expect(links('Edit')).toHaveLength(0);
    expect(links('View')).toHaveLength(PAGE_SIZE);
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

  it('filters by status, resets to page 1 and reflects the URL in the select', async () => {
    await open('/applications?page=2');
    const select = el().querySelector<HTMLSelectElement>('#status')!;
    select.value = 'DRAFT';
    select.dispatchEvent(new Event('change'));
    await settle();

    expect(url()).toBe('/applications?status=DRAFT');
    expect(lastQuery()).toMatchObject({ page: 1, status: 'DRAFT' });
    expect(select.value).toBe('DRAFT');
  });

  it('pages through results via the URL and disables the ends', async () => {
    await open('/applications');
    expect(button('Previous').disabled).toBe(true);

    button('Next').click();
    await settle();
    expect(url()).toBe('/applications?page=2');
    expect(lastQuery()).toMatchObject({ page: 2 });
    expect(text()).toContain('page 2 of 5');

    button('Previous').click();
    await settle();
    expect(url()).toBe('/applications');

    await harness.navigateByUrl('/applications?page=5');
    await settle();
    expect(button('Next').disabled).toBe(true);
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
    expect(text()).toContain('No applications found.');

    button('Clear filters').click();
    await settle();
    expect(url()).toBe('/applications');
  });
});
