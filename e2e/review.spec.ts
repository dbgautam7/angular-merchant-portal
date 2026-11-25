import { expect, openAs, openApplication, signInAs, signOut, test } from './fixtures';

test.describe('Review: decisions, reveal and assignment across roles', () => {
  test('the assigned reviewer reveals a masked value and approves; the author then sees it read-only', async ({
    page,
  }) => {
    await openAs(page, 'Ravi Reviewer');
    await openApplication(page, 'Demo Merchant 1 Pvt Ltd'); // SUBMITTED, assigned to Ravi

    // Masked by default; reveal is fetched from the server and can be hidden again.
    await expect(page.getByText('••••••••0001')).toBeVisible();
    await page.getByRole('button', { name: 'Reveal tax ID' }).click();
    await expect(page.getByText('TAX900000001')).toBeVisible();
    await page.getByRole('button', { name: 'Hide tax ID' }).click();
    await expect(page.getByText('TAX900000001')).toHaveCount(0);

    // A decision needs a comment.
    await page.getByRole('button', { name: 'Approve' }).click();
    await expect(page.getByLabel('Comment')).toBeFocused();
    await page.getByLabel('Comment').fill('Documents verified, low risk.');
    await page.getByRole('button', { name: 'Approve' }).click();

    await expect(page.getByText('Application approved.')).toBeFocused();
    await expect(page.getByRole('button', { name: 'Approve' })).toHaveCount(0);
    await expect(page.getByText('Approved by Ravi Reviewer')).toBeVisible();
    await expect(page.getByText('Documents verified, low risk.')).toBeVisible();

    // Role switch: the author sees the outcome, with no review controls and no reveal.
    await signOut(page);
    await signInAs(page, 'Sita Sales');
    await openApplication(page, 'Demo Merchant 1 Pvt Ltd');
    await expect(page.getByText('Approved by Ravi Reviewer')).toBeVisible();
    await expect(page.getByRole('button', { name: /Approve|Reject|Reveal/ })).toHaveCount(0);
  });

  test('ADMIN assigns a reviewer but cannot decide; the new reviewer then sees it', async ({
    page,
  }) => {
    await openAs(page, 'Ada Admin');
    await openApplication(page, 'Demo Merchant 6 Pvt Ltd'); // SUBMITTED, assigned to Rita
    await expect(page.getByRole('button', { name: 'Approve' })).toHaveCount(0);

    await page.getByLabel('Reviewer').selectOption({ label: 'Ravi Reviewer' });
    await page.getByRole('button', { name: 'Assign' }).click();
    await expect(page.getByText('Assigned to Ravi Reviewer.')).toBeVisible();
    await expect(page.getByText('Reviewer: Ravi Reviewer')).toBeVisible();

    await signOut(page);
    await signInAs(page, 'Ravi Reviewer');
    await openApplication(page, 'Demo Merchant 6 Pvt Ltd');
    await expect(page.getByRole('button', { name: 'Approve' })).toBeVisible();
  });
});
