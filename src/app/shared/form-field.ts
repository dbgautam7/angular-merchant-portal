import {
  AfterContentInit,
  ChangeDetectionStrategy,
  Component,
  computed,
  contentChild,
  DestroyRef,
  Directive,
  inject,
  input,
  signal,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { NgControl, Validators } from '@angular/forms';
import { startWith } from 'rxjs';
import { errorMessage } from './validators';

let nextId = 0;

/**
 * A labelled form control with an optional hint and its validation message:
 *
 *   <app-form-field label="Legal name" hint="As registered">
 *     <input appFieldControl formControlName="legalName" class="form-control" />
 *   </app-form-field>
 *
 * The message appears once the control has been touched (on blur, or when the step is
 * validated), so nobody sees errors before they start typing.
 *
 * OnPush-safe: this component's inputs never change while the user types, so it listens to
 * the control's `events` stream (value, status and touched changes) and keeps the result in
 * a signal. The signal refreshes both this template and the host bindings on the control.
 */
@Component({
  selector: 'app-form-field',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <label class="form-label" [for]="controlId">
      {{ label() }}
      @if (required()) {
        <span class="text-danger" aria-hidden="true">*</span>
      }
    </label>
    <ng-content />
    @if (hint(); as text) {
      <div class="form-text" [id]="hintId">{{ text }}</div>
    }
    @if (error(); as message) {
      <div class="invalid-feedback d-block" [id]="errorId">{{ message }}</div>
    }
  `,
})
export class FormFieldComponent implements AfterContentInit {
  private readonly destroyRef = inject(DestroyRef);
  private readonly ngControl = contentChild.required(NgControl);

  readonly label = input.required<string>();
  readonly hint = input<string>();

  readonly controlId = `field-${++nextId}`;
  protected readonly hintId = `${this.controlId}-hint`;
  protected readonly errorId = `${this.controlId}-error`;

  /** The first validation message, or null while the control is valid or untouched. */
  readonly error = signal<string | null>(null);
  readonly required = signal(false);
  /** Ids for aria-describedby: the hint, then the error, so screen readers read both. */
  readonly describedBy = computed(
    () =>
      [this.hint() ? this.hintId : null, this.error() ? this.errorId : null]
        .filter(Boolean)
        .join(' ') || null,
  );

  ngAfterContentInit(): void {
    // The directive has bound its control by now: FormControlName does it in ngOnChanges.
    const control = this.ngControl().control;
    if (!control) return;
    this.required.set(control.hasValidator(Validators.required));
    control.events
      .pipe(startWith(null), takeUntilDestroyed(this.destroyRef))
      .subscribe(() =>
        this.error.set(control.touched && control.invalid ? errorMessage(control.errors) : null),
      );
  }
}

/**
 * Marks the input or select inside <app-form-field>: gives it the id the label points to,
 * Bootstrap's is-invalid style, and the matching ARIA state.
 */
@Directive({
  selector: '[appFieldControl]',
  host: {
    '[id]': 'field.controlId',
    '[class.is-invalid]': 'field.error() !== null',
    '[attr.aria-invalid]': 'field.error() !== null',
    '[attr.aria-required]': 'field.required() || null',
    '[attr.aria-describedby]': 'field.describedBy()',
  },
})
export class FieldControlDirective {
  protected readonly field = inject(FormFieldComponent);
}
