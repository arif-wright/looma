import { test, expect } from '@playwright/test';

test('shows roster, can set active, rename, and rest', async ({ page }) => {
  await page.goto('/app/companions');
  await expect(page.getByRole('heading', { name: /Your Companions/i })).toBeVisible();

  const firstCard = page.locator('[data-test="companion-card"]').first();
  await expect(firstCard).toBeVisible();
  await firstCard.click();

  const modal = page.getByRole('dialog');
  await expect(modal).toBeVisible();

  await modal.getByRole('button', { name: /Rename/i }).click();
  const nameInput = modal.getByPlaceholder('New name');
  await nameInput.fill('Mirae');
  await modal.getByRole('button', { name: 'Save' }).click();
  await expect(firstCard).toContainText('Mirae');

  const setActive = modal.getByRole('button', { name: /Set Active/i });
  if (await setActive.isEnabled()) {
    await setActive.click();
  }
  await expect(page.getByText(/Active: Mirae/i)).toBeVisible();

  const restButton = modal.getByRole('button', { name: /Rest/i });
  await restButton.click();
  await expect(page.getByText(/Resting/i)).toBeVisible();
});
