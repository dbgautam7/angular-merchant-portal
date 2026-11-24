import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';

/**
 * Stroke icons on a 24×24 grid, drawn for this app. Rendered as inline SVG through Angular
 * bindings: no icon font to download, nothing for the CSP to allow, and no innerHTML.
 */
const ICONS = {
  alert: ['M22 12a10 10 0 1 1-20 0 10 10 0 0 1 20 0Z', 'M12 7.5v5.5', 'M12 16.5h.01'],
  arrowLeft: ['M19 12H5', 'm11 6-6 6 6 6'],
  arrowRight: ['M5 12h14', 'm13 6 6 6-6 6'],
  bank: ['M3 21h18', 'M5 18v-7', 'M10 18v-7', 'M14 18v-7', 'M19 18v-7', 'M12 3 3 8h18Z'],
  building: [
    'M5 21V5a2 2 0 0 1 2-2h7a2 2 0 0 1 2 2v16',
    'M16 9h2a2 2 0 0 1 2 2v10',
    'M3 21h18',
    'M9 7h3',
    'M9 11h3',
    'M9 15h3',
  ],
  card: [
    'M3 7a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2Z',
    'M3 10h18',
    'M7 15h4',
  ],
  check: ['M20 6 9 17l-5-5'],
  checkCircle: ['M22 12a10 10 0 1 1-20 0 10 10 0 0 1 20 0Z', 'm8 12 3 3 5-6'],
  chevronLeft: ['m15 18-6-6 6-6'],
  chevronRight: ['m9 18 6-6-6-6'],
  clock: ['M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z', 'M12 7v5l3 2'],
  eye: ['M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12Z', 'M15 12a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z'],
  eyeOff: [
    'M9.9 5.2A9.7 9.7 0 0 1 12 5c6.4 0 10 7 10 7a17 17 0 0 1-2.6 3.5',
    'M6.6 6.6C3.7 8.4 2 12 2 12s3.6 7 10 7c1.7 0 3.2-.5 4.5-1.2',
    'M9.9 9.9a3 3 0 0 0 4.2 4.2',
    'm3 3 18 18',
  ],
  file: [
    'M14 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9Z',
    'M14 3v6h6',
    'm9 15 2 2 4-4',
  ],
  inbox: ['M3 13h5l2 3h4l2-3h5', 'M6 5h12l3 8v5a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-5Z'],
  lock: [
    'M6 11h12a1 1 0 0 1 1 1v8a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1v-8a1 1 0 0 1 1-1Z',
    'M8 11V7a4 4 0 0 1 8 0v4',
  ],
  logOut: ['M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4', 'm16 17 5-5-5-5', 'M21 12H9'],
  menu: ['M4 6h16', 'M4 12h16', 'M4 18h16'],
  message: ['M21 12a8 8 0 0 1-11.6 7.1L3 21l1.9-5.4A8 8 0 1 1 21 12Z'],
  pencil: ['M4 20h4L19 9l-4-4L4 16Z', 'm13.5 6.5 4 4'],
  plus: ['M12 5v14', 'M5 12h14'],
  refresh: ['M20 12a8 8 0 1 1-2.3-5.7', 'M20 4v5h-5'],
  search: ['M18 11a7 7 0 1 1-14 0 7 7 0 0 1 14 0Z', 'm20 20-4-4'],
  send: ['M22 2 11 13', 'M22 2 15 22l-4-9-9-4Z'],
  shield: ['M12 3 4 6v6c0 5 3.4 8 8 9 4.6-1 8-4 8-9V6Z', 'm9 12 2 2 4-4'],
  user: ['M16 7a4 4 0 1 1-8 0 4 4 0 0 1 8 0Z', 'M4 21a8 8 0 0 1 16 0'],
  userPlus: [
    'M14 7a4 4 0 1 1-8 0 4 4 0 0 1 8 0Z',
    'M2 21a8 8 0 0 1 14-5.3',
    'M19 14v6',
    'M16 17h6',
  ],
  x: ['M18 6 6 18', 'm6 6 12 12'],
  xCircle: ['M22 12a10 10 0 1 1-20 0 10 10 0 0 1 20 0Z', 'm15 9-6 6', 'm9 9 6 6'],
} satisfies Record<string, string[]>;

export type IconName = keyof typeof ICONS;

/** `<app-icon name="search" />`: decorative, so hidden from screen readers; label the control instead. */
@Component({
  selector: 'app-icon',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'd-inline-flex' },
  template: `
    <svg
      class="icon"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      [attr.stroke-width]="strokeWidth()"
      stroke-linecap="round"
      stroke-linejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      @for (d of paths(); track $index) {
        <path [attr.d]="d" />
      }
    </svg>
  `,
})
export class IconComponent {
  readonly name = input.required<IconName>();
  readonly strokeWidth = input(2);

  protected readonly paths = computed(() => ICONS[this.name()]);
}
