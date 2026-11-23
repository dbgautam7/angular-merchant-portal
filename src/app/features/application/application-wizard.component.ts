import { Component, input } from '@angular/core';

/** Placeholder: replaced by the multi-step application wizard. */
@Component({
  selector: 'app-application-wizard',
  template: `
    <h1 class="h3">Merchant application</h1>
    @if (id(); as draftId) {
      <p>Editing draft <code>{{ draftId }}</code></p>
    } @else {
      <p>New application</p>
    }
    <p class="text-body-secondary">Placeholder: the multi-step form is not implemented yet.</p>
  `,
})
export class ApplicationWizardComponent {
  /** Bound from the route param via withComponentInputBinding (undefined on /new). */
  readonly id = input<string>();
}
