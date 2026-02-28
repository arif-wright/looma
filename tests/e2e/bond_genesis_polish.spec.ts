import { test, expect } from '@playwright/test';

test.describe('Bond Genesis polish', () => {
  test('progress, back/next, and consent persistence', async ({ page }) => {
    await page.goto('/app/onboarding/companion?retake=1');
    await expect(page.getByRole('heading', { level: 2, name: /Question 1 \/ 10/i })).toBeVisible();
    await expect(page.getByTestId('quiz-progress')).toHaveText(/10%/);

    await page.getByTestId('quiz-choice-agree').click();
    await page.getByTestId('quiz-next').click();
    await expect(page.getByRole('heading', { level: 2, name: /Question 2 \/ 10/i })).toBeVisible();
    await expect(page.getByTestId('quiz-progress')).toHaveText(/20%/);

    await page.getByTestId('quiz-back').click();
    await expect(page.getByRole('heading', { level: 2, name: /Question 1 \/ 10/i })).toBeVisible();
    await expect(page.getByTestId('quiz-progress')).toHaveText(/10%/);

    const consentToggle = page.getByTestId('quiz-consent-toggle');
    await consentToggle.click();
    await page.reload();
    await expect(page.getByTestId('quiz-consent-toggle')).not.toBeChecked();
  });

  test('spawn endpoint blocks duplicate companions', async ({ page }) => {
    const first = await page.request.post('/api/persona/spawn');
    if (first.ok()) {
      const second = await page.request.post('/api/persona/spawn');
      expect(second.status()).toBe(400);
    } else {
      expect(first.status()).toBe(400);
    }
  });
});
