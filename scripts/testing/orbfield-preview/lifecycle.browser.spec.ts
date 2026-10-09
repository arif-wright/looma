import { test, expect, capture, calls, finish, openLifecycle } from './guard';

test('intro needs explicit start; one session, server rewards, repeat play and Play navigation', async ({ page }, info) => {
  await openLifecycle(page);
  await expect(page.getByRole('button', { name: 'Start round', exact: true })).toBeVisible();
  expect(await calls(page, 'start')).toHaveLength(0);
  await capture(page, info, 'intro');
  await page.getByRole('button', { name: 'Start round', exact: true }).click();
  await expect.poll(async () => (await calls(page, 'start')).length).toBe(1);
  await expect(page.getByRole('button', { name: 'Pause', exact: true })).toBeVisible();
  await finish(page);
  await expect(page.getByRole('heading', { name: 'Round complete', exact: true })).toBeVisible();
  await expect(page.getByText(/37\s*XP|XP\s*37/i)).toBeVisible();
  await expect(page.getByText(/11\s*shards|shards\s*11/i)).toBeVisible();
  const completed = await calls(page, 'complete');
  expect(completed).toHaveLength(1);
  expect(completed[0].args[1]).toMatchObject({ score: 84, durationMs: 8000 });
  expect(await calls(page, 'fetchPlayerState')).toHaveLength(0);
  expect(await page.evaluate(() => window.__orbfieldFixture.playerStates)).toEqual([]);
  expect(await page.evaluate(() => window.__orbfieldFixture.ritualUpdates)).toEqual([[{ id: 'synthetic-ritual', state: 'complete' }]]);
  await capture(page, info, 'confirmed-server-rewards');
  await page.getByRole('button', { name: 'Play again', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Pause', exact: true })).toBeVisible();
  expect(await calls(page, 'start')).toHaveLength(2);
  await page.getByRole('button', { name: /back to play/i }).first().click();
  await expect(page.getByRole('heading', { name: 'Play', exact: true })).toBeVisible();
  await page.goBack();
  await expect(page.getByRole('button', { name: 'Start round', exact: true })).toBeVisible();
  expect(await calls(page, 'start')).toHaveLength(2);
});

test('pause, resume and touch warp controls retain the same session', async ({ page }, info) => {
  await openLifecycle(page);
  await page.getByRole('button', { name: 'Start round', exact: true }).click();
  const canvas = page.getByLabel('Orbfield play area', { exact: true });
  await expect(canvas).toHaveAttribute('tabindex', '0');
  await page.getByRole('button', { name: 'Pause', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Resume', exact: true })).toBeVisible();
  expect(await page.evaluate(() => window.__orbfieldFixture.engineEvents)).toContain('lifecycle:pause');
  await capture(page, info, 'paused');
  await page.getByRole('button', { name: 'Resume', exact: true }).click();
  await page.getByRole('button', { name: /time warp/i }).tap();
  expect(await page.evaluate(() => window.__orbfieldFixture.engineEvents)).toContain('lifecycle:warp');
  expect(await page.evaluate(() => window.__orbfieldFixture.engineState?.slowCharges)).toBe(2);
  expect(await calls(page, 'start')).toHaveLength(1);
  expect(await calls(page, 'complete')).toHaveLength(0);
});

test('failed start recovers through Try again without fabricating a completion', async ({ page }, info) => {
  await openLifecycle(page, 'start-failure');
  await page.getByRole('button', { name: 'Start round', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Start new round', exact: true })).toBeVisible();
  await capture(page, info, 'start-failure');
  expect(await calls(page, 'complete')).toHaveLength(0);
  await page.evaluate(() => window.__orbfieldFixture.configure('success'));
  await page.getByRole('button', { name: 'Start new round', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Pause', exact: true })).toBeVisible();
  expect(await calls(page, 'start')).toHaveLength(2);
});

test('completion failure keeps the result with no invented rewards or blind retry', async ({ page }, info) => {
  await openLifecycle(page, 'completion-failure');
  await page.getByRole('button', { name: 'Start round', exact: true }).click();
  await finish(page);
  await expect(page.getByText('We couldn’t confirm your rewards', { exact: false }).first()).toBeVisible();
  expect(await calls(page, 'complete')).toHaveLength(1);
  await expect(page.getByRole('button', { name: /retry|try again/i })).toHaveCount(0);
  await expect(page.getByText(/37\s*XP|11\s*shards/i)).toHaveCount(0);
  await capture(page, info, 'unconfirmed-rewards');
  await page.evaluate(() => window.__orbfieldFixture.configure('success'));
  await page.getByRole('button', { name: 'Play again', exact: true }).click();
  await finish(page);
  await expect(page.getByText(/37\s*XP|XP\s*37/i)).toBeVisible();
  const completed = await calls(page, 'complete');
  expect(completed).toHaveLength(2);
  expect(completed[0].args[0]).not.toBe(completed[1].args[0]);
});

test('short round stays practice and never pads its duration or submits', async ({ page }, info) => {
  await openLifecycle(page, 'practice');
  await page.getByRole('button', { name: 'Start round', exact: true }).click();
  await finish(page, 250);
  await expect(page.getByText('Practice round', { exact: true })).toBeVisible();
  expect(await calls(page, 'complete')).toHaveLength(0);
  await expect(page.getByText(/37\s*XP|11\s*shards/i)).toHaveCount(0);
  await capture(page, info, 'honest-short-practice-round');
});

test('repeated start while pending cannot start two sessions; stale start cannot re-open after navigation', async ({ page }, info) => {
  await openLifecycle(page, 'delayed-start');
  await page.getByRole('button', { name: 'Start round', exact: true }).evaluate((button: HTMLButtonElement) => { button.click(); button.click(); button.click(); });
  await expect.poll(async () => (await calls(page, 'start')).length).toBe(1);
  await capture(page, info, 'pending-start');
  await page.getByRole('button', { name: /back to play/i }).first().click();
  await expect(page.getByRole('heading', { name: 'Play', exact: true })).toBeVisible();
  await page.evaluate(() => window.__orbfieldFixture.release('start'));
  await expect.poll(async () => (await calls(page, 'abandon')).length).toBe(1);
  expect(await page.evaluate(() => window.__orbfieldFixture.engineEvents)).not.toContain('lifecycle:start');
  await page.goBack();
  await expect(page.getByRole('button', { name: 'Start round', exact: true })).toBeVisible();
});

test('delayed completion cannot overwrite a remounted round or apply stale state', async ({ page }) => {
  await openLifecycle(page, 'delayed-completion');
  await page.getByRole('button', { name: 'Start round', exact: true }).click();
  await finish(page);
  expect(await calls(page, 'complete')).toHaveLength(1);
  await page.getByRole('button', { name: /back to play/i }).first().click();
  await page.goBack();
  await expect(page.getByRole('button', { name: 'Start round', exact: true })).toBeVisible();
  await page.evaluate(() => window.__orbfieldFixture.release('completion'));
  await expect(page.getByRole('button', { name: 'Start round', exact: true })).toBeVisible();
  expect(await page.evaluate(() => window.__orbfieldFixture.playerStates)).toEqual([]);
  expect(await page.evaluate(() => window.__orbfieldFixture.ritualUpdates)).toEqual([]);
  await expect(page.getByRole('heading', { name: 'Round complete', exact: true })).toHaveCount(0);
});

test('confirmed results and replay never call or apply the legacy player-state refresh', async ({ page }) => {
  await openLifecycle(page);
  await page.getByRole('button', { name: 'Start round', exact: true }).click();
  await finish(page);
  await expect(page.getByRole('heading', { name: 'Round complete', exact: true })).toBeVisible();
  await expect(page.getByTestId('orbfield-rewards')).toHaveText('+37 XP · +11 shards');
  expect(await calls(page, 'fetchPlayerState')).toHaveLength(0);
  expect(await page.evaluate(() => window.__orbfieldFixture.playerStates)).toEqual([]);
  await page.getByRole('button', { name: 'Play again', exact: true }).click();
  await finish(page);
  await expect(page.getByRole('heading', { name: 'Round complete', exact: true })).toBeVisible();
  expect(await calls(page, 'complete')).toHaveLength(2);
  await page.getByRole('button', { name: /back to play/i }).first().click();
  await expect(page.getByRole('heading', { name: 'Play', exact: true })).toBeVisible();
  expect(await calls(page, 'fetchPlayerState')).toHaveLength(0);
  expect(await page.evaluate(() => window.__orbfieldFixture.playerStates)).toEqual([]);
});

for (const scenario of ['negative-reward', 'fractional-reward']) {
  test(`malformed ${scenario} stays unconfirmed and does not update player state`, async ({ page }, info) => {
    await openLifecycle(page, scenario);
    await page.getByRole('button', { name: 'Start round', exact: true }).click();
    await finish(page);
    await expect(page.getByRole('heading', { name: 'We couldn’t confirm your rewards', exact: true })).toBeVisible();
    await expect(page.getByTestId('orbfield-rewards')).toHaveCount(0);
    await expect(page.getByRole('button', { name: /retry|try again/i })).toHaveCount(0);
    expect(await calls(page, 'complete')).toHaveLength(1);
    expect(await calls(page, 'fetchPlayerState')).toHaveLength(0);
    expect(await page.evaluate(() => window.__orbfieldFixture.playerStates)).toEqual([]);
    expect(await page.evaluate(() => window.__orbfieldFixture.ritualUpdates)).toEqual([]);
    await capture(page, info, scenario);
  });
}

test('blur during delayed start resolves paused and requires explicit Resume without stealing focus', async ({ page }, info) => {
  await openLifecycle(page, 'delayed-start');
  await page.getByRole('button', { name: 'Start round', exact: true }).click();
  await expect(page.getByTestId('orbfield-game')).toHaveAttribute('data-phase', 'starting');
  const back = page.getByRole('button', { name: /back to play/i }).first();
  await back.focus();
  await page.evaluate(() => {
    // Synthetic blur exercises the shell event handler; real tab-background QA remains separate.
    window.dispatchEvent(new Event('blur'));
    window.__orbfieldFixture.release('start');
  });
  await expect(page.getByTestId('orbfield-game')).toHaveAttribute('data-phase', 'paused');
  await expect(page.getByRole('button', { name: 'Resume', exact: true })).toBeVisible();
  await expect(back).toBeFocused();
  await expect(page.getByLabel('Orbfield play area', { exact: true })).not.toBeFocused();
  expect(await page.evaluate(() => window.__orbfieldFixture.engineEvents)).toEqual(['lifecycle:start', 'lifecycle:pause']);
  await page.evaluate(() => window.dispatchEvent(new Event('focus')));
  await expect(page.getByTestId('orbfield-game')).toHaveAttribute('data-phase', 'paused');
  await capture(page, info, 'delayed-start-resolves-paused');
  await page.getByRole('button', { name: 'Resume', exact: true }).click();
  await expect(page.getByTestId('orbfield-game')).toHaveAttribute('data-phase', 'playing');
  await expect(page.getByLabel('Orbfield play area', { exact: true })).toBeFocused();
  expect(await page.evaluate(() => window.__orbfieldFixture.engineEvents)).toEqual(['lifecycle:start', 'lifecycle:pause', 'lifecycle:resume']);
  expect(await calls(page, 'start')).toHaveLength(1);
  expect(await calls(page, 'complete')).toHaveLength(0);
});
