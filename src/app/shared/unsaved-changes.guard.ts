import { CanDeactivateFn, MaybeAsync } from '@angular/router';

/** A page that may need to save, or ask, before the user leaves it. */
export interface CanLeave {
  canLeave(): MaybeAsync<boolean>;
}

/**
 * Lets the page finish saving before the router leaves it. It is typed against the CanLeave
 * interface, not a concrete component, so the route table doesn't import (and eagerly bundle)
 * a lazy page.
 */
export const unsavedChangesGuard: CanDeactivateFn<CanLeave> = (page) => page.canLeave();
