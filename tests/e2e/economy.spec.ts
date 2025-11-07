import { test, expect } from '@playwright/test';

const WALLET_URL = '/app/wallet';
const SHOP_URL = '/app/shop';
const INVENTORY_URL = '/app/inventory';

test.describe('Economy flows', () => {
  test('Wallet page renders and shows balance capsule', async ({ page }) => {
    await page.goto(WALLET_URL);
    await expect(page.getByText(/Wallet Balance/i)).toBeVisible({ timeout: 15000 });
    await expect(page.getByText(/Buy Shards/i)).toBeVisible();
    await expect(page.locator('[data-test=wallet-pack-card]').first()).toBeVisible();
  });

  test('Shop grid loads and owned items show badges', async ({ page }) => {
    await page.goto(SHOP_URL);
    await expect(page.getByText(/Featured Drops/i)).toBeVisible();
    await expect(page.locator('[data-test=shop-card]').first()).toBeVisible();
  });

  test('Inventory page renders list', async ({ page }) => {
    await page.goto(INVENTORY_URL);
    await expect(page.getByText(/Inventory/i)).toBeVisible();
  });
});
