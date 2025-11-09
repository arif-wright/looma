import { expect, test } from '@playwright/test';
import { createClient } from '@supabase/supabase-js';
import { runSeed, type SeedResult } from '../fixtures/env';
import { createAuthedRequest, VIEWER_CREDENTIALS } from '../fixtures/auth';

const SUPABASE_URL = process.env.PUBLIC_SUPABASE_URL!;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;

const adminClient = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false }
});

const upsertedUsers: string[] = [];

const fetchCounts = async (userId: string) => {
  const { data, error } = await adminClient
    .from('follow_counts')
    .select('followers, following')
    .eq('user_id', userId)
    .maybeSingle();
  if (error) {
    throw error;
  }
  return {
    followers: Number(data?.followers ?? 0),
    following: Number(data?.following ?? 0)
  };
};

const resetFollows = async (userIds: string[]) => {
  if (!userIds.length) return;
  const followerClear = await adminClient.from('follows').delete().in('follower_id', userIds);
  if (followerClear.error) {
    throw followerClear.error;
  }
  const followeeClear = await adminClient.from('follows').delete().in('followee_id', userIds);
  if (followeeClear.error) {
    throw followeeClear.error;
  }
};

test.describe.serial('Follow API', () => {
  let seed: SeedResult;

  test.beforeAll(async () => {
    seed = await runSeed();
    upsertedUsers.push(seed.viewer.id, seed.author.id);
    await resetFollows(upsertedUsers);
  });

  test.beforeEach(async () => {
    await resetFollows(upsertedUsers);
  });

  test('follow actions are idempotent and update counts', async () => {
    const followerCtx = await createAuthedRequest(VIEWER_CREDENTIALS);

    const followRes = await followerCtx.post('/api/follow', {
      data: { userId: seed.author.id, action: 'follow' }
    });
    expect(followRes.status(), 'follow status').toBe(200);

    const followAgain = await followerCtx.post('/api/follow', {
      data: { userId: seed.author.id, action: 'follow' }
    });
    expect(followAgain.status(), 'follow idempotent status').toBe(200);

    const authorCounts = await fetchCounts(seed.author.id);
    const viewerCounts = await fetchCounts(seed.viewer.id);
    expect(authorCounts.followers).toBe(1);
    expect(viewerCounts.following).toBe(1);

    const selfFollow = await followerCtx.post('/api/follow', {
      data: { userId: seed.viewer.id, action: 'follow' }
    });
    expect(selfFollow.status(), 'self follow status').toBe(400);

    const unfollowRes = await followerCtx.post('/api/follow', {
      data: { userId: seed.author.id, action: 'unfollow' }
    });
    expect(unfollowRes.status(), 'unfollow status').toBe(200);

    const authorAfter = await fetchCounts(seed.author.id);
    const viewerAfter = await fetchCounts(seed.viewer.id);
    expect(authorAfter.followers).toBe(0);
    expect(viewerAfter.following).toBe(0);

    await followerCtx.dispose();
  });
});
