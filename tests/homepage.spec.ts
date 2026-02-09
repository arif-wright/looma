import { expect, test } from '@playwright/test';

test.describe('Marketing homepage', () => {
  test('shows hero and CTA', async ({ page }) => {
    await page.goto('/');

    await expect(page.getByRole('heading', { level: 1, name: 'Looma remembers you.' })).toBeVisible();
    await expect(page.getByRole('link', { name: 'Begin your bond' })).toBeVisible();
  });

  test('CTA navigates to login', async ({ page }) => {
    await page.goto('/');
    await page.getByRole('link', { name: 'Begin your bond' }).click();
    await expect(page).toHaveURL(/\/app\/auth$/);
  });

  test('sections render for features, how it works, and footer', async ({ page }) => {
    await page.goto('/');

    await expect(page.getByRole('heading', { level: 2, name: 'A world that learns you back' })).toBeVisible();
    await expect(page.getByRole('heading', { level: 2, name: 'The Bond System' })).toBeVisible();
    await expect(page.locator('footer')).toBeVisible();
  });
});
