import { DatePipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, inject, input } from '@angular/core';
import { takeUntilDestroyed, toObservable, toSignal } from '@angular/core/rxjs-interop';
import { ActivatedRoute, Params, Router, RouterLink } from '@angular/router';
import {
  catchError,
  combineLatest,
  debounceTime,
  filter,
  map,
  of,
  scan,
  startWith,
  Subject,
  switchMap,
} from 'rxjs';
import { ApplicationApi } from '../../core/api/application.api';
import { AuthService } from '../../core/auth/auth.service';
import { ApplicationDto, ApplicationQuery, ApplicationStatus, Page } from '../../core/models';
import { CategoryLabelPipe } from '../../shared/categories';
import { IconComponent } from '../../shared/icon.component';
import { STATUS_LABELS, StatusBadgeComponent } from '../../shared/status-badge.component';

export const PAGE_SIZE = 10;
export const SEARCH_DEBOUNCE_MS = 300;

/** Query params are untrusted input: anything invalid falls back to the default. */
const toPage = (value: unknown): number => {
  const page = Number(value);
  return Number.isSafeInteger(page) && page > 0 ? page : 1;
};
const toStatus = (value: unknown): ApplicationStatus | '' =>
  typeof value === 'string' && Object.hasOwn(STATUS_LABELS, value)
    ? (value as ApplicationStatus)
    : '';
const toText = (value: unknown): string => (typeof value === 'string' ? value : '');

/** The first, last, current and neighbouring pages, with null where pages are skipped. */
export function pageList(current: number, total: number): (number | null)[] {
  if (total <= 7) return Array.from({ length: total }, (_, i) => i + 1);
  const shown = [1, current - 1, current, current + 1, total]
    .filter((p, i, all) => p >= 1 && p <= total && all.indexOf(p) === i)
    .sort((a, b) => a - b);
  return shown.flatMap((p, i) => (i > 0 && p - shown[i - 1] > 1 ? [null, p] : [p]));
}

interface ListState {
  /** Rows for the current filters. Kept on screen (dimmed) while the next page loads. */
  page: Page<ApplicationDto> | null;
  loading: boolean;
  error: string | null;
}

type ListEvent =
  { type: 'request' } | { type: 'success'; page: Page<ApplicationDto> } | { type: 'failure' };

const INITIAL_STATE: ListState = { page: null, loading: true, error: null };

function reduce(state: ListState, event: ListEvent): ListState {
  switch (event.type) {
    case 'request':
      return { ...state, loading: true, error: null };
    case 'success':
      return { page: event.page, loading: false, error: null };
    case 'failure':
      return { page: null, loading: false, error: 'Could not load applications.' };
  }
}

