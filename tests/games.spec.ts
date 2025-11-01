import { test, expect, request as playwrightRequest } from '@playwright/test';

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
});
