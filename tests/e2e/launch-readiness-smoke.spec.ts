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
    await expect(page.getByText(/Your bond with .* feels (distant|near|resonant)/i)).toBeVisible();
    await expect(page.getByText(/Current mood:/i).first()).toBeVisible();
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

  test('a recoverable first-bond persistence failure keeps the moment available for retry', async ({ page }) => {
    await page.route('**/api/home/reconnect', async (route) => {
      await route.fulfill({
        status: 503,
        contentType: 'application/json',
        body: JSON.stringify({ error: 'memory_persistence_failed', recoverable: true })
      });
    });
    await page.goto('/app/home');

    const reflection = page.getByPlaceholder(/Share a few words with/i);
    const firstMomentButton = page.getByRole('button', { name: /Share your first moment/i });
    if ((await reflection.count()) && (await firstMomentButton.count())) {
      await reflection.fill('I want this first moment to stay with us.');
      await firstMomentButton.click();
      await expect(page.getByText(/still waiting safely on this screen/i)).toBeVisible();
      await expect(page.getByRole('button', { name: /Try saving this moment again/i })).toBeVisible();
      await expect(reflection).toHaveValue('I want this first moment to stay with us.');
      await expect(page.getByText(/safely remembered yet/i)).toHaveCount(0);
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

  test('desktop profile menu exposes logout', async ({ page }) => {
    await page.goto('/app/home');
    await page.getByRole('button', { name: 'Open profile menu' }).click();
    await expect(page.getByRole('menuitem', { name: /Log out/i })).toBeVisible();
  });

  test('onboarding is isolated from the protected app shell', async ({ page }) => {
    await page.goto('/app/onboarding/companion');

    await expect(page.locator('.fantasy-sidebar')).toHaveCount(0);
    await expect(page.locator('.protected-topbar')).toHaveCount(0);
    await expect(page.getByRole('navigation', { name: 'Primary navigation' })).toHaveCount(0);
    await expect(page.getByRole('button', { name: /Notifications|Messages|Open profile menu/i })).toHaveCount(0);
    await expect(page.getByRole('link', { name: /Open wallet/i })).toHaveCount(0);
    await expect(page.getByRole('link', { name: /Exit Onboarding/i })).toHaveCount(0);
    await expect(page.getByRole('img', { name: 'Memvoya' })).toBeVisible();
    await expect(page.getByText(/Question 1 of 12/i)).toBeVisible();
  });
});
