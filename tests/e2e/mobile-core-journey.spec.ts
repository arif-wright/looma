import { expect, test } from '@playwright/test';
import { loginAs, VIEWER_CREDENTIALS } from '../fixtures/auth';

test.describe('Mobile core journey', () => {
  test('authenticated user can move through sanctuary, journal, messages, and companions on a phone viewport', async ({
    page
  }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await loginAs(page, VIEWER_CREDENTIALS);

    await page.goto('/app/home');
    await expect(page.getByText(/Remember what/i)).toBeVisible();

    await page.locator('a[href^="/app/memory"]').first().click();
    await expect(page).toHaveURL(/\/app\/memory/);
    await expect(page.getByText(/Memory Summary|Journal/i).first()).toBeVisible();

    await page.goto('/app/messages');
    await expect(page.getByText(/Messages|Keep the weave close/i).first()).toBeVisible();

    await page.goto('/app/companions');
    await expect(page.getByRole('heading', { level: 2, name: /Quick switch/i })).toBeVisible();
    await expect(page.locator('a[href^="/app/memory"]').first()).toBeVisible();
    await expect(page.locator('a[href="/app/home"]').first()).toBeVisible();
  });
});
