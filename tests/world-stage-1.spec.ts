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

  test('serves and decodes the production Muse atlas and all referenced pages', async ({ page, request }) => {
    const manifestResponse = await request.get('/game/sprites/companions/muse/muse.atlas.json');
    expect(manifestResponse.ok()).toBe(true);
    const manifest = await manifestResponse.json();
    expect(manifest).toMatchObject({ id: 'muse-hd-production-v2', status: 'production', version: 2 });
    expect(manifest.pages).toHaveLength(28);
    for (const atlasPage of manifest.pages) {
      const response = await request.get(`/game/sprites/companions/muse/${atlasPage.image}`);
      expect(response.ok(), atlasPage.image).toBe(true);
      expect(response.headers()['content-type']).toContain('image/png');
    }

    await page.goto('/');
    const sanity = await page.evaluate(async () => {
      const response = await fetch('/game/sprites/companions/muse/muse.atlas.json');
      const asset = await response.json();
      const frame = asset.animations.idle.directions.s.frames[0];
      const atlasPage = asset.pages.find((candidate: { id: string }) => candidate.id === frame.page);
      const image = new Image();
      image.src = new URL(atlasPage.image, response.url).toString();
      await image.decode();
      const canvas = document.createElement('canvas');
      canvas.width = asset.animations.idle.frameWidth;
      canvas.height = asset.animations.idle.frameHeight;
      const context = canvas.getContext('2d', { willReadFrequently: true })!;
      context.drawImage(image, frame.column * canvas.width, frame.row * canvas.height, canvas.width, canvas.height,
        0, 0, canvas.width, canvas.height);
      const pixels = context.getImageData(0, 0, canvas.width, canvas.height).data;
      let transparent = 0;
      let opaque = 0;
      for (let index = 3; index < pixels.length; index += 4) {
        if (pixels[index] === 0) transparent += 1;
        if (pixels[index]! > 200) opaque += 1;
      }
      return { page: frame.page, imageUrl: image.src, transparent, opaque };
    });
    expect(sanity.page).toBe('idle-s-p01');
    expect(sanity.imageUrl).toContain('/game/sprites/companions/muse/muse.idle.s.p01.png');
    expect(sanity.transparent).toBeGreaterThan(30_000);
    expect(sanity.opaque).toBeGreaterThan(2_000);
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
    await expect.poll(async () => Number(await canvas.getAttribute('data-camera-yaw'))).toBeCloseTo(0, 3);
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
    await expect(canvas).toHaveAttribute('data-local-sprite-load', /^(loaded|fallback)$/);
    await expect(canvas).toHaveAttribute('data-sprite-assets', /^[1-9]\d*$/);
    await page.keyboard.down('KeyD');
    await expect.poll(() => canvas.getAttribute('data-local-animation')).toBe('walk');
    await page.keyboard.up('KeyD');
    await expect.poll(() => canvas.getAttribute('data-local-animation')).toBe('idle');
    await expect(canvas).toHaveAttribute('data-animation-update-ms', /^\d+\.\d+$/);
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
    await expect(page.locator('canvas[data-renderer="three"]')).toHaveAttribute('data-sprite-assets', /^[1-9]\d*$/);
  });
});
