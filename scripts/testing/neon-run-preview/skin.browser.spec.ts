import { test, expect, calls, capture, phase, start, back } from './guard';

test('SKIN: decoded Lanternway art reaches the actual engine without changing geometry', async ({ page }, info) => {
  await page.goto('/app/games/runner');
  await expect(page.getByTestId('neon-run-game')).toHaveAttribute('data-art-state', 'ready');
  await capture(page, info, 'lanternway-ready'); await start(page);
  expect(await page.evaluate(() => window.__neonRunFixture.engineOptions)).toMatchObject({ skinLoaded: true, reducedMotion: false, maxDurationMs: 60000 });
  await expect.poll(() => page.evaluate(() => window.__neonRunFixture.engineState?.elapsedMs ?? 0)).toBeGreaterThan(0);
  await page.getByRole('button', { name: 'Pause', exact: true }).click(); await phase(page, 'paused');
  const canvas = page.getByTestId('neon-run-canvas');
  await expect(canvas).toHaveAttribute('width', '960'); await expect(canvas).toHaveAttribute('height', '540');
  expect(await canvas.evaluate((element: HTMLCanvasElement) => {
    const pixels = element.getContext('2d')!.getImageData(0, 0, element.width, element.height).data;
    return pixels.some((value, index) => index % 4 !== 3 && value > 20);
  }), 'Real renderer produced nonblank canvas pixels').toBe(true);
  expect(await page.evaluate(() => window.__neonRunFixture.drawnImages)).toEqual(expect.arrayContaining([
    '/games/runner/skins/lanternway/background.webp', '/games/runner/skins/lanternway/ground.webp',
    '/games/runner/skins/lanternway/adventurer.webp', '/games/runner/skins/lanternway/echo.webp'
  ]));
  await capture(page, info, 'lanternway-real-engine-paused'); await back(page);
});

test('SKIN: reduced-motion preference reaches real renderer and preserves keyboard gameplay', async ({ page }, info) => {
  await page.emulateMedia({ reducedMotion: 'reduce' }); await page.goto('/app/games/runner');
  await expect(page.getByTestId('neon-run-game')).toHaveAttribute('data-art-state', 'ready');
  await start(page);
  expect(await page.evaluate(() => window.__neonRunFixture.engineOptions)).toMatchObject({ reducedMotion: true, skinLoaded: true });
  await page.keyboard.press('ArrowUp');
  await expect.poll(() => page.evaluate(() => window.__neonRunFixture.engineState!.onGround)).toBe(false);
  await page.getByRole('button', { name: 'Pause', exact: true }).click(); await phase(page, 'paused');
  await capture(page, info, 'lanternway-reduced-motion-jump'); await back(page);
});

test('SKIN: failed assets retain playable fallback, fixed geometry and actual controls', async ({ page }, info) => {
  await page.route('**/games/runner/skins/lanternway/*', (route) => route.abort('failed'));
  await page.goto('/app/games/runner');
  await expect(page.getByTestId('neon-run-game')).toHaveAttribute('data-art-state', 'fallback');
  await start(page);
  expect(await page.evaluate(() => window.__neonRunFixture.engineOptions?.skinLoaded)).toBe(false);
  const canvas = page.getByTestId('neon-run-canvas');
  await expect(canvas).toHaveAttribute('width', '960'); await expect(canvas).toHaveAttribute('height', '540');
  await page.getByRole('button', { name: 'Jump', exact: true }).tap();
  await expect.poll(() => page.evaluate(() => window.__neonRunFixture.engineState!.onGround)).toBe(false);
  await page.getByRole('button', { name: 'Pause', exact: true }).click(); await phase(page, 'paused');
  expect(await calls(page, 'start')).toHaveLength(1); expect(await calls(page, 'complete')).toHaveLength(0);
  await capture(page, info, 'lanternway-failed-assets-fallback'); await back(page);
});

test('SKIN: leaving during held preload aborts without late session or engine creation', async ({ page }) => {
  // Freeze only this preload-lifecycle case, before mount. No gameplay claim uses a fake clock.
  await page.clock.install({ time: 0 }); await page.clock.pauseAt(1000);
  const release: Array<() => Promise<void>> = [];
  await page.route('**/games/runner/skins/lanternway/*', (route) => new Promise<void>((resolve) => {
    release.push(async () => { try { await route.fulfill({ status: 404, body: '' }); } catch { /* Abort may already have canceled the request. */ } resolve(); });
  }));
  await page.goto('/app/games/runner', { waitUntil: 'domcontentloaded' });
  await expect.poll(() => release.length).toBeGreaterThan(0);
  await page.getByRole('button', { name: 'Start run', exact: true }).click(); await phase(page, 'starting');
  expect(await calls(page, 'start')).toHaveLength(0);
  await back(page);
  await Promise.all(release.map((unblock) => unblock())); await page.clock.fastForward(5000);
  expect(await calls(page, 'start')).toHaveLength(0); expect(await calls(page, 'complete')).toHaveLength(0);
  expect(await page.evaluate(() => window.__neonRunFixture.engineEvents)).toEqual([]);
  expect(await page.evaluate(() => window.__neonRunFixture.engineOptions)).toBeNull();
});
