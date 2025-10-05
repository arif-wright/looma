import { expect, test } from '@playwright/test';

test.describe('Marketing homepage', () => {
  test('shows hero and CTA', async ({ page }) => {
    await page.goto('/');

    await expect(page.getByRole('heading', { name: 'Looma keeps every creature at your command' })).toBeVisible();
    await expect(page.getByRole('link', { name: 'Start with your Kinforge account' })).toBeVisible();
  });

  test('CTA navigates to login', async ({ page }) => {
    await page.goto('/');
    await page.getByRole('link', { name: 'Start with your Kinforge account' }).click();
    await expect(page).toHaveURL(/\/login$/);
  });

  test('sections render for features, how it works, and footer', async ({ page }) => {
    await page.goto('/');

    await expect(page.getByRole('heading', { name: 'Built to tame every bestiary' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'How Looma supports your session flow' })).toBeVisible();
    await expect(page.getByRole('contentinfo')).toBeVisible();
  });
});
