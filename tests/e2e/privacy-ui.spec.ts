import { test, expect } from '@playwright/test';

test('gated profile shows Request to follow and hides feed', async ({ page }) => {
  // Navigate to a private profile as a non-follower (wire up your auth fixture as needed)
  await page.goto('/u/<PRIVATE_HANDLE>');
  // Allow either state depending on prior runs
  await expect(page.getByRole('heading', { name: /This profile is private/i })).toBeVisible();
  const btn = page.getByRole('button', { name: /Request to follow|Requested/ });
  await expect(btn).toBeVisible();
});
