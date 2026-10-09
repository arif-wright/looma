import { test as base, expect, type Page, type Route } from '@playwright/test';
import { isExpectedConsoleError, TITLES } from './cases.mjs';
import { EXPECTED_REWARD_MUTATIONS } from './protocol.mjs';
import { readFileSync } from 'node:fs';
const assets = JSON.parse(readFileSync(new URL('./asset-paths.json', import.meta.url), 'utf8')) as string[];
const ORIGIN = 'http://127.0.0.1:4281';
export const test = base.extend<{ isolation: void }>({
  isolation: [async ({ context, page, browser }, use, info) => {
    const blocked: string[] = [], errors: string[] = [], cleanupErrors: string[] = [];
    const consoleErrors: Array<{ text: string; url: string }> = [];
    page.on('pageerror', error => errors.push(error.message));
    page.on('console', message => { if (message.type() === 'error') consoleErrors.push({ text: message.text(), url: message.location().url }); });
    await context.route('**/*', async route => {
      const request = route.request(), url = new URL(request.url());
      const pathAllowed = ['/', '/preview'].includes(url.pathname) ||
        /^\/assets\/[a-zA-Z0-9_.-]+\.(?:js|css)$/.test(url.pathname) || assets.includes(url.pathname);
      if (url.origin !== ORIGIN || !['GET', 'HEAD'].includes(request.method()) || !pathAllowed || url.search) {
        blocked.push(`${request.method()} ${url.href}`); await route.abort(); return;
      }
      await route.continue();
    });
    await context.routeWebSocket('**/*', socket => { blocked.push(`WebSocket ${socket.url()}`); socket.close(); });
    // Use the native clock. In particular, the page's actual 30s timer must not
    // share a virtual-clock simulation with Phaser's real requestAnimationFrame.
    await use();
    let state = null, afterCleanup = null;
    try {
      if (!page.isClosed()) {
        state = await snapshot(page);
        await page.evaluate(() => window.__arpgFixture.unmountAll());
        await expect.poll(async () => (await snapshot(page)).scenes.every(scene => scene.destroyed)).toBe(true);
        afterCleanup = await snapshot(page);
      }
    } catch (error) { cleanupErrors.push(String(error)); }
    const unexpectedConsoleErrors = consoleErrors.filter(message => !isExpectedConsoleError(info.title, message));
    await info.attach('arpg-real-engine-observations', { contentType: 'application/json',
      body: JSON.stringify({ browserVersion: browser.version(), state, afterCleanup, blocked, errors,
        consoleErrors, unexpectedConsoleErrors, cleanupErrors }, null, 2) });
    expect(cleanupErrors, 'Cleanup must finish and preserve evidence').toEqual([]);
    expect(unexpectedConsoleErrors, 'Only the case-specific injected image errors are expected').toEqual([]);
    expect(state, 'Runtime snapshot required').not.toBeNull();
    expect(state?.blocked, 'No forbidden in-memory API/reward call').toEqual([]);
    if (info.title !== TITLES[10]) expect(state?.rewardMutations, 'No XP, reward or ritual mutation').toEqual([]);
    else {
      expect(state?.profile).toBe('return-flow');
      expect(state?.rewardMutations).toEqual(EXPECTED_REWARD_MUTATIONS);
    }
    expect(afterCleanup?.authCallbacks, 'Unmount removes Auth subscriptions').toBe(0);
    expect(afterCleanup?.canvasCount, 'Unmount removes all canvases').toBe(0);
    expect(blocked, 'No off-origin requests, API network traffic or WebSockets').toEqual([]);
    expect(errors, 'No unrelated uncaught page errors').toEqual([]);
  }, { auto: true }]
});
export { expect };
export const snapshot = (page: Page) => page.evaluate(() => window.__arpgFixture.snapshot());
export const screen = (page: Page, id = 1) => page.locator(`[data-fixture-page="${id}"]`);
export const starts = async (page: Page) => (await snapshot(page)).api.filter(call => call.path === '/api/games/session/start');
export const open = async (page: Page) => {
  await page.goto('/preview');
  await expect.poll(async () => (await snapshot(page)).ready).toBe(true);
};
export const initializing = async (page: Page, id = 1) => {
  await expect(screen(page, id).getByRole('button', { name: 'Loading town…', exact: true })).toBeDisabled();
  await expect(screen(page, id).locator('.game-status')).toHaveText('Loading Lantern Square…');
};
export const town = async (page: Page, id = 1) => {
  await expect(screen(page, id).locator('.game-status')).toHaveText('Town is untimed. Depart when you’re ready.');
  await expect.poll(async () => {
    const scenes = (await snapshot(page)).scenes.filter(scene => scene.pageId === id && !scene.destroyed);
    return scenes.length === 1 && scenes[0]!.createAt !== null && scenes[0]!.decodedKeys.length === 249 &&
      scenes[0]!.missingKeys.length === 0 && scenes[0]!.framesAfterCreate > 0 &&
      scenes[0]!.gameplay?.area === 0 && scenes[0]!.gameplay?.expeditionActive === false;
  }).toBe(true);
};
export const expedition = async (page: Page, id = 1) => {
  await expect(screen(page, id).locator('.game-status')).toHaveText('Expedition in progress. Return to town to save your result.');
  await expect.poll(async () => {
    const scene = (await snapshot(page)).scenes.find(scene => scene.pageId === id && !scene.destroyed);
    return scene?.gameplay?.area === 1 && scene.gameplay.expeditionActive;
  }).toBe(true);
};
export const record = (page: Page, label: string, id = 1) => page.evaluate(({ label, id }) => window.__arpgFixture.record(label, id), { label, id });
export const gameplay = async (page: Page, id = 1) => {
  // Poll only the real gameplay observation, not all 249 texture keys, API
  // bodies and accumulated checkpoints on every browser round trip.
  const state = await page.evaluate(id => window.__arpgFixture.scenes.find(scene => scene.pageId === id && !scene.destroyed)?.gameplay ?? null, id);
  expect(state).not.toBeNull();
  return state!;
};
export const clickControl = async (page: Page, control: 'primary' | 'secondary', label: string, id = 1) => {
  await screen(page, id).locator('canvas').scrollIntoViewIfNeeded();
  const button = (await gameplay(page, id))[control];
  expect(button.label).toBe(label);
  await screen(page, id).locator('canvas').click({ position: { x: button.x, y: button.y } });
};
export const failed = async (page: Page) => {
  await expect(screen(page).locator('.game-status')).toHaveText('Town could not load. No expedition session was started.');
  await expect(screen(page).getByRole('button', { name: 'Retry loading town', exact: true })).toBeEnabled();
};
export const HOLD_PATH = '/games/arpg/tiles/ground_stone1.png';
export const holdFirstImage = async (page: Page) => {
  let held: Route | null = null;
  let reached!: () => void;
  const requested = new Promise<void>(resolve => { reached = resolve; });
  let seen = 0;
  await page.route(`${ORIGIN}${HOLD_PATH}`, async route => {
    if (++seen === 1) { held = route; reached(); return; }
    await route.fallback();
  });
  return { requested, async release() { if (held) { const route = held; held = null; await route.fallback(); } } };
};
