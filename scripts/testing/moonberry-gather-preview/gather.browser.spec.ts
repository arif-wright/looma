import { expect, test, type Page } from '@playwright/test';
import { readFileSync } from 'node:fs';
const grovePortal = JSON.parse(readFileSync(new URL('../../../services/world-server/src/world/areas.json', import.meta.url), 'utf8'))['wilds-exploration'].portal as { x: number; y: number; targetName: string };

// Exercises production UI, session, connection, and renderers against an explicitly
// synthetic transport. A success here is NOT proof of server/persistence behavior.
const pressGather = async (page: Page, expectedGathers?: number) => {
  // Phaser reads E during its update, unlike Three's keydown handler. Keep the
  // physical key held until an intended gather has actually crossed transport.
  await page.keyboard.down('e');
  try {
    if (expectedGathers !== undefined) await expect.poll(() => gatherCount(page)).toBe(expectedGathers);
    else await page.waitForTimeout(150); // Brief physical press for ignored/duplicate input.
  } finally { await page.keyboard.up('e'); }
};
const activateGather = async (page: Page) => {
  const button = page.getByRole('button', { name: 'Gather Moonberry', exact: true });
  if (await page.evaluate(() => navigator.maxTouchPoints > 0)) await button.tap();
  else await button.click();
};
const gatherCount = (page: Page) => page.evaluate(() => window.__MOONBERRY_FIXTURE__.gathers.length);
const lastId = (page: Page) => page.evaluate(() => String(window.__MOONBERRY_FIXTURE__.gathers.at(-1)!.payload.requestId));
const settle = (page: Page, requestId: string, status = 'success') => page.evaluate(({ requestId, status }) => {
  window.__MOONBERRY_FIXTURE__.current.result(requestId, status);
}, { requestId, status });
const ready = async (page: Page) => {
  await expect(page.getByText('Multiplayer connected', { exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Gather Moonberry', exact: true })).toBeEnabled();
  await expect(page.locator('canvas')).toHaveCount(1);
  await expect(page.locator('canvas')).toHaveAttribute('data-local-sprite-load', 'loaded', { timeout: 30_000 });
};
const uncertainty = async (page: Page) => {
  await expect(page.locator('.gather-result')).toContainText(/could not confirm|couldn[’']t confirm|unconfirmed|not confirmed/i);
  await expect(page.getByRole('link', { name: /View in Keepsakes/i })).toHaveAttribute('href', '/app/inventory');
  await expect(page.locator('.gather-result')).not.toContainText('Gathered 1 Moonberry');
  await expect(page.getByRole('button', { name: 'Gathering…', exact: true })).toHaveCount(0);
};

const observations = new WeakMap<Page, { errors: string[]; blocked: string[]; sockets: string[] }>();
test.beforeEach(async ({ page }, testInfo) => {
  const observed = { errors: [] as string[], blocked: [] as string[], sockets: [] as string[] };
  observations.set(page, observed);
  page.on('pageerror', (error) => observed.errors.push(error.message));
  page.on('websocket', (socket) => observed.sockets.push(socket.url()));
  page.on('response', (response) => {
    if (!response.ok() && new URL(response.url()).pathname.startsWith('/game/')) observed.errors.push(`Asset ${response.status()}: ${response.url()}`);
  });
  await page.route('**/*', async (route) => {
    const url = new URL(route.request().url());
    if (url.origin === 'http://127.0.0.1:4178') return route.continue();
    observed.blocked.push(url.origin);
    return route.abort('blockedbyclient');
  });
  // This fixture has no live transport. Advancing time below tests only the
  // production client timeout; it cannot advance a real service or reward clock.
  await page.clock.install();
  await page.goto(`/?renderer=${testInfo.project.metadata.renderer}`);
  await ready(page);
  expect(await page.evaluate(() => window.__MOONBERRY_FIXTURE__.sdk)).toBe('synthetic-colyseus-no-sockets');
  expect(await page.evaluate(() => window.__MOONBERRY_FIXTURE__.tickets)).toBe(1);
});
test.afterEach(async ({ page }) => {
  const observed = observations.get(page)!;
  expect(observed.blocked, 'No request may leave the local fixture origin').toEqual([]);
  expect(observed.sockets.filter((url) => {
    const socket = new URL(url);
    return socket.origin !== 'ws://127.0.0.1:4178' || socket.pathname !== '/';
  }), 'Only Vite’s local development socket is allowed; never an application socket').toEqual([]);
  expect(observed.errors, 'No page exceptions or failed game assets').toEqual([]);
});

test('keyboard and button share one pending gather and delayed success unlocks both', async ({ page }, testInfo) => {
  await pressGather(page, 1);
  const busy = page.getByRole('button', { name: 'Gathering…', exact: true });
  await expect(busy).toBeDisabled();
  await expect(busy).toHaveAttribute('aria-busy', 'true');
  await expect.poll(() => gatherCount(page)).toBe(1);
  const first = await lastId(page);
  await busy.dispatchEvent('click');
  await pressGather(page);
  await pressGather(page);
  expect(await gatherCount(page)).toBe(1);
  await settle(page, 'unsolicited-result');
  await expect(busy).toBeDisabled();
  await settle(page, first);
  await expect(page.locator('.gather-result')).toContainText('Gathered 1 Moonberry.');
  await expect(page.getByRole('link', { name: 'View in Keepsakes' })).toHaveAttribute('href', '/app/inventory');
  await ready(page);
  await page.screenshot({ path: testInfo.outputPath('delayed-success.png'), fullPage: true });

  // Button first, then keyboard: the shared transport guard works both ways.
  await activateGather(page);
  await expect(busy).toBeDisabled();
  await pressGather(page);
  expect(await gatherCount(page)).toBe(2);
  const second = await lastId(page);
  expect(second).not.toBe(first);
  await settle(page, first); // A duplicate/late earlier response must not unlock it.
  await expect(busy).toBeDisabled();
  await settle(page, second, 'cooldown');
  await expect(page.locator('.gather-result')).toContainText('bush is still resting');
  await ready(page);
  await activateGather(page);
  await settle(page, await lastId(page), 'inventory_full');
  await expect(page.locator('.gather-result')).toContainText('You’ve reached the Moonberry holding limit.');
  await expect(page.locator('.gather-result')).not.toContainText(/make room/i);
  await expect(page.getByRole('link', { name: 'View in Keepsakes' })).toHaveAttribute('href', '/app/inventory');
  await ready(page);
});

test('a lost response times out honestly and ignores a late success', async ({ page }, testInfo) => {
  await activateGather(page);
  const timedOut = await lastId(page);
  await expect(page.getByRole('button', { name: 'Gathering…', exact: true })).toBeDisabled();
  await page.clock.fastForward(10_050);
  await uncertainty(page);
  await ready(page);
  await settle(page, timedOut);
  await uncertainty(page);
  expect(await gatherCount(page)).toBe(1);
  await page.screenshot({ path: testInfo.outputPath('unconfirmed-timeout.png'), fullPage: true });
  await activateGather(page);
  expect(await gatherCount(page)).toBe(2);
  const fresh = await lastId(page);
  expect(fresh).not.toBe(timedOut);
  await settle(page, fresh);
  await expect(page.locator('.gather-result')).toContainText('Gathered 1 Moonberry.');
});

test('drop marks uncertainty, reconnect does not replay, and a fresh action works', async ({ page }) => {
  await pressGather(page, 1);
  await expect.poll(() => gatherCount(page)).toBe(1);
  const dropped = await lastId(page);
  await page.evaluate(() => window.__MOONBERRY_FIXTURE__.current.drop());
  await expect(page.getByText('Reconnecting…', { exact: true })).toBeVisible();
  await uncertainty(page);
  await pressGather(page);
  expect(await gatherCount(page)).toBe(1);
  await page.evaluate(() => window.__MOONBERRY_FIXTURE__.current.reconnect());
  await ready(page);
  expect(await gatherCount(page)).toBe(1);
  await settle(page, dropped);
  await uncertainty(page);
  await activateGather(page);
  const fresh = await lastId(page);
  expect(fresh).not.toBe(dropped);
  expect(await gatherCount(page)).toBe(2);
  await settle(page, fresh);
  await expect(page.locator('.gather-result')).toContainText('Gathered 1 Moonberry.');
});

test('exhausted reconnection joins a fresh room without replaying the old reward', async ({ page }) => {
  await activateGather(page);
  const abandoned = await lastId(page);
  await page.evaluate(() => {
    const room = window.__MOONBERRY_FIXTURE__.current;
    room.drop(); room.exhaust();
  });
  await expect.poll(() => page.evaluate(() => window.__MOONBERRY_FIXTURE__.rooms.length)).toBe(2);
  await ready(page);
  expect(await gatherCount(page)).toBe(1);
  await page.evaluate((id) => window.__MOONBERRY_FIXTURE__.rooms[0]!.result(id), abandoned);
  await expect(page.locator('.gather-result')).not.toContainText('Gathered 1 Moonberry');
  await pressGather(page, 2);
  await expect.poll(() => gatherCount(page)).toBe(2);
  const fresh = await lastId(page);
  expect(fresh).not.toBe(abandoned);
  expect(await page.evaluate(() => window.__MOONBERRY_FIXTURE__.gathers.at(-1)!.room)).toBe(1);
  await settle(page, fresh);
  await expect(page.locator('.gather-result')).toContainText('Gathered 1 Moonberry.');
});

test('repeated teardown rejects old outcomes and removes old keyboard listeners', async ({ page }) => {
  for (let cycle = 0; cycle < 3; cycle++) {
    await pressGather(page, cycle + 1);
    await expect.poll(() => gatherCount(page)).toBe(cycle + 1);
    const requestId = await lastId(page);
    const roomIndex = await page.evaluate(() => window.__MOONBERRY_FIXTURE__.current.index);
    await page.getByRole('button', { name: 'Unmount fixture', exact: true }).click();
    await expect(page.locator('canvas')).toHaveCount(0);
    expect(await page.evaluate(() => window.__MOONBERRY_FIXTURE__.liveRooms)).toBe(0);
    await page.evaluate(({ roomIndex, requestId }) => {
      const room = window.__MOONBERRY_FIXTURE__.rooms[roomIndex]!;
      room.result(requestId); room.drop(); room.reconnect();
    }, { roomIndex, requestId });
    await page.clock.fastForward(10_050);
    await expect(page.locator('.gather-result')).toHaveCount(0);
    await pressGather(page);
    expect(await gatherCount(page)).toBe(cycle + 1);
    await page.getByRole('button', { name: 'Mount fixture', exact: true }).click();
    await ready(page);
    expect(await page.evaluate(() => window.__MOONBERRY_FIXTURE__.liveRooms)).toBe(1);
    await expect(page.locator('.gather-result')).toHaveCount(0);
  }
});

test('authoritative proximity and both result states fit the viewport', async ({ page }, testInfo) => {
  await page.evaluate(() => window.__MOONBERRY_FIXTURE__.current.snapshot(440, 270));
  await expect(page.getByRole('button', { name: 'Gather Moonberry', exact: true })).toHaveCount(0);
  await pressGather(page);
  expect(await gatherCount(page)).toBe(0);
  await page.evaluate(() => window.__MOONBERRY_FIXTURE__.current.snapshot());
  await ready(page);
  for (const selector of ['[data-testid="world-game-mount"]', 'canvas', '.interaction-prompt']) {
    const box = await page.locator(selector).boundingBox();
    expect(box!.x).toBeGreaterThanOrEqual(0);
    expect(box!.x + box!.width).toBeLessThanOrEqual(page.viewportSize()!.width + 1);
  }
  await activateGather(page);
  await page.clock.fastForward(10_050);
  await uncertainty(page);
  const result = await page.locator('.gather-result').boundingBox();
  expect(result!.x).toBeGreaterThanOrEqual(0);
  expect(result!.x + result!.width).toBeLessThanOrEqual(page.viewportSize()!.width + 1);
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(page.viewportSize()!.width);
  await page.screenshot({ path: testInfo.outputPath('viewport-uncertainty.png'), fullPage: true });
});

test('Three feedback, gather and independent movement/camera targets never overlap', async ({ page }, testInfo) => {
  test.skip(testInfo.project.metadata.renderer !== 'three', 'Three-only layout; Phaser retains the original HUD.');
  const touch = Boolean(testInfo.project.use.hasTouch);
  const devtools = await page.context().newCDPSession(page);
  const restoreTouch = async () => {
    if (!touch) return;
    // Explicitly assert the declared device mode; never silently skip mobile checks.
    await devtools.send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 1 });
    await expect.poll(() => page.evaluate(() => navigator.maxTouchPoints > 0 && matchMedia('(pointer: coarse)').matches)).toBe(true);
  };
  await restoreTouch();
  const captureLayout = async (filename: string) => {
    await restoreTouch();
    // Keep the real viewport/media queries. Full-page captures reset Chromium's
    // touch mode; short landscape gets a second, visibly labeled controls view.
    await page.screenshot({ path: testInfo.outputPath(filename), fullPage: false });
    if (touch) await expect.poll(() => page.evaluate(() => navigator.maxTouchPoints > 0 && matchMedia('(pointer: coarse)').matches)).toBe(true);
    if (page.viewportSize()!.width > page.viewportSize()!.height) {
      const scroll = await page.evaluate(() => window.scrollY);
      await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
      await page.screenshot({ path: testInfo.outputPath(filename.replace('.png', '-controls.png')), fullPage: false });
      if (touch) await expect.poll(() => page.evaluate(() => navigator.maxTouchPoints > 0 && matchMedia('(pointer: coarse)').matches)).toBe(true);
      await page.evaluate((y) => window.scrollTo(0, y), scroll);
    }
  };
  const checkLayout = async () => {
    const selectors = ['.interaction-prompt', '.gather-result', '.camera-controls', '.touch-controls'];
    const regions = [];
    const world = (await page.getByTestId('world-game-mount').boundingBox())!;
    for (const selector of selectors) {
      if (!(await page.locator(selector).isVisible())) continue;
      const box = (await page.locator(selector).boundingBox())!;
      expect(box.x, `${selector} left`).toBeGreaterThanOrEqual(world.x);
      expect(box.x + box.width, `${selector} right`).toBeLessThanOrEqual(world.x + world.width);
      expect(box.y, `${selector} top`).toBeGreaterThanOrEqual(world.y);
      expect(box.y + box.height, `${selector} bottom`).toBeLessThanOrEqual(world.y + world.height);
      regions.push({ selector, ...box });
    }
    for (const [index, a] of regions.entries()) for (const b of regions.slice(index + 1)) {
      const width = Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x);
      const height = Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y);
      expect(width <= 0 || height <= 0, `${a.selector} overlaps ${b.selector}: ${JSON.stringify({ a, b })}`).toBe(true);
    }
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(page.viewportSize()!.width);
    for (const target of await page.locator('.camera-controls button, .camera-controls select, .touch-controls button, .interaction-prompt button, .gather-result a').all()) {
      if (!(await target.isVisible())) continue;
      await target.scrollIntoViewIfNeeded();
      expect(await target.evaluate((element) => {
        const box = element.getClientRects()[0]!;
        const hit = document.elementFromPoint(box.x + box.width / 2, box.y + box.height / 2);
        return hit === element || Boolean(hit && element.contains(hit));
      }), 'Control/link center must hit the intended target').toBe(true);
      if (touch && !(await target.evaluate((el) => el.tagName === 'A'))) {
        const box = (await target.boundingBox())!;
        expect(box.width).toBeGreaterThanOrEqual(44);
        expect(box.height).toBeGreaterThanOrEqual(44);
      }
    }
  };
  await checkLayout();
  await activateGather(page);
  await page.clock.fastForward(10_050);
  await uncertainty(page);
  await checkLayout();
  for (const name of ['Rotate camera left', 'Rotate camera right', 'Zoom camera out', 'Zoom camera in', 'Reset camera']) {
    const button = page.getByRole('button', { name, exact: true });
    for (let press = 0; press < 2; press++) {
      if (touch) await button.tap();
      else await button.click();
    }
  }
  await page.getByRole('combobox', { name: 'Camera preset' }).selectOption('wide');
  await expect(page.getByRole('combobox', { name: 'Camera preset' })).toHaveValue('wide');
  await page.getByRole('combobox', { name: 'Camera preset' }).selectOption('classic');
  const up = page.getByRole('button', { name: 'Move up', exact: true });
  if (await up.isVisible()) {
    await up.scrollIntoViewIfNeeded();
    const box = (await up.boundingBox())!;
    await devtools.send('Input.dispatchTouchEvent', { type: 'touchStart',
      touchPoints: [{ x: box.x + box.width / 2, y: box.y + box.height / 2, id: 1 }] });
    await expect(up).toHaveClass(/active/);
    await expect.poll(() => page.evaluate(() => window.__MOONBERRY_FIXTURE__.sent.some((m) => m.type === 'move' && Number(m.payload.y) < 0))).toBe(true);
    await devtools.send('Input.dispatchTouchEvent', { type: 'touchCancel', touchPoints: [] });
    await expect(up).not.toHaveClass(/active/);
    await expect.poll(() => page.evaluate(() => window.__MOONBERRY_FIXTURE__.sent.filter((m) => m.type === 'move').at(-1)?.payload.y)).toBe(0);
    await page.evaluate(() => window.__MOONBERRY_FIXTURE__.current.snapshot());
    await ready(page);
  }
  await activateGather(page);
  await settle(page, await lastId(page));
  await checkLayout();
  await page.evaluate(() => window.scrollTo(0, 0));
  await captureLayout('separate-mobile-controls.png');
  await restoreTouch();
  // The link remains a real, keyboard-accessible navigation target after feedback.
  await page.getByRole('link', { name: 'View in Keepsakes' }).focus();
  await expect(page.getByRole('link', { name: 'View in Keepsakes' })).toBeFocused();
  const portal = grovePortal;
  await page.evaluate(({ x, y }) => window.__MOONBERRY_FIXTURE__.current.snapshot(x, y), portal);
  await expect(page.getByRole('button', { name: `Enter ${portal.targetName}`, exact: true })).toBeVisible();
  await checkLayout();
  if (touch) {
    const landscape = page.viewportSize()!.width > page.viewportSize()!.height;
    const insets = { top: 0, left: landscape ? 32 : 0, right: landscape ? 32 : 0, bottom: landscape ? 21 : 34 };
    await devtools.send('Emulation.setSafeAreaInsetsOverride', { insets });
    await expect.poll(() => page.getByTestId('world-game-mount').evaluate((element) =>
      parseFloat(getComputedStyle(element).minHeight))).toBe((landscape ? 304 : 400) + insets.bottom);
    await checkLayout();
    await page.evaluate(() => window.scrollTo(0, 0));
    await captureLayout('safe-area-mobile-controls.png');
    await devtools.send('Emulation.setSafeAreaInsetsOverride', { insets: { top: 0, left: 0, right: 0, bottom: 0 } });
    await restoreTouch();
  }
  // Follow the real link into a clearly synthetic destination, then exercise history.
  // This checks navigation only, never an authenticated inventory or saved reward.
  await page.route('**/app/inventory', (route) => route.fulfill({ contentType: 'text/html',
    body: '<!doctype html><title>Synthetic Keepsakes destination</title><p>Local Keepsakes link target only. No inventory or saved rewards.</p>' }));
  const link = page.getByRole('link', { name: 'View in Keepsakes' });
  if (touch) await link.tap();
  else await link.click();
  await expect(page).toHaveURL('http://127.0.0.1:4178/app/inventory');
  await expect(page.getByText('Local Keepsakes link target only. No inventory or saved rewards.')).toBeVisible();
  await page.goBack();
  await ready(page);
  await expect(page.locator('.gather-result')).toHaveCount(0);
  await page.goForward();
  await expect(page).toHaveURL('http://127.0.0.1:4178/app/inventory');
  await devtools.detach();
});
