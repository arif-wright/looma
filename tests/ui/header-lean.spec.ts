import { expect, test } from '@playwright/test';

test.describe('Lean header default', () => {
  test('renders compact facebook-style header with center dock', async ({ page }) => {
    await page.goto('/app/home');
    const header = page.getByTestId('lean-header');
    await expect(header).toBeVisible();

    const navIcons = page.locator('[data-testid^="nav-icon-"]');
    await expect(navIcons).toHaveCount(5);
    await expect(page.locator('[data-testid="nav-icon-feed"]')).toBeVisible();

    const box = await header.boundingBox();
    expect(box?.height ?? 0).toBeLessThanOrEqual(64);
  });
});
