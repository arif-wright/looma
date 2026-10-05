import type { Page } from '@playwright/test';
import { test, expect, calls, capture, phase, start, back, openLifecycle } from './guard';

type FullscreenMode = 'supported' | 'reject' | 'unsupported' | 'delayed';
type FullscreenProbe = { requests: number; exits: number; current: Element | null; release: () => void };
declare global { interface Window { __neonRunFullscreen: FullscreenProbe } }

// These cases replace only the native browser API. They prove shell handling,
// never real platform fullscreen support, permission behavior or orientation.
async function mockFullscreen(page: Page, mode: FullscreenMode) {
  await page.addInitScript((behavior) => {
    const state: FullscreenProbe = { requests: 0, exits: 0, current: null, release: () => {} };
    window.__neonRunFullscreen = state;
    Object.defineProperty(document, 'fullscreenEnabled', { configurable: true, value: behavior !== 'unsupported' });
    Object.defineProperty(document, 'fullscreenElement', { configurable: true, get: () => state.current });
    Object.defineProperty(Element.prototype, 'requestFullscreen', { configurable: true,
      value: behavior === 'unsupported' ? undefined : function (this: Element) {
        state.requests++;
        if (behavior === 'reject') return Promise.reject(new DOMException('Synthetic fullscreen denial', 'NotAllowedError'));
        const target = this;
        const grant = () => { state.current = target; document.dispatchEvent(new Event('fullscreenchange')); };
        if (behavior === 'delayed') return new Promise<void>((resolve) => { state.release = () => { grant(); resolve(); }; });
        grant(); return Promise.resolve();
      }
    });
    Object.defineProperty(document, 'exitFullscreen', { configurable: true,
      value: behavior === 'unsupported' ? undefined : async () => {
        state.exits++; state.current = null; document.dispatchEvent(new Event('fullscreenchange'));
      }
    });
  }, mode);
}

async function checkGeometry(page: Page) {
  await expect(page.getByTestId('neon-run-canvas')).toHaveAttribute('width', '960');
  await expect(page.getByTestId('neon-run-canvas')).toHaveAttribute('height', '540');
}

async function enterPausedFullscreen(page: Page) {
  await openLifecycle(page); await start(page);
  await page.getByRole('button', { name: 'Pause', exact: true }).click(); await phase(page, 'paused');
  await page.getByRole('button', { name: 'Fullscreen', exact: true }).click();
  await expect(page.getByTestId('neon-run-game')).toHaveAttribute('data-focused', 'true');
  await expect(page.getByTestId('neon-run-game')).toHaveAttribute('data-fullscreen', 'true');
}

test('REAL ENGINE: focused layout preserves paused state, logical geometry and Resume focus', async ({ page }, info) => {
  await page.goto('/app/games/runner'); await start(page);
  await page.getByRole('button', { name: 'Pause', exact: true }).click(); await phase(page, 'paused');
  const paused = await page.evaluate(() => window.__neonRunFixture.readEngineState());
  const shell = page.getByTestId('neon-run-game');
  await page.getByRole('button', { name: 'Focus view', exact: true }).click();
  await expect(shell).toHaveAttribute('data-focused', 'true'); await checkGeometry(page);
  await page.waitForTimeout(140);
  expect(await page.evaluate(() => window.__neonRunFixture.readEngineState())).toEqual(paused);
  await phase(page, 'paused'); await capture(page, info, 'focus-view-paused');
  await page.getByRole('button', { name: 'Exit focus view', exact: true }).click();
  await expect(shell).toHaveAttribute('data-focused', 'false'); await checkGeometry(page);
  expect(await page.evaluate(() => window.__neonRunFixture.readEngineState())).toEqual(paused);
  await phase(page, 'paused');
  await page.getByRole('button', { name: 'Resume', exact: true }).click(); await phase(page, 'playing');
  await expect(page.getByTestId('neon-run-canvas')).toBeFocused();
  await expect.poll(() => page.evaluate(() => window.__neonRunFixture.engineState!.elapsedMs)).toBeGreaterThan(paused!.elapsedMs);
  expect(await calls(page, 'start')).toHaveLength(1); expect(await calls(page, 'complete')).toHaveLength(0);
  await back(page);
});

