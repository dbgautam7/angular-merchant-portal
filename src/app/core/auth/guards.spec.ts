import { TestBed } from '@angular/core/testing';
import {
  ActivatedRouteSnapshot,
  CanActivateFn,
  Router,
  RouterStateSnapshot,
  UrlTree,
} from '@angular/router';
import { Role } from '../models';
import { AuthService } from './auth.service';
import { authGuard, roleGuard } from './guards';

describe('route guards', () => {
  let role: Role | null;
  const run = (guard: CanActivateFn, url = '/applications') =>
    TestBed.runInInjectionContext(() =>
      guard({} as ActivatedRouteSnapshot, { url } as RouterStateSnapshot),
    );
  const serialize = (tree: unknown) => TestBed.inject(Router).serializeUrl(tree as UrlTree);

  beforeEach(() => {
    role = null;
    TestBed.configureTestingModule({
      providers: [
        {
          provide: AuthService,
          useValue: {
            isLoggedIn: () => role !== null,
            hasRole: (...r: Role[]) => role !== null && r.includes(role),
          },
        },
      ],
    });
  });

  it('authGuard sends anonymous users to /login and remembers the requested URL', () => {
    expect(serialize(run(authGuard, '/applications/app-007'))).toBe(
      '/login?returnUrl=%2Fapplications%2Fapp-007',
    );
  });

  it('authGuard allows signed-in users', () => {
    role = 'ADMIN';
    expect(run(authGuard)).toBe(true);
  });

  it('roleGuard sends other roles back to the dashboard', () => {
    role = 'REVIEWER';
    expect(serialize(run(roleGuard('SALES')))).toBe('/applications');
  });

  it('roleGuard allows any of the listed roles', () => {
    role = 'ADMIN';
    expect(run(roleGuard('SALES', 'ADMIN'))).toBe(true);
  });
});
