import { test, expect, calls, capture } from './guard';

test('SKIN: decoded artwork, real engine, stable geometry after orientation change', async ({ page }, info) => {
  await page.goto('/app/games/dodge');
  const shell = page.getByTestId('orbfield-game');
  await expect(shell).toHaveAttribute('data-art-state', 'ready');
  await expect(page.getByRole('img', { name: 'Muse, a little lavender dragon' })).toBeVisible();
  await capture(page, info, 'moonlit-intro-loaded');
  await page.getByRole('button', { name: 'Start round', exact: true }).click();
  await expect(shell).toHaveAttribute('data-phase', 'playing');
  await expect.poll(() => page.evaluate(() => window.__orbfieldFixture.engineState?.elapsedMs ?? 0)).toBeGreaterThan(1100);
  await page.getByRole('button', { name: 'Pause', exact: true }).click();
  const canvas = page.getByTestId('orbfield-canvas');
  const pixels = await canvas.evaluate((element: HTMLCanvasElement) => {
    const values = element.getContext('2d')!.getImageData(0, 0, element.width, element.height).data;
    const colors = new Set<string>();
    for (let i = 0; i < values.length; i += 64) colors.add(`${values[i]},${values[i + 1]},${values[i + 2]}`);
    return colors.size;
  });
  expect(pixels, 'actual decoded painted background reached the real canvas').toBeGreaterThan(500);
  const state = await page.evaluate(() => window.__orbfieldFixture.engineState);
  await capture(page, info, 'moonlit-real-engine-paused');
  const original = page.viewportSize()!;
  await page.setViewportSize({ width: original.height, height: original.width });
  await expect(canvas).toHaveAttribute('width', '960');
  await expect(canvas).toHaveAttribute('height', '540');
  expect(await page.evaluate(() => window.__orbfieldFixture.engineState)).toEqual(state);
  await capture(page, info, 'moonlit-orientation-stable');
});

test('SKIN: reduced-motion warp remains readable with persistent text', async ({ page }, info) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/app/games/dodge');
  await expect(page.getByTestId('orbfield-game')).toHaveAttribute('data-art-state', 'ready');
  await page.getByRole('button', { name: 'Start round', exact: true }).click();
  await page.getByRole('button', { name: /time warp/i }).click();
  await expect(page.getByRole('button', { name: /time warp/i })).toContainText('Time warp active');
  await page.getByRole('button', { name: 'Pause', exact: true }).click();
  expect(await page.evaluate(() => matchMedia('(prefers-reduced-motion: reduce)').matches)).toBe(true);
  await capture(page, info, 'moonlit-reduced-motion-warp');
});

test('SKIN: failed artwork uses a playable bounded fallback', async ({ page }, info) => {
  await page.route('**/games/dodge/skins/moonlit/*', (route) => route.abort('failed'));
  await page.goto('/app/games/dodge');
  await expect(page.getByTestId('orbfield-game')).toHaveAttribute('data-art-state', 'fallback');
  await page.getByRole('button', { name: 'Start round', exact: true }).click();
  await expect(page.getByTestId('orbfield-game')).toHaveAttribute('data-phase', 'playing');
  await page.getByRole('button', { name: 'Pause', exact: true }).click();
  expect(await calls(page, 'start')).toHaveLength(1);
  await capture(page, info, 'moonlit-art-failure-fallback');
});

test('SKIN: leave during preload never creates a late server session', async ({ page }) => {
  // Freeze before app mount so slow CI cannot hit the real four-second timeout first.
  await page.clock.install({ time: 0 });
  await page.clock.pauseAt(1000);
  const release: Array<() => Promise<void>> = [];
  await page.route('**/games/dodge/skins/moonlit/*', (route) => new Promise<void>((resolve) => {
    release.push(async () => { try { await route.fulfill({ status: 404, body: '' }); } catch { /* Navigation canceled request. */ } resolve(); });
  }));
  await page.goto('/app/games/dodge', { waitUntil: 'domcontentloaded' });
  await expect.poll(() => release.length).toBe(4);
  await page.getByRole('button', { name: 'Start round', exact: true }).click();
  await expect(page.getByTestId('orbfield-game')).toHaveAttribute('data-phase', 'starting');
  expect(await calls(page, 'start')).toHaveLength(0);
  await page.getByRole('button', { name: /back to play/i }).first().click();
  await expect(page.getByRole('heading', { name: 'Play', exact: true })).toBeVisible();
  await Promise.all(release.map((unblock) => unblock()));
  await page.clock.fastForward(5000);
  expect(await calls(page, 'start')).toHaveLength(0);
  expect(await page.evaluate(() => window.__orbfieldFixture.engineEvents)).toEqual([]);
});
