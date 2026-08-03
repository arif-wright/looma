import { expect, test } from '@playwright/test';

const hasAuthenticatedEnvironment = Boolean(
  process.env.PUBLIC_SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY
);
const worldEnabled = ['true', '1'].includes((process.env.PUBLIC_WORLD_ENABLED ?? '').trim().toLowerCase());

test.describe('The Wilds protected route', () => {
  test.describe.configure({ timeout: 120_000 });
  test('redirects an unauthenticated visitor to the public entry point', async ({ request }) => {
    const response = await request.get('/app/world', { maxRedirects: 0 });
    expect(response.status()).toBe(302);
    expect(response.headers().location).toBe('/');
  });

  test('does not issue a world ticket to an unauthenticated visitor', async ({ page }) => {
    await page.goto('/');
    const response = await page.evaluate(async () => {
      const result = await fetch('/api/world/ticket', { method: 'POST' });
      return { status: result.status };
    });
    expect(response.status).toBe(401);
  });

  test('shows the server-controlled disabled state without mounting Phaser', async ({ page }) => {
    test.skip(!hasAuthenticatedEnvironment, 'requires seeded authenticated storage state');
    test.skip(worldEnabled, 'requires PUBLIC_WORLD_ENABLED to be disabled');

    await page.goto('/app/world');
    await expect(page.getByTestId('world-disabled-state')).toBeVisible();
    await expect(page.getByTestId('world-game-mount')).toHaveCount(0);
    await expect(page.locator('canvas')).toHaveCount(0);
    await expect(page.getByRole('link', { name: 'Continue to Home' })).toBeVisible();
  });

  test('mounts the local Phaser shell when enabled', async ({ page }) => {
    test.skip(!hasAuthenticatedEnvironment, 'requires seeded authenticated storage state');
    test.skip(!worldEnabled, 'requires PUBLIC_WORLD_ENABLED=true');

    await page.goto('/app/world');
    await expect(page.getByTestId('world-enabled-state')).toBeVisible();
    await expect(page.getByTestId('world-game-mount').locator('canvas')).toHaveCount(1);
    await expect(page.getByRole('link', { name: 'Return Home' })).toBeVisible();
  });
});
