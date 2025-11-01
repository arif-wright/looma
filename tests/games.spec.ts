import { test, expect, request as playwrightRequest } from '@playwright/test';
import { createHmac } from 'crypto';
import { loginAs, VIEWER_CREDENTIALS, createAuthedRequest } from './fixtures/auth';

const SIGNING_SECRET = process.env.GAME_SIGNING_SECRET ?? process.env.VITE_GAME_SIGNING_SECRET ?? 'dev-secret';

const signPayload = (sessionId: string, score: number, durationMs: number, nonce: string) =>
  createHmac('sha256', SIGNING_SECRET).update(`${sessionId}|${score}|${durationMs}|${nonce}`).digest('hex');

test.describe('Games API safeguards', () => {
  test('start session requires auth', async () => {
    const baseURL = process.env.BASE_URL ?? process.env.PLAYWRIGHT_BASE_URL ?? 'http://localhost:5173';
    const anon = await playwrightRequest.newContext({ baseURL, storageState: undefined });
    const response = await anon.post('/api/games/session/start', {
      data: { slug: 'tiles-run' }
    });

    await anon.dispose();
    expect(response.status()).toBe(401);
  });

  test('invalid signature is rejected', async () => {
    const authed = await createAuthedRequest(VIEWER_CREDENTIALS);

    const start = await authed.post('/api/games/session/start', {
      data: { slug: 'tiles-run', clientVersion: '1.0.0' }
    });

    expect(start.ok()).toBeTruthy();
    const { sessionId, nonce } = await start.json();

    const response = await authed.post('/api/games/session/complete', {
      data: {
        sessionId,
        score: 4200,
        durationMs: 90000,
        nonce,
        signature: 'bad-signature'
      }
    });

    expect(response.status()).toBe(403);
  });

  test('scores above cap are rejected', async () => {
    const authed = await createAuthedRequest(VIEWER_CREDENTIALS);

    const start = await authed.post('/api/games/session/start', {
      data: { slug: 'tiles-run' }
    });

    const { sessionId, nonce } = await start.json();
    const score = 200000; // above default cap
    const durationMs = 120000;

    const signature = signPayload(sessionId, score, durationMs, nonce);

    const response = await authed.post('/api/games/session/complete', {
      data: {
        sessionId,
        score,
        durationMs,
        nonce,
        signature
      }
    });

    expect(response.status()).toBe(400);
    const payload = await response.json();
    expect(payload.error).toBe('invalid_score');
  });
});

test.describe('Games hub flow', () => {
  test('user can launch a game and receive rewards', async ({ page }) => {
    await loginAs(page, VIEWER_CREDENTIALS);

    await page.goto('/app/games');
    await expect(page.locator('[data-testid="game-hub"]')).toBeVisible();

    const playButton = page.locator('[data-testid="game-card-tiles-run"]');
    await playButton.click();

    await expect(page).toHaveURL(/\/app\/games\/tiles-run$/);

    const sessionHandle = await page.waitForFunction(() => (window as any).__loomaSession, null, { timeout: 30000 });
    const session = (await sessionHandle.jsonValue()) as { sessionId: string; nonce: string };

    expect(session.sessionId).toBeTruthy();

    const score = 4200;
    const durationMs = 60000;
    const signature = signPayload(session.sessionId, score, durationMs, session.nonce);

    const completion = page.waitForResponse((response) =>
      response.url().includes('/api/games/session/complete')
    );

    await page.evaluate(
      ({ score, durationMs, nonce, signature }) => {
        window.__loomaComplete?.({ score, durationMs, nonce, signature });
      },
      { score, durationMs, nonce: session.nonce, signature }
    );

    const rewardResponse = await completion;
    expect(rewardResponse.status()).toBe(200);

    await expect(page.locator('.reward-callout')).toBeVisible({ timeout: 15000 });
    await expect(page.locator('.reward-callout')).toContainText('XP earned');
  });
});
