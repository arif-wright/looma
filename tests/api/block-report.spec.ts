import { expect, test } from '@playwright/test';
import { createClient } from '@supabase/supabase-js';
import { runSeed, type SeedResult } from '../fixtures/env';
import { AUTHOR_CREDENTIALS, VIEWER_CREDENTIALS, createAuthedRequest } from '../fixtures/auth';

const SUPABASE_URL = process.env.PUBLIC_SUPABASE_URL!;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;

const adminClient = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false }
});

const buildPairFilter = (fieldA: string, fieldB: string, ids: [string, string]) =>
  `and(${fieldA}.eq.${ids[0]},${fieldB}.eq.${ids[1]}),and(${fieldA}.eq.${ids[1]},${fieldB}.eq.${ids[0]})`;

const cleanupEdges = async (seed: SeedResult) => {
  const ids: [string, string] = [seed.viewer.id, seed.author.id];

  const blockFilter = buildPairFilter('blocker_id', 'blocked_id', ids);
  await adminClient.from('blocks').delete().or(blockFilter);

  const followRequestFilter = buildPairFilter('requester_id', 'target_id', ids);
  await adminClient.from('follow_requests').delete().or(followRequestFilter);

  const followFilter = buildPairFilter('follower_id', 'followee_id', ids);
  await adminClient.from('follows').delete().or(followFilter);
};

test.describe.serial('Safety APIs', () => {
  let seed: SeedResult;

  test.beforeAll(async () => {
    seed = await runSeed();
    await cleanupEdges(seed);
  });

  test.afterEach(async () => {
    await cleanupEdges(seed);
  });

  test('block prevents new follow requests', async () => {
    const viewerCtx = await createAuthedRequest(VIEWER_CREDENTIALS);
    const authorCtx = await createAuthedRequest(AUTHOR_CREDENTIALS);

    const blockRes = await viewerCtx.post('/api/safety/block', {
      data: { userId: seed.author.id }
    });
    expect(blockRes.status(), 'block status').toBe(200);

    const followRequestRes = await authorCtx.post('/api/privacy/follow-request', {
      data: { userId: seed.viewer.id }
    });
    expect(followRequestRes.status(), 'blocked follow request').toBeGreaterThanOrEqual(400);

    await viewerCtx.dispose();
    await authorCtx.dispose();
  });

  test('report submission succeeds', async () => {
    const viewerCtx = await createAuthedRequest(VIEWER_CREDENTIALS);
    const reportRes = await viewerCtx.post('/api/safety/report', {
      data: {
        targetKind: 'post',
        targetId: seed.postId,
        reason: 'spam',
        details: 'Playwright smoke report'
      }
    });
    expect(reportRes.status(), 'report status').toBeLessThan(500);
    await viewerCtx.dispose();
  });
});
