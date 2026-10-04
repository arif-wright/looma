import { test, expect } from '@playwright/test';
import { createClient } from '@supabase/supabase-js';
import { randomUUID } from 'crypto';
import { createAuthedRequest, loginAs, VIEWER_CREDENTIALS } from '../fixtures/auth';
import { runSeed } from '../fixtures/env';

const SUPABASE_URL = process.env.PUBLIC_SUPABASE_URL!;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;

const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false }
});

const ensureGameId = async (slug: string): Promise<string> => {
  const { data, error } = await admin.from('game_titles').select('id').eq('slug', slug).maybeSingle();
  if (error || !data) {
    throw error ?? new Error(`Game ${slug} not found`);
  }
  return data.id as string;
};

const insertCompletedSession = async (params: {
  sessionId?: string;
  nonce?: string;
  userId: string;
  gameId: string;
  score?: number;
  durationMs?: number;
}) => {
  const sessionId = params.sessionId ?? randomUUID();
  const nonce = params.nonce ?? randomUUID().slice(0, 16);
  const score = Math.max(0, Math.floor(params.score ?? 4000));
  const durationMs = Math.max(1000, Math.floor(params.durationMs ?? 86_000));
  const playedAt = new Date().toISOString();

  const sessionInsert = await admin.from('game_sessions').insert({
    id: sessionId,
    user_id: params.userId,
    game_id: params.gameId,
    status: 'completed',
    nonce,
    score,
    duration_ms: durationMs,
    started_at: playedAt,
    completed_at: playedAt,
    client_ver: '1.0.0'
  });

  if (sessionInsert.error) {
    throw sessionInsert.error;
  }

  const scoreInsert = await admin.from('game_scores').insert({
    user_id: params.userId,
    game_id: params.gameId,
    session_id: sessionId,
    score,
    duration_ms: durationMs,
    inserted_at: playedAt
  });

  if (scoreInsert.error) {
    throw scoreInsert.error;
  }

  return { sessionId, nonce, score, durationMs };
};

const ensureTestAchievement = async (key: string) => {
  const { data, error } = await admin
    .from('achievements')
    .upsert(
      {
        key,
        name: 'Automation Badge',
        description: 'Badge created during UI tests',
        icon: 'sparkles',
        rarity: 'rare',
        points: 15,
        rule: { kind: 'manual' }
      },
      { onConflict: 'key' }
    )
    .select('id')
    .maybeSingle();

  if (error || !data) {
    throw error ?? new Error('Failed to upsert test achievement');
  }

  return data.id as string;
};

const grantAchievementToUser = async (userId: string, achievementId: string) => {
  const { error } = await admin.from('user_achievements').upsert(
    {
      user_id: userId,
      achievement_id: achievementId,
      unlocked_at: new Date().toISOString(),
      meta: {}
    },
    { onConflict: 'user_id, achievement_id' }
  );

  if (error) {
    throw error;
  }
};

test.describe.serial('Social share UI', () => {
  let viewerId: string;
  let viewerHandle: string;
  let gameId: string;

  test.beforeAll(async () => {
    const seed = await runSeed();
    viewerId = seed.viewer.id;
    viewerHandle = seed.viewer.handle;
    gameId = await ensureGameId('tiles-run');
  });

  test('historical run share renders and its old play link opens the archive', async ({ page }) => {
    await loginAs(page, VIEWER_CREDENTIALS);

    // The session is already completed history; the archive must never launch
    // Tiles Run just to render or follow its existing social share.
    const { sessionId, score, durationMs } = await insertCompletedSession({
      userId: viewerId,
      gameId,
      score: 5120,
      durationMs: 92_000
    });
    const authed = await createAuthedRequest(VIEWER_CREDENTIALS);
    let postId: string;
    try {
      const response = await authed.post('/api/social/share/run', {
        data: { sessionId, score, durationMs, slug: 'tiles-run', text: 'A saved Tiles Run result.' }
      });
      expect(response.ok()).toBeTruthy();
      const payload = await response.json();
      expect(typeof payload.postId).toBe('string');
      postId = payload.postId;
    } finally {
      await authed.dispose();
    }

    await page.goto(`/app/u/${encodeURIComponent(viewerHandle)}/p/${postId}`);
    const runCard = page.getByTestId('run-share-card');
    await expect(runCard).toBeVisible();
    await expect(runCard).toContainText('Tiles Run');
    await expect(runCard).toContainText('5,120');
    await expect(runCard).toContainText('92s');
    const playLink = runCard.getByTestId('run-share-cta');
    await expect(playLink).toHaveAttribute('href', '/app/games/tiles-run');

    const sessionRequests: string[] = [];
    await page.route('**/api/games/session/**', async (route) => {
      sessionRequests.push(new URL(route.request().url()).pathname);
      await route.fulfill({ status: 409, contentType: 'application/json', body: '{}' });
    });
    await playLink.click();
    await expect(page).toHaveURL(/\/app\/games\/tiles-run$/);
    await expect(page.getByTestId('tiles-archive')).toBeVisible();
    await expect(page.getByText('Tiles Run is archived', { exact: true })).toBeVisible();
    await expect(page.locator('iframe, canvas, #game-container')).toHaveCount(0);
    expect(sessionRequests).toEqual([]);

    await page.goBack();
    await expect(runCard).toBeVisible();
    await expect(runCard).toContainText('5,120');
    await page.goForward();
    await expect(page.getByTestId('tiles-archive')).toBeVisible();
    expect(sessionRequests).toEqual([]);
  });

  test('previously earned achievement share still renders its badge and deep link', async ({ page }) => {
    await loginAs(page, VIEWER_CREDENTIALS);
    const achievementKey = 'automation.badge.ui';
    const achievementId = await ensureTestAchievement(achievementKey);
    await grantAchievementToUser(viewerId, achievementId);

    const authed = await createAuthedRequest(VIEWER_CREDENTIALS);
    let postId: string;
    try {
      const response = await authed.post('/api/social/share/achievement', {
        data: { key: achievementKey, text: 'A previously earned badge.' }
      });
      expect(response.ok()).toBeTruthy();
      const payload = await response.json();
      expect(typeof payload.postId).toBe('string');
      postId = payload.postId;
    } finally {
      await authed.dispose();
    }

    await page.goto(`/app/u/${encodeURIComponent(viewerHandle)}/p/${postId}`);
    const achievementCard = page.getByTestId('achievement-share-card');
    await expect(achievementCard).toBeVisible();
    await expect(achievementCard).toContainText('Automation Badge');
    await expect(achievementCard).toContainText('Rare');
    await expect(achievementCard).toContainText('+15 pts');
    await expect(achievementCard.getByTestId('achievement-share-cta')).toHaveAttribute(
      'href', `/app/achievements?highlight=${encodeURIComponent(achievementKey)}`
    );
  });
});
