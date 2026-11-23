import { Route } from '@angular/router';
import { routes } from './app.routes';

const flatten = (rs: Route[]): Route[] => rs.flatMap((r) => [r, ...flatten(r.children ?? [])]);

describe('app routes', () => {
  const all = flatten(routes);

  it('lazy-loads every feature page', async () => {
    const pages = all.filter((r) => r.loadComponent);
    expect(pages.map((r) => r.path)).toEqual(['login', '', 'new', ':id/edit', ':id']);
    for (const page of pages) {
      expect(typeof (await page.loadComponent!())).toBe('function');
    }
  });

  it('declares "new" before ":id" so /applications/new is not read as an id', () => {
    const paths = all.map((r) => r.path);
    expect(paths.indexOf('new')).toBeLessThan(paths.indexOf(':id'));
  });

  it('redirects the root and unknown URLs to /applications', () => {
    expect(routes.find((r) => r.path === '')).toMatchObject({
      pathMatch: 'full',
      redirectTo: 'applications',
    });
    expect(routes.at(-1)).toMatchObject({ path: '**', redirectTo: 'applications' });
  });
});
