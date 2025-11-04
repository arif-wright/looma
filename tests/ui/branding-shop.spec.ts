import { expect, test } from '@playwright/test';

test.describe('Branding • Shop surfaces', () => {
  test('grid, promo ribbon, and modal use neon tokens', async ({ page }) => {
    await page.goto('/app/shop');
    await expect(page.getByTestId('shop-grid')).toBeVisible();
    await expect(page.getByTestId('promo-ribbon').first()).toBeVisible();

    const firstCard = page.locator('[data-testid^="shop-card-"]').first();
    await firstCard.click();

    const modal = page.getByTestId('shop-modal');
    await expect(modal).toBeVisible();
    const buyButton = page.getByTestId('shop-modal-buy');
    await expect(buyButton).toHaveClass(/brand-cta/);
    await expect(buyButton).toHaveAttribute('data-ana', 'shop:purchase');
  });
});
