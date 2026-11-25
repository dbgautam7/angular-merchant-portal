import { DatePipe, DecimalPipe, DOCUMENT } from '@angular/common';
import { HttpErrorResponse } from '@angular/common/http';
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  DestroyRef,
  inject,
  input,
  signal,
} from '@angular/core';
import { takeUntilDestroyed, toObservable, toSignal } from '@angular/core/rxjs-interop';
import { NonNullableFormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { catchError, map, Observable, of, startWith, switchMap, tap, throwError } from 'rxjs';
import { ApplicationApi } from '../../core/api/application.api';
import { MIN_NAME_LENGTH, MIN_OWNER_AGE } from '../../core/application-rules';
import { ApplicationDto, ApplicationForm } from '../../core/models';
import { autoSave } from '../../shared/auto-save';
import { CATEGORY_LABELS, CategoryLabelPipe } from '../../shared/categories';
import { injectFocus } from '../../shared/focus';
import { FieldControlDirective, FormFieldComponent } from '../../shared/form-field';
import { IconComponent } from '../../shared/icon.component';
import { maskValue } from '../../shared/mask';
import { CanLeave } from '../../shared/unsaved-changes.guard';
import {
  accountNumber,
  httpsUrl,
  minAge,
  notBlank,
  registrationNumber,
  taxId,
} from '../../shared/validators';

export const AUTO_SAVE_DEBOUNCE_MS = 800;

type SectionKey = keyof ApplicationForm;
type StepKey = SectionKey | 'review';
type LoadState = 'loading' | 'ready' | 'error';

type StepState = 'current' | 'complete' | 'error' | 'upcoming';

const STEPS: readonly {
  key: StepKey;
  label: string;
  description: string;
  title: string;
  intro: string;
}[] = [
  {
    key: 'business',
    label: 'Business',
    description: 'Legal name and registration',
    title: 'Business details',
    intro: 'The merchant’s business, exactly as it is registered.',
  },
  {
    key: 'owner',
    label: 'Owner',
    description: 'Identity and contact',
    title: 'Owner details',
    intro: 'The person who owns or controls the business.',
  },
  {
    key: 'banking',
    label: 'Banking',
    description: 'Payout account and volume',
    title: 'Banking details',
    intro: 'Where settlements are paid, and the expected monthly card volume.',
  },
  {
    key: 'review',
    label: 'Review',
    description: 'Check and submit',
    title: 'Review and submit',
    intro: 'Check every answer. Submitting locks the application and sends it for risk review.',
  },
];
const REVIEW = STEPS.length - 1;

/** One group per step; the shape matches ApplicationForm, so getRawValue() is the API payload. */
function buildForm(fb: NonNullableFormBuilder) {
  const text = [Validators.required, notBlank];
  return fb.group({
    business: fb.group({
      legalName: ['', [...text, Validators.minLength(MIN_NAME_LENGTH), Validators.maxLength(120)]],
      registrationNumber: ['', [Validators.required, registrationNumber]],
      category: ['', Validators.required],
      website: ['', httpsUrl],
    }),
    owner: fb.group({
      fullName: ['', [...text, Validators.minLength(MIN_NAME_LENGTH), Validators.maxLength(120)]],
      email: ['', [Validators.required, Validators.email]],
      dateOfBirth: ['', [Validators.required, minAge(MIN_OWNER_AGE)]],
      taxId: ['', [Validators.required, taxId]],
    }),
    banking: fb.group({
      bankName: ['', [...text, Validators.maxLength(120)]],
      accountNumber: ['', [Validators.required, accountNumber]],
      monthlyVolume: fb.control<number | null>(null, [Validators.required, Validators.min(1)]),
    }),
  });
}

/**
 * The server re-checks the application on submit (422 with the reasons). The form normally
 * catches the same problems first, so this only shows up if the rules ever disagree.
 */
function submitErrorMessage(error: unknown): string {
  const problems: unknown = error instanceof HttpErrorResponse ? error.error?.problems : null;
  if (error instanceof HttpErrorResponse && error.status === 422 && Array.isArray(problems)) {
    return `The server could not accept the application: ${problems.join(' ')}`;
  }
  return 'Could not submit the application. Your answers are kept; try again.';
}

@Component({
  selector: 'app-application-wizard',
  imports: [
    CategoryLabelPipe,
    DatePipe,
    DecimalPipe,
    ReactiveFormsModule,
    FormFieldComponent,
    FieldControlDirective,
    IconComponent,
    RouterLink,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './application-wizard.component.html',
  styleUrl: './application-wizard.component.scss',
  host: { '(window:beforeunload)': 'onBeforeUnload($event)' },
})
export class ApplicationWizardComponent implements CanLeave {
  private readonly api = inject(ApplicationApi);
  private readonly router = inject(Router);
  private readonly window = inject(DOCUMENT).defaultView;
  private readonly focus = injectFocus();
  private readonly destroyRef = inject(DestroyRef);

  /** Bound from the :id route param; undefined on /applications/new. */
  readonly id = input<string>();

  protected readonly steps = STEPS;
  protected readonly categories = Object.entries(CATEGORY_LABELS).map(([value, label]) => ({
    value,
    label,
  }));
  protected readonly form = buildForm(inject(NonNullableFormBuilder));

  protected readonly stepIndex = signal(0);
  protected readonly step = computed(() => STEPS[this.stepIndex()]);
  protected readonly isReview = computed(() => this.stepIndex() === REVIEW);
  protected readonly submitting = signal(false);
  protected readonly submitError = signal<string | null>(null);

  /** Set once the server draft exists: loaded on /:id/edit, or created by the first save on /new. */
  protected readonly draftId = signal<string | null>(null);

  protected readonly draft = autoSave({
    changes: this.form.valueChanges,
    value: () => this.form.getRawValue(),
    save: (value) => this.saveDraft(value),
    debounceMs: AUTO_SAVE_DEBOUNCE_MS,
  });

  /**
   * /new shows a blank form; /:id/edit loads the draft. The id can change while the wizard stays
   * mounted (one route serves both URLs), so this follows the input rather than reading it once.
   */
  protected readonly loadState = toSignal(
    toObservable(this.id).pipe(
      switchMap((id) => {
        if (!id) return of(this.show(null));
        if (id === this.draftId()) return of<LoadState>('ready'); // the URL update after creating it
        return this.api.get(id).pipe(
          map((app) => this.show(app)),
          catchError(() => of<LoadState>('error')),
          startWith<LoadState>('loading'),
        );
      }),
    ),
    { initialValue: 'loading' },
  );

  /** Route guard hook: saves pending changes before the router leaves the page. */
  canLeave(): Observable<boolean> {
    return this.draft.flush().pipe(
      map(() => true),
      catchError(() =>
        of(this.window?.confirm('Your latest changes could not be saved. Leave anyway?') ?? true),
      ),
    );
  }

  /** Closing the tab can't wait for a save, so the browser asks the user to confirm instead. */
  protected onBeforeUnload(event: BeforeUnloadEvent): void {
    if (this.draft.hasPendingChanges()) event.preventDefault();
  }

  /** Enter in any field submits the form: Next on the data steps, Submit on the review step. */
  protected onSubmit(): void {
    if (this.isReview()) this.submit();
    else this.goTo(this.stepIndex() + 1);
  }

  /**
   * Moves to a step. Going back is always allowed. Going forward requires every step in
   * between to be valid; otherwise it stops at the first invalid one and shows its errors.
   */
  protected goTo(target: number): void {
    const blocker =
      target > this.stepIndex()
        ? STEPS.findIndex((s, i) => i < target && s.key !== 'review' && this.section(s.key).invalid)
        : -1;
    if (blocker === -1) {
      this.stepIndex.set(target);
      this.focus('#step-heading');
      return;
    }
    this.section(STEPS[blocker].key as SectionKey).markAllAsTouched();
    this.stepIndex.set(blocker);
    this.focus('[aria-invalid="true"]');
  }

  /** Drives the stepper: done steps get a check, visited steps with errors get a warning. */
  protected stepState(index: number): StepState {
    if (index === this.stepIndex()) return 'current';
    const key = STEPS[index].key;
    if (key === 'review') return 'upcoming';
    const section = this.section(key);
    if (section.valid) return 'complete';
    return section.touched ? 'error' : 'upcoming';
  }

  protected retrySave(): void {
    // The status line reports the outcome.
    this.draft.flush().subscribe({ error: () => undefined });
  }

  protected mask(value: string): string {
    return maskValue(value);
  }

  private submit(): void {
    if (this.form.invalid) {
      this.goTo(REVIEW); // stops at the first invalid step
      return;
    }
    this.submitting.set(true);
    this.submitError.set(null);
    // flush() runs in the save queue, so submit always follows the latest saved version.
    this.draft
      .flush()
      .pipe(
        switchMap(() => {
          const id = this.draftId();
          return id ? this.api.submit(id) : throwError(() => new Error('No draft to submit'));
        }),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe({
        next: (app) => void this.router.navigate(['/applications', app.id]),
        error: (error: unknown) => {
          this.submitting.set(false);
          this.submitError.set(submitErrorMessage(error));
        },
      });
  }

  private section(key: SectionKey) {
    return this.form.controls[key];
  }

  /** Creates the server draft on the first save, then saves into it. */
  private saveDraft(value: ApplicationForm): Observable<ApplicationDto> {
    const id = this.draftId();
    const id$ = id
      ? of(id)
      : this.api.createDraft().pipe(
          map((app) => app.id),
          tap((newId) => {
            this.draftId.set(newId);
            // Refresh-safe URL. Same route, so the wizard stays mounted (see wizardMatcher).
            // Skipped when the user is already leaving (this is the leave guard's save):
            // starting a navigation now would cancel theirs and keep them on the form.
            if (!this.router.currentNavigation()) {
              void this.router.navigate(['/applications', newId, 'edit'], { replaceUrl: true });
            }
          }),
        );
    return id$.pipe(switchMap((draftId) => this.api.saveDraft(draftId, value)));
  }

  /**
   * Starts the wizard on a loaded draft, or on a blank form for /new. Anything already submitted
   * opens read-only on the detail page instead.
   */
  private show(app: ApplicationDto | null): LoadState {
    // Not editable by this user (e.g. already submitted): open it read-only instead.
    if (app && !app.allowedActions.includes('edit')) {
      void this.router.navigate(['/applications', app.id], { replaceUrl: true });
      return 'loading';
    }
    if (app) {
      const { business, owner, banking } = app;
      this.form.reset({ business, owner, banking });
    } else {
      this.form.reset();
    }
    this.draft.reset(this.form.getRawValue()); // loading is not an edit: nothing to save
    this.draftId.set(app?.id ?? null);
    this.stepIndex.set(0);
    this.submitError.set(null);
    return 'ready';
  }
}
