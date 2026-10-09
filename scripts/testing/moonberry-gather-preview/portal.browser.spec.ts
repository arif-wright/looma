import { expect, test, type Page } from '@playwright/test';
import { readFileSync } from 'node:fs';
import type { WorldArea } from '../../../src/lib/game/areas';

const WORLD_AREAS = JSON.parse(readFileSync(new URL('../../../services/world-server/src/world/areas.json', import.meta.url), 'utf8')) as Record<'wilds-exploration' | 'wilds-town', WorldArea>;

const grove = WORLD_AREAS['wilds-exploration'];
const hollow = WORLD_AREAS['wilds-town'];
const unavailable = 'The portal is temporarily unavailable. Please wait for the connection or try again.';
const portalCount = (page: Page) => page.evaluate(() =>
  window.__MOONBERRY_FIXTURE__.sent.filter((message) => message.type === 'portal').length);
const lastPortalId = (page: Page) => page.evaluate(() => String(
  window.__MOONBERRY_FIXTURE__.sent.filter((message) => message.type === 'portal').at(-1)!.payload.requestId));
const activatePortal = async (page: Page) => {
  const previousCount = await portalCount(page);
  const button = page.getByRole('button', { name: `Enter ${grove.portal.targetName}`, exact: true });
  if (await page.evaluate(() => navigator.maxTouchPoints > 0)) await button.tap();
  else await button.click();
  // Touch dispatch can finish before its synthesized click reaches the app.
  // WorldConnection installs the timeout before sending, so observe that send
  // before advancing the clock or injecting a result/drop/snapshot.
  await expect.poll(() => portalCount(page)).toBe(previousCount + 1);
  await expect(page.getByRole('button', { name: 'Travelling…', exact: true })).toBeDisabled();
};
const recoverDestination = (page: Page) => page.evaluate(({ mapId, x, y }) => {
  const room = window.__MOONBERRY_FIXTURE__.current;
  room.reconnect();
  room.transition(mapId, x, y);
}, { mapId: hollow.id, ...grove.portal.arrival });
const expectDestination = async (page: Page) => {
  await expect(page.getByTestId('world-area')).toContainText(hollow.name);
  await expect(page.getByTestId('world-area')).toHaveAttribute('aria-live', 'polite');
  await expect(page.getByText('Multiplayer connected', { exact: true })).toBeVisible();
};

const observations = new WeakMap<Page, { errors: string[]; blocked: string[]; sockets: string[] }>();
test.beforeEach(async ({ page }, testInfo) => {
  const observed = { errors: [] as string[], blocked: [] as string[], sockets: [] as string[] };
  observations.set(page, observed);
  page.on('pageerror', (error) => observed.errors.push(error.message));
  page.on('websocket', (socket) => observed.sockets.push(socket.url()));
  page.on('response', (response) => {
    if (!response.ok() && new URL(response.url()).pathname.startsWith('/game/')) {
      observed.errors.push(`Asset ${response.status()}: ${response.url()}`);
    }
  });
  await page.route('**/*', (route) => {
    const url = new URL(route.request().url());
    if (url.origin === 'http://127.0.0.1:4178') return route.continue();
    observed.blocked.push(url.origin);
    return route.abort('blockedbyclient');
  });
  await page.clock.install();
  await page.goto(`/?renderer=${testInfo.project.metadata.renderer}`);
  await expect(page.getByText('Multiplayer connected', { exact: true })).toBeVisible();
  await expect(page.locator('canvas')).toHaveCount(1);
  await expect(page.locator('canvas')).toHaveAttribute('data-local-sprite-load', 'loaded', { timeout: 30_000 });
  await page.evaluate(({ x, y }) => window.__MOONBERRY_FIXTURE__.current.snapshot(x, y), grove.portal);
  await expect(page.getByRole('button', { name: `Enter ${grove.portal.targetName}`, exact: true })).toBeEnabled();
  expect(await page.evaluate(() => window.__MOONBERRY_FIXTURE__.sdk)).toBe('synthetic-colyseus-no-sockets');
});
test.afterEach(async ({ page }) => {
  const observed = observations.get(page)!;
  expect(observed.blocked, 'No request may leave the local fixture origin').toEqual([]);
  expect(observed.sockets.filter((url) => {
    const socket = new URL(url);
    return socket.origin !== 'ws://127.0.0.1:4178' || socket.pathname !== '/';
  }), 'No application socket may be opened').toEqual([]);
  expect(observed.errors, 'No page exceptions or failed game assets').toEqual([]);
});

test('portal recovery clears stale failure only after the authoritative destination arrives', async ({ page }, testInfo) => {
  await activatePortal(page);
  const requestId = await lastPortalId(page);
  await page.evaluate(() => window.__MOONBERRY_FIXTURE__.current.drop());
  await expect(page.locator('.portal-result')).toHaveText(unavailable);
  await expect(page.locator('.portal-result')).toHaveAttribute('role', 'status');
  await expect(page.locator('.portal-result')).toHaveAttribute('aria-live', 'polite');
  await recoverDestination(page);
  await expectDestination(page);
  await expect(page.locator('.portal-result')).toHaveCount(0);
  expect(await portalCount(page)).toBe(1);
  await page.evaluate(({ requestId, mapId }) =>
    window.__MOONBERRY_FIXTURE__.current.portalResult(requestId, 'success', mapId), { requestId, mapId: hollow.id });
  await expect(page.locator('.portal-result')).toHaveCount(0);
  expect(await portalCount(page)).toBe(1);
  await page.screenshot({ path: testInfo.outputPath('portal-recovered-destination.png'), fullPage: false });
});

