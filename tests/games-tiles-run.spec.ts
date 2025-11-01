import { test, expect } from '@playwright/test';
import { loginAs, VIEWER_CREDENTIALS } from './fixtures/auth';

test.describe('Tiles Run embed bridge', () => {
  test('completes session and surfaces rewards toast', async ({ page }) => {
    await loginAs(page, VIEWER_CREDENTIALS);

    const sessionPayload = { sessionId: 'session-123', nonce: 'nonce-xyz' };
    let completePayload: Record<string, unknown> | null = null;

    await page.route('**/api/games/session/start', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(sessionPayload)
      });
    });

    await page.route('**/api/games/session/complete', async (route) => {
      try {
        completePayload = route.request().postDataJSON();
      } catch {
        const raw = route.request().postData();
        completePayload = raw ? JSON.parse(raw) : null;
      }

      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ xpDelta: 12, currencyDelta: 24 })
      });
    });

    const startRequest = page.waitForRequest('**/api/games/session/start');

    await page.goto('/app/games/tiles-run');

    const iframeLocator = page.locator('iframe[data-testid="tiles-embed"]');
    await expect(iframeLocator).toBeVisible();

    await startRequest;

    const iframeHandle = await iframeLocator.elementHandle();
    const embedFrame = await iframeHandle?.contentFrame();
    expect(embedFrame).toBeTruthy();

    await embedFrame!.evaluate(({ nonce }) => {
      parent.postMessage({ type: 'GAME_COMPLETE', payload: { score: 1234, durationMs: 18456, nonce } }, '*');
    }, { nonce: sessionPayload.nonce });

    await page.waitForResponse('**/api/games/session/complete');

    const rewardToast = page.locator('[data-testid="reward-toast"]');
    await expect(rewardToast).toBeVisible();
    await expect(rewardToast).toContainText('+12 XP');
    await expect(rewardToast).toContainText('+24 shards');

    expect(completePayload).not.toBeNull();
    expect(completePayload!).toMatchObject({
      sessionId: sessionPayload.sessionId,
      score: 1234,
      durationMs: 18456,
      nonce: sessionPayload.nonce
    });
  });
});
