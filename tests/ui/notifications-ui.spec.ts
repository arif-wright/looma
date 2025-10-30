import { expect, request, test } from '@playwright/test';
import { createClient } from '@supabase/supabase-js';
import { BASE_URL, seedMinimal, type SeedResult } from '../fixtures/env';
import { loginAs } from '../fixtures/auth';

const SUPABASE_URL = process.env.PUBLIC_SUPABASE_URL!;
const SUPABASE_ANON_KEY = process.env.PUBLIC_SUPABASE_ANON_KEY!;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;

const adminClient = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: {
    autoRefreshToken: false,
    persistSession: false
  }
});

const projectRef = (() => {
  const host = new URL(SUPABASE_URL).host;
  const [subdomain] = host.split('.');
  return subdomain;
})();

type Credentials = { email: string; password: string };

type NotificationRow = {
  id: string;
  kind: string;
  target_kind: string;
  read: boolean;
};

async function buildAuthedRequest(user: Credentials) {
  const client = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: {
      autoRefreshToken: false,
      persistSession: false
    }
  });

  const { data, error } = await client.auth.signInWithPassword(user);
  if (error || !data.session) {
    throw new Error(`Unable to create session for ${user.email}: ${error?.message ?? 'unknown error'}`);
  }

  const session = data.session;
  const cookieHeader = [
    `sb-${projectRef}-access-token=${session.access_token}`,
    `sb-${projectRef}-refresh-token=${session.refresh_token}`
  ].join('; ');

  return request.newContext({
    baseURL: BASE_URL,
    extraHTTPHeaders: {
      Cookie: cookieHeader,
      Authorization: `Bearer ${session.access_token}`
    }
  });
}

async function fetchNotifications(userId: string): Promise<NotificationRow[]> {
  const { data, error } = await adminClient
    .from('notifications')
    .select('id, kind, target_kind, read')
    .eq('user_id', userId)
    .order('created_at', { ascending: false });

  if (error) throw error;
  return (data as NotificationRow[]) ?? [];
}

async function resetState(seed: SeedResult) {
  await adminClient.from('notifications').delete().in('user_id', [seed.author.id, seed.viewer.id]);
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

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

test.describe('Notifications UI', () => {
  test.slow();

  let seedData: SeedResult;
  let viewerRequest: request.APIRequestContext;

  test.beforeAll(async () => {
    seedData = await seedMinimal();
    await resetState(seedData);
    viewerRequest = await buildAuthedRequest(seedData.viewer);
  });

  test.afterAll(async () => {
    await viewerRequest?.dispose();
  });

  test.beforeEach(async () => {
    await resetState(seedData);
  });

  test('realtime badge increments on new activity and toast appears', async ({ page }) => {
    await loginAs(page, seedData.author);
    await page.goto('/app/home');
    await page.waitForLoadState('networkidle');

    await expect(page.locator('[data-testid="notification-badge"]')).toHaveCount(0);

    const res = await viewerRequest.post('/api/reactions/post', {
      data: { post_id: seedData.postId, kind: 'like' }
    });
    expect(res.status()).toBe(200);

    await expect(page.locator('[data-testid="notification-badge"]')).toHaveText('1');
    const toast = page.locator('[data-testid="toast-success"]').last();
    await expect(toast).toHaveText(/New notification/i);
  });

  test('dropdown shows newest first and mark all read clears badge', async ({ page }) => {
    await loginAs(page, seedData.author);
    await page.goto('/app/home');
    await page.waitForLoadState('networkidle');

    const reaction = await viewerRequest.post('/api/reactions/post', {
      data: { post_id: seedData.postId, kind: 'like' }
    });
    expect(reaction.status()).toBe(200);

    const share = await viewerRequest.post('/api/shares', {
      data: { post_id: seedData.postId }
    });
    expect(share.status()).toBe(200);

    await expect(page.locator('[data-testid="notification-badge"]')).toHaveText('2');

    await page.locator('[data-testid="notification-bell"]').click();
    const list = page.locator('[data-testid="notification-list"]');
    await expect(list).toBeVisible();

    const items = list.locator('[data-testid="notification-item"]');
    await expect(items).toHaveCount(2);
    await expect(items.first()).toContainText(/shared your post/i);

    await page.locator('[data-testid="notification-mark-all"]').click();
    await expect(page.locator('[data-testid="notification-badge"]')).toHaveCount(0);

    await expect(items.first()).toHaveAttribute('data-unread', 'false');
    await expect(items.nth(1)).toHaveAttribute('data-unread', 'false');
  });

  test('rate limiting shows toast and avoids duplicate notifications', async ({ browser, page }) => {
    await loginAs(page, seedData.author);
    await page.goto('/app/home');
    await page.waitForLoadState('networkidle');

    const viewerContext = await browser.newContext();
    const viewerPage = await viewerContext.newPage();
    await loginAs(viewerPage, seedData.viewer);
    await viewerPage.goto('/app/home');
    await viewerPage.waitForLoadState('networkidle');

    const feedItem = viewerPage.locator(
      `[data-testid="feed-item"][data-post-id="${seedData.postId}"]`
    ).first();
    await expect(feedItem).toBeVisible();

    const likeButton = feedItem.locator('[data-testid="react-like"]');
    if ((await likeButton.getAttribute('aria-pressed')) === 'true') {
      await likeButton.click();
      await expect(likeButton).toHaveAttribute('aria-pressed', 'false');
    }

    let limitTriggered = false;
    for (let i = 0; i < 12; i += 1) {
      await likeButton.click();
      await viewerPage.waitForTimeout(120);
      const errorToast = viewerPage
        .locator('[data-testid="toast-error"]').filter({ hasText: /slow|quickly/i });
      if (await errorToast.isVisible()) {
        limitTriggered = true;
        break;
      }
      await likeButton.click();
      await viewerPage.waitForTimeout(120);
    }

    const errorToast = viewerPage
      .locator('[data-testid="toast-error"]').filter({ hasText: /slow|quickly/i });
    await expect(errorToast).toBeVisible();
    expect(limitTriggered, 'rate limit should trigger during spam').toBeTruthy();

    const throttledResponse = await viewerRequest.post('/api/reactions/post', {
      data: { post_id: seedData.postId, kind: 'like' }
    });
    expect(throttledResponse.status()).toBe(429);

    await sleep(300);
    const notifications = await fetchNotifications(seedData.author.id);
    expect(notifications.length).toBeLessThanOrEqual(1);

    await viewerContext.close();
  });
});
