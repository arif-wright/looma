import { expect, test } from '@playwright/test';

test('unmount during a delayed renderer import cannot install stale observers or listeners', async ({ page }, testInfo) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('console', (message) => { if (message.type() === 'error') errors.push(message.text()); });
  const blocked: string[] = [];
  const sockets: string[] = [];
  page.on('websocket', (socket) => sockets.push(socket.url()));
  page.on('response', (response) => {
    if (!response.ok() && new URL(response.url()).pathname.startsWith('/game/')) errors.push(`Asset ${response.status()}: ${response.url()}`);
  });
  await page.route('**/*', (route) => {
    const origin = new URL(route.request().url()).origin;
    if (origin === 'http://127.0.0.1:4178') return route.continue();
    blocked.push(origin);
    return route.abort('blockedbyclient');
  });
  await page.addInitScript(() => {
    const state = { lateObserves: 0, visibility: new Set<EventListenerOrEventListenerObject>(), removed: false };
    (window as any).__MOUNT_PROBE__ = state;
    const NativeObserver = window.ResizeObserver;
    window.ResizeObserver = class extends NativeObserver {
      observe(target: Element, options?: ResizeObserverOptions) {
        if (state.removed) state.lateObserves++;
        super.observe(target, options);
      }
    };
    const add = document.addEventListener.bind(document);
    const remove = document.removeEventListener.bind(document);
    document.addEventListener = ((type: string, listener: EventListenerOrEventListenerObject, options: any) => {
      if (type === 'visibilitychange') state.visibility.add(listener);
      add(type, listener, options);
    }) as typeof document.addEventListener;
    document.removeEventListener = ((type: string, listener: EventListenerOrEventListenerObject, options: any) => {
      if (type === 'visibilitychange') state.visibility.delete(listener);
      remove(type, listener, options);
    }) as typeof document.removeEventListener;
  });
  let release!: () => void;
  let started!: () => void;
  const gated = new Promise<void>((resolve) => { release = resolve; });
  const imported = new Promise<void>((resolve) => { started = resolve; });
  const renderer = testInfo.project.metadata.renderer;
  const path = renderer === 'three' ? '**/src/lib/game/renderers/three/threeWorld.ts*' : '**/src/lib/game/worldGame.ts*';
  await page.route(path, async (route) => {
    started();
    await gated;
    await route.continue();
  });
  await page.goto(`/?renderer=${renderer}`, { waitUntil: 'domcontentloaded' });
  await imported;
  await page.getByRole('button', { name: 'Unmount fixture', exact: true }).click();
  await expect(page.getByTestId('world-game-mount')).toHaveCount(0);
  await page.evaluate(() => { (window as any).__MOUNT_PROBE__.removed = true; });
  release();
  await page.waitForLoadState('networkidle');
  await expect.poll(() => page.evaluate(() => window.__MOONBERRY_FIXTURE__.liveRooms)).toBe(0);
  expect(await page.evaluate(() => (window as any).__MOUNT_PROBE__.lateObserves)).toBe(0);
  await expect.poll(() => page.evaluate(() => (window as any).__MOUNT_PROBE__.visibility.size)).toBe(0);
  expect(await page.evaluate(() => Boolean((globalThis as any)[Symbol.for('memvoya.world.runtime')]))).toBe(false);
  await page.evaluate(() => { (window as any).__MOUNT_PROBE__.removed = false; });
  await page.getByRole('button', { name: 'Mount fixture', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Gather Moonberry', exact: true })).toBeEnabled();
  await expect(page.locator('canvas')).toHaveCount(1);
  await expect(page.locator('canvas')).toHaveAttribute('data-local-sprite-load', 'loaded');
  const componentListeners = () => page.evaluate(() =>
    [...(window as any).__MOUNT_PROBE__.visibility].filter((listener: EventListener) => listener.name === 'handleVisibility').length);
  await expect.poll(componentListeners).toBe(1);
  await page.getByRole('button', { name: 'Unmount fixture', exact: true }).click();
  await expect(page.locator('canvas')).toHaveCount(0);
  // The installed Phaser core retains its own onChange listener after ordinary
  // game disposal. This regression owns the component listener, not library internals.
  await expect.poll(componentListeners).toBe(0);
  expect(await page.evaluate(() => window.__MOONBERRY_FIXTURE__.liveRooms)).toBe(0);
  expect(await page.evaluate(() => Boolean((globalThis as any)[Symbol.for('memvoya.world.runtime')]))).toBe(false);
  expect(blocked).toEqual([]);
  expect(sockets.filter((url) => {
    const socket = new URL(url);
    return socket.origin !== 'ws://127.0.0.1:4178' || socket.pathname !== '/';
  })).toEqual([]);
  expect(errors).toEqual([]);
});
