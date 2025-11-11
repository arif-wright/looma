import { expect, test } from '@playwright/test';

test.describe('Routing – unauthenticated', () => {
  test.use({ storageState: undefined });

  test('redirects /app/home to marketing', async ({ page }) => {
    await page.goto('/app/home');
    await expect(page).toHaveURL('/');
  });

  test('marketing enter button points to auth', async ({ page }) => {
    await page.goto('/');
    const enterLink = page.getByRole('link', { name: 'Enter' });
    await expect(enterLink).toHaveAttribute('href', '/app/auth');
  });
});

test.describe('Routing – authenticated', () => {
  test('marketing enter button points to app home', async ({ page }) => {
    await page.goto('/');
    const enterLink = page.getByRole('link', { name: 'Enter' });
    await expect(enterLink).toHaveAttribute('href', '/app/home');
  });
});
