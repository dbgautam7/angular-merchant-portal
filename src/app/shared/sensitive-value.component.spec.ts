import { HttpErrorResponse } from '@angular/common/http';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { of, throwError } from 'rxjs';
import { ApplicationApi } from '../core/api/application.api';
import { REVEAL_MS, SensitiveValueComponent } from './sensitive-value.component';

describe('SensitiveValueComponent', () => {
  let fixture: ComponentFixture<SensitiveValueComponent>;
  let reveal: ReturnType<typeof vi.fn>;

  async function render(inputs: { value: string; canReveal?: boolean }): Promise<void> {
    TestBed.configureTestingModule({
      providers: [{ provide: ApplicationApi, useValue: { reveal } }],
    });
    fixture = TestBed.createComponent(SensitiveValueComponent);
    fixture.componentRef.setInput('appId', 'app-001');
    fixture.componentRef.setInput('field', 'taxId');
    fixture.componentRef.setInput('label', 'tax ID');
    fixture.componentRef.setInput('value', inputs.value);
    fixture.componentRef.setInput('canReveal', inputs.canReveal ?? false);
    await settle();
  }

  async function settle(): Promise<void> {
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
  }

  const el = () => fixture.nativeElement as HTMLElement;
  const shown = () => el().querySelector('.font-monospace')?.textContent?.trim();
  const button = () => el().querySelector('button');

  beforeEach(() => {
    // A revealed value starts a 30 s timer. With real timers the zone would see it and
    // whenStable() would wait it out; shouldAdvanceTime keeps Angular's own short timers running.
    vi.useFakeTimers({ shouldAdvanceTime: true });
    reveal = vi.fn(() => of({ value: 'TAX900000001' }));
  });

  afterEach(() => vi.useRealTimers());

  it('always shows the value masked, even when the API sent it in full', async () => {
    await render({ value: 'TAX900000001' });
    expect(shown()).toBe('••••••••0001');
    expect(el().textContent).not.toContain('TAX900000001');
    // Screen readers hear "Hidden, ends in 0001" rather than eight "bullet"s.
    expect(el().querySelector('[aria-hidden="true"]')?.textContent?.trim()).toBe('••••••••0001');
    expect(el().querySelector('.visually-hidden')?.textContent).toBe('Hidden, ends in 0001');
  });

  it('offers no Reveal button unless the page allows it', async () => {
    await render({ value: '••••••••0001' });
    expect(button()).toBeNull();
  });

  it('reveals the value from the server, then hides it again', async () => {
    await render({ value: '••••••••0001', canReveal: true });
    expect(button()?.textContent?.replace(/\s+/g, ' ').trim()).toBe('Reveal tax ID');

    button()!.click();
    await settle();
    expect(reveal).toHaveBeenCalledWith('app-001', 'taxId');
    expect(shown()).toBe('TAX900000001');

    button()!.click(); // Hide
    await settle();
    expect(shown()).toBe('••••••••0001');
    expect(reveal).toHaveBeenCalledTimes(1);
  });

  it('hides the revealed value automatically after 30 seconds', async () => {
    await render({ value: '••••••••0001', canReveal: true });
    button()!.click();
    await settle();
    expect(shown()).toBe('TAX900000001');

    await vi.advanceTimersByTimeAsync(REVEAL_MS - 1);
    await settle();
    expect(shown()).toBe('TAX900000001');
    await vi.advanceTimersByTimeAsync(1);
    await settle();
    expect(shown()).toBe('••••••••0001');
  });

  it('explains a refusal from the server and keeps the value masked', async () => {
    reveal.mockReturnValueOnce(throwError(() => new HttpErrorResponse({ status: 403 })));
    await render({ value: '••••••••0001', canReveal: true });
    button()!.click();
    await settle();
    expect(el().querySelector('[role="alert"]')?.textContent).toContain('not allowed');
    expect(shown()).toBe('••••••••0001');
  });
});