@Component({
  selector: 'app-dashboard',
  imports: [CategoryLabelPipe, DatePipe, IconComponent, RouterLink, StatusBadgeComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './dashboard.component.html',
  styleUrl: './dashboard.component.scss',
})
export class DashboardComponent {
  private readonly api = inject(ApplicationApi);
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);

  // Query params bound via withComponentInputBinding. The URL is the single source of truth,
  // so filters survive a reload, work with Back/Forward and can be shared as a link.
  readonly page = input(1, { transform: toPage });
  readonly status = input<ApplicationStatus | '', unknown>('', { transform: toStatus });
  readonly q = input('', { transform: toText });

  protected readonly canCreate = computed(() => this.auth.hasRole('SALES'));
  protected readonly subtitle = computed(() =>
    this.auth.hasRole('SALES')
      ? 'Merchant applications you have created.'
      : this.auth.hasRole('REVIEWER')
        ? 'Applications assigned to you for review.'
        : 'Every merchant application, across all teams.',
  );
  protected readonly hasFilters = computed(() => this.status() !== '' || this.term() !== '');

  /** Trimmed search term; as a computed it only changes when the trimmed text does. */
  private readonly term = computed(() => this.q().trim());
  private readonly query = computed<ApplicationQuery>(() => ({
    page: this.page(),
    size: PAGE_SIZE,
    status: this.status(),
    q: this.term(),
  }));

  private readonly retry$ = new Subject<void>();
  private readonly search$ = new Subject<string>();

  /** Counts per status for the search term; null while loading or if it failed (tabs still work). */
  private readonly summary = toSignal(
    toObservable(this.term).pipe(
      switchMap((q) => this.api.summary(q).pipe(catchError(() => of(null)))),
    ),
    { initialValue: null },
  );

  /** Status filters as links, so each view has its own URL. */
  protected readonly tabs = computed(() => {
    const summary = this.summary();
    return [
      { value: '', label: 'All', count: summary?.total ?? null },
      ...Object.entries(STATUS_LABELS).map(([value, label]) => ({
        value,
        label,
        count: summary?.byStatus[value as ApplicationStatus] ?? null,
      })),
    ];
  });

  /**
   * query (or Retry) -> request. switchMap cancels a stale request when the filters change,
   * and scan folds request/success/failure into one view state.
   */
  protected readonly state = toSignal(
    combineLatest([toObservable(this.query), this.retry$.pipe(startWith(null))]).pipe(
      switchMap(([query]) =>
        this.api.list(query).pipe(
          map((page): ListEvent => ({ type: 'success', page })),
          catchError(() => of<ListEvent>({ type: 'failure' })),
          startWith<ListEvent>({ type: 'request' }),
        ),
      ),
      scan(reduce, INITIAL_STATE),
    ),
    { initialValue: INITIAL_STATE },
  );

  protected readonly totalPages = computed(() => {
    const page = this.state().page;
    return page ? Math.max(1, Math.ceil(page.total / page.size)) : 1;
  });

  /** "Showing 11–20 of 42". */
  protected readonly range = computed(() => {
    const page = this.state().page;
    if (!page || page.total === 0) return null;
    const from = (page.page - 1) * page.size + 1;
    return { from, to: Math.min(page.page * page.size, page.total), total: page.total };
  });

  /** Page numbers to show, with null for a gap: 1 … 4 5 6 … 12. */
  protected readonly pageItems = computed(() => pageList(this.page(), this.totalPages()));

  /** Read out by a polite live region, so screen-reader users hear when results change. */
  protected readonly announcement = computed(() => {
    const { page, loading } = this.state();
    if (loading) return 'Loading applications…';
    return page ? `${page.total} ${page.total === 1 ? 'application' : 'applications'} found` : '';
  });

  constructor() {
    // Compared with the URL rather than distinctUntilChanged, so it stays correct after Back/Forward.
    this.search$
      .pipe(
        debounceTime(SEARCH_DEBOUNCE_MS),
        filter((text) => text !== this.q()),
        // If the user clicked through to another page meanwhile, applying the search now
        // would pull them back to the dashboard.
        filter(() => !this.leaving()),
        takeUntilDestroyed(),
      )
      .subscribe((text) => this.navigate({ q: text.trim() ? text : null, page: null }, true));
  }

  /** True while the router is taking the user to a different page. */
  private leaving(): boolean {
    const navigation = this.router.currentNavigation();
    const path = (url: string) => url.split(/[?#]/)[0];
    return (
      !!navigation &&
      path(this.router.serializeUrl(navigation.extractedUrl)) !== path(this.router.url)
    );
  }

  protected onSearch(text: string): void {
    this.search$.next(text);
  }

  protected goTo(page: number): void {
    const target = Math.min(Math.max(page, 1), this.totalPages());
    if (target !== this.page()) this.navigate({ page: target === 1 ? null : target });
  }

  protected clearFilters(): void {
    this.navigate({ status: null, q: null, page: null });
  }

  protected retry(): void {
    this.retry$.next();
  }

  /** From the server's allowedActions; the API rejects any other edit anyway. */
  protected canEdit(app: ApplicationDto): boolean {
    return app.allowedActions.includes('edit');
  }

  /** Merges into the current query params; null removes a param, keeping URLs clean. */
  private navigate(queryParams: Params, replaceUrl = false): void {
    void this.router.navigate([], {
      relativeTo: this.route,
      queryParams,
      queryParamsHandling: 'merge',
      replaceUrl,
    });
  }
}