test('same-area reconnect retains guidance and an explicit new attempt owns its feedback', async ({ page }) => {
  await activatePortal(page);
  const oldId = await lastPortalId(page);
  await page.evaluate(({ x, y }) => {
    const room = window.__MOONBERRY_FIXTURE__.current;
    room.drop(); room.reconnect(); room.snapshot(x, y);
  }, grove.portal);
  await expect(page.getByTestId('world-area')).toContainText(grove.name);
  await expect(page.locator('.portal-result')).toHaveText(unavailable);
  expect(await portalCount(page)).toBe(1);
  await activatePortal(page);
  const newId = await lastPortalId(page);
  expect(newId).not.toBe(oldId);
  await expect(page.locator('.portal-result')).toHaveCount(0);
  const busy = page.getByRole('button', { name: 'Travelling…', exact: true });
  await expect(busy).toBeDisabled();
  await busy.dispatchEvent('click');
  await page.keyboard.down('e');
  await page.waitForTimeout(150);
  await page.keyboard.up('e');
  expect(await portalCount(page)).toBe(2);
  await page.evaluate(({ oldId, mapId }) =>
    window.__MOONBERRY_FIXTURE__.current.portalResult(oldId, 'success', mapId), { oldId, mapId: hollow.id });
  await expect(busy).toBeDisabled();
  await expect(page.locator('.portal-result')).toHaveCount(0);
  await page.evaluate((requestId) =>
    window.__MOONBERRY_FIXTURE__.current.portalResult(requestId, 'cooldown'), newId);
  await expect(page.locator('.portal-result')).toHaveText('The portal is settling. Try again in a moment.');
});

test('a destination snapshot clears an earlier portal timeout without sending another request', async ({ page }) => {
  await activatePortal(page);
  await page.clock.fastForward(10_050);
  await expect(page.locator('.portal-result')).toHaveText(unavailable);
  await page.evaluate(({ mapId, x, y }) =>
    window.__MOONBERRY_FIXTURE__.current.transition(mapId, x, y), { mapId: hollow.id, ...grove.portal.arrival });
  await expectDestination(page);
  await expect(page.locator('.portal-result')).toHaveCount(0);
  expect(await portalCount(page)).toBe(1);
});

for (const order of ['result-first', 'snapshot-first'] as const) {
  test(`confirmed portal success survives its destination snapshot (${order})`, async ({ page }) => {
    await activatePortal(page);
    const requestId = await lastPortalId(page);
    await page.evaluate(({ requestId, mapId, x, y, order }) => {
      const room = window.__MOONBERRY_FIXTURE__.current;
      if (order === 'result-first') room.portalResult(requestId, 'success', mapId);
      room.transition(mapId, x, y);
      if (order === 'snapshot-first') room.portalResult(requestId, 'success', mapId);
    }, { requestId, mapId: hollow.id, ...grove.portal.arrival, order });
    await expectDestination(page);
    await expect(page.locator('.portal-result')).toHaveText(`Arrived in ${hollow.name}.`);
    expect(await portalCount(page)).toBe(1);
  });
}

test('unmount after recovered portal travel rejects old results and remounts with clean feedback', async ({ page }) => {
  await activatePortal(page);
  const requestId = await lastPortalId(page);
  await page.evaluate(() => window.__MOONBERRY_FIXTURE__.current.drop());
  await recoverDestination(page);
  await expect(page.locator('.portal-result')).toHaveCount(0);
  await page.getByRole('button', { name: 'Unmount fixture', exact: true }).click();
  await page.evaluate(({ requestId, mapId }) => {
    const room = window.__MOONBERRY_FIXTURE__.rooms[0]!;
    room.portalResult(requestId, 'success', mapId); room.reconnect();
  }, { requestId, mapId: hollow.id });
  await page.clock.fastForward(10_050);
  await expect(page.locator('.portal-result')).toHaveCount(0);
  await page.getByRole('button', { name: 'Mount fixture', exact: true }).click();
  await expect(page.getByText('Multiplayer connected', { exact: true })).toBeVisible();
  await expect(page.getByTestId('world-area')).toContainText(grove.name);
  await expect(page.locator('.portal-result')).toHaveCount(0);
  expect(await portalCount(page)).toBe(1);
});

