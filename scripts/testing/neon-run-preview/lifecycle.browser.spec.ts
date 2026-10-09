import { test, expect, capture, calls, finish, openLifecycle, start, phase, back } from './guard';

test('explicit start, true engine stats, only confirmed server rewards and replay reset', async ({ page }, info) => {
  await openLifecycle(page);
  expect(await calls(page, 'start')).toHaveLength(0);
  await expect(page.getByTestId('neon-run-score')).toHaveText('0');
  await capture(page, info, 'ready');
  await start(page);
  await finish(page);
  await phase(page, 'complete');
  await expect(page.getByRole('heading', { name: 'Run complete' })).toBeVisible();
  await expect(page.getByTestId('neon-run-score')).toHaveText('84');
  await expect(page.getByTestId('neon-run-rewards')).toHaveText('+37 XP · +11 shards');
  const completed = await calls(page, 'complete');
  expect(completed).toHaveLength(1);
  expect(completed[0].args[1]).toMatchObject({ score: 84, durationMs: 8000, success: false, stats: {
    shards: 4, shardsCollected: 4, distance_meters: 82, distanceMeters: 82, simulation_elapsed_ms: 7990,
    powerupsUsed: { shield: 1, magnet: 2, doubleShards: 3, slowMo: 4, dash: 5, dreamSurge: 6 }
  } });
  expect(await page.evaluate(() => window.__neonRunFixture.ritualUpdates)).toEqual([[{ id: 'synthetic-ritual', state: 'complete' }]]);
  await capture(page, info, 'confirmed-rewards');
  await page.getByRole('button', { name: 'Play again', exact: true }).click();
  await phase(page, 'playing');
  await expect(page.getByTestId('neon-run-score')).toHaveText('0');
  expect(await calls(page, 'start')).toHaveLength(2);
  expect(await page.evaluate(() => window.__neonRunFixture.engineState)).toMatchObject({ score: 0, elapsedMs: 0, distanceMeters: 0, shardsCollected: 0, powerups: { shield: true } });
  await expect(page.getByTestId('neon-run-rewards')).toHaveCount(0);
  await back(page);
  await page.goBack();
  await phase(page, 'ready');
  expect(await calls(page, 'start')).toHaveLength(2);
});

test('pause, explicit resume and touch Jump retain one session', async ({ page }, info) => {
  await openLifecycle(page); await start(page);
  const canvas = page.getByTestId('neon-run-canvas');
  await expect(canvas).toHaveAttribute('tabindex', '0');
  await page.getByRole('button', { name: 'Pause', exact: true }).click();
  await phase(page, 'paused');
  await expect(page.getByRole('button', { name: 'Jump', exact: true })).toBeDisabled();
  await capture(page, info, 'paused');
  await page.getByRole('button', { name: 'Resume', exact: true }).click();
  await phase(page, 'playing');
  await expect(canvas).toBeFocused();
  await page.getByRole('button', { name: 'Jump', exact: true }).tap();
  expect(await page.evaluate(() => window.__neonRunFixture.engineEvents)).toEqual(['lifecycle:start', 'lifecycle:pause', 'lifecycle:resume', 'lifecycle:jump']);
  expect(await calls(page, 'start')).toHaveLength(1);
  expect(await calls(page, 'complete')).toHaveLength(0);
});

test('early practice never pads duration or sends completion', async ({ page }, info) => {
  await openLifecycle(page, 'practice'); await start(page); await finish(page, 250);
  await phase(page, 'practice');
  await expect(page.getByRole('heading', { name: 'Practice run', exact: true })).toBeVisible();
  expect(await calls(page, 'complete')).toHaveLength(0);
  expect(await calls(page, 'abandon')).toHaveLength(1);
  expect(await page.evaluate(() => window.__neonRunFixture.finishedSource?.durationMs)).toBe(250);
  await expect(page.getByTestId('neon-run-rewards')).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Retry saving', exact: true })).toHaveCount(0);
  await capture(page, info, 'practice-no-reward');
});

