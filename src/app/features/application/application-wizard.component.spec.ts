import { Location } from '@angular/common';
import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter, Routes, withComponentInputBinding } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { of, throwError } from 'rxjs';
import { wizardMatcher } from '../../app.routes';
import { ApplicationApi } from '../../core/api/application.api';
import { emptyForm, seed } from '../../core/mock/mock-db';
import { ApplicationForm } from '../../core/models';
import { unsavedChangesGuard } from '../../shared/unsaved-changes.guard';
import { ApplicationWizardComponent, AUTO_SAVE_DEBOUNCE_MS } from './application-wizard.component';

@Component({ template: 'Page' })
class StubPage {}

const routes: Routes = [
  {
    path: 'applications',
    children: [
      { path: '', component: StubPage },
      {
        matcher: wizardMatcher,
        component: ApplicationWizardComponent,
        canDeactivate: [unsavedChangesGuard],
      },
      { path: ':id', component: StubPage },
    ],
  },
];

/** Fictional seed data: app-005 is a complete, valid draft; app-001 is already submitted. */
const ROWS = seed();
const DRAFT = ROWS.find((a) => a.id === 'app-005')!;

describe('ApplicationWizardComponent', () => {
  let harness: RouterTestingHarness;
  let api: {
    get: ReturnType<typeof vi.fn>;
    createDraft: ReturnType<typeof vi.fn>;
    saveDraft: ReturnType<typeof vi.fn>;
    submit: ReturnType<typeof vi.fn>;
  };

  async function open(url: string): Promise<void> {
    TestBed.configureTestingModule({
      providers: [
        provideRouter(routes, withComponentInputBinding()),
        { provide: ApplicationApi, useValue: api },
      ],
    });
    harness = await RouterTestingHarness.create();
    await harness.navigateByUrl(url);
    await settle();
  }

  async function settle(): Promise<void> {
    harness.detectChanges();
    await harness.fixture.whenStable();
    harness.detectChanges();
  }

  /** Lets the auto-save debounce elapse. */
  async function pause(): Promise<void> {
    await vi.advanceTimersByTimeAsync(AUTO_SAVE_DEBOUNCE_MS);
    await settle();
  }

  const el = () => harness.routeNativeElement as HTMLElement;
  const text = () => el().textContent?.replace(/\s+/g, ' ') ?? '';
  const heading = () => el().querySelector('#step-heading')?.textContent?.trim();
  const saveStatus = () => el().querySelector('p[role="status"]')?.textContent?.trim();
  const path = () => TestBed.inject(Location).path();
  const button = (label: string) =>
    Array.from(el().querySelectorAll('button')).find((b) =>
      b.textContent?.trim().startsWith(label),
    )!;
  const field = (label: string) => {
    const match = Array.from(el().querySelectorAll('label')).find(
      (l) => l.textContent?.replace('*', '').trim() === label,
    )!;
    return el().querySelector<HTMLInputElement | HTMLSelectElement>(`#${match.htmlFor}`)!;
  };
  const fill = (label: string, value: string) => {
    const control = field(label);
    control.value = value;
    control.dispatchEvent(new Event(control instanceof HTMLSelectElement ? 'change' : 'input'));
    control.dispatchEvent(new Event('blur'));
  };
  const fillBusiness = () => {
    fill('Legal name', 'Acme Demo Ltd');
    fill('Registration number', 'REG-123456');
    fill('Category', 'RETAIL');
  };

  beforeEach(() => {
    // Fake timers keep the auto-save debounce pending until a test calls pause(). With real
    // timers, the zone would see the debounce timer and whenStable() would wait it out.
    // shouldAdvanceTime lets Angular's own short timers (render scheduling) still run.
    vi.useFakeTimers({ shouldAdvanceTime: true });
    api = {
      get: vi.fn((id: string) => of(structuredClone(ROWS.find((a) => a.id === id)!))),
      createDraft: vi.fn(() => of({ ...DRAFT, ...emptyForm(), id: 'app-new' })),
      saveDraft: vi.fn((id: string, form: ApplicationForm) => of({ ...DRAFT, ...form, id })),
      submit: vi.fn((id: string) => of({ ...DRAFT, id, status: 'SUBMITTED' })),
    };
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('keeps Next on an invalid step, shows the errors and focuses the first one', async () => {
    await open('/applications/new');
    expect(heading()).toBe('Business details');
    expect(api.get).not.toHaveBeenCalled();

    button('Next').click();
    await settle();
    expect(heading()).toBe('Business details');
    expect(el().querySelectorAll('.invalid-feedback')).toHaveLength(3); // website is optional
    expect(document.activeElement).toBe(field('Legal name'));
  });

  it('treats Enter on a data step as Next, never as submit, and focuses the new step', async () => {
    await open('/applications/new');
    fillBusiness();
    el().querySelector('form')!.dispatchEvent(new Event('submit'));
    await settle();

    expect(heading()).toBe('Owner details');
    expect(document.activeElement).toBe(el().querySelector('#step-heading'));
    expect(api.submit).not.toHaveBeenCalled();
  });

  it('jumps ahead only through valid steps', async () => {
    await open('/applications/new');
    button('3. Banking').click();
    await settle();
    expect(heading()).toBe('Business details');

    fillBusiness();
    button('3. Banking').click();
    await settle();
    expect(heading()).toBe('Owner details'); // stops at the next invalid step
    expect(text()).toContain('1. Business ✓');
  });

  it('creates the draft on the first auto-save, then saves into it', async () => {
    await open('/applications/new');
    const wizard = harness.routeDebugElement!.componentInstance;
    fill('Legal name', 'Acme');
    await settle();
    expect(saveStatus()).toBe('Unsaved changes');
    expect(api.createDraft).not.toHaveBeenCalled();

    await pause();
    expect(api.createDraft).toHaveBeenCalledTimes(1);
    expect(api.saveDraft).toHaveBeenLastCalledWith(
      'app-new',
      expect.objectContaining({ business: expect.objectContaining({ legalName: 'Acme' }) }),
    );
    expect(path()).toBe('/applications/app-new/edit'); // a reload reopens this draft
    expect(harness.routeDebugElement!.componentInstance).toBe(wizard); // still mounted
    expect(api.get).not.toHaveBeenCalled(); // and not reloaded
    expect(saveStatus()).toMatch(/^Draft saved at /);

    fill('Legal name', 'Acme Demo');
    await pause();
    expect(api.createDraft).toHaveBeenCalledTimes(1);
    expect(api.saveDraft).toHaveBeenCalledTimes(2);

    // "New application" from here opens a blank form, not the draft just created.
    await harness.navigateByUrl('/applications/new');
    await settle();
    expect(path()).toBe('/applications/new');
    expect(field('Legal name').value).toBe('');
    expect(el().querySelector('h1')?.textContent?.trim()).toBe('New application');
  });

  it('loads an existing draft into the form without saving it again', async () => {
    await open('/applications/app-005/edit');
    expect(api.get).toHaveBeenCalledWith('app-005');
    expect(field('Legal name').value).toBe(DRAFT.business.legalName);

    await pause();
    expect(api.saveDraft).not.toHaveBeenCalled();
    expect(saveStatus()).toBe('');
  });

  it('opens a submitted application read-only and reports load errors', async () => {
    await open('/applications/app-001/edit');
    expect(path()).toBe('/applications/app-001');

    api.get.mockReturnValueOnce(throwError(() => new Error('404')));
    await harness.navigateByUrl('/applications/app-999/edit');
    await settle();
    expect(el().querySelector('[role="alert"]')?.textContent).toContain(
      'Could not load this draft',
    );
  });

  it('masks the tax ID and account number on the review step', async () => {
    await open('/applications/app-005/edit');
    button('4. Review').click();
    await settle();

    expect(heading()).toBe('Review and submit');
    expect(text()).toContain('••••••••0005'); // TAX900000005
    expect(text()).toContain('••••••••2005'); // 000011112005
    expect(text()).not.toContain(DRAFT.owner.taxId);
    expect(text()).not.toContain(DRAFT.banking.accountNumber);
  });

  it('saves the latest changes before submitting, then opens the submitted application', async () => {
    await open('/applications/app-005/edit');
    fill('Legal name', 'Renamed Demo Ltd');
    button('4. Review').click();
    await settle();
    button('Submit application').click(); // before the auto-save debounce has elapsed
    await settle();

    expect(api.saveDraft).toHaveBeenCalledTimes(1);
    expect(api.saveDraft.mock.calls[0][1].business.legalName).toBe('Renamed Demo Ltd');
    expect(api.submit).toHaveBeenCalledWith('app-005');
    expect(api.saveDraft.mock.invocationCallOrder[0]).toBeLessThan(
      api.submit.mock.invocationCallOrder[0],
    );
    expect(path()).toBe('/applications/app-005');
  });

  it('keeps the answers and shows an error when submitting fails', async () => {
    api.submit.mockReturnValueOnce(throwError(() => new Error('500')));
    await open('/applications/app-005/edit');
    button('4. Review').click();
    await settle();
    button('Submit application').click();
    await settle();

    expect(el().querySelector('[role="alert"]')?.textContent).toContain('Could not submit');
    expect(button('Submit application').disabled).toBe(false);
    expect(path()).toBe('/applications/app-005/edit');
  });

  it('shows a failed auto-save with Retry', async () => {
    api.saveDraft.mockReturnValueOnce(throwError(() => new Error('offline')));
    await open('/applications/app-005/edit');
    fill('Legal name', 'Renamed Demo Ltd');
    await pause();
    expect(saveStatus()).toContain('Draft not saved.');

    button('Retry').click();
    await settle();
    expect(api.saveDraft).toHaveBeenCalledTimes(2);
    expect(saveStatus()).toMatch(/^Draft saved at /);
  });

  it('saves pending changes before leaving, and asks when that save fails', async () => {
    await open('/applications/app-005/edit');
    fill('Legal name', 'Renamed Demo Ltd');
    const unload = new Event('beforeunload', { cancelable: true });
    window.dispatchEvent(unload);
    expect(unload.defaultPrevented).toBe(true); // the browser asks before closing the tab

    await harness.navigateByUrl('/applications');
    expect(api.saveDraft).toHaveBeenCalledTimes(1);
    expect(path()).toBe('/applications');

    await harness.navigateByUrl('/applications/app-005/edit');
    await settle();
    api.saveDraft.mockReturnValueOnce(throwError(() => new Error('offline')));
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false);
    fill('Legal name', 'Another Demo Ltd');
    await harness.navigateByUrl('/applications');
    expect(confirm).toHaveBeenCalled();
    expect(path()).toBe('/applications/app-005/edit');
  });
});
