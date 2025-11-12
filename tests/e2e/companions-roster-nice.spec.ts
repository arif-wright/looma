import { test, expect } from '@playwright/test';

test.describe('Companion roster niceties', () => {
  test('unlock flow blocks then allows extra slot', async ({ page }) => {
    await page.goto('/app/companions');

    const unlockCta = page.getByRole('button', { name: /Unlock slot/i }).first();
    await unlockCta.click();
    await expect(page.getByText('Unlock an extra companion slot')).toBeVisible();

    const modalUnlock = page.getByRole('button', { name: /^Unlock slot$/i }).last();
    await modalUnlock.click();

    await expect(page.getByText(/Slot unlocked/i)).toBeVisible();
  });

  test('mood chip shows with accessible label', async ({ page }) => {
    await page.goto('/app/companions');
    const chip = page.locator('[aria-label^="Companion mood:"]');
    await expect(chip.first()).toBeVisible();
  });
});