test('start failure recovers without fabricated completion', async ({ page }, info) => {
  await openLifecycle(page, 'start-failure');
  await page.getByRole('button', { name: 'Start run', exact: true }).click();
  await phase(page, 'start-error');
  expect(await calls(page, 'complete')).toHaveLength(0);
  expect(await page.evaluate(() => window.__neonRunFixture.engineEvents)).toEqual([]);
  await capture(page, info, 'start-error');
  await page.evaluate(() => window.__neonRunFixture.configure('success'));
  await page.getByRole('button', { name: 'Start new run', exact: true }).click();
  await phase(page, 'playing');
  expect(await calls(page, 'start')).toHaveLength(2);
});

test('unauthorized start offers a local sign-in destination without gameplay', async ({ page }) => {
  await openLifecycle(page, 'unauthorized');
  await page.getByRole('button', { name: 'Start run', exact: true }).click();
  await phase(page, 'start-error');
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Sign in', exact: true })).toBeVisible();
  expect(await calls(page, 'complete')).toHaveLength(0);
  expect(await page.evaluate(() => window.__neonRunFixture.engineEvents)).toEqual([]);
});

test('failed completion retries the same frozen session and payload, once, after mutation', async ({ page }, info) => {
  await openLifecycle(page, 'completion-failure'); await start(page); await finish(page);
  await phase(page, 'save-error');
  await expect(page.getByTestId('neon-run-rewards')).toHaveCount(0);
  const original = (await calls(page, 'complete'))[0];
  expect(original).toBeTruthy();
  await capture(page, info, 'save-error-exact-retry');
  await page.evaluate(() => {
    const source = window.__neonRunFixture.finishedSource!;
    // The shell must copy/freeze the result rather than reread this engine-owned object.
    source.score = 9999; source.durationMs = 99999; source.meta!.shards = 900;
    source.meta!.shield_powerups = 999;
    window.__neonRunFixture.configure('delayed-completion');
  });
  await page.getByRole('button', { name: 'Retry saving', exact: true }).evaluate((button: HTMLButtonElement) => { button.click(); button.click(); button.click(); });
  await phase(page, 'saving');
  expect(await calls(page, 'complete')).toHaveLength(2);
  expect((await calls(page, 'complete'))[1]).toEqual(original);
  expect(await page.evaluate(() => window.__neonRunFixture.completionFrozen)).toEqual([true, true]);
  expect(await calls(page, 'start')).toHaveLength(1);
  await expect(page.getByTestId('neon-run-rewards')).toHaveCount(0);
  await page.evaluate(() => window.__neonRunFixture.release('completion'));
  await phase(page, 'complete');
  await expect(page.getByTestId('neon-run-rewards')).toHaveText('+37 XP · +11 shards');
  expect(await page.evaluate(() => window.__neonRunFixture.ritualUpdates)).toHaveLength(1);
  expect(await calls(page, 'complete')).toHaveLength(2);
});

test('choosing a new run after uncertain save abandons retry and uses a new session', async ({ page }) => {
  await openLifecycle(page, 'completion-failure'); await start(page); await finish(page);
  await phase(page, 'save-error');
  await page.evaluate(() => window.__neonRunFixture.configure('success'));
  await page.getByRole('button', { name: 'Play again', exact: true }).click();
  await phase(page, 'playing'); await finish(page); await phase(page, 'complete');
  const completed = await calls(page, 'complete');
  expect(completed).toHaveLength(2);
  expect(completed[0].args[0]).not.toBe(completed[1].args[0]);
  expect((await calls(page, 'abandon')).map((call) => call.args[0])).toContain(completed[0].args[0]);
});

