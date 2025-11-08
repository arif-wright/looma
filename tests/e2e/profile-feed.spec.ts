import { test, expect } from '@playwright/test';
import { TEST_USERS } from '../fixtures/env';

test.describe('Profile feed', () => {
  test('public profile shows pinned highlight and posts', async ({ page }) => {
    await page.goto(`/app/u/${TEST_USERS.author.handle}`);
    await expect(page.getByText(/Pinned/i)).toBeVisible();
    await expect(page.getByText(/Seed post for automated tests/i)).toBeVisible();
  });

  test('self composer posts prepend to feed', async ({ page }) => {
    const note = `Profile post ${Date.now()}`;
    await page.goto('/app/profile');
    await page.getByPlaceholder('Share a new update…').fill(note);
    await page.getByRole('button', { name: 'Post' }).click();
    await expect(page.getByText(note)).toBeVisible();
  });
});
