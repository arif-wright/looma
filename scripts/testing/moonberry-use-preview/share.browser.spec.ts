import { test as base, expect, type Page, type TestInfo } from '@playwright/test';

const owner = '10000000-0000-0000-0000-000000000001';
const first = '10000000-0000-0000-0000-000000000002';
const second = '10000000-0000-0000-0000-000000000005';
const moss = '10000000-0000-0000-0000-000000000003';
const fern = '10000000-0000-0000-0000-000000000007';
const intentKey = `memvoya:moonberry-share:v1:${owner}`;
const card = (page: Page, stack = first) => page.locator(`#keepsake-${stack}`);
const state = (page: Page) => page.evaluate(() => (window as any).__moonberryFixture.snapshot());
const configure = (page: Page, value: Record<string, unknown>) => page.evaluate((options) => (window as any).__moonberryFixture.configure(options), value);
const action = (page: Page, method: string, args: any[] = []) => page.evaluate(({ method, args }) => (window as any).__moonberryFixture[method](...args), { method, args });
async function open(page: Page) {
  await page.goto('/app/inventory');
  await expect(card(page).getByRole('combobox')).toBeVisible();
}
async function confirm(page: Page, companion = moss, stack = first) {
  await card(page, stack).getByRole('combobox').selectOption(companion);
  await card(page, stack).getByRole('button', { name: 'Share one Moonberry', exact: true }).click();
  await expect(card(page, stack).getByRole('group', { name: 'Confirm Moonberry share' })).toBeFocused();
}
async function share(page: Page, companion = moss, stack = first) {
  await confirm(page, companion, stack);
  await card(page, stack).getByRole('button', { name: 'Confirm share', exact: true }).click();
}
async function capture(page: Page, info: TestInfo, name: string) {
  await expect(page.locator('.fixture-note')).toContainText('SYNTHETIC LOCAL TEST');
  await info.attach(`${name}-synthetic`, { body: await page.screenshot({ fullPage: true, animations: 'disabled' }), contentType: 'image/png' });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), 'No horizontal overflow').toBe(true);
}
const test = base.extend<{ guard: void }>({
  guard: [async ({ context, page }, use, info) => {
    const blocked: string[] = [], pageErrors: string[] = [];
    page.on('pageerror', (error) => pageErrors.push(error.message));
    await context.route('**/*', async (route) => {
      const request = route.request();
      if (new URL(request.url()).origin !== 'http://127.0.0.1:4182' || !['GET', 'HEAD'].includes(request.method())) {
        blocked.push(`${request.method()} ${request.url()}`); return route.abort();
      }
      return route.continue();
    });
    await use();
    const synthetic = await page.evaluate(() => (window as any).__moonberryFixture?.snapshot()).catch(() => null);
    await info.attach('synthetic-transport-log.json', { body: JSON.stringify({ synthetic, blocked, pageErrors }, null, 2), contentType: 'application/json' });
    expect(blocked, 'No hosted requests or network mutations').toEqual([]);
    expect(pageErrors, 'No uncaught browser errors').toEqual([]);
  }, { auto: true }]
});

test('cancel restores focus and sends no request; companion changes before confirmation remain explicit', async ({ page }, info) => {
  await open(page); await confirm(page);
  await capture(page, info, 'confirmation');
  await card(page).getByRole('button', { name: 'Cancel', exact: true }).click();
  await expect(card(page).getByRole('button', { name: 'Share one Moonberry', exact: true })).toBeFocused();
  expect((await state(page)).calls).toHaveLength(0);
  expect((await state(page)).mutations).toBe(0);
  await confirm(page, fern);
  await expect(card(page).getByRole('group', { name: 'Confirm Moonberry share' })).toContainText('Fern');
  await card(page).getByRole('button', { name: 'Cancel', exact: true }).click();
  expect((await state(page)).calls).toHaveLength(0);
});

