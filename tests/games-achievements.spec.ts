import { test, expect } from '@playwright/test';
import { createClient } from '@supabase/supabase-js';
import { randomUUID, createHmac } from 'crypto';
import { runSeed } from './fixtures/env';
import { createAuthedRequest, loginAs, VIEWER_CREDENTIALS } from './fixtures/auth';

const SUPABASE_URL = process.env.PUBLIC_SUPABASE_URL!;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const SIGNING_SECRET =
  process.env.GAME_SIGNING_SECRET ?? process.env.VITE_GAME_SIGNING_SECRET ?? 'dev-secret';

const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false }
});

const makeSignature = (sessionId: string, score: number, durationMs: number, nonce: string) =>
  createHmac('sha256', SIGNING_SECRET)
    .update(`${sessionId}|${score}|${durationMs}|${nonce}`)
    .digest('hex');

const upsertAchievementsCatalog = async (gameId: string | null) => {
  const rows = [
    {
      key: 'tiles.first_clear',
      game_id: gameId,
      name: 'First clear of Tiles Run',
      description: 'Complete your first Tiles Run session.',
      icon: 'sparkles',
      rarity: 'common',
      points: 10,
      rule: { kind: 'first_clear', slug: 'tiles-run' }
    },
    {
      key: 'tiles.score_1k',
      game_id: gameId,
      name: 'Score 1,000 points',
      description: 'Reach a score of 1,000 in Tiles Run.',
      icon: 'trophy',
      rarity: 'common',
      points: 10,
      rule: { kind: 'score_threshold', slug: 'tiles-run', gte: 1000 }
    },
    {
      key: 'tiles.score_5k',
      game_id: gameId,
      name: 'Score 5,000 points',
      description: 'Reach a score of 5,000 in Tiles Run.',
      icon: 'medal',
      rarity: 'rare',
      points: 20,
      rule: { kind: 'score_threshold', slug: 'tiles-run', gte: 5000 }
    },
    {
      key: 'tiles.score_10k',
      game_id: gameId,
      name: 'Score 10,000 points',
      description: 'Reach a score of 10,000 in Tiles Run.',
      icon: 'crown',
      rarity: 'epic',
      points: 30,
      rule: { kind: 'score_threshold', slug: 'tiles-run', gte: 10000 }
    },
    {
      key: 'tiles.sessions_25',
      game_id: gameId,
      name: 'Tiles Marathoner',
      description: 'Complete 25 Tiles Run sessions.',
      icon: 'flag',
      rarity: 'rare',
      points: 20,
      rule: { kind: 'sessions_completed', slug: 'tiles-run', gte: 25 }
    },
    {
      key: 'global.streak_3',
      game_id: null,
      name: 'Three-Day Streak',
      description: 'Play any game three days in a row.',
      icon: 'fire',
      rarity: 'rare',
      points: 20,
      rule: { kind: 'streak_days', gte: 3 }
    },
    {
      key: 'tiles.weekly_top10',
      game_id: gameId,
      name: 'Weekly Top 10',
      description: 'Finish a Tiles Run session that lands you in the top 10 for the week.',
      icon: 'star',
      rarity: 'legendary',
      points: 30,
      rule: { kind: 'weekly_top_rank', slug: 'tiles-run', rank_lte: 10 }
    }
  ];

  await admin.from('achievements').upsert(rows, { onConflict: 'key' });
};

const insertCompletedSession = async (args: {
  userId: string;
  gameId: string;
  score: number;
  durationMs?: number;
  insertedAt?: Date;
}) => {
  const { userId, gameId, score } = args;
  const durationMs = args.durationMs ?? 90_000;
  const insertedAt = args.insertedAt ?? new Date();
  const sessionId = randomUUID();
  const nonce = randomUUID().slice(0, 16);

  const sessionInsert = await admin.from('game_sessions').insert({
    id: sessionId,
    user_id: userId,
    game_id: gameId,
    status: 'completed',
    nonce,
    score,
    duration_ms: durationMs,
    started_at: insertedAt.toISOString(),
    completed_at: insertedAt.toISOString(),
    client_ver: '1.0.0'
  });

  if (sessionInsert.error) {
    throw sessionInsert.error;
  }

  const scoreInsert = await admin.from('game_scores').insert({
    user_id: userId,
    game_id: gameId,
    session_id: sessionId,
    score,
    duration_ms: durationMs,
    inserted_at: insertedAt.toISOString()
  });

  if (scoreInsert.error) {
    throw scoreInsert.error;
  }
};

