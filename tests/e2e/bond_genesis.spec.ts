import { test, expect } from '@playwright/test';

test('quiz → archetype → spawn companion', async ({ page }) => {
  await page.goto('/app/onboarding/companion');
  await expect(page.getByText(/Find your first bond/i)).toBeVisible();
  await expect(page.getByTestId('quiz-progress')).toHaveText(/1 \/ 10/);

  for (let i = 0; i < 10; i += 1) {
    await page.getByTestId('quiz-choice-agree').click();
    await page.getByTestId('quiz-next').click();
  }

  await expect(page.getByText(/Your Archetype/i)).toBeVisible();

  const spawnButton = page.getByTestId('quiz-spawn');
  if (await spawnButton.isEnabled()) {
    await spawnButton.click();
    await page.waitForURL('**/app/home', { timeout: 15_000 });
  } else {
    await page.getByRole('link', { name: /Skip for now/i }).click();
    await page.waitForURL('**/app/home', { timeout: 15_000 });
  }

  await page.goto('/app/profile');
  await expect(page.getByTestId('archetype-badge')).toBeVisible();
});
