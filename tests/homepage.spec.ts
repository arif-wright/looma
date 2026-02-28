import { expect, test } from '@playwright/test';

test.describe('Marketing homepage', () => {
  test('shows hero and CTA', async ({ page }) => {
    await page.goto('/', { waitUntil: 'domcontentloaded' });

    await expect(
      page.getByRole('heading', { level: 1, name: /A relationship platform for the companion you return to every day/i })
    ).toBeVisible();
    await expect(page.getByRole('link', { name: 'Begin your bond' })).toBeVisible();
  });

  test('CTA navigates to login', async ({ page }) => {
    await page.goto('/', { waitUntil: 'domcontentloaded' });
    await page.getByRole('link', { name: 'Begin your bond' }).click();
    await expect(page).toHaveURL(/\/app\/auth$/);
  });

  test('sections render for features, how it works, and footer', async ({ page }) => {
    await page.goto('/', { waitUntil: 'domcontentloaded' });

    await expect(page.getByRole('heading', { level: 2, name: 'A companion-first home' })).toBeVisible();
    await expect(page.getByRole('heading', { level: 2, name: 'Three small returns make the platform work.' })).toBeVisible();
    await expect(page.getByRole('heading', { level: 2, name: /Start with one companion/i })).toBeVisible();
  });
});
