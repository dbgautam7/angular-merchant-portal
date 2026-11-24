import { DatePipe, DecimalPipe } from '@angular/common';
import { HttpErrorResponse } from '@angular/common/http';
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  DestroyRef,
  inject,
  input,
  linkedSignal,
  signal,
} from '@angular/core';
import { takeUntilDestroyed, toObservable, toSignal } from '@angular/core/rxjs-interop';
import { NonNullableFormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { RouterLink } from '@angular/router';
import {
  catchError,
  combineLatest,
  finalize,
  map,
  Observable,
  of,
  startWith,
  Subject,
  switchMap,
} from 'rxjs';
import { ApplicationApi } from '../../core/api/application.api';
import { AuthService } from '../../core/auth/auth.service';
import { MerchantApplication, RiskEvent } from '../../core/models';
import { CategoryLabelPipe } from '../../shared/categories';
import { injectFocus } from '../../shared/focus';
import { FieldControlDirective, FormFieldComponent } from '../../shared/form-field';
import { SensitiveValueComponent } from '../../shared/sensitive-value.component';
import { StatusBadgeComponent } from '../../shared/status-badge.component';
import { notBlank } from '../../shared/validators';

type Decision = 'APPROVED' | 'REJECTED';

type LoadState =
  | { status: 'loading' }
  | { status: 'ready'; app: MerchantApplication }
  | { status: 'error'; notFound: boolean };

const EVENT_BADGES: Record<RiskEvent['decision'], { label: string; css: string }> = {
  APPROVED: { label: 'Approved', css: 'text-bg-success' },
  REJECTED: { label: 'Rejected', css: 'text-bg-danger' },
  NOTE: { label: 'Note', css: 'text-bg-secondary' },
};

const isStatus = (error: unknown, ...codes: number[]) =>
  error instanceof HttpErrorResponse && codes.includes(error.status);

@Component({
  selector: 'app-application-detail',
  imports: [
    CategoryLabelPipe,
    DatePipe,
    DecimalPipe,
    ReactiveFormsModule,
    RouterLink,
    FormFieldComponent,
    FieldControlDirective,
    SensitiveValueComponent,
    StatusBadgeComponent,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './application-detail.component.html',
})
export class ApplicationDetailComponent {
  private readonly api = inject(ApplicationApi);
  private readonly auth = inject(AuthService);
  private readonly fb = inject(NonNullableFormBuilder);
  private readonly destroyRef = inject(DestroyRef);
  private readonly focus = injectFocus();

  /** Bound from the :id route param via withComponentInputBinding. */
  readonly id = input.required<string>();

  private readonly retry$ = new Subject<void>();

  /** id (or Retry) → GET. switchMap drops a stale response when the id changes. */
  protected readonly load = toSignal(
    combineLatest([toObservable(this.id), this.retry$.pipe(startWith(null))]).pipe(
      switchMap(([id]) =>
        this.api.get(id).pipe(
          map((app): LoadState => ({ status: 'ready', app })),
          // The API answers 404 for anything outside your scope, so it can't leak existence.
          catchError((error: unknown) =>
            of<LoadState>({ status: 'error', notFound: isStatus(error, 404) }),
          ),
          startWith<LoadState>({ status: 'loading' }),
        ),
      ),
    ),
    { initialValue: { status: 'loading' } },
  );

  /**
   * The application on screen. Follows each load, and a decision or assignment replaces it
   * with the updated copy the server returns, so the page updates without a refetch.
   */
  protected readonly app = linkedSignal(() => {
    const state = this.load();
    return state.status === 'ready' ? state.app : null;
  });

  /** Newest first. */
  protected readonly history = computed(() => [...(this.app()?.riskHistory ?? [])].reverse());
  protected readonly eventBadges = EVENT_BADGES;

  /**
   * Who sees which control, in one place so the policy is easy to review. UX only: the API
   * enforces the same rules (403/404), so hiding a control is never the security boundary.
   */
  protected readonly can = computed(() => {
    const status = this.app()?.status;
    const open = status === 'SUBMITTED' || status === 'IN_REVIEW';
    return {
      edit: this.auth.hasRole('SALES') && status === 'DRAFT',
      decide: this.auth.hasRole('REVIEWER', 'ADMIN') && open,
      assign: this.auth.hasRole('ADMIN') && open,
      reveal: this.auth.hasRole('REVIEWER', 'ADMIN'),
      seeReviewer: this.auth.hasRole('REVIEWER', 'ADMIN'),
    };
  });

  /** Only ADMIN may list reviewers (the API returns 403 to anyone else). null = failed. */
  protected readonly reviewers = toSignal(
    this.auth.hasRole('ADMIN') ? this.api.reviewers().pipe(catchError(() => of(null))) : of([]),
    { initialValue: [] },
  );

  protected readonly reviewerName = computed(() => {
    const assignee = this.app()?.assignedTo;
    if (!assignee) return 'Unassigned';
    if (assignee === this.auth.user()?.id) return 'You';
    return this.reviewers()?.find((r) => r.id === assignee)?.name ?? assignee;
  });

  protected readonly decisionForm = this.fb.group({
    comment: [
      '',
      [Validators.required, notBlank, Validators.minLength(5), Validators.maxLength(500)],
    ],
  });
  protected readonly reviewerControl = this.fb.control('');

  protected readonly busy = signal(false);
  // Messages about the last action; cleared when another application is opened.
  protected readonly notice = linkedSignal<string, string | null>({
    source: this.id,
    computation: () => null,
  });
  protected readonly actionError = linkedSignal<string, string | null>({
    source: this.id,
    computation: () => null,
  });

  protected retry(): void {
    this.retry$.next();
  }

  protected decide(decision: Decision): void {
    const comment = this.decisionForm.controls.comment;
    if (comment.invalid) {
      comment.markAsTouched();
      this.focus('[aria-invalid="true"]');
      return;
    }
    this.run(
      this.api.decide(this.id(), decision, comment.value.trim()),
      decision === 'APPROVED' ? 'Application approved.' : 'Application rejected.',
    );
  }

  protected assign(): void {
    const reviewerId = this.reviewerControl.value;
    const reviewer = this.reviewers()?.find((r) => r.id === reviewerId);
    if (!reviewer || reviewerId === this.app()?.assignedTo) return;
    this.run(this.api.assign(this.id(), reviewerId), `Assigned to ${reviewer.name}.`);
  }

  /** Runs one action at a time and shows the server's updated copy of the application. */
  private run(request: Observable<MerchantApplication>, success: string): void {
    if (this.busy()) return;
    this.busy.set(true);
    this.notice.set(null);
    this.actionError.set(null);
    request
      .pipe(
        finalize(() => this.busy.set(false)),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe({
        next: (updated) => {
          this.app.set(updated);
          this.decisionForm.reset();
          this.reviewerControl.reset();
          this.notice.set(success);
          // The panel that had focus is gone now; move focus to the confirmation.
          this.focus('#action-notice');
        },
        error: (error: unknown) => {
          if (isStatus(error, 403, 404)) {
            // Someone else decided, or it was reassigned: show the current state.
            this.actionError.set(
              'This application changed since you opened it, so it was reloaded.',
            );
            this.retry();
          } else {
            this.actionError.set('Something went wrong. Nothing was changed; try again.');
          }
        },
      });
  }
}
