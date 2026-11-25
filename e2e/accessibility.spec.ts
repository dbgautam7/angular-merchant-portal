import AxeBuilder from '@axe-core/playwright';
import type { Page } from '@playwright/test';
import { expect, openAs, openApplication, test } from './fixtures';

/** Automated WCAG 2.1 A/AA checks with axe-core. They catch a lot, but not everything. */
async function expectNoViolations(page: Page): Promise<void> {
  const { violations } = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
    .analyze();
  expect(violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target).join(', ')}`)).toEqual([]);
}

test.describe('Accessibility (axe, WCAG 2.1 AA)', () => {
  test('sign-in page', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByRole('heading', { name: 'Sign in' })).toBeVisible();
    await expectNoViolations(page);
  });

  test('dashboard', async ({ page }) => {
    await openAs(page, 'Sita Sales');
    await expectNoViolations(page);
  });

  test('application form, with errors showing', async ({ page }) => {
    await openAs(page, 'Sita Sales');
    await page.getByRole('link', { name: 'New application' }).first().click();
    await page.getByRole('button', { name: 'Next' }).click();
    await expect(page.getByText('This field is required.').first()).toBeVisible();
    await expectNoViolations(page);
  });

  test('detail page with review controls', async ({ page }) => {
    await openAs(page, 'Ravi Reviewer');
    await openApplication(page, 'Demo Merchant 1 Pvt Ltd');
    await expectNoViolations(page);
  });
});