test('double activation stays single-flight and depletion retains acquisition identity', async ({ page }, info) => {
  await open(page); const before = (await state(page)).stacks[0];
  await configure(page, { mode: 'hold' }); await confirm(page, fern);
  // Two same-turn DOM activations exercise the real click handler before Svelte flushes.
  await card(page).getByRole('button', { name: 'Confirm share', exact: true }).evaluate((button: HTMLButtonElement) => { button.click(); button.click(); });
  await expect(card(page).getByRole('button', { name: 'Sharing…', exact: true })).toBeDisabled();
  expect((await state(page)).calls).toHaveLength(1);
  expect((await state(page)).mutations).toBe(0);
  await capture(page, info, 'single-flight-pending');
  await action(page, 'release');
  await expect(card(page)).toContainText('You shared one Moonberry with Fern.');
  await expect(card(page)).toContainText('0 available');
  await expect(card(page)).toContainText('No Moonberries left');
  await expect(card(page).getByRole('button', { name: 'Share one Moonberry', exact: true })).toHaveCount(0);
  await expect(page.getByText('1 owned · 1 empty', { exact: true })).toBeVisible();
  const after = await state(page);
  expect(after.calls).toHaveLength(1); expect(after.mutations).toBe(1);
  expect(after.stacks[0]).toEqual({ ...before, quantity: 0 });
  await capture(page, info, 'depleted-stack-retained');
});

test('failure remains uncertain, blocks different stack and target, and explicit retry reuses exact key', async ({ page }, info) => {
  await open(page); await configure(page, { mode: 'failure' }); await share(page, fern);
  await expect(card(page)).toContainText('A previous Moonberry share is unconfirmed.');
  await expect(card(page)).toContainText('same share with Fern');
  await expect(card(page).getByRole('combobox')).toHaveCount(0);
  await expect(card(page, second)).toContainText('original Moonberry stack');
  await expect(card(page, second).getByRole('button', { name: 'Share one Moonberry', exact: true })).toHaveCount(0);
  const original = (await state(page)).calls[0];
  expect(original.companionId).toBe(fern); expect(original.userItemId).toBe(first);
  await capture(page, info, 'uncertain-target-bound');
  await configure(page, { mode: 'success' });
  await card(page).getByRole('button', { name: 'Check same share', exact: true }).click();
  await expect(card(page)).toContainText('You shared one Moonberry with Fern.');
  const result = await state(page);
  expect(result.calls).toEqual([original, original]); expect(result.mutations).toBe(1);
});

test('real client timeout stays uncertain and makes no automatic retry', async ({ page }, info) => {
  await open(page); await page.clock.install(); await configure(page, { mode: 'timeout' }); await share(page);
  await expect(card(page)).toContainText('Checking your share with Moss');
  await page.clock.fastForward(10_001);
  await expect(card(page)).toContainText('A previous Moonberry share is unconfirmed.');
  await page.clock.fastForward(60_000);
  expect((await state(page)).calls).toHaveLength(1); expect((await state(page)).mutations).toBe(0);
  await capture(page, info, 'timeout-stays-uncertain');
});

test('lost committed response reloads without mutation; retry ignores old receipt quantity after refill', async ({ page }, info) => {
  await open(page); await configure(page, { mode: 'lost' }); await share(page, fern);
  await expect.poll(async () => (await state(page)).mutations).toBe(1);
  const original = (await state(page)).calls[0];
  await action(page, 'refill', [first, 2]);
  await page.reload();
  await expect(card(page)).toContainText('A previous Moonberry share is unconfirmed.');
  expect((await state(page)).calls).toHaveLength(1);
  await configure(page, { mode: 'success' });
  await card(page).getByRole('button', { name: 'Check same share', exact: true }).click();
  await expect(card(page)).toContainText('Confirmed: you shared one Moonberry with Fern.');
  await expect(card(page)).toContainText('2 available');
  await expect(card(page)).not.toContainText('Fern receives it gently.');
  const result = await state(page);
  expect(result.calls).toEqual([original, original]); expect(result.mutations).toBe(1);
  expect(result.receipts[original.requestId].quantityAfter).toBe(0);
  expect(result.stacks[0].quantity).toBe(2);
  await capture(page, info, 'replay-current-stock-not-receipt');
});

test('pending unmount and remount restores uncertainty without auto-send or stale success', async ({ page }, info) => {
  await open(page); await configure(page, { mode: 'hold' }); await share(page);
  await action(page, 'unmount'); await action(page, 'release');
  await expect.poll(async () => (await state(page)).mutations).toBe(1);
  await action(page, 'mount');
  await expect(card(page)).toContainText('A previous Moonberry share is unconfirmed.');
  await expect(card(page)).not.toContainText('You shared one Moonberry with Moss.');
  expect((await state(page)).calls).toHaveLength(1);
  await configure(page, { mode: 'success' }); await card(page).getByRole('button', { name: 'Check same share', exact: true }).click();
  await expect(card(page)).toContainText('Confirmed: you shared one Moonberry with Moss.');
  expect((await state(page)).mutations).toBe(1);
  await capture(page, info, 'interrupted-navigation-recovered');
});

