import { expect, test } from '@playwright/test';
import { loginAs, VIEWER_CREDENTIALS } from '../fixtures/auth';

test.describe('Reduced Phase 2 launch readiness', () => {
  test.beforeEach(async ({ page }) => {
    await loginAs(page, VIEWER_CREDENTIALS);
  });

  test('Home stays companion-first and presents durable continuity honestly', async ({ page }) => {
    await page.goto('/app/home');

    await expect(page.getByRole('main', { name: 'Memvoya companion home' })).toBeVisible();
    await expect(page.getByRole('navigation', { name: 'Supporting relationship actions' })).toBeVisible();
    await expect(page.locator('a[href="/app/games"]')).toHaveCount(0);
    await expect(page.locator('a[href="/app/missions"]')).toHaveCount(0);
    await expect(page.locator('a[href="/app/messages"]')).toHaveCount(0);

    const continuity = page.getByRole('region', { name: 'Remembered continuity' });
    await expect(continuity).toBeVisible();
    const journalLink = continuity.getByRole('link', { name: /Revisit in Journal/i });
    if (await journalLink.count()) {
      await expect(continuity.getByText(/persisted in your Journal/i)).toBeVisible();
    } else {
      await expect(continuity.getByText(/Share one honest moment above/i)).toBeVisible();
    }
  });

  test('Sanctuary+ is concrete and does not claim ownership of the core bond', async ({ page }) => {
    await page.goto('/app/wallet');

    await expect(page.getByText(/The companion bond stays free/i)).toBeVisible();
    await expect(page.getByText(/Deeper chapter readings in your Journal/i)).toBeVisible();
    await expect(page.getByText(/Choose a richer atmosphere for Home/i)).toBeVisible();
    await expect(page.getByText(/without a subscription/i)).toBeVisible();
  });

  test('Sanctuary only offers shared rest when the ritual is currently available', async ({ page }) => {
    await page.goto('/app/sanctuary');

    const restButton = page.getByRole('button', { name: /Rest Together/i });
    if (await restButton.count()) {
      await expect(page.getByText(/restore spark and create a durable Journal memory/i)).toBeVisible();
    } else {
      await expect(
        page.getByText(/Place something you earned together|holding your last quiet moment|No placeable keepsakes yet/i).first()
      ).toBeVisible();
    }
  });
});
