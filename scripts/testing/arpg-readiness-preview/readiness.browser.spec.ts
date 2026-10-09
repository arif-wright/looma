import { test, expect, snapshot, screen, starts, open, initializing, town, expedition, gameplay, record, clickControl, failed, HOLD_PATH, holdFirstImage } from './guard';
import { TITLES } from './cases.mjs';
import { FLOW_CAP_MS } from './protocol.mjs';
import { DESKTOP_TOWN_SCREENSHOT, PHONE_TOWN_SCREENSHOT } from './screenshots.mjs';

const screenshot = async (page: import('@playwright/test').Page, info: import('@playwright/test').TestInfo, label: string) => {
  await info.attach(label, { body: await page.screenshot({ fullPage: true }), contentType: 'image/png' });
};
const townArtScreenshot = async (page: import('@playwright/test').Page, info: import('@playwright/test').TestInfo, label: string, viewport: { width: number; height: number }) => {
  const canvas = screen(page).locator('canvas');
  await canvas.scrollIntoViewIfNeeded();
  const visual = await page.evaluate(label => window.__arpgFixture.recordVisual(label), label);
  expect(page.viewportSize()).toEqual(viewport);
  expect(visual.viewport).toEqual(viewport);
  expect(visual.documentWidth).toBeLessThanOrEqual(viewport.width);
  expect(visual.canvas.width).toBeGreaterThan(0);
  expect(visual.canvas.height).toBeGreaterThan(0);
  expect(visual.canvas.x).toBeGreaterThanOrEqual(-1);
  expect(visual.canvas.x + visual.canvas.width).toBeLessThanOrEqual(viewport.width + 1);
  expect(visual.starts).toBe(0);
  expect(visual.scene?.gameplay).toMatchObject({ area: 0, expeditionActive: false, elapsed: 0 });
  // Desktop gets a canvas close-up; the phone-sized capture preserves the full
  // 390x844 viewport. Neither changes camera, scene, controls, textures or state.
  await info.attach(label, { body: label === PHONE_TOWN_SCREENSHOT ? await page.screenshot({ fullPage: false }) : await canvas.screenshot(), contentType: 'image/png' });
};
test(TITLES[0]!, async ({ page }, info) => {
  const hold = await holdFirstImage(page);
  await open(page); await hold.requested; await initializing(page);
  expect(await starts(page)).toHaveLength(0);
  // A forced DOM click cannot create a session while town assets are pending.
  await screen(page).getByRole('button', { name: 'Loading town…', exact: true }).evaluate(button => button.dispatchEvent(new MouseEvent('click', { bubbles: true })));
  expect(await starts(page)).toHaveLength(0);
  expect((await snapshot(page)).scenes[0]!.createAt).toBeNull();
  await record(page, 'assets-pending');
  await hold.release(); await town(page);
  expect(await starts(page)).toHaveLength(0);
  await record(page, 'town-ready');
  await screenshot(page, info, 'initialized-town-real-decoded-assets');
  await page.evaluate(() => window.__arpgFixture.holdStart());
  await screen(page).getByRole('button', { name: 'Depart on expedition', exact: true }).click();
  await expect.poll(async () => (await starts(page)).length).toBe(1);
  await expect(screen(page).getByRole('button', { name: 'Starting…', exact: true })).toBeDisabled();
  await screen(page).getByRole('button', { name: 'Starting…', exact: true }).evaluate(button => button.dispatchEvent(new MouseEvent('click', { bubbles: true })));
  expect(await starts(page)).toHaveLength(1);
  expect(await gameplay(page)).toMatchObject({ area: 0, expeditionActive: false, elapsed: 0 });
  await record(page, 'departure-pending');
  await page.evaluate(() => window.__arpgFixture.releaseStart());
  await expedition(page); await record(page, 'expedition-started');
  expect(await starts(page)).toHaveLength(1);
});

test(TITLES[1]!, async ({ page }, info) => {
  let count = 0;
  await page.route(`http://127.0.0.1:4281${HOLD_PATH}`, route => ++count === 1
    ? route.fulfill({ status: 503, contentType: 'text/plain', body: 'Synthetic image download failure' }) : route.fallback());
  await open(page); await failed(page);
  await expect.poll(async () => (await snapshot(page)).scenes[0]!.destroyed).toBe(true);
  expect((await snapshot(page)).scenes[0]!.loadErrors).toContain('floor_0');
  expect(await starts(page)).toHaveLength(0);
  await screenshot(page, info, 'actual-route-image-download-failure');
  await screen(page).getByRole('button', { name: 'Retry loading town', exact: true }).click();
  await town(page);
  expect(await starts(page)).toHaveLength(0);
  expect((await snapshot(page)).scenes).toHaveLength(2);
});