test('exact acquisition story survives depletion and refill; other stack cannot inherit its moment', async ({ page }, info) => {
  await open(page); const before = (await state(page)).stacks[0]; await share(page, fern);
  await expect(card(page)).toContainText('0 available');
  await card(page).getByRole('link', { name: /Read its story/ }).click();
  const story = page.locator('#keepsake-story');
  await expect(story).toBeFocused(); await expect(story).toContainText('Acquired with Moss');
  await expect(story).toContainText('You shared one Moonberry with Fern.');
  await expect(story).toContainText('first recorded gather');
  await capture(page, info, 'depleted-acquisition-exact-story');
  const link = story.getByRole('link', { name: /Open Journal.*A Moonberry shared with Fern/ });
  await expect(link).toHaveAttribute('href', '/app/memory?companion=10000000-0000-0000-0000-000000000007&moment=10000000-0000-0000-0000-000000000201#moment-10000000-0000-0000-0000-000000000201');
  await link.click(); await expect(page.getByRole('heading', { name: 'Exact synthetic Journal destination' })).toBeVisible();
  await page.goBack(); await expect(story).toContainText('A Moonberry shared with Fern');
  await card(page, second).getByRole('link', { name: /Read its story/ }).click();
  await expect(story).not.toContainText('You shared one Moonberry with Fern.');
  await page.goBack(); await expect(story).toContainText('You shared one Moonberry with Fern.');
  await action(page, 'refill', [first, 2]); await action(page, 'refresh');
  await expect(card(page)).toContainText('2 available');
  expect((await state(page)).stacks[0]).toEqual({ ...before, quantity: 2 });
  await expect(story).toContainText('You shared one Moonberry with Fern.');
  await action(page, 'hideMemory');
  await expect(story).toContainText('Journal moments aren’t shown here while memory is turned off.');
  await expect(story).not.toContainText('You shared one Moonberry with Fern.');
  await capture(page, info, 'refilled-identity-memory-disabled');
});

test('reaction and memory disabled do not fabricate emotional response or Journal entry', async ({ page }, info) => {
  await open(page); await configure(page, { reaction: false, memory: false }); await share(page);
  await expect(card(page)).toContainText('You shared one Moonberry with Moss.');
  await expect(card(page)).not.toContainText('receives it gently');
  expect((await state(page)).journal).toEqual([]);
  await card(page).getByRole('link', { name: /Read its story/ }).click();
  await expect(page.locator('#keepsake-story')).toContainText('memory is turned off');
  await capture(page, info, 'neutral-success-no-memory');
});

for (const mode of ['mismatched', 'unauthorized'] as const) {
  test(`${mode} response cannot confirm consumption or authorize a different target`, async ({ page }, info) => {
    await open(page); await configure(page, { mode }); await share(page, fern);
    await expect(card(page)).toContainText('A previous Moonberry share is unconfirmed.');
    await expect(card(page)).not.toContainText('You shared one Moonberry');
    expect((await state(page)).mutations).toBe(0);
    const saved = await page.evaluate((key) => JSON.parse(sessionStorage.getItem(key)!), intentKey);
    expect(saved).toEqual(expect.objectContaining({ userItemId: first, companionId: fern }));
    await capture(page, info, `${mode}-uncertain`);
  });
}

test('depleted receipt refreshes current stock without invented success', async ({ page }, info) => {
  await open(page); await configure(page, { mode: 'empty' }); await share(page);
  await expect(card(page)).toContainText('No Moonberry was shared: this stack was empty.');
  await expect(card(page)).toContainText('0 available');
  expect((await state(page)).mutations).toBe(0);
  expect((await state(page)).journal).toEqual([]);
  await capture(page, info, 'empty-terminal-receipt');
});

