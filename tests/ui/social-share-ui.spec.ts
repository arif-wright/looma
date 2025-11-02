import { test, expect } from '@playwright/test';
import { createClient } from '@supabase/supabase-js';
import { randomUUID } from 'crypto';
import { loginAs, VIEWER_CREDENTIALS } from '../fixtures/auth';
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
  let gameId: string;

  test.beforeAll(async () => {
    const seed = await runSeed();
    viewerId = seed.viewer.id;
    gameId = await ensureGameId('tiles-run');
  });

  test('session completion prompts run share and renders feed card', async ({ page }) => {
    await loginAs(page, VIEWER_CREDENTIALS);

    const sessionId = randomUUID();
    const nonce = randomUUID().slice(0, 16);
    const { score, durationMs } = await insertCompletedSession({
      sessionId,
      nonce,
      userId: viewerId,
      gameId,
      score: 5120,
      durationMs: 92_000
    });

    await page.route('**/api/games/session/start', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ sessionId, nonce, caps: {} })
      });
    });

    await page.route('**/api/games/session/complete', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ xpDelta: 18, currencyDelta: 24, achievements: [] })
      });
    });

    await page.route('**/api/games/player/state', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          level: 8,
          xp: 2400,
          xpNext: 3200,
          energy: 6,
          energyMax: 10,
          currency: 340,
          rewards: []
        })
      });
    });

    await page.goto('/app/games/tiles-run');

    const iframeHandle = await page.locator('iframe[data-testid="tiles-embed"]').elementHandle();
    const frame = await iframeHandle?.contentFrame();
    expect(frame, 'embedded frame').toBeTruthy();

    await frame!.evaluate(
      ({ shareScore, shareDuration, shareNonce }) => {
        parent.postMessage(
          { type: 'GAME_COMPLETE', payload: { score: shareScore, durationMs: shareDuration, nonce: shareNonce } },
          '*'
        );
      },
      { shareScore: score, shareDuration: durationMs, shareNonce: nonce }
    );

    const runComposer = page.locator('[data-testid="share-composer"][data-kind="run"]');
    await expect(runComposer).toBeVisible();

    const postButton = runComposer.getByRole('button', { name: 'Post' });
    await Promise.all([
      page.waitForResponse('**/api/social/share/run'),
      postButton.click()
    ]);

    await expect(runComposer).not.toBeVisible();
    await expect(page.locator('.share-toast.success')).toContainText('Shared to your Circle.');

    await page.goto('/app/home?from=run-share');
    await expect(page.locator('[data-testid="run-share-card"]').first()).toBeVisible();
  });

  test('achievement unlock prompts badge share and renders feed card', async ({ page }) => {
    await loginAs(page, VIEWER_CREDENTIALS);

    const sessionId = randomUUID();
    const nonce = randomUUID().slice(0, 16);
    const { score, durationMs } = await insertCompletedSession({
      sessionId,
      nonce,
      userId: viewerId,
      gameId,
      score: 6200,
      durationMs: 88_000
    });

    const achievementKey = 'automation.badge.ui';
    const achievementId = await ensureTestAchievement(achievementKey);
    await grantAchievementToUser(viewerId, achievementId);

    await page.route('**/api/games/session/start', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ sessionId, nonce, caps: {} })
      });
    });

    await page.route('**/api/games/session/complete', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          xpDelta: 20,
          currencyDelta: 30,
          achievements: [
            {
              key: achievementKey,
              name: 'Automation Badge',
              icon: 'sparkles',
              points: 15,
              rarity: 'rare'
            }
          ]
        })
      });
    });

    await page.route('**/api/games/player/state', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          level: 9,
          xp: 2800,
          xpNext: 3600,
          energy: 7,
          energyMax: 10,
          currency: 380,
          rewards: []
        })
      });
    });

    await page.goto('/app/games/tiles-run');

    const iframeHandle = await page.locator('iframe[data-testid="tiles-embed"]').elementHandle();
    const frame = await iframeHandle?.contentFrame();
    expect(frame, 'embedded frame').toBeTruthy();

    await frame!.evaluate(
      ({ shareScore, shareDuration, shareNonce }) => {
        parent.postMessage(
          { type: 'GAME_COMPLETE', payload: { score: shareScore, durationMs: shareDuration, nonce: shareNonce } },
          '*'
        );
      },
      { shareScore: score, shareDuration: durationMs, shareNonce: nonce }
    );

    const runComposer = page.locator('[data-testid="share-composer"][data-kind="run"]');
    await expect(runComposer).toBeVisible();
    await Promise.all([
      page.waitForResponse('**/api/social/share/run'),
      runComposer.getByRole('button', { name: 'Post' }).click()
    ]);
    await expect(runComposer).not.toBeVisible();

    const achievementComposer = page.locator('[data-testid="share-composer"][data-kind="achievement"]');
    await expect(achievementComposer).toBeVisible();
    await Promise.all([
      page.waitForResponse('**/api/social/share/achievement'),
      achievementComposer.getByRole('button', { name: 'Post' }).click()
    ]);

    await expect(page.locator('.share-toast.success')).toContainText('Shared to your Circle.');

    await page.goto('/app/home?from=achievement-share');
    await expect(page.locator('[data-testid="run-share-card"]').first()).toBeVisible();
    await expect(page.locator('[data-testid="achievement-share-card"]').first()).toBeVisible();
  });
});
