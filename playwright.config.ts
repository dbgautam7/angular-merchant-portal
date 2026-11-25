import { defineConfig, devices } from '@playwright/test';

/**
 * End-to-end tests (`npm run e2e`). They run the production build from dist/, served by
 * Playwright's request routing (e2e/fixtures.ts), so no web server is needed and the tests
 * exercise exactly the bundle that ships, CSP included. Set E2E_BASE_URL to test a running
 * deployment instead.
 *
 * Browsers: `npx playwright install chromium` once. E2E_BROWSER can point at any locally
 * installed Chromium-based browser instead (for example Chrome or Edge).
 */
export default defineConfig({
  testDir: 'e2e',
  fullyParallel: true,
  forbidOnly: !!process.env['CI'],
  retries: process.env['CI'] ? 1 : 0,
  reporter: process.env['CI'] ? [['list'], ['html', { open: 'never' }]] : 'list',
  use: {
    baseURL: process.env['E2E_BASE_URL'] ?? 'http://portal.test',
    trace: 'retain-on-failure',
    launchOptions: process.env['E2E_BROWSER'] ? { executablePath: process.env['E2E_BROWSER'] } : {},
  },
  projects: [
    { name: 'desktop', use: { ...devices['Desktop Chrome'] }, grepInvert: /@phone/ },
    { name: 'phone', use: { ...devices['Pixel 7'] }, grep: /@phone/ },
  ],
});
