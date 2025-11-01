import { test, expect, request as playwrightRequest } from '@playwright/test';
import { VIEWER_CREDENTIALS, createAuthedRequest } from './fixtures/auth';

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

  test('nonce mismatch is rejected', async () => {
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
        nonce: `${nonce}-mismatch`
      }
    });

    expect(response.status()).toBe(400);
    const payload = await response.json();
    expect(payload.error).toBe('bad_request');
    expect(payload.details).toBe('Nonce mismatch');
  });

  test('scores above cap are rejected', async () => {
    const authed = await createAuthedRequest(VIEWER_CREDENTIALS);

    const start = await authed.post('/api/games/session/start', {
      data: { slug: 'tiles-run' }
    });

    const { sessionId, nonce } = await start.json();
    const score = 400000; // above cap for tiles-run
    const durationMs = 120000;

    const response = await authed.post('/api/games/session/complete', {
      data: {
        sessionId,
        score,
        durationMs,
        nonce
      }
    });

    expect(response.status()).toBe(400);
    const payload = await response.json();
    expect(payload.error).toBe('invalid_score');
  });
});
