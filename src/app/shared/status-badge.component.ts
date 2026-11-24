import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { ApplicationStatus } from '../core/models';

/** Display label per status. A Record keeps it exhaustive: a new status will not compile without one. */
export const STATUS_LABELS: Record<ApplicationStatus, string> = {
  DRAFT: 'Draft',
  SUBMITTED: 'Submitted',
  IN_REVIEW: 'In review',
  APPROVED: 'Approved',
  REJECTED: 'Rejected',
};

/** Soft "subtle" colours: readable in light and dark mode, and calmer than solid badges in a table. */
const TONES: Record<ApplicationStatus, string> = {
  DRAFT: 'secondary',
  SUBMITTED: 'info',
  IN_REVIEW: 'warning',
  APPROVED: 'success',
  REJECTED: 'danger',
};

@Component({
  selector: 'app-status-badge',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `<span class="badge status-badge" [class]="badgeClass()">{{ label() }}</span>`,
})
export class StatusBadgeComponent {
  readonly status = input.required<ApplicationStatus>();

  protected readonly label = computed(() => STATUS_LABELS[this.status()]);
  protected readonly badgeClass = computed(() => {
    const tone = TONES[this.status()];
    return `text-${tone}-emphasis bg-${tone}-subtle border-${tone}-subtle`;
  });
}
