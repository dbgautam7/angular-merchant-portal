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
    expect(reviewer).toContain('Rita Reviewer · REVIEWER');
    expect(reviewer).not.toContain('New application');
  });

  it('logs out from the navbar', () => {
    const f = render({ id: 'u-admin', name: 'Ada Admin', role: 'ADMIN' });
    (f.nativeElement as HTMLElement).querySelector<HTMLButtonElement>('nav button')!.click();
    expect(logout).toHaveBeenCalledTimes(1);
  });
});
