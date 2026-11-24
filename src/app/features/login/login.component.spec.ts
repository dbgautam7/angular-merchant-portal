import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import { of, throwError } from 'rxjs';
import { AuthService } from '../../core/auth/auth.service';
import { DEMO_USERS } from '../../core/auth/demo-users';
import { User } from '../../core/models';
import { LoginComponent, safeReturnUrl } from './login.component';

describe('safeReturnUrl', () => {
  it.each([
    ['/applications/app-007', '/applications/app-007'],
    ['/applications?status=DRAFT', '/applications?status=DRAFT'],
    ['https://evil.example', '/applications'],
    ['//evil.example', '/applications'],
    ['/\\evil.example', '/applications'],
    ['javascript:alert(1)', '/applications'],
    [undefined, '/applications'],
  ])('%s -> %s', (input, expected) => {
    expect(safeReturnUrl(input)).toBe(expected);
  });
});

describe('LoginComponent', () => {
  const users: User[] = [
    { id: 'u-sales-1', name: 'Sam Sales', role: 'SALES' },
    { id: 'u-rev-1', name: 'Rita Reviewer', role: 'REVIEWER' },
    { id: 'u-admin', name: 'Ada Admin', role: 'ADMIN' },
  ];
  const login = vi.fn();
  let navigateByUrl: ReturnType<typeof vi.fn>;

  function render(returnUrl?: string): ComponentFixture<LoginComponent> {
    TestBed.configureTestingModule({
      imports: [LoginComponent],
      providers: [
        provideRouter([]),
        { provide: AuthService, useValue: { login } },
        { provide: DEMO_USERS, useValue: users },
      ],
    });
    navigateByUrl = vi.fn().mockResolvedValue(true);
    TestBed.inject(Router).navigateByUrl = navigateByUrl;
    const f = TestBed.createComponent(LoginComponent);
    if (returnUrl) f.componentRef.setInput('returnUrl', returnUrl);
    f.detectChanges();
    return f;
  }

  const buttons = (f: ComponentFixture<unknown>) =>
    Array.from((f.nativeElement as HTMLElement).querySelectorAll('button'));
  const clickUser = (f: ComponentFixture<unknown>, name: string) => {
    buttons(f)
      .find((b) => b.textContent?.includes(name))!
      .click();
    f.detectChanges();
  };

  beforeEach(() => login.mockReset());

  it('lists every provided demo user with their role', () => {
    const text = buttons(render()).map((b) => b.textContent?.replace(/\s+/g, ' ').trim());
    expect(text).toEqual(['Sam Sales SALES', 'Rita Reviewer REVIEWER', 'Ada Admin ADMIN']);
  });

  it('signs in and returns to the page the guard intercepted', () => {
    login.mockReturnValue(of({ id: 'u-rev-1', name: 'Rita Reviewer', role: 'REVIEWER' }));
    clickUser(render('/applications/app-007'), 'Rita Reviewer');
    expect(login).toHaveBeenCalledWith('u-rev-1');
    expect(navigateByUrl).toHaveBeenCalledWith('/applications/app-007');
  });

  it('ignores an external returnUrl', () => {
    login.mockReturnValue(of({ id: 'u-admin', name: 'Ada Admin', role: 'ADMIN' }));
    clickUser(render('https://evil.example'), 'Ada Admin');
    expect(navigateByUrl).toHaveBeenCalledWith('/applications');
  });

  it('shows an error and re-enables the buttons when sign-in fails', () => {
    login.mockReturnValue(throwError(() => new Error('offline')));
    const f = render();
    clickUser(f, 'Sam Sales');
    expect((f.nativeElement as HTMLElement).querySelector('[role="alert"]')?.textContent).toContain(
      'Sign-in failed',
    );
    expect(buttons(f).every((b) => !b.disabled)).toBe(true);
    expect(navigateByUrl).not.toHaveBeenCalled();
  });
});
