import { afterNextRender, ElementRef, inject, Injector } from '@angular/core';

/**
 * Returns `focus(selector)`, which focuses the first match inside this component once the next
 * render has finished, i.e. after the element exists. Used to move focus when content changes
 * (a new wizard step, the first invalid field, a confirmation), so keyboard and screen-reader
 * users are not left on an element that disappeared. Call it in an injection context.
 */
export function injectFocus(): (selector: string) => void {
  const host = inject<ElementRef<HTMLElement>>(ElementRef);
  const injector = inject(Injector);
  return (selector) =>
    afterNextRender(() => host.nativeElement.querySelector<HTMLElement>(selector)?.focus(), {
      injector,
    });
}