test('rotation hint is nonblocking; focus view never auto-starts or requests fullscreen', async ({ page }, info) => {
  await mockFullscreen(page, 'supported'); await openLifecycle(page);
  const portrait = page.viewportSize()!.height > page.viewportSize()!.width;
  const hint = page.getByText('For a closer view, turn your phone sideways.', { exact: true });
  if (portrait) await expect(hint).toBeVisible(); else await expect(hint).toBeHidden();
  await page.getByRole('button', { name: 'Focus view', exact: true }).click();
  await expect(page.getByTestId('neon-run-game')).toHaveAttribute('data-focused', 'true');
  await phase(page, 'ready'); await checkGeometry(page);
  expect(await calls(page, 'start')).toHaveLength(0);
  expect(await page.evaluate(() => window.__neonRunFullscreen.requests)).toBe(0);
  await capture(page, info, 'ready-focus-optional');
  await page.getByRole('button', { name: 'Start run', exact: true }).click(); await phase(page, 'playing');
  expect(await calls(page, 'start')).toHaveLength(1); await back(page);
});

test('SYNTHETIC FULLSCREEN API: enter, explicit exit and owned cleanup on Back', async ({ page }, info) => {
  await mockFullscreen(page, 'supported'); await enterPausedFullscreen(page);
  const paused = await page.evaluate(() => window.__neonRunFixture.readEngineState());
  await checkGeometry(page); await phase(page, 'paused');
  await capture(page, info, 'synthetic-fullscreen-owned');
  await page.getByRole('button', { name: 'Exit fullscreen', exact: true }).click();
  await expect(page.getByTestId('neon-run-game')).toHaveAttribute('data-fullscreen', 'false');
  expect(await page.evaluate(() => window.__neonRunFullscreen.exits)).toBe(1);
  expect(await page.evaluate(() => window.__neonRunFixture.readEngineState())).toEqual(paused);
  await page.getByRole('button', { name: 'Fullscreen', exact: true }).click();
  await expect(page.getByTestId('neon-run-game')).toHaveAttribute('data-fullscreen', 'true');
  await back(page);
  await expect.poll(() => page.evaluate(() => window.__neonRunFullscreen.exits)).toBe(2);
  expect(await page.evaluate(() => window.__neonRunFullscreen.current === null)).toBe(true);
  await page.goBack(); await phase(page, 'ready');
  await expect(page.getByTestId('neon-run-game')).toHaveAttribute('data-focused', 'false');
  await expect(page.getByTestId('neon-run-game')).toHaveAttribute('data-fullscreen', 'false');
});

test('SYNTHETIC FULLSCREEN API: rejection leaves usable focused layout and paused game', async ({ page }, info) => {
  await mockFullscreen(page, 'reject'); await openLifecycle(page); await start(page);
  await page.getByRole('button', { name: 'Pause', exact: true }).click(); await phase(page, 'paused');
  const paused = await page.evaluate(() => window.__neonRunFixture.readEngineState());
  await page.getByRole('button', { name: 'Fullscreen', exact: true }).click();
  await expect(page.getByTestId('neon-run-game')).toHaveAttribute('data-focused', 'true');
  await expect(page.getByTestId('neon-run-game')).toHaveAttribute('data-fullscreen', 'false');
  await phase(page, 'paused'); await checkGeometry(page);
  expect(await page.evaluate(() => window.__neonRunFullscreen.requests)).toBe(1);
  expect(await page.evaluate(() => window.__neonRunFixture.readEngineState())).toEqual(paused);
  await expect(page.getByText('Fullscreen isn’t available here. Focus view is open.', { exact: true })).toBeVisible();
  await capture(page, info, 'synthetic-fullscreen-rejected-focus-fallback');
  await page.getByRole('button', { name: 'Resume', exact: true }).click(); await phase(page, 'playing');
  await expect(page.getByTestId('neon-run-canvas')).toBeFocused(); await back(page);
});

