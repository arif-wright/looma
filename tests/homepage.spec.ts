import { expect, test } from '@playwright/test';

test.describe('Marketing homepage', () => {
  test('shows hero and CTA', async ({ page }) => {
    await page.goto('/', { waitUntil: 'domcontentloaded' });

    await expect(page.getByRole('heading', { level: 1, name: /Begin the bond/i })).toBeVisible();
    await expect(page.getByRole('link', { name: 'Begin the bond' }).first()).toBeVisible();
  });

  test('CTA navigates to login', async ({ page }) => {
    await page.goto('/', { waitUntil: 'domcontentloaded' });
    await page.getByRole('link', { name: 'Begin the bond' }).first().click();
    await expect(page).toHaveURL(/\/app\/login$/);
  });

  test('sections render for worlds and support copy', async ({ page }) => {
    await page.goto('/', { waitUntil: 'domcontentloaded' });

    await expect(page.getByRole('heading', { level: 2, name: 'Which companion energy calls to you?' })).toBeVisible();
    await expect(page.getByRole('heading', { level: 2, name: 'A quiz becomes the first emotional handshake.' })).toBeVisible();
    await expect(page.getByRole('heading', { level: 2, name: 'Not a category. A relationship that can return.' })).toBeVisible();
    await expect(page.locator('.archetype-card')).toHaveCount(5);
  });
});
