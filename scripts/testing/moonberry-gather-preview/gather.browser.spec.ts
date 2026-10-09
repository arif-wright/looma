import { expect, test, type Page, type TestInfo } from '@playwright/test';
import { performance as testPerformance } from 'node:perf_hooks';
import { readFileSync, writeFileSync } from 'node:fs';
// Keep DOM/action traces and manual/failure PNGs; omit continuous trace screencast.
// File-level scope is required because Playwright's trace option is worker-scoped.
test.use({ trace: { mode: 'on', screenshots: false, snapshots: true, sources: true, attachments: true } });
const THREE_LAYOUT_TEST = 'Three feedback, gather and independent movement/camera targets never overlap';
const NATIVE_GATHER_OBSERVATION_MS = 12_000;
const layoutTimings = new WeakMap<TestInfo, { started: number; phases: Array<{ phase: string; elapsedMs: number }> }>();
const recordLayoutPhase = (testInfo: TestInfo, phase: string) => {
  const timing = layoutTimings.get(testInfo);
  if (!timing) return;
  const entry = { phase, elapsedMs: Math.round((testPerformance.now() - timing.started) * 10) / 10 };
  timing.phases.push(entry);
  console.log('[native-layout-phase]', JSON.stringify({ project: testInfo.project.name,
    repeat: testInfo.repeatEachIndex, timeoutMs: testInfo.timeout, ...entry }));
};

