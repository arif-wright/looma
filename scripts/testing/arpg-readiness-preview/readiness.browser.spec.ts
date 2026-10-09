import { test, expect, snapshot, screen, starts, open, initializing, live, failed, HOLD_PATH, holdFirstImage } from './guard';
import { TITLES } from './cases.mjs';

const screenshot = async (page: import('@playwright/test').Page, info: import('@playwright/test').TestInfo, label: string) => {
  await info.attach(label, { body: await page.screenshot({ fullPage: true }), contentType: 'image/png' });
};
test(TITLES[0]!, async ({ page }, info) => {
  const hold = await holdFirstImage(page);
  await open(page); await hold.requested;
  await initializing(page);
  expect(await starts(page)).toHaveLength(1);
  // A forced DOM click still cannot bypass the actual route's start guard.
  await screen(page).getByRole('button', { name: 'Starting…', exact: true }).evaluate(button => button.dispatchEvent(new MouseEvent('click', { bubbles: true })));
  expect(await starts(page)).toHaveLength(1);
  expect((await snapshot(page)).scenes[0]!.createAt).toBeNull();
  await hold.release(); await live(page);
  expect(await starts(page)).toHaveLength(1);
  await screenshot(page, info, 'initialized-scene-known-floor-wall-visual-defect');
});

test(TITLES[1]!, async ({ page }, info) => {
  let count = 0;
  await page.route(`http://127.0.0.1:4281${HOLD_PATH}`, route => ++count === 1
    ? route.fulfill({ status: 503, contentType: 'text/plain', body: 'Synthetic image download failure' }) : route.fallback());
  await open(page); await failed(page);
  await expect.poll(async () => (await snapshot(page)).scenes[0]!.destroyed).toBe(true);
  expect((await snapshot(page)).scenes[0]!.loadErrors).toContain('floor_0');
  expect(await starts(page)).toHaveLength(1);
  await screenshot(page, info, 'actual-route-image-download-failure');
  await screen(page).getByRole('button', { name: 'Start new run', exact: true }).click();
  await live(page);
  expect(await starts(page)).toHaveLength(2);
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
  expect(await starts(page)).toHaveLength(1);
  await screenshot(page, info, 'actual-route-image-decode-failure');
  await screen(page).getByRole('button', { name: 'Start new run', exact: true }).click();
  await live(page); expect(await starts(page)).toHaveLength(2);
});

test(TITLES[3]!, async ({ page }, info) => {
  const hold = await holdFirstImage(page);
  await open(page); await hold.requested; await initializing(page);
  await expect(screen(page).locator('.error-banner')).toContainText('The game took too long to load.', { timeout: 40_000 });
  const elapsed = await page.evaluate(() => performance.now() - window.__arpgFixture.api.find(call => call.path === '/api/games/session/start')!.at);
  expect(elapsed).toBeGreaterThanOrEqual(29_000);
  await failed(page);
  await expect.poll(async () => (await snapshot(page)).scenes[0]!.destroyed).toBe(true);
  expect(await starts(page)).toHaveLength(1);
  await screenshot(page, info, 'actual-route-native-30-second-asset-timeout');
  await screen(page).getByRole('button', { name: 'Start new run', exact: true }).click();
  await live(page);
  await hold.release();
  await live(page); expect(await starts(page)).toHaveLength(2);
  expect((await snapshot(page)).scenes[0]!.createAt).toBeNull();
});

for (const [index, owner, label] of [[4, 'owner-b', 'Refresh page'], [5, null, 'Sign in']] as const) {
  test(TITLES[index]!, async ({ page }) => {
    const hold = await holdFirstImage(page);
    await open(page); await hold.requested; await initializing(page);
    await page.evaluate(owner => window.__arpgFixture.emitAuth(owner ? 'SIGNED_IN' : 'SIGNED_OUT', owner), owner);
    await expect(screen(page).locator('.game-status')).toHaveText('Start interrupted');
    await expect(screen(page).getByRole('button', { name: label, exact: true })).toBeEnabled();
    await expect.poll(async () => (await snapshot(page)).scenes[0]!.destroyed).toBe(true);
    await hold.release();
    await expect(screen(page).locator('canvas')).toHaveCount(0);
    expect((await snapshot(page)).scenes[0]!.createAt).toBeNull();
    expect(await starts(page)).toHaveLength(1);
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
  expect(await starts(page)).toHaveLength(1);
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
  expect(await starts(page)).toHaveLength(1);
});

test(TITLES[8]!, async ({ page }) => {
  const hold = await holdFirstImage(page);
  await open(page); await hold.requested; await initializing(page);
  await page.evaluate(() => window.__arpgFixture.emitAuth('TOKEN_REFRESHED', 'owner-a'));
  await initializing(page); expect(await starts(page)).toHaveLength(1);
  await hold.release(); await live(page);
  expect(await starts(page)).toHaveLength(1);
});

test(TITLES[9]!, async ({ page }) => {
  const hold = await holdFirstImage(page);
  await open(page); await hold.requested; await initializing(page);
  const nextPage = await page.evaluate(() => window.__arpgFixture.mountAnother());
  expect(nextPage).toBe(2);
  await live(page, nextPage);
  await expect.poll(async () => (await snapshot(page)).scenes[0]!.destroyed).toBe(true);
  await page.evaluate(() => window.__arpgFixture.unmountPage(1));
  await hold.release();
  await live(page, nextPage);
  expect((await snapshot(page)).scenes[0]!.createAt).toBeNull();
  expect(await starts(page)).toHaveLength(2);
  await expect(screen(page, nextPage).locator('canvas')).toHaveCount(1);
});
