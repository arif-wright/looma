import { expect, test } from '@playwright/test';
import { createClient } from '@supabase/supabase-js';
import { runSeed, type SeedResult } from '../fixtures/env';
import { createAuthedRequest } from '../fixtures/auth';

const SUPABASE_URL = process.env.PUBLIC_SUPABASE_URL!;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;

const adminClient = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: {
    autoRefreshToken: false,
    persistSession: false
  }
});

async function clearNotifications(userId: string) {
  await adminClient.from('notifications').delete().eq('user_id', userId);
}

async function resetState(seed: SeedResult) {
  await clearNotifications(seed.author.id);
  await adminClient.from('notifications').delete().eq('user_id', seed.viewer.id);

  await adminClient
    .from('post_reactions')
    .delete()
    .eq('post_id', seed.postId)
    .eq('user_id', seed.viewer.id);

  await adminClient
    .from('comment_reactions')
    .delete()
    .eq('comment_id', seed.commentId)
    .eq('user_id', seed.viewer.id);

  await adminClient
    .from('shares')
    .delete()
    .eq('post_id', seed.postId)
    .eq('user_id', seed.viewer.id);
}

type NotificationRow = {
  id: string;
  kind: string;
  target_kind: string;
  read: boolean;
};

async function fetchNotifications(userId: string): Promise<NotificationRow[]> {
  const { data, error } = await adminClient
    .from('notifications')
    .select('id, kind, target_kind, read')
    .eq('user_id', userId)
    .order('created_at', { ascending: false });

  if (error) throw error;
  return (data as NotificationRow[]) ?? [];
}

async function waitForNotification(
  userId: string,
  matcher: (payload: { kind: string; target_kind: string }) => boolean
) {
  for (let attempt = 0; attempt < 15; attempt += 1) {
    const rows = await fetchNotifications(userId);
    const match = rows.find((row) => matcher(row));
    if (match) {
      return match;
    }
    await new Promise((resolve) => setTimeout(resolve, 200));
  }
  throw new Error('Notification not observed in expected window');
}

async function expectUnreadCount(userId: string, expected: number) {
  for (let attempt = 0; attempt < 10; attempt += 1) {
    const rows = await fetchNotifications(userId);
    const unread = rows.filter((row) => row.read === false).length;
    if (unread === expected) {
      return;
    }
    await new Promise((resolve) => setTimeout(resolve, 150));
  }
  throw new Error(`Expected unread count to reach ${expected}`);
}

test.describe.serial('Notifications API', () => {
  let seedData: SeedResult;

  test.beforeAll(async () => {
    seedData = await runSeed();
    await resetState(seedData);
  });

  test.beforeEach(async () => {
    await resetState(seedData);
  });

  test('reaction creates notification for author', async () => {
    const viewerContext = await createAuthedRequest(seedData.viewer);
    const res = await viewerContext.post('/api/reactions/post', {
      data: { post_id: seedData.postId, kind: 'like' }
    });
    expect(res.status(), 'reaction request status').toBe(200);

    await waitForNotification(seedData.author.id, (row) => row.kind === 'reaction' && row.target_kind === 'post');
    await viewerContext.dispose();
  });

  test('comment reply creates notification targeting comment', async () => {
    const viewerContext = await createAuthedRequest(seedData.viewer);
    const res = await viewerContext.post('/api/comments', {
      data: {
        postId: seedData.postId,
        replyTo: seedData.commentId,
        body: `Automated reply ${Date.now().toString(36)}`
      }
    });
    expect(res.status(), 'comment request status').toBe(201);

    await waitForNotification(seedData.author.id, (row) => row.kind === 'comment' && row.target_kind === 'comment');
    await viewerContext.dispose();
  });

  test('share creates notification', async () => {
    const viewerContext = await createAuthedRequest(seedData.viewer);
    const res = await viewerContext.post('/api/shares', {
      data: { post_id: seedData.postId }
    });
    expect(res.status(), 'share request status').toBe(200);

    await waitForNotification(seedData.author.id, (row) => row.kind === 'share' && row.target_kind === 'post');
    await viewerContext.dispose();
  });

  test('mark all read clears unread count', async () => {
    // generate a notification first
    const viewerContext = await createAuthedRequest(seedData.viewer);
    const reaction = await viewerContext.post('/api/reactions/post', {
      data: { post_id: seedData.postId, kind: 'like' }
    });
    expect(reaction.status()).toBe(200);

    await waitForNotification(seedData.author.id, (row) => row.kind === 'reaction');

    const authorContext = await createAuthedRequest(seedData.author);
    const markAll = await authorContext.post('/api/notifications', {
      data: { action: 'mark_all' }
    });
    expect(markAll.status(), 'mark all status').toBe(200);

    await expectUnreadCount(seedData.author.id, 0);
    await viewerContext.dispose();
    await authorContext.dispose();
  });
});
