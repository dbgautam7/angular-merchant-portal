import { expect, openAs, openApplication, test } from './fixtures';

test.describe('SALES: the application journey', () => {
  test('fills in every step, auto-saves a draft, submits it and sees it on the dashboard', async ({
    page,
  }) => {
    await openAs(page, 'Sam Sales');
    await page
      .getByRole('navigation', { name: 'Main' })
      .getByRole('link', { name: 'New application' })
      .click();
    await expect(page.getByRole('heading', { name: 'Business details' })).toBeVisible();

    await page.getByLabel('Legal name').fill('Playwright Demo Ltd');
    // The first auto-save creates the draft, and the URL switches to it (refresh-safe).
    await expect(page.getByText(/Draft saved at/)).toBeVisible();
    await expect(page).toHaveURL(/\/applications\/app-\w+\/edit$/);

    await page.getByLabel('Registration number').fill('REG-654321');
    await page.getByLabel('Category').selectOption('TRAVEL');
    await page.getByLabel('Website').fill('https://playwright-demo.example.com');
    await page.getByRole('button', { name: 'Next' }).click();

    await expect(page.getByRole('heading', { name: 'Owner details' })).toBeVisible();
    await page.getByLabel('Full name').fill('Casey Example');
    await page.getByLabel('Email').fill('casey@example.com');
    await page.getByLabel('Date of birth').fill('1988-04-12');
    await page.getByLabel('Tax ID').fill('TAX987654321');
    await page.getByRole('button', { name: 'Next' }).click();

    await expect(page.getByRole('heading', { name: 'Banking details' })).toBeVisible();
    await page.getByLabel('Bank name').fill('Example Bank');
    await page.getByLabel('Account number').fill('987654321012');
    await page.getByLabel('Expected monthly volume').fill('12000');
    await page.getByRole('button', { name: 'Next' }).click();

    // Review: answers summarised, sensitive values masked.
    await expect(page.getByRole('heading', { name: 'Review and submit' })).toBeVisible();
    await expect(page.getByText('Playwright Demo Ltd')).toBeVisible();
    await expect(page.getByText('••••••••4321')).toBeVisible();
    await expect(page.getByText('TAX987654321')).toHaveCount(0);

    await page.getByRole('button', { name: 'Submit application' }).click();
    await expect(
      page.getByRole('heading', { level: 1, name: 'Playwright Demo Ltd' }),
    ).toBeVisible();
    await expect(page.getByText('Submitted', { exact: true }).first()).toBeVisible();
    await expect(page.getByRole('link', { name: 'Continue editing' })).toHaveCount(0);

    await page
      .getByRole('navigation', { name: 'Breadcrumb' })
      .getByRole('link', { name: 'Applications' })
      .click();
    await page.getByLabel('Search by merchant name or ID').fill('Playwright Demo');
    const row = page.getByRole('row', { name: /Playwright Demo Ltd/ });
    await expect(row).toContainText('Submitted');
  });

  test('blocks Next on an invalid step and focuses the first error', async ({ page }) => {
    await openAs(page, 'Sam Sales');
    await page.getByRole('link', { name: 'New application' }).first().click();
    await page.getByRole('button', { name: 'Next' }).click();

    await expect(page.getByRole('heading', { name: 'Business details' })).toBeVisible();
    await expect(page.getByText('This field is required.')).toHaveCount(3);
    await expect(page.getByLabel('Legal name')).toBeFocused();
    await expect(page.getByLabel('Legal name')).toHaveAttribute('aria-invalid', 'true');
  });

  test('saves the draft when leaving straight after typing, and reopens it', async ({ page }) => {
    await openAs(page, 'Sam Sales');
    await page.getByRole('link', { name: 'New application' }).first().click();
    await page.getByLabel('Legal name').fill('Leave Early Ltd');
    // Leave before the auto-save debounce: the unsaved-changes guard saves first.
    await page
      .getByRole('navigation', { name: 'Main' })
      .getByRole('link', { name: 'Applications' })
      .click();

    await openApplication(page, 'Leave Early Ltd');
    await page.getByRole('link', { name: 'Continue editing' }).click();
    await expect(page.getByLabel('Legal name')).toHaveValue('Leave Early Ltd');
  });
});
