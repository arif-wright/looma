import { test, expect } from '@playwright/test';

test('unlock modal highlights license actions', async ({ page }) => {
  await page.goto('/app/companions');
  await page.getByRole('button', { name: /Unlock slot/i }).click();
  await expect(page.getByText('Companion Slot License')).toBeVisible();
  const primary = page.getByRole('button', { name: /(Use License|Buy License)/i }).first();
  await expect(primary).toBeVisible();
});
