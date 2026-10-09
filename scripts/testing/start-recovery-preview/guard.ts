import { test as base, expect, type Page } from '@playwright/test';
import type { Kind, Stage } from './runtime';
export const test = base.extend<{ isolatedGuard: void }>({
  isolatedGuard: [async ({ context, page }, use, info) => {
    const blocked: string[] = [], errors: string[] = [];
    page.on('pageerror', (error) => { errors.push(error.message); });
    await context.route('**/*', async (route) => {
      const request = route.request(), url = new URL(request.url());
      if (url.origin !== 'http://127.0.0.1:4279' || !['GET', 'HEAD'].includes(request.method()) || /^\/api(?:\/|$)/.test(url.pathname)) {
        blocked.push(`${request.method()} ${url.href}`); await route.abort(); return;
      }
      await route.continue();
    });
    await context.routeWebSocket('**/*', (socket) => { blocked.push(`WebSocket ${socket.url()}`); socket.close(); });
    await page.clock.install({ time: new Date('2026-10-09T00:00:00.000Z') });
    await page.clock.pauseAt(new Date('2026-10-09T00:00:01.000Z'));
    await use();
    // Record failures too. This attachment is runtime evidence only if a browser ran.
    if (!page.isClosed()) {
      const state = await page.evaluate(() => window.__startRecovery?.snapshot() ?? null);
      await info.attach('synthetic-fixture-observations', { body: JSON.stringify({ state, blocked, errors }, null, 2), contentType: 'application/json' });
      expect(state?.blocked ?? [], 'No forbidden fetch attempts').toEqual([]);
      expect(state?.playerStates ?? [], 'No local XP/wallet mutation').toEqual([]);
    }
    expect(blocked, 'No external requests, API network requests or WebSockets').toEqual([]);
    expect(errors, 'No uncaught page errors').toEqual([]);
  }, { auto: true }]
});
export { expect };
export const snapshot = (page: Page) => page.evaluate(() => window.__startRecovery.snapshot());
export const shell = (page: Page, kind: Kind) => page.getByTestId(kind === 'neon' ? 'neon-run-game' : 'orbfield-game');
export const phase = (page: Page, kind: Kind, state: string) => expect(shell(page, kind)).toHaveAttribute('data-phase', state);
export const startLabel = (kind: Kind) => kind === 'neon' ? 'Start run' : 'Start round';
export const newLabel = (kind: Kind) => kind === 'neon' ? 'Start new run' : 'Start new round';
export const api = async (page: Page, path: string) => (await snapshot(page)).api.filter((call) => call.path === path);
export const START = '/api/games/session/start', SIGN = '/api/games/sign', COMPLETE = '/api/games/session/complete';
export const open = async (page: Page, kind: Kind, params: Record<string, string> = {}) => {
  await page.goto(`/preview?${new URLSearchParams({ game: kind, ...params })}`);
  await expect.poll(async () => (await snapshot(page)).ready).toBe(true);
  await phase(page, kind, 'ready');
  await expect.poll(async () => (await snapshot(page)).artLoaded).toBe(true);
  expect((await snapshot(page)).artComplete, 'Original checked-in artwork decoded').toBe(true);
  if (!('holdArt' in params)) await expect(shell(page, kind)).toHaveAttribute('data-art-state', 'ready');
  if (params.auth !== 'hold' && params.auth !== 'unavailable') await expect.poll(async () => (await snapshot(page)).authNotifications).toBeGreaterThan(0);
};
export const clickStart = async (page: Page, kind: Kind) => page.getByRole('button', { name: startLabel(kind), exact: true }).click();
export const pending = async (page: Page, kind: Kind, stage: Stage = 'fetch') => {
  await phase(page, kind, 'starting');
  await expect.poll(async () => (await api(page, START)).length).toBe(1);
  await expect.poll(async () => (await api(page, START))[0]?.stage).toBe(stage === 'fetch' ? 'fetch-pending' : 'body-pending');
};
export const deadline = async (page: Page, kind: Kind, stage: Stage = 'fetch') => {
  await pending(page, kind, stage); // Never advance until the SDK request/body actually entered the intended stage.
  await page.clock.runFor(29_999);
  await phase(page, kind, 'starting');
  await page.clock.runFor(1);
  await phase(page, kind, 'start-error');
  await expect.poll(async () => (await api(page, START))[0]?.aborted).toBe(true);
};
export const emitAuth = async (page: Page, event: string, owner: string | null) => page.evaluate(({ event, owner }) => window.__startRecovery.emitAuth(event, owner), { event, owner });
export const release = async (page: Page) => page.evaluate(() => window.__startRecovery.releaseStart());
export const finish = async (page: Page, kind: Kind, durationMs = 8000) => {
  await phase(page, kind, 'playing');
  await page.evaluate((durationMs) => window.__startRecovery.finish({ score: 84, durationMs, meta: {} }), durationMs);
};
export const noEngine = async (page: Page) => {
  const state = await snapshot(page);
  expect(state.engines).toHaveLength(0); expect(state.events).toHaveLength(0); expect(state.analytics).toHaveLength(0);
};
