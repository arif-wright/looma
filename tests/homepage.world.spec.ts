import { expect, test } from '@playwright/test';

test('Looma World homepage renders key sections and CTA navigates to auth', async ({ page }) => {
  await page.goto('/', { waitUntil: 'domcontentloaded' });

  await expect(page.getByRole('link', { name: 'Looma' })).toBeVisible();
  await expect(page.getByTestId('hero-backdrop')).toBeVisible();
  await expect(page.locator('.feature-row span')).toHaveCount(4);
  await expect(page.locator('.archetype-card')).toHaveCount(5);

  await expect(page.getByRole('heading', { level: 1, name: 'Begin the bond.' })).toBeVisible();

  await expect(page.getByRole('heading', { level: 2, name: 'Which companion energy calls to you?' })).toBeVisible();
  await expect(page.getByRole('heading', { level: 2, name: 'A quiz becomes the first emotional handshake.' })).toBeVisible();
  await expect(page.getByRole('heading', { level: 2, name: 'Not a category. A relationship that can return.' })).toBeVisible();

  const navigationPromise = page.waitForURL('**/app/login');
  await page.getByRole('link', { name: 'Begin the bond' }).first().click();
  await navigationPromise;
  await expect(page).toHaveURL(/\/app\/login$/);
});