test(TITLES[2]!, async ({ page }, info) => {
  let count = 0;
  await page.route(`http://127.0.0.1:4281${HOLD_PATH}`, route => ++count === 1
    ? route.fulfill({ status: 200, contentType: 'image/png', body: 'These bytes are not a decodable PNG.' }) : route.fallback());
  await open(page); await failed(page);
  await expect.poll(async () => (await snapshot(page)).scenes[0]!.destroyed).toBe(true);
  const scene = (await snapshot(page)).scenes[0]!;
  expect(scene.loadComplete).toBe(true);
  expect(scene.missingKeys).toContain('floor_0');
  expect(scene.loadErrors).toEqual([]);
  expect(await starts(page)).toHaveLength(0);
  await screenshot(page, info, 'actual-route-image-decode-failure');
  await screen(page).getByRole('button', { name: 'Retry loading town', exact: true }).click();
  await town(page); expect(await starts(page)).toHaveLength(0);
});

test(TITLES[3]!, async ({ page }, info) => {
  const hold = await holdFirstImage(page);
  await open(page); await hold.requested; await initializing(page);
  await expect(screen(page).locator('.error-banner')).toContainText('Town took too long to load. Try loading it again. No expedition session was started.', { timeout: 40_000 });
  const elapsed = await page.evaluate(() => performance.now() - window.__arpgFixture.scenes[0]!.preloadAt);
  expect(elapsed).toBeGreaterThanOrEqual(29_000);
  await failed(page);
  await expect.poll(async () => (await snapshot(page)).scenes[0]!.destroyed).toBe(true);
  expect(await starts(page)).toHaveLength(0);
  await screenshot(page, info, 'actual-route-native-30-second-asset-timeout');
  await screen(page).getByRole('button', { name: 'Retry loading town', exact: true }).click();
  await town(page);
  await hold.release();
  await town(page); expect(await starts(page)).toHaveLength(0);
  expect((await snapshot(page)).scenes[0]!.createAt).toBeNull();
});

for (const [index, owner, label] of [[4, 'owner-b', 'Refresh page'], [5, null, 'Sign in']] as const) {
  test(TITLES[index]!, async ({ page }) => {
    const hold = await holdFirstImage(page);
    await open(page); await hold.requested; await initializing(page);
    await page.evaluate(owner => window.__arpgFixture.emitAuth(owner ? 'SIGNED_IN' : 'SIGNED_OUT', owner), owner);
    await expect(screen(page).locator('.game-status')).toHaveText('Play stopped because your account changed.');
    await expect(screen(page).getByRole('button', { name: label, exact: true })).toBeEnabled();
    await expect.poll(async () => (await snapshot(page)).scenes[0]!.destroyed).toBe(true);
    await hold.release();
    await expect(screen(page).locator('canvas')).toHaveCount(0);
    expect((await snapshot(page)).scenes[0]!.createAt).toBeNull();
    expect(await starts(page)).toHaveLength(0);
  });
}

test(TITLES[6]!, async ({ page }) => {
  const hold = await holdFirstImage(page);
  await open(page); await hold.requested; await initializing(page);
  await page.evaluate(() => window.__arpgFixture.unmountPage(1));
  await expect.poll(async () => (await snapshot(page)).scenes[0]!.destroyed).toBe(true);
  await hold.release();
  await expect(screen(page)).toHaveCount(0);
  expect((await snapshot(page)).scenes[0]!.createAt).toBeNull();
  expect(await starts(page)).toHaveLength(0);
});

test(TITLES[7]!, async ({ page }) => {
  const hold = await holdFirstImage(page);
  await open(page); await hold.requested; await initializing(page);
  await screen(page).getByRole('button', { name: 'Back to hub', exact: true }).click();
  await expect(page).toHaveURL('http://127.0.0.1:4281/app/games');
  await expect.poll(async () => (await snapshot(page)).scenes[0]!.destroyed).toBe(true);
  await hold.release();
  await expect(screen(page)).toHaveCount(0);
  expect((await snapshot(page)).scenes[0]!.createAt).toBeNull();
  expect(await starts(page)).toHaveLength(0);
});

