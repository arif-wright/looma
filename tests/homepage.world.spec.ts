import { expect, test } from '@playwright/test';

test('Looma World homepage renders key sections and CTA navigates to auth', async ({ page }) => {
  await page.goto('/');

  await expect(page.getByRole('link', { name: 'Looma' })).toBeVisible();
  await expect(page.getByRole('region', { name: 'Looma hero' })).toBeVisible();
  await expect(page.getByTestId('hero-video')).toBeVisible();
  await expect(page.getByTestId('threads')).toBeVisible();
  await expect(page.locator('.subcards .card')).toHaveCount(4);

  await expect(page.getByRole('heading', { level: 1, name: 'Looma remembers you.' })).toBeVisible();

  await expect(page.getByRole('heading', { level: 2, name: 'A world that learns you back' })).toBeVisible();
  await expect(
    page.getByRole('heading', { level: 2, name: 'Built for dreamers, players, and explorers' })
  ).toBeVisible();
  await expect(page.getByRole('heading', { level: 2, name: 'The Bond System' })).toBeVisible();
  await expect(page.getByRole('heading', { level: 2, name: 'Threads that connect us all' })).toBeVisible();

  await expect(page.locator('footer')).toBeVisible();

  const navigationPromise = page.waitForURL('**/app/auth');
  await page.getByRole('link', { name: 'Begin your bond' }).click();
  await navigationPromise;
  await expect(page).toHaveURL(/\/app\/auth$/);
});