test('failed collection refresh blocks another share until current stock is loaded', async ({ page }, info) => {
  await open(page); await configure(page, { refreshMode: 'failure' }); await share(page);
  await expect(card(page)).toContainText('Your current quantity couldn’t be refreshed.');
  await expect(card(page).getByRole('button', { name: 'Share one Moonberry', exact: true })).toHaveCount(0);
  expect((await state(page)).calls).toHaveLength(1);
  await capture(page, info, 'failed-refresh');
  await configure(page, { refreshMode: 'success' }); await card(page).getByRole('button', { name: 'Refresh collection', exact: true }).click();
  await expect(card(page)).toContainText('0 available'); expect((await state(page)).calls).toHaveLength(1);
});

test('storage removal failure offers local-only cleanup and refreshes before another share', async ({ page }, info) => {
  await open(page);
  await page.evaluate((key) => {
    const remove = Storage.prototype.removeItem;
    (window as any).__restoreFixtureRemoveItem = () => { Storage.prototype.removeItem = remove; };
    Storage.prototype.removeItem = function (name: string) { if (name === key) throw new Error('Synthetic removeItem failure'); return remove.call(this, name); };
  }, intentKey);
  await share(page);
  await expect(card(page)).toContainText('You shared one Moonberry with Moss.');
  await expect(card(page).locator('.inventory-quantity')).toHaveText('0 at last refresh');
  await expect(card(page).getByRole('button', { name: 'Check same share', exact: true })).toHaveCount(0);
  const clear = card(page).getByRole('button', { name: 'Clear saved request', exact: true });
  await expect(clear).toBeEnabled();
  await clear.click();
  expect((await state(page)).calls).toHaveLength(1);
  await expect(clear).toBeVisible();
  await page.evaluate(() => (window as any).__restoreFixtureRemoveItem());
  await clear.click();
  await expect(clear).toHaveCount(0);
  await expect(card(page).locator('.inventory-quantity')).toHaveText('0 available');
  await expect(card(page, second).getByRole('combobox')).toBeVisible();
  const after = await state(page);
  expect(after.calls).toHaveLength(1); expect(after.mutations).toBe(1);
  expect(after.refreshes).toBe(2);
  expect(await page.evaluate((key) => sessionStorage.getItem(key), intentKey)).toBeNull();
  await capture(page, info, 'storage-local-only-cleanup');
});

test('deleted source stack reload exposes exact saved-target recovery without auto-send', async ({ page }, info) => {
  await open(page); await configure(page, { mode: 'lost' }); await share(page, fern);
  await expect.poll(async () => (await state(page)).mutations).toBe(1);
  const original = (await state(page)).calls[0];
  await action(page, 'removeStack', [first]); await page.reload();
  const recovery = page.getByRole('region', { name: 'Recover a Moonberry share', exact: true });
  await expect(recovery).toContainText('original stack is no longer available');
  await expect(card(page)).toHaveCount(0); expect((await state(page)).calls).toHaveLength(1);
  await configure(page, { mode: 'success' });
  await recovery.getByRole('button', { name: 'Check same share', exact: true }).click();
  await expect(recovery).toContainText('Confirmed: you shared one Moonberry with Fern.');
  const after = await state(page);
  expect(after.calls).toEqual([original, original]); expect(after.mutations).toBe(1);
  await expect(card(page, second)).toContainText('3 available');
  await expect(card(page, second).getByRole('combobox')).toBeVisible();
  await capture(page, info, 'missing-stack-exact-recovery');
});

test('account change while stale page remains cannot apply saved intent to another owner', async ({ page }, info) => {
  await open(page); await configure(page, { mode: 'failure' }); await share(page, fern);
  await expect(card(page)).toContainText('A previous Moonberry share is unconfirmed.');
  const original = (await state(page)).calls[0];
  await configure(page, { mode: 'success', authenticatedOwnerId: '10000000-0000-0000-0000-000000000009' });
  await card(page).getByRole('button', { name: 'Check same share', exact: true }).click();
  await expect(card(page)).toContainText('Sign in again before checking this share.');
  await expect(card(page)).toContainText('A previous Moonberry share is unconfirmed.');
  const after = await state(page);
  expect(after.calls).toEqual([original, original]); expect(after.mutations).toBe(0);
  const requests = after.log.filter((entry: any) => entry.event === 'synthetic_request');
  expect(requests.map((entry: any) => entry.details.requestedOwnerId)).toEqual([owner, owner]);
  const saved = await page.evaluate((key) => JSON.parse(sessionStorage.getItem(key)!), intentKey);
  expect(saved).toEqual({ requestId: original.requestId, userItemId: first, companionId: fern });
  await capture(page, info, 'account-change-retains-bound-intent');
});

