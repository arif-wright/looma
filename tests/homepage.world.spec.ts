import { expect, test } from '@playwright/test';

test('Looma World homepage renders key sections and CTA navigates to auth', async ({ page }) => {
  await page.goto('/', { waitUntil: 'domcontentloaded' });

  await expect(page.getByRole('link', { name: 'Looma' })).toBeVisible();
  await expect(page.getByTestId('hero-video')).toBeVisible();
  await expect(page.locator('.signal-card')).toHaveCount(4);
  await expect(page.locator('.archetype-card')).toHaveCount(5);

  await expect(
    page.getByRole('heading', { level: 1, name: 'Something in this world has been waiting for you.' })
  ).toBeVisible();

  await expect(
    page.getByRole('heading', { level: 2, name: 'Every companion responds to different emotional patterns.' })
  ).toBeVisible();
  await expect(page.getByRole('heading', { level: 2, name: 'Not every companion is meant for every soul.' })).toBeVisible();
  await expect(page.getByRole('heading', { level: 2, name: 'Not a result. A first encounter.' })).toBeVisible();

  const navigationPromise = page.waitForURL('**/app/login');
  await page.getByRole('link', { name: 'Begin the bond' }).first().click();
  await navigationPromise;
  await expect(page).toHaveURL(/\/app\/login$/);
});
