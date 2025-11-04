import { expect, test } from '@playwright/test';

test.describe('Lean header default', () => {
  test('renders compact header without brand dock', async ({ page }) => {
    await page.goto('/app/home');
    const header = page.getByTestId('lean-header');
    await expect(header).toBeVisible();

    const brandDock = page.getByTestId('nav-icon-games');
    await expect(brandDock).toHaveCount(0);

    const box = await header.boundingBox();
    expect(box?.height ?? 0).toBeLessThanOrEqual(64);
  });
});
