import { ChangeDetectionStrategy, Component } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { FieldControlDirective, FormFieldComponent } from './form-field';

@Component({
  imports: [ReactiveFormsModule, FormFieldComponent, FieldControlDirective],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <form [formGroup]="form">
      <app-form-field label="Legal name" hint="As registered">
        <input appFieldControl formControlName="name" />
      </app-form-field>
      <app-form-field label="Website">
        <input appFieldControl formControlName="website" />
      </app-form-field>
    </form>
  `,
})
class HostComponent {
  readonly form = new FormGroup({
    name: new FormControl('', [Validators.required, Validators.minLength(3)]),
    website: new FormControl(''),
  });
}

describe('FormFieldComponent', () => {
  let fixture: ComponentFixture<HostComponent>;
  let input: HTMLInputElement;

  const el = () => fixture.nativeElement as HTMLElement;
  const describedText = () =>
    (input.getAttribute('aria-describedby') ?? '')
      .split(' ')
      .map((id) => el().querySelector(`#${id}`)?.textContent?.trim())
      .join(' | ');

  /** Explicit change detection: it still skips an OnPush view that nothing marked dirty. */
  async function render(): Promise<void> {
    fixture.detectChanges();
    await fixture.whenStable();
  }

  beforeEach(async () => {
    fixture = TestBed.createComponent(HostComponent);
    await render();
    input = el().querySelector('input')!;
  });

  it('links the label to the control and marks required fields', () => {
    const label = el().querySelector('label')!;
    expect(label.htmlFor).toBe(input.id);
    expect(label.textContent).toContain('*');
    expect(input.getAttribute('aria-required')).toBe('true');

    const website = el().querySelectorAll('input')[1];
    expect(website.hasAttribute('aria-required')).toBe(false);
    expect(el().querySelectorAll('label')[1].textContent).not.toContain('*');
  });

  it('shows no error before the field is touched, only the hint', () => {
    expect(el().querySelector('.invalid-feedback')).toBeNull();
    expect(input.getAttribute('aria-invalid')).toBe('false');
    expect(describedText()).toBe('As registered');
  });

  it('shows the message on blur and links it with aria-describedby', async () => {
    input.dispatchEvent(new Event('blur'));
    await render();

    expect(input.classList).toContain('is-invalid');
    expect(input.getAttribute('aria-invalid')).toBe('true');
    expect(describedText()).toBe('As registered | This field is required.');
  });

  it('updates under OnPush when the change comes from code, not from the DOM', async () => {
    fixture.componentInstance.form.markAllAsTouched();
    await render();
    expect(describedText()).toContain('This field is required.');

    fixture.componentInstance.form.controls.name.setValue('Ac');
    await render();
    expect(describedText()).toContain('Enter at least 3 characters.');

    fixture.componentInstance.form.controls.name.setValue('Acme');
    await render();
    expect(el().querySelector('.invalid-feedback')).toBeNull();
    expect(input.classList).not.toContain('is-invalid');
  });
});
