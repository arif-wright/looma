import { expect, test } from '@playwright/test';

test.describe('Branding • Games hub', () => {
  test('hero, playable grid, and CTAs adopt neuro-branding', async ({ page }) => {
    await page.goto('/app/games');
    await expect(page.getByTestId('games-hub')).toBeVisible();
    const grid = page.getByTestId('games-grid');
    await expect(grid).toBeVisible();
    await expect(grid).toHaveClass(/panel-glass/);

    const card = grid.getByRole('link', { name: 'Start Neon Run ritual', exact: true });
    await expect(card).toBeVisible();
    await expect(card).toHaveAttribute('href', '/app/games/runner');
    await expect(grid.locator('a[href="/app/games/tiles-run"]')).toHaveCount(0);

    const artwork = card.locator('img');
    const before = await artwork.evaluate((el) => getComputedStyle(el).transform);
    await card.hover();
    await expect.poll(() => artwork.evaluate((el) => getComputedStyle(el).transform)).not.toBe(before);

    await card.focus();
    await expect(card).toBeFocused();

    const cta = page.getByTestId('featured-play');
    await expect(cta).not.toHaveAttribute('href', '/app/games/tiles-run');
    await cta.focus();
    await expect(cta).toBeFocused();
    await expect(cta).toHaveAttribute('data-ana', 'cta:play');
  });
});
