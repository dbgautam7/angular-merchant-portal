import { test as base, expect, type Page } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { extname, join } from 'node:path';

const DIST = join(__dirname, '..', 'dist', 'merchant-portal', 'browser');
const TYPES: Record<string, string> = {
  '.html': 'text/html',
  '.js': 'text/javascript',
  '.css': 'text/css',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
};

/**
 * `page`, but:
 * - unless E2E_BASE_URL is set, every request to http://portal.test is answered from dist/
 *   (with the SPA fallback to index.html), so no server is needed;
 * - the test fails on any console error, uncaught exception or CSP violation, and on any
 *   request to another origin: the app must work inside its own Content Security Policy.
 *
 * The mock backend lives in the page, so a full page load (page.goto) starts from fresh seed
 * data and signs everyone out. Within a test, move around through the app itself.
 */
export const test = base.extend({
  page: async ({ page, baseURL }, use) => {
    const problems: string[] = [];
    const origin = new URL(baseURL!).origin;

    if (!process.env['E2E_BASE_URL']) {
      await page.route(`${origin}/**`, async (route) => {
        const path = new URL(route.request().url()).pathname;
        const file = extname(path) ? path : '/index.html';
        try {
          const body = await readFile(join(DIST, file));
          const contentType = TYPES[extname(file)] ?? 'application/octet-stream';
          await route.fulfill({ body, contentType });
        } catch {
          await route.fulfill({ status: 404, body: '' });
        }
      });
    }
    page.on('request', (request) => {
      const url = new URL(request.url());
      if (url.protocol !== 'data:' && url.origin !== origin) {
        problems.push(`request to another origin: ${url.origin}`);
      }
    });
    page.on('console', (message) => {
      if (message.type() === 'error') problems.push(`console: ${message.text()}`);
    });
    page.on('pageerror', (error) => problems.push(`exception: ${error.message}`));
    await page.addInitScript(() =>
      document.addEventListener('securitypolicyviolation', (event) =>
        console.error(`CSP violation: ${event.violatedDirective} ${event.blockedURI}`),
      ),
    );

    await use(page);

    expect(problems, 'console errors, CSP violations or requests to other origins').toEqual([]);
  },
});

export { expect };

/** Picks a fictional demo user on the sign-in page (which must be showing). */
export async function signInAs(page: Page, name: string): Promise<void> {
  await page.getByRole('button', { name: new RegExp(`^${name}`) }).click();
}

/** Opens the app from scratch (fresh demo data) and signs in. */
export async function openAs(page: Page, name: string): Promise<void> {
  await page.goto('/');
  await signInAs(page, name);
  await expect(page.getByRole('heading', { level: 1, name: 'Applications' })).toBeVisible();
}

/** Signs out through the navbar, keeping the in-page demo data. */
export async function signOut(page: Page): Promise<void> {
  const menu = page.getByRole('button', { name: 'Menu' });
  if (await menu.isVisible()) await menu.click();
  await page.getByRole('button', { name: 'Log out' }).click();
  await expect(page.getByRole('heading', { name: 'Sign in' })).toBeVisible();
}

/** Opens an application from the dashboard by its merchant name. */
export async function openApplication(page: Page, merchant: string): Promise<void> {
  await page.getByLabel('Search by merchant name or ID').fill(merchant);
  await page.getByRole('link', { name: merchant, exact: true }).click();
  await expect(page.getByRole('heading', { level: 1, name: merchant })).toBeVisible();
}
