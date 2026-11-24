import { computed, DestroyRef, inject, Signal, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import {
  catchError,
  concatMap,
  debounceTime,
  defer,
  EMPTY,
  finalize,
  Observable,
  Subject,
  tap,
} from 'rxjs';

export type SaveStatus = 'idle' | 'unsaved' | 'saving' | 'saved' | 'error';

export interface AutoSaveOptions<T> {
  /** Emits whenever the value may have changed, e.g. `form.valueChanges`. */
  changes: Observable<unknown>;
  /** Reads the current value. Called when a save starts, so a queued save never sends stale data. */
  value: () => T;
  save: (value: T) => Observable<unknown>;
  debounceMs: number;
}

export interface AutoSave<T> {
  readonly status: Signal<SaveStatus>;
  /** When the last save succeeded. */
  readonly savedAt: Signal<Date | null>;
  /** True while the server is missing some changes (not saved yet, saving, or failed). */
  readonly hasPendingChanges: Signal<boolean>;
  /**
   * Saves right away, skipping the debounce but waiting for any save already running.
   * Emits once and completes when everything is saved; errors if the save fails.
   */
  flush(): Observable<void>;
  /** Treats `value` as already saved, e.g. a draft that was just loaded from the server. */
  reset(value: T): void;
}

/**
 * Debounced auto-save. Call it in an injection context (a field initializer, for example);
 * it stops when that context is destroyed.
 *
 *  - Changes are debounced, and a save is skipped when the value equals the last saved one.
 *  - Saves run one at a time, in order (concatMap), so requests never overlap or arrive out
 *    of order. That also lets the first save create the draft exactly once.
 *  - A failed save leaves the form untouched; the next change, or flush(), tries again.
 */
export function autoSave<T>({ changes, value, save, debounceMs }: AutoSaveOptions<T>): AutoSave<T> {
  const destroyRef = inject(DestroyRef);
  // Compared as JSON: cheap for a small form, and it catches "typed, then undid" as no change.
  const snapshot = (v: T) => JSON.stringify(v);

  const current = signal(snapshot(value()));
  const saved = signal(current());
  const saving = signal(false);
  const failed = signal(false);
  const savedAt = signal<Date | null>(null);

  /** Saves the latest value if it differs from the last saved one. */
  const saveLatest = defer(() => {
    const latest = value();
    const key = snapshot(latest);
    if (key === saved()) {
      failed.set(false);
      return EMPTY;
    }
    saving.set(true);
    return save(latest).pipe(
      tap({
        complete: () => {
          saved.set(key);
          failed.set(false);
          savedAt.set(new Date());
        },
        error: () => failed.set(true),
      }),
      finalize(() => saving.set(false)),
    );
  });

  // Every save goes through this queue, one at a time.
  const queue = new Subject<Observable<unknown>>();
  queue
    .pipe(
      concatMap((job) => job.pipe(catchError(() => EMPTY))),
      takeUntilDestroyed(destroyRef),
    )
    .subscribe();

  changes
    .pipe(
      tap(() => current.set(snapshot(value()))),
      debounceTime(debounceMs),
      takeUntilDestroyed(destroyRef),
    )
    .subscribe(() => queue.next(saveLatest));

  return {
    status: computed(() => {
      if (saving()) return 'saving';
      if (failed()) return 'error';
      if (current() !== saved()) return 'unsaved';
      return savedAt() ? 'saved' : 'idle';
    }),
    savedAt: savedAt.asReadonly(),
    hasPendingChanges: computed(() => saving() || current() !== saved()),
    flush: () =>
      new Observable<void>((subscriber) => {
        queue.next(
          saveLatest.pipe(
            tap({
              complete: () => {
                subscriber.next();
                subscriber.complete();
              },
              error: (error: unknown) => subscriber.error(error),
            }),
          ),
        );
      }),
    reset: (v) => {
      const key = snapshot(v);
      current.set(key);
      saved.set(key);
      failed.set(false);
      savedAt.set(null);
    },
  };
}