test('malformed stored intent fails closed without automatic mutation', async ({ page }, info) => {
  await page.addInitScript(({ key }) => sessionStorage.setItem(key, 'not-json'), { key: intentKey });
  await page.goto('/app/inventory');
  await expect(card(page)).toContainText('Sharing is unavailable in this browser session.');
  await expect(card(page).getByRole('button', { name: 'Share one Moonberry', exact: true })).toHaveCount(0);
  expect((await state(page)).calls).toHaveLength(0);
  await capture(page, info, 'malformed-storage-fail-closed');
});


test('unconfirmed share and failed refresh never present stale quantity as currently available', async ({ page }, info) => {
  await open(page); await page.clock.install(); await configure(page, { mode: 'lost' }); await share(page);
  await expect.poll(async () => (await state(page)).mutations).toBe(1);
  await expect(card(page).locator('.inventory-quantity')).not.toHaveText(/^1 available$/);
  await page.clock.fastForward(10_001);
  await expect(card(page)).toContainText('A previous Moonberry share is unconfirmed.');
  await expect(card(page).locator('.inventory-quantity')).not.toHaveText(/^1 available$/);
  await configure(page, { mode: 'success', refreshMode: 'failure' });
  await card(page).getByRole('button', { name: 'Check same share', exact: true }).click();
  await expect(card(page)).toContainText('Your current quantity couldn’t be refreshed.');
  await expect(card(page).locator('.inventory-quantity')).not.toHaveText(/^1 available$/);
  await capture(page, info, 'stale-stock-not-current-claim');
});


test('newer saved intent appearing during refresh remains explicit and actionable after it finishes', async ({ page }, info) => {
  await open(page); await configure(page, { refreshMode: 'hold' }); await share(page);
  await expect(card(page)).toContainText('Refreshing your collection…');
  const newer = { requestId: '10000000-0000-0000-0000-000000000901', userItemId: first, companionId: fern };
  await page.evaluate(({ key, intent }) => {
    sessionStorage.setItem(key, JSON.stringify(intent));
    window.dispatchEvent(new Event('memvoya:moonberry-intent'));
  }, { key: intentKey, intent: newer });
  await configure(page, { refreshMode: 'success' }); await action(page, 'releaseRefresh');
  await expect(card(page)).toContainText('A previous Moonberry share is unconfirmed.');
  await expect(card(page)).toContainText('same share with Fern');
  expect((await state(page)).calls).toHaveLength(1);
  await card(page).getByRole('button', { name: 'Check same share', exact: true }).click();
  await expect(card(page)).toContainText('No Moonberry was shared: this stack was empty.');
  const after = await state(page);
  expect(after.calls).toHaveLength(2);
  expect(after.calls[1]).toEqual({ action: 'share_moonberry', ...newer });
  expect(after.mutations).toBe(1);
  await capture(page, info, 'new-intent-during-refresh');
});


test('collection refresh timeout keeps old quantity qualified and never retries sharing', async ({ page }, info) => {
  await open(page); await page.clock.install(); await configure(page, { refreshMode: 'hold' }); await share(page);
  await expect(card(page)).toContainText('Refreshing your collection…');
  await page.clock.fastForward(10_001);
  await expect(card(page)).toContainText('Your current quantity couldn’t be refreshed.');
  await expect(card(page).locator('.inventory-quantity')).toHaveText('1 at last refresh');
  expect((await state(page)).calls).toHaveLength(1); expect((await state(page)).mutations).toBe(1);
  await configure(page, { refreshMode: 'success' }); await action(page, 'releaseRefresh');
  await card(page).getByRole('button', { name: 'Refresh collection', exact: true }).click();
  await expect(card(page).locator('.inventory-quantity')).toHaveText('0 available');
  expect((await state(page)).calls).toHaveLength(1);
  await capture(page, info, 'refresh-timeout-recovery');
});

test('companion disappearing during confirmation cancels safely without a request', async ({ page }, info) => {
  await open(page); await confirm(page, fern);
  await action(page, 'setCompanions', [[moss]]);
  await expect(card(page).getByRole('group', { name: 'Confirm Moonberry share' })).toHaveCount(0);
  expect((await state(page)).calls).toHaveLength(0); expect((await state(page)).mutations).toBe(0);
  await capture(page, info, 'companion-disappeared-before-confirm');
});
