import { expect, test } from '@playwright/test';

test.describe('Marketing homepage', () => {
  test('shows hero and CTA', async ({ page }) => {
    await page.goto('/', { waitUntil: 'domcontentloaded' });

    await expect(
      page.getByRole('heading', { level: 1, name: /Something in this world has been waiting for you/i })
    ).toBeVisible();
    await expect(page.getByRole('link', { name: 'Begin the bond' }).first()).toBeVisible();
  });

  test('CTA navigates to login', async ({ page }) => {
    await page.goto('/', { waitUntil: 'domcontentloaded' });
    await page.getByRole('link', { name: 'Begin the bond' }).first().click();
    await expect(page).toHaveURL(/\/app\/login$/);
  });

  test('sections render for resonance, worlds, and encounter', async ({ page }) => {
    await page.goto('/', { waitUntil: 'domcontentloaded' });

    await expect(
      page.getByRole('heading', { level: 2, name: 'Every companion responds to different emotional patterns.' })
    ).toBeVisible();
    await expect(page.getByRole('heading', { level: 2, name: 'Not every companion is meant for every soul.' })).toBeVisible();
    await expect(page.getByRole('heading', { level: 2, name: 'Not a result. A first encounter.' })).toBeVisible();
    await expect(page.locator('.archetype-card')).toHaveCount(5);
  });
});
