import { test, expect, snapshot, shell, phase, startLabel, newLabel, api, START, SIGN, COMPLETE,
  open, clickStart, pending, deadline, emitAuth, release, finish, noEngine } from './guard';
import type { Kind, Stage } from './runtime';

// 21 cases per maintained shell = 42 discoverable browser cases. Discovery is NOT execution.
for (const kind of ['neon', 'orbfield'] as const satisfies readonly Kind[]) {
  test.describe(`${kind}: actual shell + actual SDK, synthetic collaborators`, () => {
    for (const stage of ['fetch', 'body', 'error-body'] as const satisfies readonly Stage[]) {
      test(`30-second ${stage} timeout is uncertain, never auto-replayed, and ignores a late reply`, async ({ page }, info) => {
        await open(page, kind, { stage }); await clickStart(page, kind); await deadline(page, kind, stage);
        await expect(shell(page, kind)).toContainText('A session may already exist.');
        await expect(shell(page, kind)).toContainText('may count toward your daily limit');
        await expect(page.getByRole('button', { name: newLabel(kind), exact: true })).toBeVisible();
        await expect.poll(() => page.evaluate(() => document.activeElement?.tagName)).toBe('H2');
        if (stage === 'fetch') await info.attach(`${kind}-uncertain-start`, { body: await page.screenshot({ fullPage: true }), contentType: 'image/png' });
        // Observation window: four further start deadlines, with no user action.
        await page.clock.runFor(120_000);
        expect(await api(page, START)).toHaveLength(1); await noEngine(page);
        await release(page); await phase(page, kind, 'start-error'); await noEngine(page);
        expect(await api(page, START)).toHaveLength(1);
        expect(await api(page, SIGN)).toHaveLength(0); expect(await api(page, COMPLETE)).toHaveLength(0);
        expect((await snapshot(page)).callbacks).toBe(1); // Mounted owner watcher only.
      });
    }

    test('repeated clicks open one request; explicit new start settles only its own identity after an old reply', async ({ page }) => {
      await open(page, kind, { stage: 'fetch' });
      // Deliberately dispatch the UI event three times in one task to exercise the
      // handler guard even if disabled-button browser hit testing would suppress it.
      await page.getByRole('button', { name: startLabel(kind), exact: true }).evaluate((button) => {
        for (let i = 0; i < 3; i++) button.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      });
      await pending(page, kind); expect(await api(page, START)).toHaveLength(1);
      await deadline(page, kind);
      await page.getByRole('button', { name: newLabel(kind), exact: true }).evaluate((button) => {
        for (let i = 0; i < 3; i++) button.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      });
      await phase(page, kind, 'playing'); expect(await api(page, START)).toHaveLength(2);
      let state = await snapshot(page);
      expect(state.engines).toHaveLength(1);
      expect(state.events.filter((event) => event.name === 'game.session.start').map((event) => event.payload.sessionId)).toEqual(['new-session-1']);
      await release(page); await phase(page, kind, 'playing');
      state = await snapshot(page);
      expect(state.engines).toHaveLength(1);
      expect(state.events.filter((event) => event.name === 'game.session.start').map((event) => event.payload.sessionId)).toEqual(['new-session-1']);
      const startAnalytics = state.analytics.filter((event) => event.name === 'game_session_started');
      expect(startAnalytics).toHaveLength(1);
      expect(startAnalytics[0]).toMatchObject({ payload: { payload: { sessionId: 'new-session-1' } } });
      await finish(page, kind); await phase(page, kind, 'complete');
      const signed = await api(page, SIGN), completed = await api(page, COMPLETE);
      expect(signed).toHaveLength(1); expect(completed).toHaveLength(1);
      expect(signed[0].body).toMatchObject({ sessionId: 'new-session-1', nonce: 'nonce-new-session-1' });
      expect(completed[0].body).toMatchObject({ sessionId: 'new-session-1', nonce: 'nonce-new-session-1' });
      await expect(shell(page, kind)).toContainText('+37 XP');
      state = await snapshot(page);
      expect(state.events.filter((event) => event.name === 'game.complete').map((event) => event.payload.sessionId)).toEqual(['new-session-1']);
      expect(state.playerStates).toHaveLength(0);
    });

    test('a successful original start preserves its original session and nonce through completion', async ({ page }, info) => {
      await open(page, kind); await clickStart(page, kind); await phase(page, kind, 'playing');
      expect(await api(page, START)).toHaveLength(1);
      const state = await snapshot(page);
      expect(state.engines).toHaveLength(1);
      expect(state.engines[0].skinKeys).toHaveLength(kind === 'neon' ? 5 : 4);
      expect(state.events[0]).toMatchObject({ name: 'game.session.start', payload: { sessionId: 'original-session' } });
      expect((await api(page, START))[0].body).not.toHaveProperty('ownerId');
      await finish(page, kind); await phase(page, kind, 'complete');
      expect((await api(page, SIGN))[0].body).toMatchObject({ sessionId: 'original-session', nonce: 'nonce-original-session' });
      expect((await api(page, COMPLETE))[0].body).toMatchObject({ sessionId: 'original-session', nonce: 'nonce-original-session' });
      await expect(shell(page, kind)).toContainText('+37 XP');
      await info.attach(`${kind}-confirmed-synthetic-receipt`, { body: await page.screenshot({ fullPage: true }), contentType: 'image/png' });
    });

    for (const action of ['exit', 'unmount'] as const) {
      test(`${action} aborts a pending start and rejects its late response`, async ({ page }) => {
        await open(page, kind, { stage: 'fetch' }); await clickStart(page, kind); await pending(page, kind);
        if (action === 'exit') await page.getByRole('button', { name: '← Back to Play', exact: true }).click();
        else await page.evaluate(() => window.__startRecovery.unmount());
        await expect(page.getByRole('heading', { name: action === 'exit' ? 'Play' : 'Fixture unmounted', exact: true })).toBeVisible();
        expect((await api(page, START))[0].aborted).toBe(true);
        await expect.poll(async () => (await snapshot(page)).callbacks).toBe(0);
        await release(page); await page.clock.runFor(30_000); await noEngine(page);
        await expect(shell(page, kind)).toHaveCount(0);
        expect(await api(page, START)).toHaveLength(1);
        if (action === 'exit') { await expect(page).toHaveURL(/\/app\/games$/); expect((await snapshot(page)).navigations).toEqual(['/app/games']); }
      });
    }

    for (const change of ['account switch', 'sign out'] as const) {
      test(`${change} aborts pending start and offers the correct recovery action`, async ({ page }) => {
        const signedOut = change === 'sign out';
        await open(page, kind, { stage: 'fetch' }); await clickStart(page, kind); await pending(page, kind);
        await emitAuth(page, signedOut ? 'SIGNED_OUT' : 'SIGNED_IN', signedOut ? null : 'owner-b');
        await phase(page, kind, 'start-error');
        await expect(shell(page, kind)).toContainText(signedOut ? 'You were signed out' : 'Your account changed');
        await expect(page.getByRole('button', { name: signedOut ? 'Sign in' : 'Refresh page', exact: true })).toBeVisible();
        expect((await api(page, START))[0].aborted).toBe(true);
        await release(page); await noEngine(page); expect(await api(page, START)).toHaveLength(1);
      });
    }

    test('same-owner token refresh keeps the pending start; a synthetic background signal pauses it on arrival', async ({ page }) => {
      await open(page, kind, { stage: 'fetch' }); await clickStart(page, kind); await pending(page, kind);
      await emitAuth(page, 'TOKEN_REFRESHED', 'owner-a'); await emitAuth(page, 'SIGNED_IN', 'owner-a');
      await phase(page, kind, 'starting'); expect((await api(page, START))[0].aborted).toBe(false);
      await page.evaluate(() => window.dispatchEvent(new Event('blur')));
      await release(page); await phase(page, kind, 'paused');
      expect((await snapshot(page)).engineEvents).toEqual(['0:start', '0:pause']);
      expect(await api(page, START)).toHaveLength(1);
    });

    for (const action of ['owner change', 'unmount'] as const) {
      test(`${action} during the explicit preload gate prevents any server-session attempt`, async ({ page }) => {
        await open(page, kind, { holdArt: '1' }); await clickStart(page, kind); await phase(page, kind, 'starting');
        expect(await api(page, START)).toHaveLength(0);
        if (action === 'owner change') { await emitAuth(page, 'SIGNED_IN', 'owner-b'); await phase(page, kind, 'start-error'); }
        else { await page.evaluate(() => window.__startRecovery.unmount()); await expect(page.getByRole('heading', { name: 'Fixture unmounted' })).toBeVisible(); }
        await page.evaluate(() => window.__startRecovery.releaseArt());
        await noEngine(page); expect(await api(page, START)).toHaveLength(0);
        if (action === 'unmount') expect((await snapshot(page)).callbacks).toBe(0);
      });
    }

    test('the first Auth event cannot adopt owner B during the rendered owner A preload', async ({ page }) => {
      await open(page, kind, { auth: 'hold', holdArt: '1' }); await clickStart(page, kind); await phase(page, kind, 'starting');
      expect((await snapshot(page)).authNotifications).toBe(0);
      await emitAuth(page, 'SIGNED_IN', 'owner-b'); await emitAuth(page, 'INITIAL_SESSION', 'owner-b');
      await phase(page, kind, 'start-error'); await expect(shell(page, kind)).toContainText('Your account changed');
      await page.evaluate(() => window.__startRecovery.releaseArt());
      expect(await api(page, START)).toHaveLength(0); await noEngine(page);
    });

    test('an initial owner mismatch before Start fails closed with Refresh page', async ({ page }) => {
      await open(page, kind, { auth: 'other-owner' }); await clickStart(page, kind); await phase(page, kind, 'start-error');
      await expect(page.getByRole('button', { name: 'Refresh page', exact: true })).toBeVisible();
      expect(await api(page, START)).toHaveLength(0); await noEngine(page);
    });

    test('unavailable Auth renders safely and fails closed before any API request', async ({ page }) => {
      await open(page, kind, { auth: 'unavailable' }); await clickStart(page, kind); await phase(page, kind, 'start-error');
      await expect(page.getByRole('button', { name: newLabel(kind), exact: true })).toBeVisible();
      expect(await api(page, START)).toHaveLength(0); expect((await snapshot(page)).callbacks).toBe(0); await noEngine(page);
    });

    test('missing initial Auth notification times out at 30 seconds without opening a session', async ({ page }) => {
      await open(page, kind, { auth: 'hold' }); await clickStart(page, kind); await phase(page, kind, 'starting');
      await expect.poll(async () => (await snapshot(page)).authSubscriptions).toBe(2);
      expect((await snapshot(page)).callbacks).toBe(2); expect(await api(page, START)).toHaveLength(0);
      await page.clock.runFor(29_999); await phase(page, kind, 'starting');
      await page.clock.runFor(1); await phase(page, kind, 'start-error');
      await expect(shell(page, kind)).toContainText('We couldn’t check your sign-in.');
      expect((await snapshot(page)).callbacks).toBe(1); expect(await api(page, START)).toHaveLength(0); await noEngine(page);
    });

    test('Refresh page really reloads once, without automatically starting against stale rendered ownership', async ({ page }) => {
      await open(page, kind, { stage: 'fetch' }); await clickStart(page, kind); await pending(page, kind);
      await emitAuth(page, 'SIGNED_IN', 'owner-b'); await phase(page, kind, 'start-error');
      const beforeReload = await snapshot(page);
      expect(beforeReload.persistedStarts).toBe(1);
      expect(beforeReload.blocked).toEqual([]); expect(beforeReload.playerStates).toEqual([]);
      expect(beforeReload.engines).toEqual([]); expect(beforeReload.events).toEqual([]);
      expect(beforeReload.analytics).toEqual([]);
      expect(beforeReload.api).toHaveLength(1); expect(beforeReload.api[0].aborted).toBe(true);
      const beforeUrl = page.url();
      const documentRequests: string[] = [];
      page.on('request', (request) => {
        if (request.isNavigationRequest() && request.frame() === page.mainFrame()) documentRequests.push(request.url());
      });
      await page.evaluate(() => { document.documentElement.dataset.startRecoveryReloadProbe = 'old-document'; });
      const [response] = await Promise.all([
        page.waitForNavigation({ waitUntil: 'domcontentloaded' }),
        page.getByRole('button', { name: 'Refresh page', exact: true }).click()
      ]);
      expect(response?.request().isNavigationRequest(), 'A real document request, not same-document navigation').toBe(true);
      expect(response?.url()).toBe(beforeUrl);
      await expect.poll(async () => page.evaluate(() => window.__startRecovery?.ready ?? false)).toBe(true);
      await phase(page, kind, 'ready');
      // Playwright's installed clock intentionally returns no performance entries.
      // A same-URL document request plus a missing old-document marker proves reload.
      expect(documentRequests).toEqual([beforeUrl]);
      await expect(page.locator('html')).not.toHaveAttribute('data-start-recovery-reload-probe');
      expect((await snapshot(page)).persistedStarts).toBe(1);
      expect(await api(page, START)).toHaveLength(0); await noEngine(page);
    });

    test('already signed-out Auth offers Sign in and navigates locally without an API request', async ({ page }) => {
      await open(page, kind, { auth: 'signed-out' }); await clickStart(page, kind); await phase(page, kind, 'start-error');
      await page.getByRole('button', { name: 'Sign in', exact: true }).click();
      await expect(page).toHaveURL(/\/app\/auth$/);
      await expect(page.getByRole('heading', { name: 'Sign in', exact: true })).toBeVisible();
      expect(await api(page, START)).toHaveLength(0); expect((await snapshot(page)).callbacks).toBe(0); await noEngine(page);
    });

    test('a short practice run still skips signing, completion and local rewards', async ({ page }) => {
      await open(page, kind); await clickStart(page, kind); await phase(page, kind, 'playing');
      await finish(page, kind, 250); await phase(page, kind, 'practice');
      expect(await api(page, SIGN)).toHaveLength(0); expect(await api(page, COMPLETE)).toHaveLength(0);
      expect((await snapshot(page)).events.filter((event) => event.name === 'game.complete')).toHaveLength(0);
      expect((await snapshot(page)).playerStates).toHaveLength(0);
      await expect(shell(page, kind)).not.toContainText('+37 XP');
    });

    for (const change of ['account switch', 'sign out'] as const) {
      test(`${change} after timeout blocks explicit new start before another API attempt`, async ({ page }) => {
        const signedOut = change === 'sign out';
        await open(page, kind, { stage: 'fetch' }); await clickStart(page, kind); await deadline(page, kind);
        await emitAuth(page, signedOut ? 'SIGNED_OUT' : 'SIGNED_IN', signedOut ? null : 'owner-b');
        await page.getByRole('button', { name: newLabel(kind), exact: true }).click();
        await phase(page, kind, 'start-error');
        await expect(page.getByRole('button', { name: signedOut ? 'Sign in' : 'Refresh page', exact: true })).toBeVisible();
        await release(page); expect(await api(page, START)).toHaveLength(1); await noEngine(page);
      });
    }
  });
}
