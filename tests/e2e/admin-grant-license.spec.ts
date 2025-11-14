import { test, expect } from '@playwright/test';

test('super admin can open Players page and view grant action', async ({ page }) => {
  await page.goto('/app/admin');
  await page.getByRole('link', { name: /Players/i }).first().click();
  await expect(page.getByRole('heading', { name: /Players/i })).toBeVisible();
  await expect(page.getByRole('button', { name: /Grant Slot License/i }).first()).toBeVisible();
});
