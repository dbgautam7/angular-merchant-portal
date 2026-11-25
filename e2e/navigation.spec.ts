import { expect, openAs, signInAs, signOut, test } from './fixtures';

test.describe('Navigation, guards and deep links', () => {
  test('shows each role its own navigation and data', async ({ page }) => {
    await openAs(page, 'Sita Sales');
    const nav = page.getByRole('navigation', { name: 'Main' });
    await expect(nav.getByRole('link', { name: 'New application' })).toBeVisible();
    await expect(page.getByText('Merchant applications you have created.')).toBeVisible();

    await signOut(page);
    await signInAs(page, 'Ravi Reviewer');
    await expect(nav.getByRole('link', { name: 'New application' })).toHaveCount(0);
    await expect(page.getByText('Applications assigned to you for review.')).toBeVisible();
    await expect(page.getByRole('link', { name: /Draft/ })).toContainText('0'); // never assigned

    await signOut(page);
    await signInAs(page, 'Ada Admin');
    await expect(page.getByRole('link', { name: /^All/ })).toContainText('42');
  });

  test('sends a deep link through sign-in and back to the page asked for', async ({ page }) => {
    await page.goto('/applications/app-001');
    await expect(page).toHaveURL(/\/login\?returnUrl=%2Fapplications%2Fapp-001$/);
    await signInAs(page, 'Ravi Reviewer');
    await expect(
      page.getByRole('heading', { level: 1, name: 'Demo Merchant 1 Pvt Ltd' }),
    ).toBeVisible();
  });

  test('keeps a reviewer out of the SALES-only form, even by URL', async ({ page }) => {
    await page.goto('/applications/new');
    await signInAs(page, 'Ravi Reviewer');
    await expect(page).toHaveURL(/\/applications$/);
    await expect(page.getByRole('heading', { level: 1, name: 'Applications' })).toBeVisible();
  });

  test('works on a phone: menu, table and form @phone', async ({ page }) => {
    await openAs(page, 'Sam Sales');
    const menu = page.getByRole('button', { name: 'Menu' });
    await expect(menu).toHaveAttribute('aria-expanded', 'false');
    await menu.click();
    await expect(menu).toHaveAttribute('aria-expanded', 'true');
    await page
      .getByRole('navigation', { name: 'Main' })
      .getByRole('link', { name: 'New application' })
      .click();
    await expect(menu).toHaveAttribute('aria-expanded', 'false'); // closes after navigating
    await expect(page.getByRole('heading', { name: 'Business details' })).toBeVisible();
    // Nothing wider than the screen.
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth > innerWidth);
    expect(overflow).toBe(false);
  });
});
