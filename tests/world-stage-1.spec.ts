import { expect, test } from '@playwright/test';

const hasAuthenticatedEnvironment = Boolean(
  process.env.PUBLIC_SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY
);
const worldEnabled = ['true', '1'].includes((process.env.PUBLIC_WORLD_ENABLED ?? '').trim().toLowerCase());
const selectedRenderer = (process.env.PUBLIC_WORLD_RENDERER ?? '').trim().toLowerCase() === 'three' ? 'three' : 'phaser';

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

  test('mounts only the selected renderer when enabled', async ({ page }) => {
    test.skip(!hasAuthenticatedEnvironment, 'requires seeded authenticated storage state');
    test.skip(!worldEnabled, 'requires PUBLIC_WORLD_ENABLED=true');

    await page.goto('/app/world');
    await expect(page.getByTestId('world-enabled-state')).toBeVisible();
    const mount = page.getByTestId('world-game-mount');
    await expect(mount).toHaveAttribute('data-renderer', selectedRenderer);
    await expect(mount.locator('canvas')).toHaveCount(1);
    await expect(page.getByRole('link', { name: 'Return Home' })).toBeVisible();
  });

  test('Three camera controls update state and route teardown removes its canvas', async ({ page }) => {
    test.skip(!hasAuthenticatedEnvironment || !worldEnabled || selectedRenderer !== 'three', 'requires enabled authenticated Three renderer');

    await page.goto('/app/world');
    const canvas = page.locator('canvas[data-renderer="three"]');
    await expect(canvas).toHaveCount(1);
    const initialYaw = await canvas.getAttribute('data-camera-yaw');
    await page.getByRole('button', { name: 'Rotate camera right' }).click();
    await expect.poll(() => canvas.getAttribute('data-camera-yaw')).not.toBe(initialYaw);
    const initialZoom = await canvas.getAttribute('data-camera-zoom');
    await page.getByRole('button', { name: 'Zoom camera in' }).click();
    await expect.poll(() => canvas.getAttribute('data-camera-zoom')).not.toBe(initialZoom);
    await page.keyboard.press('KeyR');
    await expect.poll(() => canvas.getAttribute('data-camera-yaw')).not.toBe(null);
    const initialPosition = await canvas.evaluate((element) => `${element.dataset.localPlayerX}:${element.dataset.localPlayerZ}`);
    await page.keyboard.down('KeyW');
    await page.waitForTimeout(250);
    await page.keyboard.up('KeyW');
    await expect.poll(() => canvas.evaluate((element) => `${element.dataset.localPlayerX}:${element.dataset.localPlayerZ}`)).not.toBe(initialPosition);
    await expect(canvas).toHaveAttribute('data-facing', /^(n|ne|e|se|s|sw|w|nw)$/);
    await page.getByRole('link', { name: 'Return Home' }).click();
    await expect(page.locator('canvas[data-renderer="three"]')).toHaveCount(0);
  });

  test('Three context-loss hook presents recovery without duplicating canvas on re-entry', async ({ page }) => {
    test.skip(!hasAuthenticatedEnvironment || !worldEnabled || selectedRenderer !== 'three', 'requires enabled authenticated Three renderer');
    await page.goto('/app/world');
    await page.evaluate(() => (window as any).__MEMVOYA_WORLD_THREE__.loseContext());
    await expect(page.getByTestId('webgl-recovery-state')).toBeVisible();
    await page.getByRole('button', { name: 'Restore display' }).click();
    await expect(page.getByTestId('webgl-recovery-state')).toHaveCount(0);
    await page.getByRole('link', { name: 'Return Home' }).click();
    await page.goto('/app/world');
    await expect(page.locator('canvas[data-renderer="three"]')).toHaveCount(1);
  });
});
