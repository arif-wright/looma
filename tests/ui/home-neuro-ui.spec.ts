import { expect, test } from '@playwright/test';

test.describe('Neuro UI dashboard', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/app/home');
  });

  test('renders orb panels for key sections', async ({ page }) => {
    const panels = page.locator('[data-testid="orb-panel"]');
    await expect(panels).toHaveCount(5);
  });

  test('primary CTA exposes cyan focus ring', async ({ page }) => {
    const primaryCta = page.locator('.primary-cta').first();
    const baseShadow = await primaryCta.evaluate((element) => getComputedStyle(element).boxShadow);
    let focused = false;
    for (let i = 0; i < 18; i += 1) {
      await page.keyboard.press('Tab');
      focused = await primaryCta.evaluate(
        (element) => element === document.activeElement
      );
      if (focused) break;
    }
    expect(focused).toBeTruthy();
    const focusState = await primaryCta.evaluate((element) =>
      element.matches(':focus-visible') || element.matches(':focus')
    );
    expect(focusState).toBeTruthy();
    const boxShadow = await primaryCta.evaluate((element) => getComputedStyle(element).boxShadow);
    expect(boxShadow).not.toBe(baseShadow);
  });
});
