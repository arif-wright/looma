import { test, expect, calls, capture, phase, start, back } from './guard';

test('REAL ENGINE: focused keyboard jump, pause excludes time, resume and cleanup', async ({ page }, info) => {
  await page.goto('/app/games/runner'); await start(page);
  expect(await page.evaluate(() => window.__neonRunFixture.engine)).toBe('real');
  const canvas = page.getByTestId('neon-run-canvas');
  await expect(canvas).toBeFocused();
  await expect.poll(() => page.evaluate(() => window.__neonRunFixture.engineState?.elapsedMs ?? 0)).toBeGreaterThan(0);
  const ground = await page.evaluate(() => window.__neonRunFixture.engineState!.playerY);
  await page.keyboard.press('Space');
  await expect.poll(() => page.evaluate(() => window.__neonRunFixture.engineState!.playerY)).toBeLessThan(ground);
  await page.getByRole('button', { name: 'Pause', exact: true }).click(); await phase(page, 'paused');
  const paused = await page.evaluate(() => window.__neonRunFixture.readEngineState());
  await page.waitForTimeout(160);
  expect(await page.evaluate(() => window.__neonRunFixture.readEngineState())).toEqual(paused);
  await capture(page, info, 'real-keyboard-paused');
  await page.getByRole('button', { name: 'Resume', exact: true }).click(); await phase(page, 'playing');
  await expect.poll(() => page.evaluate(() => window.__neonRunFixture.engineState!.elapsedMs)).toBeGreaterThan(paused!.elapsedMs);
  const detachedCanvas = await canvas.elementHandle();
  await back(page);
  const ended = await page.evaluate(() => window.__neonRunFixture.readEngineState());
  await detachedCanvas!.evaluate((element) => {
    element.dispatchEvent(new KeyboardEvent('keydown', { key: ' ', code: 'Space', bubbles: true, cancelable: true }));
    element.dispatchEvent(new PointerEvent('pointerdown', { pointerType: 'touch', isPrimary: true, bubbles: true, cancelable: true }));
  });
  await page.waitForTimeout(120);
  expect(await page.evaluate(() => window.__neonRunFixture.readEngineState())).toEqual(ended);
  expect(await page.evaluate(() => window.__neonRunFixture.engineEvents)).toContain('real:destroy');
  expect((await page.evaluate(() => window.__neonRunFixture.audioEvents)).at(-1)).toBe('stop:bgm');
  expect(await calls(page, 'start')).toHaveLength(1); expect(await calls(page, 'complete')).toHaveLength(0);
});

test('REAL ENGINE: mouse and touchscreen canvas jumps, fixed logical geometry and paused resize', async ({ page }, info) => {
  await page.goto('/app/games/runner'); await start(page);
  const canvas = page.getByTestId('neon-run-canvas');
  await expect(canvas).toHaveAttribute('width', '960'); await expect(canvas).toHaveAttribute('height', '540');
  await canvas.click({ position: { x: 20, y: 20 } });
  await expect.poll(() => page.evaluate(() => window.__neonRunFixture.engineState!.onGround)).toBe(false);
  await expect.poll(() => page.evaluate(() => window.__neonRunFixture.engineState!.onGround)).toBe(true);
  const bounds = await canvas.boundingBox(); if (!bounds) throw new Error('No canvas layout box.');
  await page.touchscreen.tap(bounds.x + bounds.width * .7, bounds.y + bounds.height * .5);
  await expect.poll(() => page.evaluate(() => window.__neonRunFixture.engineState!.onGround)).toBe(false);
  await page.getByRole('button', { name: 'Pause', exact: true }).click(); await phase(page, 'paused');
  const before = await page.evaluate(() => window.__neonRunFixture.readEngineState());
  const initialViewport = page.viewportSize()!;
  await capture(page, info, 'real-pointer-touch-paused');
  await page.setViewportSize({ width: 844, height: 390 });
  await expect(canvas).toHaveAttribute('width', '960'); await expect(canvas).toHaveAttribute('height', '540');
  expect(await page.evaluate(() => window.__neonRunFixture.readEngineState())).toEqual(before);
  await capture(page, info, 'real-landscape-fixed-geometry');
  await page.setViewportSize(initialViewport);
  await capture(page, info, 'real-restored-viewport'); await back(page);
  expect(await calls(page, 'complete')).toHaveLength(0);
});

test('REAL ENGINE: visible touch Jump button and background pause', async ({ page }, info) => {
  await page.goto('/app/games/runner'); await start(page);
  await page.getByRole('button', { name: 'Jump', exact: true }).tap();
  await expect.poll(() => page.evaluate(() => window.__neonRunFixture.engineState!.onGround)).toBe(false);
  await page.evaluate(() => window.dispatchEvent(new Event('blur'))); await phase(page, 'paused');
  const paused = await page.evaluate(() => window.__neonRunFixture.readEngineState());
  await page.waitForTimeout(160);
  expect(await page.evaluate(() => window.__neonRunFixture.readEngineState())).toEqual(paused);
  await page.evaluate(() => window.dispatchEvent(new Event('focus'))); await phase(page, 'paused');
  await capture(page, info, 'real-touch-control-background-paused'); await back(page);
  expect(await calls(page, 'complete')).toHaveLength(0);
});
