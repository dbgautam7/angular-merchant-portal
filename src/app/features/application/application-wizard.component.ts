import { DatePipe, DecimalPipe, DOCUMENT } from '@angular/common';
import {
  afterNextRender,
  ChangeDetectionStrategy,
  Component,
  computed,
  DestroyRef,
  ElementRef,
  inject,
  Injector,
  input,
  signal,
} from '@angular/core';
import { takeUntilDestroyed, toObservable, toSignal } from '@angular/core/rxjs-interop';
import { NonNullableFormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router } from '@angular/router';
import { catchError, map, Observable, of, startWith, switchMap, tap, throwError } from 'rxjs';
import { ApplicationApi } from '../../core/api/application.api';
import { ApplicationForm, MerchantApplication } from '../../core/models';
import { autoSave } from '../../shared/auto-save';
import { FieldControlDirective, FormFieldComponent } from '../../shared/form-field';
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

const STEPS: readonly { key: StepKey; label: string; title: string }[] = [
  { key: 'business', label: 'Business', title: 'Business details' },
  { key: 'owner', label: 'Owner', title: 'Owner details' },
  { key: 'banking', label: 'Banking', title: 'Banking details' },
  { key: 'review', label: 'Review', title: 'Review and submit' },
];
const REVIEW = STEPS.length - 1;

const CATEGORIES = [
  { value: 'RETAIL', label: 'Retail' },
  { value: 'TRAVEL', label: 'Travel' },
  { value: 'FOOD', label: 'Food & beverage' },
  { value: 'DIGITAL', label: 'Digital goods' },
];

/** One group per step; the shape matches ApplicationForm, so getRawValue() is the API payload. */
function buildForm(fb: NonNullableFormBuilder) {
  const text = [Validators.required, notBlank];
  return fb.group({
    business: fb.group({
      legalName: ['', [...text, Validators.minLength(3), Validators.maxLength(120)]],
      registrationNumber: ['', [Validators.required, registrationNumber]],
      category: ['', Validators.required],
      website: ['', httpsUrl],
    }),
    owner: fb.group({
      fullName: ['', [...text, Validators.minLength(3), Validators.maxLength(120)]],
      email: ['', [Validators.required, Validators.email]],
      dateOfBirth: ['', [Validators.required, minAge(18)]],
      taxId: ['', [Validators.required, taxId]],
    }),
    banking: fb.group({
      bankName: ['', [...text, Validators.maxLength(120)]],
      accountNumber: ['', [Validators.required, accountNumber]],
      monthlyVolume: fb.control<number | null>(null, [Validators.required, Validators.min(1)]),
    }),
  });
}

/** Shows the last 4 characters, the same way the server masks sensitive values. */
const mask = (value: string): string => '•'.repeat(Math.max(0, value.length - 4)) + value.slice(-4);

@Component({
  selector: 'app-application-wizard',
  imports: [DatePipe, DecimalPipe, ReactiveFormsModule, FormFieldComponent, FieldControlDirective],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './application-wizard.component.html',
  styleUrl: './application-wizard.component.scss',
  host: { '(window:beforeunload)': 'onBeforeUnload($event)' },
})
export class ApplicationWizardComponent implements CanLeave {
  private readonly api = inject(ApplicationApi);
  private readonly router = inject(Router);
  private readonly window = inject(DOCUMENT).defaultView;
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);
  private readonly injector = inject(Injector);
  private readonly destroyRef = inject(DestroyRef);

  /** Bound from the :id route param; undefined on /applications/new. */
  readonly id = input<string>();

  protected readonly steps = STEPS;
  protected readonly categories = CATEGORIES;
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
      this.focusAfterRender('#step-heading');
      return;
    }
    this.section(STEPS[blocker].key as SectionKey).markAllAsTouched();
    this.stepIndex.set(blocker);
    this.focusAfterRender('[aria-invalid="true"]');
  }

  protected isComplete(key: StepKey): boolean {
    return key !== 'review' && this.section(key).valid;
  }

  protected retrySave(): void {
    // The status line reports the outcome.
    this.draft.flush().subscribe({ error: () => undefined });
  }

  protected mask(value: string): string {
    return mask(value);
  }

  protected categoryLabel(value: string): string {
    return CATEGORIES.find((c) => c.value === value)?.label ?? value;
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
        error: () => {
          this.submitting.set(false);
          this.submitError.set(
            'Could not submit the application. Your answers are kept; try again.',
          );
        },
      });
  }

  private section(key: SectionKey) {
    return this.form.controls[key];
  }

  /** Creates the server draft on the first save, then saves into it. */
  private saveDraft(value: ApplicationForm): Observable<MerchantApplication> {
    const id = this.draftId();
    const id$ = id
      ? of(id)
      : this.api.createDraft().pipe(
          map((app) => app.id),
          tap((newId) => {
            this.draftId.set(newId);
            // Refresh-safe URL. Same route, so the wizard stays mounted (see wizardMatcher).
            void this.router.navigate(['/applications', newId, 'edit'], { replaceUrl: true });
          }),
        );
    return id$.pipe(switchMap((draftId) => this.api.saveDraft(draftId, value)));
  }

  /**
   * Starts the wizard on a loaded draft, or on a blank form for /new. Anything already submitted
   * opens read-only on the detail page instead.
   */
  private show(app: MerchantApplication | null): LoadState {
    if (app && app.status !== 'DRAFT') {
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

  private focusAfterRender(selector: string): void {
    afterNextRender(() => this.host.nativeElement.querySelector<HTMLElement>(selector)?.focus(), {
      injector: this.injector,
    });
  }
}
