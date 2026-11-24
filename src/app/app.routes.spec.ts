import { Route, UrlSegment } from '@angular/router';
import { routes, wizardMatcher } from './app.routes';
import { unsavedChangesGuard } from './shared/unsaved-changes.guard';

const flatten = (rs: Route[]): Route[] => rs.flatMap((r) => [r, ...flatten(r.children ?? [])]);
const match = (url: string) =>
  wizardMatcher(
    url.split('/').map((path) => new UrlSegment(path, {})),
    null!,
    null!,
  );

describe('app routes', () => {
  const all = flatten(routes);
  const wizard = all.find((r) => r.matcher === wizardMatcher)!;

  it('lazy-loads every feature page', async () => {
    const pages = all.filter((r) => r.loadComponent);
    expect(pages.map((r) => r.path ?? 'wizard')).toEqual(['login', '', 'wizard', ':id']);
    for (const page of pages) {
      expect(typeof (await page.loadComponent!())).toBe('function');
    }
  });

  it('serves "new" and ":id/edit" from one wizard route, declared before ":id"', () => {
    expect(match('new')).toMatchObject({ consumed: [{ path: 'new' }] });
    expect(match('new')?.posParams).toBeUndefined();
    expect(match('app-001/edit')?.posParams?.['id'].path).toBe('app-001');
    expect(match('app-001')).toBeNull();
    expect(match('app-001/edit/more')).toBeNull();
    expect(all.indexOf(wizard)).toBeLessThan(all.findIndex((r) => r.path === ':id'));
    expect(wizard.canActivate).toHaveLength(1); // roleGuard('SALES')
    expect(wizard.canDeactivate).toEqual([unsavedChangesGuard]);
  });

  it('gives every page a title for the browser tab', () => {
    const pages = all.filter((r) => r.loadComponent);
    expect(pages.map((r) => r.title)).toEqual([
      'Sign in',
      'Applications',
      'Application form',
      'Application details',
    ]);
  });

  it('redirects the root and unknown URLs to /applications', () => {
    expect(routes.find((r) => r.path === '')).toMatchObject({
      pathMatch: 'full',
      redirectTo: 'applications',
    });
    expect(routes.at(-1)).toMatchObject({ path: '**', redirectTo: 'applications' });
  });
});
