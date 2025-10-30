import { expect, test } from '@playwright/test';
import { seed, type SeedResult } from '../fixtures/env';
import { createApiRequestContext } from '../fixtures/auth';

test.describe.serial('Shares API', () => {
  let seedData: SeedResult;

  test.beforeAll(async () => {
    seedData = await seed();
  });

  test('reposting increments share count', async ({ browser }) => {
    const apiContext = await createApiRequestContext(browser, seedData.viewer);
    const res = await apiContext.post('/api/shares', {
      data: { post_id: seedData.postId }
    });
    expect(res.status(), 'repost status').toBe(200);
    const body = await res.json();
    expect(body.shares_count).toBeGreaterThanOrEqual(1);
    await apiContext.dispose();
  });

  test('quote share succeeds within limit', async ({ browser }) => {
    const apiContext = await createApiRequestContext(browser, seedData.viewer);
    const res = await apiContext.post('/api/shares', {
      data: { post_id: seedData.postId, quote: 'Looking good from automated tests!' }
    });
    expect(res.status(), 'quote status').toBe(200);
    const body = await res.json();
    expect(body.shares_count).toBeGreaterThanOrEqual(2);
    await apiContext.dispose();
  });

  test('unauthenticated share returns 401', async ({ request }) => {
    const res = await request.post('/api/shares', {
      data: { post_id: seedData.postId }
    });
    expect(res.status(), 'unauthenticated share status').toBe(401);
  });

  test('quotes longer than 280 chars return 400', async ({ browser }) => {
    const apiContext = await createApiRequestContext(browser, seedData.viewer);
    const longQuote = 'x'.repeat(300);
    const res = await apiContext.post('/api/shares', {
      data: { post_id: seedData.postId, quote: longQuote }
    });
    expect(res.status(), 'long quote status').toBe(400);
    await apiContext.dispose();
  });
});
