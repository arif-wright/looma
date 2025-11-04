import { expect, test } from '@playwright/test';

test.describe('Branding • Games hub', () => {
  test('hero, grid, and CTAs adopt neuro-branding', async ({ page }) => {
    await page.goto('/app/games');
    await expect(page.getByTestId('games-hub')).toBeVisible();
    await expect(page.locator('[data-testid="games-grid"]').first()).toBeVisible();

    const card = page.getByTestId('game-card-tiles-run');
    await expect(card).toBeVisible();
    await expect(card).toHaveClass(/panel-glass/);

    const before = await card.evaluate((el) => getComputedStyle(el).transform);
    await card.hover();
    const after = await card.evaluate((el) => getComputedStyle(el).transform);
    expect(after).not.toBe(before);

    const cta = page.getByTestId('game-cta-tiles-run');
    await cta.focus();
    await expect(cta).toBeFocused();
    await expect(cta).toHaveAttribute('data-ana', 'cta:play');
  });
});
