import { TestBed } from '@angular/core/testing';
import { Observable, of, Subject, throwError } from 'rxjs';
import type { Mock } from 'vitest';
import { autoSave } from './auto-save';

describe('autoSave', () => {
  const DEBOUNCE = 500;
  let value: { name: string };
  let changes: Subject<void>;
  let save: Mock<(v: { name: string }) => Observable<unknown>>;

  const create = () =>
    TestBed.runInInjectionContext(() =>
      autoSave({ changes, value: () => value, save, debounceMs: DEBOUNCE }),
    );
  const type = (name: string) => {
    value = { name };
    changes.next();
  };

  beforeEach(() => {
    vi.useFakeTimers();
    value = { name: '' };
    changes = new Subject();
    save = vi.fn(() => of(true));
  });

  afterEach(() => vi.useRealTimers());

  it('debounces typing into one save of the latest value', () => {
    const draft = create();
    expect(draft.status()).toBe('idle');

    type('A');
    type('Ac');
    type('Acme');
    expect(draft.status()).toBe('unsaved');
    vi.advanceTimersByTime(DEBOUNCE - 1);
    expect(save).not.toHaveBeenCalled();

    vi.advanceTimersByTime(1);
    expect(save).toHaveBeenCalledExactlyOnceWith({ name: 'Acme' });
    expect(draft.status()).toBe('saved');
    expect(draft.savedAt()).toBeInstanceOf(Date);
  });

  it('skips the request when nothing changed since the last save', () => {
    const draft = create();
    type('Acme');
    type(''); // typed, then undid
    vi.advanceTimersByTime(DEBOUNCE);
    expect(save).not.toHaveBeenCalled();
    expect(draft.status()).toBe('idle');

    type('Acme');
    vi.advanceTimersByTime(DEBOUNCE);
    type('Acme');
    vi.advanceTimersByTime(DEBOUNCE);
    expect(save).toHaveBeenCalledTimes(1);
  });

  it('runs one save at a time and sends the newest value when its turn comes', () => {
    const first = new Subject<unknown>();
    save.mockReturnValueOnce(first);
    const draft = create();

    type('A');
    vi.advanceTimersByTime(DEBOUNCE);
    type('B');
    vi.advanceTimersByTime(DEBOUNCE);
    type('C');
    vi.advanceTimersByTime(DEBOUNCE);
    expect(save).toHaveBeenCalledTimes(1); // B and C wait for A
    expect(draft.status()).toBe('saving');

    first.next(true);
    first.complete();
    // The queued save reads the value when it starts: C, never the stale B.
    expect(save.mock.calls.map(([v]) => v.name)).toEqual(['A', 'C']);
    expect(draft.status()).toBe('saved');
  });

  it('reports a failure, keeps the value and retries on flush()', () => {
    save.mockReturnValueOnce(throwError(() => new Error('offline')));
    const draft = create();
    type('Acme');
    vi.advanceTimersByTime(DEBOUNCE);
    expect(draft.status()).toBe('error');
    expect(draft.hasPendingChanges()).toBe(true);

    const done = vi.fn();
    draft.flush().subscribe(done);
    expect(save).toHaveBeenCalledTimes(2);
    expect(save).toHaveBeenLastCalledWith({ name: 'Acme' });
    expect(done).toHaveBeenCalled();
    expect(draft.status()).toBe('saved');
    expect(draft.hasPendingChanges()).toBe(false);
  });

  it('flush() saves without waiting for the debounce, after the save already running', () => {
    const running = new Subject<unknown>();
    save.mockReturnValueOnce(running);
    const draft = create();
    type('A');
    vi.advanceTimersByTime(DEBOUNCE);
    type('AB'); // not debounced yet

    const done = vi.fn();
    draft.flush().subscribe(done);
    expect(save).toHaveBeenCalledTimes(1);
    expect(done).not.toHaveBeenCalled();

    running.next(true);
    running.complete();
    expect(save).toHaveBeenLastCalledWith({ name: 'AB' });
    expect(done).toHaveBeenCalledTimes(1);
  });

  it('flush() errors when the save fails, and completes at once when nothing changed', () => {
    const draft = create();
    const done = vi.fn();
    draft.flush().subscribe(done);
    expect(done).toHaveBeenCalled();
    expect(save).not.toHaveBeenCalled();

    save.mockReturnValueOnce(throwError(() => new Error('offline')));
    type('Acme');
    const failed = vi.fn();
    draft.flush().subscribe({ error: failed });
    expect(failed).toHaveBeenCalled();
  });

  it('reset() marks a loaded value as saved, so loading never triggers a save', () => {
    const draft = create();
    value = { name: 'Loaded' };
    draft.reset(value);
    changes.next();
    vi.advanceTimersByTime(DEBOUNCE);
    expect(save).not.toHaveBeenCalled();
    expect(draft.hasPendingChanges()).toBe(false);
  });
});
