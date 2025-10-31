import { expect, test } from '@playwright/test';

test.describe('Neuro UI dashboard', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/app/home');
  });

  test('renders neuro shell with status capsule and level panel', async ({ page }) => {
    const panels = page.locator('[data-testid="orb-panel"]');
    await expect(panels).toHaveCount(5);
    await expect(page.locator('[data-testid="quick-links"]')).toBeVisible();
    await expect(page.locator('[data-testid="level-panel"]')).toBeVisible();
    await expect(page.locator('[data-testid="top-status"]')).toBeVisible();
    await expect(page.locator('.app-rail')).toHaveCount(0);
  });

  test('quick links support keyboard navigation and CTA focus ring', async ({ page }) => {
    const links = page.locator('[data-testid="quick-links"] button');
    await expect(links.first()).toHaveAttribute('tabindex', '0');
    await expect(links.nth(1)).toHaveAttribute('tabindex', '-1');

    const primaryCta = page.locator('.primary-cta').first();
    await primaryCta.focus();
    const focusState = await primaryCta.evaluate((element) =>
      element.matches(':focus-visible') || element.matches(':focus')
    );
    expect(focusState).toBeTruthy();
  });

  test('legacy dashboard artifacts are absent', async ({ page }) => {
    await expect(page.locator('.brand-title')).toHaveCount(0);
    await expect(page.locator('[data-testid="legacy-panel"]')).toHaveCount(0);
  });
});
