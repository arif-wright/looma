import { test, expect } from '@playwright/test';

test('quiz → archetype → spawn companion', async ({ page }) => {
  await page.goto('/app/onboarding/companion');
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
  await expect(page.getByText(/Question 1 of 12/i)).toBeVisible();

  for (let i = 0; i < 12; i += 1) {
    await page.getByTestId('quiz-choice-agree').click();
    await page.getByTestId('quiz-next').click();
  }

  await expect(page.getByText(/Your companion energy/i)).toBeVisible();

  const spawnButton = page.getByTestId('quiz-spawn');
  if (await spawnButton.isEnabled()) {
    await spawnButton.click();
    await page.waitForURL('**/app/home', { timeout: 15_000 });
    await page.getByPlaceholder(/Share a few words with/i).fill('I am nervous, but hopeful about meeting you.');
    await page.getByRole('button', { name: 'Share your first moment' }).click();
    await expect(page.getByText(/What .* said/i)).toBeVisible();
    await expect(page.getByRole('link', { name: /See the moment .* remembered/i })).toBeVisible();
    await page.reload();
    await expect(page.getByText('I am nervous, but hopeful about meeting you.')).toBeVisible();
  } else {
    await page.getByRole('link', { name: /Return home/i }).click();
    await page.waitForURL('**/app/home**', { timeout: 15_000 });
  }

  await page.goto('/app/profile');
  await expect(page.getByTestId('archetype-badge')).toBeVisible();
});