for (const outcome of ['timeout', 'drop', 'unavailable', 'failure', 'out_of_range', 'cooldown'] as const) {
  test(`destination before delayed ${outcome} keeps obsolete guidance hidden`, async ({ page }) => {
    await activatePortal(page);
    const requestId = await lastPortalId(page);
    await page.evaluate(({ mapId, x, y }) =>
      window.__MOONBERRY_FIXTURE__.current.transition(mapId, x, y), { mapId: hollow.id, ...grove.portal.arrival });
    await expectDestination(page);
    if (outcome === 'timeout') await page.clock.fastForward(10_050);
    else await page.evaluate(({ requestId, outcome }) => {
      const room = window.__MOONBERRY_FIXTURE__.current;
      if (outcome === 'drop') room.drop();
      else room.portalResult(requestId, outcome);
    }, { requestId, outcome });
    await expect(page.locator('.portal-result')).toHaveCount(0);
    await page.evaluate(({ requestId, mapId }) =>
      window.__MOONBERRY_FIXTURE__.current.portalResult(requestId, 'success', mapId), { requestId, mapId: hollow.id });
    await page.clock.fastForward(10_050);
    await expect(page.locator('.portal-result')).toHaveCount(0);
    expect(await portalCount(page)).toBe(1);
  });
}

test('same-area timeout keeps guidance until an explicit new attempt', async ({ page }) => {
  await activatePortal(page);
  await page.clock.fastForward(10_050);
  await page.evaluate(({ x, y }) => window.__MOONBERRY_FIXTURE__.current.snapshot(x, y), grove.portal);
  await expect(page.locator('.portal-result')).toHaveText(unavailable);
  await activatePortal(page);
  await expect(page.locator('.portal-result')).toHaveCount(0);
  expect(await portalCount(page)).toBe(2);
});

test('duplicate keyboard starts after arrival preserve the pending destination', async ({ page }) => {
  await activatePortal(page);
  await page.evaluate(({ mapId, x, y }) =>
    window.__MOONBERRY_FIXTURE__.current.transition(mapId, x, y), { mapId: hollow.id, ...hollow.portal });
  await expectDestination(page);
  await page.keyboard.press('e');
  await page.waitForTimeout(150);
  await page.keyboard.press('e');
  expect(await portalCount(page)).toBe(1);
  await page.clock.fastForward(10_050);
  await expect(page.locator('.portal-result')).toHaveCount(0);
  expect(await portalCount(page)).toBe(1);
});

test('a fresh return attempt is not masked by the earlier arrival or old replies', async ({ page }) => {
  await activatePortal(page);
  const first = await lastPortalId(page);
  await page.evaluate(({ mapId, x, y }) =>
    window.__MOONBERRY_FIXTURE__.current.transition(mapId, x, y), { mapId: hollow.id, ...hollow.portal });
  await page.clock.fastForward(10_050);
  await expect(page.locator('.portal-result')).toHaveCount(0);
  const returnButton = page.getByRole('button', { name: `Enter ${hollow.portal.targetName}`, exact: true });
  if (await page.evaluate(() => navigator.maxTouchPoints > 0)) await returnButton.tap();
  else await returnButton.click();
  const second = await lastPortalId(page);
  expect(second).not.toBe(first);
  await page.evaluate(({ first, second, mapId }) => {
    const room = window.__MOONBERRY_FIXTURE__.current;
    room.portalResult(first, 'success', mapId);
    room.portalResult(second, 'failure');
  }, { first, second, mapId: hollow.id });
  await expect(page.locator('.portal-result')).toHaveText(unavailable);
  expect(await portalCount(page)).toBe(2);
  await page.evaluate(({ mapId, x, y }) =>
    window.__MOONBERRY_FIXTURE__.current.transition(mapId, x, y), { mapId: grove.id, ...hollow.portal.arrival });
  await expect(page.getByTestId('world-area')).toContainText(grove.name);
  await expect(page.locator('.portal-result')).toHaveCount(0);
});

test('missing local state cannot impersonate a return destination', async ({ page }) => {
  await page.evaluate(({ mapId, x, y }) =>
    window.__MOONBERRY_FIXTURE__.current.transition(mapId, x, y), { mapId: hollow.id, ...hollow.portal });
  const returnButton = page.getByRole('button', { name: `Enter ${hollow.portal.targetName}`, exact: true });
  if (await page.evaluate(() => navigator.maxTouchPoints > 0)) await returnButton.tap();
  else await returnButton.click();
  const requestId = await lastPortalId(page);
  await page.evaluate((requestId) => window.__MOONBERRY_FIXTURE__.current.portalResult(requestId, 'failure'), requestId);
  await expect(page.locator('.portal-result')).toHaveText(unavailable);
  const local = await page.evaluate(() => {
    const room = window.__MOONBERRY_FIXTURE__.current;
    const local = room.state.players.get(room.sessionId)!;
    room.state.players.delete(room.sessionId);
    room.snapshot();
    return local;
  });
  await expect(page.getByTestId('world-area')).toContainText(hollow.name);
  await expect(page.locator('.portal-result')).toHaveText(unavailable);
  await page.evaluate(({ local, x, y }) => {
    const room = window.__MOONBERRY_FIXTURE__.current;
    room.state.players.set(room.sessionId, local);
    room.snapshot(x, y);
  }, { local, ...hollow.portal });
  await expect(page.getByTestId('world-area')).toContainText(hollow.name);
  await expect(page.locator('.portal-result')).toHaveText(unavailable);
  expect(await portalCount(page)).toBe(1);
});