test('SYNTHETIC FULLSCREEN API: unsupported browser keeps optional focus controls', async ({ page }, info) => {
  await mockFullscreen(page, 'unsupported'); await openLifecycle(page);
  await expect(page.getByRole('button', { name: 'Fullscreen', exact: true })).toHaveCount(0);
  await page.getByRole('button', { name: 'Focus view', exact: true }).click();
  await expect(page.getByTestId('neon-run-game')).toHaveAttribute('data-focused', 'true');
  await phase(page, 'ready'); await checkGeometry(page);
  await capture(page, info, 'synthetic-fullscreen-unsupported');
  await page.getByRole('button', { name: 'Exit focus view', exact: true }).click();
  await expect(page.getByTestId('neon-run-game')).toHaveAttribute('data-focused', 'false');
  expect(await calls(page, 'start')).toHaveLength(0);
});

test('SYNTHETIC FULLSCREEN API: direct route unmount releases this shell fullscreen', async ({ page }) => {
  await mockFullscreen(page, 'supported'); await enterPausedFullscreen(page);
  // Fixture-only navigation bypasses the shell's Back handler to exercise onDestroy.
  await page.evaluate(() => { history.pushState({}, '', '/app/games'); window.dispatchEvent(new Event('fixture:navigation')); });
  await expect(page.getByRole('heading', { name: 'Play', exact: true })).toBeVisible();
  await expect.poll(() => page.evaluate(() => window.__neonRunFullscreen.exits)).toBe(1);
  expect(await page.evaluate(() => window.__neonRunFullscreen.current === null)).toBe(true);
  expect(await page.evaluate(() => window.__neonRunFixture.engineEvents)).toContain('lifecycle:destroy');
  expect(await calls(page, 'complete')).toHaveLength(0);
});

test('SYNTHETIC FULLSCREEN API: late grant after leaving is released without reopening the game', async ({ page }) => {
  await mockFullscreen(page, 'delayed'); await openLifecycle(page);
  await page.getByRole('button', { name: 'Fullscreen', exact: true }).click();
  await expect.poll(() => page.evaluate(() => window.__neonRunFullscreen.requests)).toBe(1);
  await back(page);
  await page.evaluate(() => window.__neonRunFullscreen.release());
  await expect.poll(() => page.evaluate(() => window.__neonRunFullscreen.exits)).toBe(1);
  expect(await page.evaluate(() => window.__neonRunFullscreen.current === null)).toBe(true);
  await expect(page.getByRole('heading', { name: 'Play', exact: true })).toBeVisible();
  expect(await calls(page, 'start')).toHaveLength(0);
});

test('SYNTHETIC FULLSCREEN API: leaving does not exit another element fullscreen', async ({ page }) => {
  await mockFullscreen(page, 'supported'); await openLifecycle(page);
  await page.evaluate(() => {
    window.__neonRunFullscreen.current = document.body;
    document.dispatchEvent(new Event('fullscreenchange'));
  });
  await back(page);
  expect(await page.evaluate(() => window.__neonRunFullscreen.exits)).toBe(0);
  expect(await page.evaluate(() => window.__neonRunFullscreen.current === document.body)).toBe(true);
});


test('SYNTHETIC FULLSCREEN API: exiting focus cancels a pending grant without changing ready state', async ({ page }) => {
  await mockFullscreen(page, 'delayed'); await openLifecycle(page);
  await page.getByRole('button', { name: 'Fullscreen', exact: true }).click();
  await expect.poll(() => page.evaluate(() => window.__neonRunFullscreen.requests)).toBe(1);
  await page.getByRole('button', { name: 'Exit focus view', exact: true }).click();
  await expect(page.getByTestId('neon-run-game')).toHaveAttribute('data-focused', 'false');
  await page.evaluate(() => window.__neonRunFullscreen.release());
  await expect.poll(() => page.evaluate(() => window.__neonRunFullscreen.exits)).toBe(1);
  await expect(page.getByTestId('neon-run-game')).toHaveAttribute('data-fullscreen', 'false');
  await expect(page.getByTestId('neon-run-game')).toHaveAttribute('data-focused', 'false');
  await phase(page, 'ready'); await checkGeometry(page);
  expect(await calls(page, 'start')).toHaveLength(0);
});
