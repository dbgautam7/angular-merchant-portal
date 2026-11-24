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

const BADGE_CLASSES: Record<ApplicationStatus, string> = {
  DRAFT: 'text-bg-secondary',
  SUBMITTED: 'text-bg-info',
  IN_REVIEW: 'text-bg-warning',
  APPROVED: 'text-bg-success',
  REJECTED: 'text-bg-danger',
};

@Component({
  selector: 'app-status-badge',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `<span class="badge" [class]="badgeClass()">{{ label() }}</span>`,
})
export class StatusBadgeComponent {
  readonly status = input.required<ApplicationStatus>();

  protected readonly label = computed(() => STATUS_LABELS[this.status()]);
  protected readonly badgeClass = computed(() => BADGE_CLASSES[this.status()]);
}