test(TITLES[8]!, async ({ page }) => {
  const hold = await holdFirstImage(page);
  await open(page); await hold.requested; await initializing(page);
  await page.evaluate(() => window.__arpgFixture.emitAuth('TOKEN_REFRESHED', 'owner-a'));
  await initializing(page); expect(await starts(page)).toHaveLength(0);
  await hold.release(); await town(page);
  expect(await starts(page)).toHaveLength(0);
});

test(TITLES[9]!, async ({ page }) => {
  const hold = await holdFirstImage(page);
  await open(page); await hold.requested; await initializing(page);
  const nextPage = await page.evaluate(() => window.__arpgFixture.mountAnother());
  expect(nextPage).toBe(2);
  await town(page, nextPage);
  await expect.poll(async () => (await snapshot(page)).scenes[0]!.destroyed).toBe(true);
  await page.evaluate(() => window.__arpgFixture.unmountPage(1));
  await hold.release();
  await town(page, nextPage);
  expect((await snapshot(page)).scenes[0]!.createAt).toBeNull();
  expect(await starts(page)).toHaveLength(0);
  await expect(screen(page, nextPage).locator('canvas')).toHaveCount(1);
});


test(TITLES[10]!, async ({ page }, info) => {
  // Two native idle periods must each exceed the synthetic server cap, with
  // headroom for actual software rendering and input on hosted Chromium.
  test.setTimeout(120_000);
  await page.addInitScript(() => { window.__arpgReturnFlow = true; });
  await open(page); await town(page);
  await townArtScreenshot(page, info, DESKTOP_TOWN_SCREENSHOT, { width: 1280, height: 900 });
  await record(page, 'town-before-idle');
  // Native elapsed time exceeds this case's synthetic server expedition cap.
  // The actual scene clock must stay off in town; no clock or update is patched.
  await page.waitForTimeout(FLOW_CAP_MS + 250);
  await town(page); expect(await starts(page)).toHaveLength(0);
  expect(await gameplay(page)).toMatchObject({ area: 0, elapsed: 0, expeditionActive: false });
  await record(page, 'town-after-idle');
  await clickControl(page, 'primary', 'Enter ruins');
  await expedition(page);
  const before = await record(page, 'expedition-started');
  expect(before).not.toBeNull();
  expect(before!.durationLimit).toBe(FLOW_CAP_MS);
  await page.keyboard.down('w');
  try {
    await expect.poll(async () => {
      const current = await gameplay(page);
      return Math.hypot(current.x - before!.x, current.y - before!.y);
    }, { timeout: 1500 }).toBeGreaterThan(20);
  } finally { await page.keyboard.up('w'); }
  await record(page, 'hero-moved');
  await clickControl(page, 'secondary', 'Return to town');
  await expect(screen(page).locator('.game-status')).toHaveText('Result saved. Town is untimed; depart again whenever you’re ready.');
  await expect.poll(async () => (await snapshot(page)).rewardMutations.length).toBe(2);
  await expect.poll(() => gameplay(page)).toMatchObject({ area: 0, expeditionActive: false, returned: true, outcome: 'retreated' });
  const returned = await record(page, 'returned-and-saved');
  expect(returned).not.toBeNull();
  await page.waitForTimeout(FLOW_CAP_MS + 250);
  expect(await gameplay(page)).toMatchObject({ area: 0, expeditionActive: false, elapsed: returned!.elapsed, outcome: 'retreated' });
  expect(await starts(page)).toHaveLength(1);
  expect((await snapshot(page)).api.filter(call => call.path === '/api/games/sign')).toHaveLength(1);
  expect((await snapshot(page)).api.filter(call => call.path === '/api/games/session/complete')).toHaveLength(1);
  await expect(screen(page).getByRole('button', { name: 'Depart on expedition', exact: true })).toBeEnabled();
  await record(page, 'returned-town-after-idle');
  await screenshot(page, info, 'returned-town-synthetic-zero-value-receipt');
});


test(TITLES[11]!, async ({ page }, info) => {
  // Desktop Chromium with a narrow viewport only. No mobile device, touch,
  // throttling, performance or phone playability is simulated or certified.
  await page.setViewportSize({ width: 390, height: 844 });
  await open(page); await town(page);
  expect(await starts(page)).toHaveLength(0);
  await townArtScreenshot(page, info, PHONE_TOWN_SCREENSHOT, { width: 390, height: 844 });
});
