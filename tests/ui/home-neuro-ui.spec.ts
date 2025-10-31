import { expect, test } from '@playwright/test';

test.describe('Neuro UI dashboard', () => {
  test('header renders compact layout with icon nav and status capsule', async ({ page }) => {
    await page.goto('/app/home');
    const header = page.locator('header.app-header');
    await expect(header).toBeVisible();
    await expect(page.locator('.logo-dot')).toBeVisible();
    await expect(page.getByPlaceholder('Search threads…')).toBeVisible();

    const navIcons = page.locator('[data-testid^="center-nav-"]');
    await expect(navIcons).toHaveCount(5);
    await expect(page.locator('[data-testid="center-nav-home"]')).toBeVisible();

    const statusCapsule = page.locator('[data-testid="top-status"]');
    await expect(statusCapsule).toBeVisible();
    const statusText = (await statusCapsule.innerText()).replace(/\s+/g, ' ');
    expect(statusText).toMatch(/⚡/);
    expect(statusText).toMatch(/Level/);
    expect((statusText.match(/\//g) ?? []).length).toBeGreaterThanOrEqual(2);
    expect((statusText.match(/•/g) ?? []).length).toBeGreaterThanOrEqual(2);

    await expect(page.locator('[data-testid="level-panel"]')).toBeVisible();
    await expect(page.locator('.app-rail')).toHaveCount(0);
  });

  test('quick links and quick post interactions', async ({ page }) => {
    await page.goto('/app/home');
    const links = page.locator('[data-testid="quick-links"] button');
    const firstLink = links.first();
    await firstLink.focus();
    await expect(firstLink).toBeFocused();

    const missionsLink = links.nth(1);
    await expect(missionsLink).toHaveAttribute('data-href', '/app/missions');
    await expect(missionsLink).toBeEnabled();
    await missionsLink.click({ noWaitAfter: true });

    await page.goto('/app/home');
    const quickPanel = page.locator('#quick-post .orb-panel');
    await expect(quickPanel).toBeVisible();

    const quickInput = page.locator('#quick-post .input-glass');
    await expect(quickInput).toBeVisible();
    await quickInput.fill('Neuro UI feels alive');
    await expect(page.locator('#quick-post .counter')).toHaveText('20/280');

    await quickInput.fill('x'.repeat(285));
    await expect(quickInput).toHaveValue('x'.repeat(280));
    await expect(page.locator('#quick-post .counter')).toHaveText('280/280');
    const sendButton = page.locator('#quick-post button[aria-label="Post quick win"]');
    await expect(sendButton).toBeEnabled();

    const primaryCta = page.locator('.primary-cta').first();
    await primaryCta.focus();
    const focusState = await primaryCta.evaluate((element) =>
      element.matches(':focus-visible') || element.matches(':focus')
    );
    expect(focusState).toBeTruthy();
  });

  test('mobile dock replaces center nav on small screens', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/app/home');
    await expect(page.locator('[data-testid="center-nav-home"]')).toBeHidden();
    const dockItems = page.locator('[data-testid^="dock-"]');
    await expect(dockItems).toHaveCount(5);
    await expect(page.locator('[data-testid="dock-home"]')).toBeVisible();
  });
});
