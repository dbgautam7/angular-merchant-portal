import { Component, input } from '@angular/core';
import { RouterLink } from '@angular/router';

/** Placeholder: replaced by the sectioned detail view with review controls. */
@Component({
  selector: 'app-application-detail',
  imports: [RouterLink],
  template: `
    <a routerLink="/applications" class="d-inline-block mb-3">← Back to applications</a>
    <h1 class="h3">Application <code>{{ id() }}</code></h1>
    <p class="text-body-secondary">Placeholder: the detail and review view is not implemented yet.</p>
  `,
})
export class ApplicationDetailComponent {
  /** Bound from the route param via withComponentInputBinding. */
  readonly id = input.required<string>();
}