const observeLayoutPhase = async <T>(testInfo: TestInfo, phase: string, action: () => Promise<T>): Promise<T> => {
  recordLayoutPhase(testInfo, `${phase}:start`);
  try {
    const result = await action();
    recordLayoutPhase(testInfo, `${phase}:end`);
    return result;
  } catch (error) {
    recordLayoutPhase(testInfo, `${phase}:error`);
    throw error;
  }
};

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
const uncertainty = async (page: Page, timeout = 5_000) => {
  await expect(page.locator('.gather-result')).toContainText(/could not confirm|couldn[’']t confirm|unconfirmed|not confirmed/i, { timeout });
  await expect(page.getByRole('link', { name: /View in Keepsakes/i })).toHaveAttribute('href', '/app/inventory');
  await expect(page.locator('.gather-result')).not.toContainText('Gathered 1 Moonberry');
  await expect(page.getByRole('button', { name: 'Gathering…', exact: true })).toHaveCount(0);
};

const observations = new WeakMap<Page, { errors: string[]; blocked: string[]; sockets: string[] }>();
test.beforeEach(async ({ page }, testInfo) => {
  if (testInfo.title === THREE_LAYOUT_TEST && testInfo.project.metadata.renderer === 'three') {
    // Preserve the original 60-second work envelope and account only for the
    // newly real deadline observation, previously an immediate virtual jump.
    testInfo.setTimeout(60_000 + NATIVE_GATHER_OBSERVATION_MS);
    layoutTimings.set(testInfo, { started: testPerformance.now(), phases: [] });
    recordLayoutPhase(testInfo, 'case-start');
  }
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
  // Keep native animation frames for the combined layout/input acceptance case.
  // Dedicated timeout scenarios below still exercise the mocked clock.
  if (testInfo.title !== THREE_LAYOUT_TEST) await page.clock.install();
  await page.goto(`/?renderer=${testInfo.project.metadata.renderer}`);
  await ready(page);
  expect(await page.evaluate(() => window.__MOONBERRY_FIXTURE__.sdk)).toBe('synthetic-colyseus-no-sockets');
  expect(await page.evaluate(() => window.__MOONBERRY_FIXTURE__.tickets)).toBe(1);
});
test.afterEach(async ({ page }, testInfo) => {
  try {
    const observed = observations.get(page)!;
    expect(observed.blocked, 'No request may leave the local fixture origin').toEqual([]);
    expect(observed.sockets.filter((url) => {
      const socket = new URL(url);
      return socket.origin !== 'ws://127.0.0.1:4178' || socket.pathname !== '/';
    }), 'Only Vite’s local development socket is allowed; never an application socket').toEqual([]);
    expect(observed.errors, 'No page exceptions or failed game assets').toEqual([]);
  } finally {
    const timing = layoutTimings.get(testInfo);
    if (timing) {
      recordLayoutPhase(testInfo, 'final');
      const filename = testInfo.outputPath('layout-phase-timings.json');
      writeFileSync(filename, JSON.stringify({
        clock: 'Node monotonic performance; elapsed from beforeEach entry',
        note: 'The case budget also includes fixture setup before this timing origin.',
        project: testInfo.project.name, repeat: testInfo.repeatEachIndex,
        timeoutMs: testInfo.timeout, runnerStatusAtArchive: testInfo.status,
        reportedDurationMs: testInfo.duration, phases: timing.phases
      }, null, 2));
      await testInfo.attach('layout-phase-timings', { path: filename, contentType: 'application/json' });
      layoutTimings.delete(testInfo);
    }
  }
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

test(THREE_LAYOUT_TEST, async ({ page }, testInfo) => {
  test.skip(testInfo.project.metadata.renderer !== 'three', 'Three-only layout; Phaser retains the original HUD.');
  recordLayoutPhase(testInfo, 'body-start');
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
    await observeLayoutPhase(testInfo, `png:${filename}`, () =>
      page.screenshot({ path: testInfo.outputPath(filename), fullPage: false }));
    if (touch) await expect.poll(() => page.evaluate(() => navigator.maxTouchPoints > 0 && matchMedia('(pointer: coarse)').matches)).toBe(true);
    if (page.viewportSize()!.width > page.viewportSize()!.height) {
      const scroll = await page.evaluate(() => window.scrollY);
      await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
      await observeLayoutPhase(testInfo, `png:${filename.replace('.png', '-controls.png')}`, () =>
        page.screenshot({ path: testInfo.outputPath(filename.replace('.png', '-controls.png')), fullPage: false }));
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
  await observeLayoutPhase(testInfo, 'checkLayout:initial', checkLayout);
  recordLayoutPhase(testInfo, 'deadline-start');
  const gathersBeforeTimeout = await gatherCount(page);
  const deadlineBefore = await page.evaluate(() => ({ date: Date.now(), performance: performance.now() }));
  let deadlineAfter: { date: number; performance: number } | null = null;
  try {
    await activateGather(page);
    await expect.poll(() => gatherCount(page)).toBe(gathersBeforeTimeout + 1);
    await expect(page.getByRole('button', { name: 'Gathering…', exact: true })).toBeDisabled();
    // Observe the real production 10-second deadline. The 12-second assertion
    // bound allows delivery/rendering; it does not change that deadline.
    await uncertainty(page, NATIVE_GATHER_OBSERVATION_MS);
  } finally {
    recordLayoutPhase(testInfo, 'deadline-end');
    deadlineAfter = await page.evaluate(() => ({ date: Date.now(), performance: performance.now() }));
    const diagnosticPath = testInfo.outputPath('gather-deadline-diagnostics.json');
    writeFileSync(diagnosticPath, JSON.stringify({ clock: 'native', before: deadlineBefore, after: deadlineAfter }, null, 2));
    await testInfo.attach('gather-deadline-diagnostics', { path: diagnosticPath, contentType: 'application/json' });
  }
  expect(deadlineAfter.performance - deadlineBefore.performance).toBeGreaterThanOrEqual(10_000);
  await observeLayoutPhase(testInfo, 'checkLayout:uncertain-feedback', checkLayout);
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
    recordLayoutPhase(testInfo, 'input-start');
    const sentBeforePress = await page.evaluate(() => window.__MOONBERRY_FIXTURE__.sent.length);
    const inputProbe = await page.evaluateHandle(() => {
      const events: Array<{ type: string; time: number; target: string | null }> = [];
      const eventTypes = ['blur', 'focus', 'visibilitychange', 'pointerdown', 'pointerup', 'pointercancel', 'pointerleave'];
      const recordEvent = (event: Event) => {
        const target = event.target instanceof Element ? event.target.getAttribute('aria-label') ?? event.target.tagName : null;
        events.push({ type: event.type, time: performance.now(), target });
        if (events.length > 30) events.shift();
      };
      for (const type of eventTypes) window.addEventListener(type, recordEvent, true);
      return {
        snapshot() {
          const fixture = window.__MOONBERRY_FIXTURE__;
          const room = fixture.current;
          const active = document.activeElement;
          return {
            time: { date: Date.now(), performance: performance.now() }, events: [...events],
            visibility: document.visibilityState, focused: document.hasFocus(),
            activeElement: active ? { tag: active.tagName, label: active.getAttribute('aria-label') } : null,
            upActive: document.querySelector('[aria-label="Move up"]')?.classList.contains('active'),
            canvas: { ...(document.querySelector('canvas')?.dataset ?? {}) },
            connection: document.querySelector('.connection-status')?.textContent ?? null,
            room: { index: room.index, left: room.left, localPlayerId: room.sessionId },
            localPlayer: room.state.players.get(room.sessionId) ?? null,
            recentMoves: fixture.sent.filter(message => message.type === 'move').slice(-20)
          };
        },
        stop() {
          for (const type of eventTypes) window.removeEventListener(type, recordEvent, true);
        }
      };
    });
    let beforeInput: unknown = null;
    let acceptedInput: unknown = null;
    let drivenFrames: unknown = null;
    let inputPassed = false;
    try {
      beforeInput = await inputProbe.evaluate(probe => probe.snapshot());
      await devtools.send('Input.dispatchTouchEvent', { type: 'touchStart',
        touchPoints: [{ x: box.x + box.width / 2, y: box.y + box.height / 2, id: 1 }] });
      await expect(up).toHaveClass(/active/);
      acceptedInput = await inputProbe.evaluate(probe => probe.snapshot());
      // Observe real renderer input; never move this case's browser clock.
      await expect.poll(() => page.evaluate((start) => window.__MOONBERRY_FIXTURE__.sent.slice(start).some((m) => m.type === 'move' && Number(m.payload.y) < 0), sentBeforePress)).toBe(true);
      drivenFrames = await inputProbe.evaluate(probe => probe.snapshot());
      await devtools.send('Input.dispatchTouchEvent', { type: 'touchCancel', touchPoints: [] });
      await expect(up).not.toHaveClass(/active/);
      await expect.poll(() => page.evaluate(() => window.__MOONBERRY_FIXTURE__.sent.filter((m) => m.type === 'move').at(-1)?.payload.y)).toBe(0);
      inputPassed = true;
      recordLayoutPhase(testInfo, 'input-complete');
    } finally {
      recordLayoutPhase(testInfo, 'input-finished');
      const finalState = await inputProbe.evaluate(probe => probe.snapshot())
        .catch(diagnosticError => ({ diagnosticError: String(diagnosticError) }));
      const diagnosticPath = testInfo.outputPath('touch-movement-diagnostics.json');
      try {
        writeFileSync(diagnosticPath, JSON.stringify({ inputPassed, sentBeforePress, beforeInput, acceptedInput, drivenFrames, finalState }, null, 2));
        await testInfo.attach('touch-movement-diagnostics', { path: diagnosticPath, contentType: 'application/json' });
      } catch { /* Diagnostic failure must not replace the original input assertion. */ }
      await inputProbe.evaluate(probe => probe.stop()).catch(() => {});
      await inputProbe.dispose().catch(() => {});
    }
    await page.evaluate(() => window.__MOONBERRY_FIXTURE__.current.snapshot());
    await ready(page);
  }
  recordLayoutPhase(testInfo, 'second-gather-start');
  const secondGather = {
    previousRequestId: await lastId(page), countBefore: await gatherCount(page),
    requestId: null as string | null, countAfter: null as number | null, successObserved: false
  };
  try {
    await activateGather(page);
    // A completed tap is not proof that its synthesized click reached the app.
    // Accept exactly one new request before choosing which result to deliver.
    await expect.poll(() => gatherCount(page)).toBe(secondGather.countBefore + 1);
    await expect(page.getByRole('button', { name: 'Gathering…', exact: true })).toBeDisabled();
    secondGather.requestId = await lastId(page);
    secondGather.countAfter = await gatherCount(page);
    expect(secondGather.requestId).not.toBe(secondGather.previousRequestId);
    recordLayoutPhase(testInfo, 'second-gather-accepted');
    await settle(page, secondGather.requestId);
    await expect(page.locator('.gather-result')).toContainText('Gathered 1 Moonberry.');
    secondGather.successObserved = true;
    recordLayoutPhase(testInfo, 'second-gather-success');
  } finally {
    recordLayoutPhase(testInfo, 'second-gather-finished');
    console.log('[native-layout-second-gather]', JSON.stringify(secondGather));
    const filename = testInfo.outputPath('second-gather-diagnostics.json');
    writeFileSync(filename, JSON.stringify(secondGather, null, 2));
    await testInfo.attach('second-gather-diagnostics', { path: filename, contentType: 'application/json' });
  }
  await observeLayoutPhase(testInfo, 'checkLayout:success-feedback', checkLayout);
  await page.evaluate(() => window.scrollTo(0, 0));
  await observeLayoutPhase(testInfo, 'captureLayout:separate-mobile-controls.png', () => captureLayout('separate-mobile-controls.png'));
  await restoreTouch();
  // The link remains a real, keyboard-accessible navigation target after feedback.
  recordLayoutPhase(testInfo, 'keepsakes-focus:start');
  await page.getByRole('link', { name: 'View in Keepsakes' }).focus();
  await expect(page.getByRole('link', { name: 'View in Keepsakes' })).toBeFocused();
  recordLayoutPhase(testInfo, 'keepsakes-focus:end');
  const portal = grovePortal;
  await page.evaluate(({ x, y }) => window.__MOONBERRY_FIXTURE__.current.snapshot(x, y), portal);
  await expect(page.getByRole('button', { name: `Enter ${portal.targetName}`, exact: true })).toBeVisible();
  await observeLayoutPhase(testInfo, 'checkLayout:portal-prompt', checkLayout);
  if (touch) {
    const landscape = page.viewportSize()!.width > page.viewportSize()!.height;
    const insets = { top: 0, left: landscape ? 32 : 0, right: landscape ? 32 : 0, bottom: landscape ? 21 : 34 };
    recordLayoutPhase(testInfo, 'safe-area-override:start');
    await devtools.send('Emulation.setSafeAreaInsetsOverride', { insets });
    await expect.poll(() => page.getByTestId('world-game-mount').evaluate((element) =>
      parseFloat(getComputedStyle(element).minHeight))).toBe((landscape ? 304 : 400) + insets.bottom);
    recordLayoutPhase(testInfo, 'safe-area-override:end');
    await observeLayoutPhase(testInfo, 'checkLayout:safe-area', checkLayout);
    await page.evaluate(() => window.scrollTo(0, 0));
    await observeLayoutPhase(testInfo, 'captureLayout:safe-area-mobile-controls.png', () => captureLayout('safe-area-mobile-controls.png'));
    await devtools.send('Emulation.setSafeAreaInsetsOverride', { insets: { top: 0, left: 0, right: 0, bottom: 0 } });
    await restoreTouch();
  }
  // Follow the real link into a clearly synthetic destination, then exercise history.
  // This checks navigation only, never an authenticated inventory or saved reward.
  await page.route('**/app/inventory', (route) => route.fulfill({ contentType: 'text/html',
    body: '<!doctype html><title>Synthetic Keepsakes destination</title><p>Local Keepsakes link target only. No inventory or saved rewards.</p>' }));
  const link = page.getByRole('link', { name: 'View in Keepsakes' });
  recordLayoutPhase(testInfo, 'navigation-start');
  recordLayoutPhase(testInfo, 'link-action-start');
  if (touch) await link.tap();
  else await link.click();
  recordLayoutPhase(testInfo, 'link-action-end');
  await expect(page).toHaveURL('http://127.0.0.1:4178/app/inventory');
  recordLayoutPhase(testInfo, 'inventory-url-reached');
  await expect(page.getByText('Local Keepsakes link target only. No inventory or saved rewards.')).toBeVisible();
  recordLayoutPhase(testInfo, 'inventory-content-visible');
  recordLayoutPhase(testInfo, 'goBack-start');
  await page.goBack();
  recordLayoutPhase(testInfo, 'goBack-end');
  await ready(page);
  recordLayoutPhase(testInfo, 'goBack-ready');
  await expect(page.locator('.gather-result')).toHaveCount(0);
  recordLayoutPhase(testInfo, 'goForward-start');
  await page.goForward();
  recordLayoutPhase(testInfo, 'goForward-end');
  await expect(page).toHaveURL('http://127.0.0.1:4178/app/inventory');
  recordLayoutPhase(testInfo, 'goForward-url-reached');
  recordLayoutPhase(testInfo, 'navigation-end');
  await devtools.detach();
  recordLayoutPhase(testInfo, 'body-end');
});