test.describe('Game achievements', () => {
  let viewerId: string;
  let gameId: string;
  let competitorIds: string[] = [];
  let viewerHandle: string;

  test.beforeAll(async () => {
    const seed = await runSeed();
    viewerId = seed.viewer.id;
    viewerHandle = seed.viewer.handle;

    const { data: game, error: gameError } = await admin
      .from('game_titles')
      .select('id')
      .eq('slug', 'tiles-run')
      .maybeSingle();

    if (gameError || !game) {
      throw gameError ?? new Error('tiles-run game not found');
    }

    gameId = game.id;

    await upsertAchievementsCatalog(gameId);

    await admin.from('game_scores').delete().eq('game_id', gameId);
    await admin.from('game_sessions').delete().eq('game_id', gameId);
    await admin.from('user_achievements').delete().eq('user_id', viewerId);
    await admin.from('user_points').delete().eq('user_id', viewerId);

    // Seed leaderboard competitors so viewer starts outside top 10.
    for (let i = 0; i < 12; i += 1) {
      const email = `achievements+${Date.now()}+${i}@example.com`;
      const { data: competitor, error: competitorError } = await admin.auth.admin.createUser({
        email,
        password: 'Passw0rd!',
        email_confirm: true
      });

      if (competitorError || !competitor.user?.id) {
        throw competitorError ?? new Error('Unable to create competitor user');
      }

      competitorIds.push(competitor.user.id);
      await insertCompletedSession({
        userId: competitor.user.id,
        gameId,
        score: 9000 + i * 25,
        durationMs: 95_000,
        insertedAt: new Date()
      });
    }

    await admin.rpc('fn_leader_refresh', { p_scope: 'all' });
  });

  test.afterAll(async () => {
    await Promise.all(
      competitorIds.map((userId) => admin.auth.admin.deleteUser(userId).catch(() => undefined))
    );
  });

  test('achievement unlock flow via API', async ({ page }) => {
    await loginAs(page, VIEWER_CREDENTIALS);
    await page.goto('/app');

    const completeSession = async (score: number, durationMs = 90_000) => {
      const authed = await createAuthedRequest(VIEWER_CREDENTIALS);

      const startResponse = await authed.post('/api/games/session/start', {
        data: { slug: 'tiles-run', clientVersion: '1.0.0' }
      });

      if (!startResponse.ok()) {
        const errorBody = await startResponse.json().catch(() => ({}));
        await authed.dispose();
        throw new Error(`session start failed: ${JSON.stringify(errorBody)}`);
      }

      const startPayload = (await startResponse.json()) as {
        sessionId: string;
        nonce: string;
      };

      const signature = makeSignature(startPayload.sessionId, score, durationMs, startPayload.nonce);

      const completeResponse = await authed.post('/api/games/session/complete', {
        data: {
          sessionId: startPayload.sessionId,
          score,
          durationMs,
          nonce: startPayload.nonce,
          signature,
          clientVersion: '1.0.0'
        }
      });

      if (!completeResponse.ok()) {
        const errorBody = await completeResponse.json().catch(() => ({}));
        await authed.dispose();
        throw new Error(`session complete failed: ${JSON.stringify(errorBody)}`);
      }

      const payload = await completeResponse.json();
      await authed.dispose();
      return payload;
    };

    const extractKeys = (payload: any) =>
      Array.isArray(payload?.achievements) ? payload.achievements.map((entry: any) => entry.key) : [];

    const first = await completeSession(1100);
    let keys = extractKeys(first);
    expect(keys).toEqual(expect.arrayContaining(['tiles.first_clear', 'tiles.score_1k']));

    const second = await completeSession(1200);
    keys = extractKeys(second);
    expect(keys).toHaveLength(0);

    const third = await completeSession(5200);
    keys = extractKeys(third);
    expect(keys).toEqual(expect.arrayContaining(['tiles.score_5k']));

    // Seed remaining sessions to reach 24 before the next completion (currently 3).
    for (let i = 0; i < 21; i += 1) {
      await insertCompletedSession({
        userId: viewerId,
        gameId,
        score: 800 + i * 5,
        durationMs: 85_000,
        insertedAt: new Date(Date.now() - (i + 1) * 60_000)
      });
    }

    await admin.rpc('fn_leader_refresh', { p_scope: 'all' });

    const marathon = await completeSession(6400);
    keys = extractKeys(marathon);
    expect(keys).toEqual(expect.arrayContaining(['tiles.sessions_25']));

    // Remove competitors and refresh so viewer can enter weekly top 10.
    if (competitorIds.length > 0) {
      await admin.from('game_scores').delete().in('user_id', competitorIds);
      await admin.from('game_sessions').delete().in('user_id', competitorIds);
      await admin.rpc('fn_leader_refresh', { p_scope: 'all' });
    }

    const weekly = await completeSession(12_400);
    keys = extractKeys(weekly);
    expect(keys).toEqual(expect.arrayContaining(['tiles.weekly_top10', 'tiles.score_10k']));

    const summary = await page.evaluate(async () => {
      const res = await fetch('/api/achievements/me', { cache: 'no-store' });
      return res.json();
    });

    expect(summary.points).toBe(10 + 10 + 20 + 20 + 30 + 30);
    const unlockedKeys = summary.unlocks.map((entry: any) => entry.key);
    expect(unlockedKeys).toEqual(
      expect.arrayContaining([
        'tiles.first_clear',
        'tiles.score_1k',
        'tiles.score_5k',
        'tiles.sessions_25',
        'tiles.weekly_top10',
        'tiles.score_10k'
      ])
    );
  });

  test('archive and profile retain earned achievements without starting a game', async ({ page }) => {
    await loginAs(page, VIEWER_CREDENTIALS);
    const sessionRequests: string[] = [];
    await page.route('**/api/games/session/**', async (route) => {
      sessionRequests.push(new URL(route.request().url()).pathname);
      await route.fulfill({ status: 409, contentType: 'application/json', body: '{}' });
    });

    const mockAchievements = [
      { key: 'tiles.first_clear', name: 'First clear of Tiles Run', icon: 'sparkles', points: 10, rarity: 'common' },
      { key: 'tiles.score_1k', name: 'Score 1,000 points', icon: 'trophy', points: 10, rarity: 'common' }
    ];
    const catalogResponse = {
      achievements: [
        ...mockAchievements.map((entry) => ({
          id: `ach-${entry.key}`,
          ...entry,
          description: `${entry.name} description`,
          gameId: 'game-tiles',
          gameSlug: 'tiles-run',
          gameName: 'Tiles Run',
          ruleKind: 'score_threshold'
        })),
        {
          id: 'ach-runner-locked', key: 'runner.locked', name: 'Neon Run milestone',
          description: 'An unrelated game milestone.', icon: 'trophy', rarity: 'common', points: 10,
          gameId: 'game-runner', gameSlug: 'runner', gameName: 'Neon Run', ruleKind: 'score_threshold'
        }
      ]
    };

    await page.route('**/api/achievements/catalog', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(catalogResponse)
      });
    });
    await page.route('**/api/achievements/me', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          points: 200,
          unlocks: mockAchievements.map((entry) => ({
            ...entry,
            description: `${entry.name} description`,
            unlockedAt: '2026-01-01T12:00:00.000Z'
          }))
        })
      });
    });

    await page.goto('/app/games/tiles-run');
    await expect(page.getByTestId('tiles-archive')).toBeVisible();
    await expect(page.locator('iframe, canvas, #game-container')).toHaveCount(0);
    await page.getByTestId('achievements-open').click();

    const panel = page.getByTestId('achievements-panel');
    await expect(panel).toBeVisible();
    await expect(panel.locator('[data-testid^="achievement-card-"]')).toHaveCount(2);
    await expect(panel.getByTestId('achievement-card-tiles.first_clear')).toHaveClass(/unlocked/);
    await expect(panel.getByTestId('achievement-card-tiles.score_1k')).toHaveClass(/unlocked/);
    await expect(panel.getByTestId('achievement-card-runner.locked')).toHaveCount(0);
    await expect(page.getByText('Total points · 200', { exact: true })).toBeVisible();
    await expect(page.getByTestId('achievements-tab-game')).toHaveText('Tiles Run');

    await page.getByTestId('achievements-tab-locked').click();
    await expect(panel.getByText('No achievements here yet.', { exact: true })).toBeVisible();

    await page.getByTestId('achievements-close').click();
    await expect(panel).toHaveCount(0);
    await page.getByTestId('achievements-open').click();
    await expect(panel).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(panel).toHaveCount(0);
    await expect(page.getByTestId('tiles-archive')).toBeVisible();
    expect(sessionRequests).toEqual([]);

    // The current public profile displays earned history in Recent milestones.
    await page.goto(`/app/u/${viewerHandle}`);
    const milestones = page.locator('section').filter({
      has: page.getByRole('heading', { name: 'Recent milestones', exact: true })
    });
    await expect(milestones).toBeVisible();
    await expect(milestones.locator('li').first()).toBeVisible();
    await expect(milestones).toContainText(/Tiles Run|Tiles Marathoner|Weekly Top 10|Score [\d,]+ points/);
    expect(sessionRequests).toEqual([]);
  });
});
