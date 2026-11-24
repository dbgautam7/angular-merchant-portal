import { signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { App } from './app';
import { AuthService } from './core/auth/auth.service';
import { Role, User } from './core/models';

describe('App shell (role-aware navigation)', () => {
  const logout = vi.fn();

  function render(user: User | null): ComponentFixture<App> {
    const current = signal(user);
    TestBed.configureTestingModule({
      imports: [App],
      providers: [
        provideRouter([]),
        {
          provide: AuthService,
          useValue: {
            user: current,
            hasRole: (...roles: Role[]) => !!current() && roles.includes(current()!.role),
            logout,
          },
        },
      ],
    });
    const f = TestBed.createComponent(App);
    f.detectChanges();
    return f;
  }

  const nav = (f: ComponentFixture<App>) =>
    (f.nativeElement as HTMLElement).querySelector('nav')!.textContent ?? '';

  it('shows no navigation or logout while signed out', () => {
    const text = nav(render(null));
    expect(text).not.toContain('Applications');
    expect(text).not.toContain('Log out');
  });

  it('offers "New application" to SALES only', () => {
    expect(nav(render({ id: 'u-sales-1', name: 'Sam Sales', role: 'SALES' }))).toContain(
      'New application',
    );
    TestBed.resetTestingModule();
    const reviewer = nav(render({ id: 'u-rev-1', name: 'Rita Reviewer', role: 'REVIEWER' }));
    expect(reviewer).toContain('Applications');
    expect(reviewer).toContain('Rita Reviewer');
    expect(reviewer).toContain('Risk reviewer');
    expect(reviewer).not.toContain('New application');
  });

  const button = (f: ComponentFixture<App>, label: string) =>
    Array.from((f.nativeElement as HTMLElement).querySelectorAll('button')).find(
      (b) => b.textContent?.trim() === label,
    )!;

  it('logs out from the navbar', () => {
    const f = render({ id: 'u-admin', name: 'Ada Admin', role: 'ADMIN' });
    button(f, 'Log out').click();
    expect(logout).toHaveBeenCalledTimes(1);
  });

  it('opens and closes the phone menu, announcing its state', () => {
    const f = render({ id: 'u-admin', name: 'Ada Admin', role: 'ADMIN' });
    const toggle = button(f, 'Menu');
    const menu = (f.nativeElement as HTMLElement).querySelector('#main-menu')!;
    expect(toggle.getAttribute('aria-controls')).toBe('main-menu');
    expect(toggle.getAttribute('aria-expanded')).toBe('false');

    toggle.click();
    f.detectChanges();
    expect(toggle.getAttribute('aria-expanded')).toBe('true');
    expect(menu.classList).toContain('show');

    toggle.click();
    f.detectChanges();
    expect(menu.classList).not.toContain('show');
  });

  it('skip link moves focus to the main content without leaving the page', () => {
    const f = render(null);
    const link = (f.nativeElement as HTMLElement).querySelector<HTMLAnchorElement>('.skip-link')!;
    const click = new MouseEvent('click', { cancelable: true });
    link.dispatchEvent(click);
    expect(click.defaultPrevented).toBe(true); // href="#main" would resolve to "/#main"
    expect(document.activeElement?.id).toBe('main');
  });
});
