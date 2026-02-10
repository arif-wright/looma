import { expect, test, type Locator, type Page } from '@playwright/test';

const startRunnerSession = async (page: Page): Promise<Locator> => {
  await page.goto('/app/games/runner');
  // Start overlay is a button; clicking it should begin the session in dev/test.
  await page.getByRole('button', { name: /tap to begin/i }).click();
  const simulate = page.getByRole('button', { name: 'Simulate Complete' });
  await expect(simulate).toBeEnabled({ timeout: 30_000 });
  return simulate;
};

test.describe('Game failure states', () => {
  test('failed game completion shows a calm, non-scary card', async ({ page }) => {
    await page.route('**/api/games/session/complete', async (route) => {
      await route.fulfill({
        status: 500,
        contentType: 'application/json',
        body: JSON.stringify({ code: 'server_error', message: 'upstream failure' })
      });
    });

    const simulate = await startRunnerSession(page);
    await simulate.click();

    const overlay = page.getByTestId('completion-failed');
    await expect(overlay).toBeVisible();
    await expect(overlay).toContainText('We could not save that run. Try again.');
    await expect(page.getByRole('button', { name: /back to hub/i })).toBeVisible();
  });

  test('unauthorized game completion offers sign-in', async ({ page }) => {
    await page.route('**/api/games/session/complete', async (route) => {
      await route.fulfill({
        status: 401,
        contentType: 'application/json',
        body: JSON.stringify({ code: 'unauthorized', message: 'unauthorized' })
      });
    });

    const simulate = await startRunnerSession(page);
    await simulate.click();

    const overlay = page.getByTestId('completion-failed');
    await expect(overlay).toBeVisible();
    await expect(overlay).toContainText('Your session expired');
    await expect(page.getByRole('button', { name: /sign in/i })).toBeVisible();
  });

  test('network failure game completion does not look broken', async ({ page }) => {
    await page.route('**/api/games/session/complete', async (route) => {
      await route.abort();
    });

    const simulate = await startRunnerSession(page);
    await simulate.click();

    const overlay = page.getByTestId('completion-failed');
    await expect(overlay).toBeVisible();
    await expect(overlay).toContainText('Network issue');
  });
});
