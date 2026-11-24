import { HttpErrorResponse } from '@angular/common/http';
import { ChangeDetectionStrategy, Component, computed, inject, input } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { catchError, map, of, startWith, Subject, switchMap, timer } from 'rxjs';
import { ApplicationApi } from '../core/api/application.api';
import { IconComponent } from './icon.component';
import { maskValue } from './mask';

/** How long a revealed value stays on screen. */
export const REVEAL_MS = 30_000;

type RevealState =
  | { status: 'hidden' | 'loading' }
  | { status: 'shown'; value: string }
  | { status: 'error'; message: string };

const HIDDEN: RevealState = { status: 'hidden' };

/**
 * A sensitive value (tax ID, account number), always shown masked. When `canReveal` is set,
 * a button fetches the real value from GET /reveal/:field (checked and audit-logged by the
 * server) and hides it again after 30 seconds. The page decides `canReveal`; the server
 * decides whether the request succeeds.
 *
 * The value is masked here as well, so it is never shown in full by accident, even when the
 * API returns it unmasked (the author's own draft).
 */
@Component({
  selector: 'app-sensitive-value',
  imports: [IconComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @let s = state();
    <span class="d-inline-flex flex-wrap align-items-center gap-2">
      @if (s.status === 'shown') {
        <app-icon class="text-warning" name="eye" />
        <span class="font-monospace">{{ s.value }}</span>
      } @else {
        <app-icon class="text-body-secondary" name="lock" />
        <span class="font-monospace" aria-hidden="true">{{ masked() }}</span>
        <span class="visually-hidden">Hidden, ends in {{ lastFour() }}</span>
      }
      @if (canReveal()) {
        <button
          type="button"
          class="btn btn-link btn-sm p-0"
          [disabled]="s.status === 'loading'"
          (click)="toggle()"
        >
          @if (s.status === 'loading') {
            <span class="spinner-border spinner-border-sm" aria-hidden="true"></span>
          }
          {{ s.status === 'shown' ? 'Hide' : 'Reveal' }}
          <span class="visually-hidden">{{ label() }}</span>
        </button>
      }
      @if (s.status === 'shown') {
        <span class="small text-body-secondary">Hides in 30 seconds</span>
      }
    </span>
    @if (s.status === 'error') {
      <div class="small text-danger mt-1" role="alert">{{ s.message }}</div>
    }
  `,
})
export class SensitiveValueComponent {
  private readonly api = inject(ApplicationApi);

  readonly appId = input.required<string>();
  readonly field = input.required<'taxId' | 'accountNumber'>();
  /** The value as the API sent it: usually already masked. */
  readonly value = input.required<string>();
  /** Names the value for screen readers, e.g. "Reveal tax ID". */
  readonly label = input.required<string>();
  readonly canReveal = input(false);

  protected readonly masked = computed(() => maskValue(this.value()));
  protected readonly lastFour = computed(() => this.value().slice(-4));

  private readonly toggle$ = new Subject<boolean>();

  /**
   * Reveal → request → show → timer → hide. switchMap cancels the timer (or a request still
   * running) on Hide, and toSignal unsubscribes when the component is destroyed.
   */
  protected readonly state = toSignal(
    this.toggle$.pipe(
      switchMap((reveal) =>
        reveal
          ? this.api.reveal(this.appId(), this.field()).pipe(
              switchMap(({ value }) =>
                timer(REVEAL_MS).pipe(
                  map(() => HIDDEN),
                  startWith<RevealState>({ status: 'shown', value }),
                ),
              ),
              catchError((error: unknown) => of(failure(error))),
              startWith<RevealState>({ status: 'loading' }),
            )
          : of(HIDDEN),
      ),
    ),
    { initialValue: HIDDEN },
  );

  protected toggle(): void {
    this.toggle$.next(this.state().status !== 'shown');
  }
}

function failure(error: unknown): RevealState {
  const forbidden = error instanceof HttpErrorResponse && error.status === 403;
  return {
    status: 'error',
    message: forbidden ? 'You are not allowed to see this value.' : 'Could not reveal. Try again.',
  };
}
