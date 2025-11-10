import { test, expect } from '@playwright/test';

test('quiz → archetype → spawn companion', async ({ page }) => {
  await page.goto('/app/onboarding/companion');
  await expect(page.getByRole('heading', { name: /Find your first bond/i })).toBeVisible();

  for (let i = 0; i < 10; i += 1) {
    await page.getByRole('button', { name: 'Agree' }).nth(i).click();
  }

  await page.getByRole('button', { name: 'See your match' }).click();
  await expect(page.getByText(/Your Archetype/i)).toBeVisible();

  await page.getByRole('button', { name: 'Begin your bond' }).click();
  await page.waitForURL('**/app/home', { timeout: 15_000 });
});