test('rapid repeated start is singleflight and deferred start cannot reopen after exit', async ({ page }, info) => {
  await openLifecycle(page, 'delayed-start');
  await page.getByRole('button', { name: 'Start run', exact: true }).evaluate((button: HTMLButtonElement) => { button.click(); button.click(); button.click(); });
  await phase(page, 'starting');
  expect(await calls(page, 'start')).toHaveLength(1);
  await capture(page, info, 'starting'); await back(page);
  await page.evaluate(() => window.__neonRunFixture.release('start'));
  await expect.poll(async () => (await calls(page, 'abandon')).length).toBe(1);
  expect(await page.evaluate(() => window.__neonRunFixture.engineEvents)).not.toContain('lifecycle:start');
  expect(await calls(page, 'complete')).toHaveLength(0);
  await page.goBack(); await phase(page, 'ready');
});

test('deferred completion after exit never applies rewards or rituals to remounted shell', async ({ page }, info) => {
  await openLifecycle(page, 'delayed-completion'); await start(page); await finish(page);
  await phase(page, 'saving');
  expect(await calls(page, 'complete')).toHaveLength(1);
  await capture(page, info, 'saving'); await back(page);
  await page.goBack(); await phase(page, 'ready');
  await page.evaluate(() => window.__neonRunFixture.release('completion'));
  // Cross an event-loop turn so continuation and Svelte updates have run.
  await page.evaluate(() => new Promise<void>((resolve) => setTimeout(resolve, 0)));
  await phase(page, 'ready');
  expect(await page.evaluate(() => window.__neonRunFixture.ritualUpdates)).toEqual([]);
  await expect(page.getByTestId('neon-run-rewards')).toHaveCount(0);
  expect(await calls(page, 'abandon')).toHaveLength(1);
});

for (const background of ['blur', 'visibility'] as const) {
  test(`${background} during delayed start resolves paused; focus cannot auto-resume`, async ({ page }, info) => {
    await openLifecycle(page, 'delayed-start');
    await page.getByRole('button', { name: 'Start run', exact: true }).click();
    await phase(page, 'starting');
    const exit = page.getByRole('button', { name: /back to play/i }).first(); await exit.focus();
    await page.evaluate((kind) => {
      // Synthetic lifecycle notification, not evidence of a real browser tab transition.
      if (kind === 'visibility') { Object.defineProperty(document, 'hidden', { configurable: true, value: true }); document.dispatchEvent(new Event('visibilitychange')); }
      else window.dispatchEvent(new Event('blur'));
      window.__neonRunFixture.release('start');
    }, background);
    await phase(page, 'paused'); await expect(exit).toBeFocused();
    expect(await page.evaluate(() => window.__neonRunFixture.engineEvents)).toEqual(['lifecycle:start', 'lifecycle:pause']);
    await page.evaluate(() => {
      Object.defineProperty(document, 'hidden', { configurable: true, value: false });
      document.dispatchEvent(new Event('visibilitychange')); window.dispatchEvent(new Event('focus'));
    });
    await phase(page, 'paused'); await capture(page, info, `${background}-delayed-start-paused`);
    await page.getByRole('button', { name: 'Resume', exact: true }).click(); await phase(page, 'playing');
    await expect(page.getByTestId('neon-run-canvas')).toBeFocused();
    expect(await calls(page, 'start')).toHaveLength(1);
    expect(await calls(page, 'complete')).toHaveLength(0);
  });
}

for (const scenario of ['negative-reward', 'fractional-reward']) {
  test(`malformed ${scenario} cannot claim rewards`, async ({ page }, info) => {
    await openLifecycle(page, scenario); await start(page); await finish(page); await phase(page, 'save-error');
    await expect(page.getByTestId('neon-run-rewards')).toHaveCount(0);
    expect(await calls(page, 'complete')).toHaveLength(1);
    expect(await page.evaluate(() => window.__neonRunFixture.ritualUpdates)).toEqual([]);
    await capture(page, info, scenario);
  });
}
