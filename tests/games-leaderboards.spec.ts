import { test, expect, request } from '@playwright/test';
import { randomUUID, randomBytes } from 'crypto';
import { createClient } from '@supabase/supabase-js';
import { runSeed, BASE_URL, TEST_USERS } from './fixtures/env';
import { loginAs, VIEWER_CREDENTIALS } from './fixtures/auth';

const SUPABASE_URL = process.env.PUBLIC_SUPABASE_URL!;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;

const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false }
});

let gameId: string;
let viewerId: string;
let authorId: string;
let challengerId: string;

const createScoreEntry = async (
  userId: string,
  score: number,
  insertedAt: Date,
  durationMs: number
) => {
  const sessionId = randomUUID();
  const nonce = randomBytes(8).toString('hex');
  const sessionInsert = await admin.from('game_sessions').insert({
    id: sessionId,
    user_id: userId,
    game_id: gameId,
    nonce,
    status: 'completed',
    score,
    duration_ms: durationMs,
    started_at: insertedAt.toISOString(),
    completed_at: insertedAt.toISOString()
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

test.describe('Game leaderboards', () => {
  test.beforeAll(async () => {
    const seed = await runSeed();
    authorId = seed.author.id;
    viewerId = seed.viewer.id;

    const challengerEmail = `leaderboard+${Date.now()}@example.com`;
    const { data: challengerUser, error: challengerError } = await admin.auth.admin.createUser({
      email: challengerEmail,
      password: 'Passw0rd!',
      email_confirm: true
    });

    if (challengerError || !challengerUser?.user?.id) {
      throw challengerError ?? new Error('Unable to create challenger user');
    }

    challengerId = challengerUser.user.id;

    const { data: game, error: gameError } = await admin
      .from('game_titles')
      .select('id')
      .eq('slug', 'tiles-run')
      .maybeSingle();

    if (gameError || !game) {
      throw gameError ?? new Error('Game tiles-run not found');
    }

    gameId = game.id;

    await admin.from('game_scores').delete().eq('game_id', gameId);

    const now = new Date();
    const startOfDayUTC = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
    const startOfWeekUTC = new Date(startOfDayUTC);
    startOfWeekUTC.setUTCDate(startOfWeekUTC.getUTCDate() - startOfWeekUTC.getUTCDay());
    const midWeek = new Date(startOfWeekUTC.getTime() + 2 * 86_400_000 + 3_600_000);
    const lastMonth = new Date(startOfDayUTC);
    lastMonth.setUTCDate(lastMonth.getUTCDate() - 20);

    const dailyNow = new Date(now.getTime() - 30_000);

    await Promise.all([
      createScoreEntry(authorId, 9200, lastMonth, 120_000),
      createScoreEntry(viewerId, 8700, lastMonth, 110_000),
      createScoreEntry(challengerId, 8700, lastMonth, 105_000),
      createScoreEntry(viewerId, 8800, midWeek, 115_000),
      createScoreEntry(challengerId, 8800, new Date(midWeek.getTime() + 600_000), 112_000),
      createScoreEntry(authorId, 6800, new Date(midWeek.getTime() + 900_000), 100_000),
      createScoreEntry(authorId, 6400, now, 95_000),
      createScoreEntry(viewerId, 7100, dailyNow, 92_000),
      createScoreEntry(challengerId, 6900, new Date(dailyNow.getTime() - 5_000), 90_000)
    ]);

    await admin.rpc('fn_leader_refresh', { p_scope: 'all' });
  });

  test('all-time API ranks with ties', async () => {
    const context = await request.newContext({ baseURL: BASE_URL });
    const response = await context.get('/api/leaderboard/tiles-run/alltime?limit=10');
    expect(response.ok()).toBeTruthy();
    const payload = await response.json();

    expect(payload.meta.total).toBeGreaterThanOrEqual(3);
    expect(payload.rows[0].score).toBe(9200);
    const tieRows = payload.rows.filter((row: any) => row.score === 8800);
    expect(tieRows.length).toBe(2);
    expect(tieRows[0].rank).toBe(tieRows[1].rank);

    const pageTwo = await context.get('/api/leaderboard/tiles-run/alltime?page=2&limit=2');
    expect(pageTwo.ok()).toBeTruthy();
    const pageTwoPayload = await pageTwo.json();
    expect(pageTwoPayload.rows.length).toBeGreaterThanOrEqual(1);

    await context.dispose();
  });

  test('daily and weekly leaderboards scope correctly', async () => {
    const context = await request.newContext({ baseURL: BASE_URL });

    const dailyRes = await context.get('/api/leaderboard/tiles-run/daily?limit=5');
    expect(dailyRes.ok()).toBeTruthy();
    const daily = await dailyRes.json();
    expect(daily.rows[0].user.id).toBe(viewerId);
    expect(daily.rows[0].score).toBe(7100);
    expect(daily.rows.find((row: any) => row.user.id === authorId)?.score).toBe(6400);

    const weeklyRes = await context.get('/api/leaderboard/tiles-run/weekly?limit=5');
    expect(weeklyRes.ok()).toBeTruthy();
    const weekly = await weeklyRes.json();
    const weeklyTie = weekly.rows.filter((row: any) => row.score === 8800);
    expect(weeklyTie.length).toBe(2);
    expect(weeklyTie[0].rank).toBe(1);
    expect(weekly.rows.find((row: any) => row.user.id === authorId)?.score).toBe(6800);

    await context.dispose();
  });

  test('leaderboard tabs highlight current user', async ({ page }) => {
    await loginAs(page, VIEWER_CREDENTIALS);
    await page.goto('/app/games/tiles-run');

    const rows = page.locator('[data-testid="leaderboard-row"]');
    await expect(rows.first()).toBeVisible();

    const selfRow = page.locator('[data-testid="leaderboard-row"][data-self="true"]');
    await expect(selfRow).toBeVisible();

    await page.locator('[data-testid="leaderboard-tabs"] button[data-scope="daily"]').click();
    await expect(rows.first()).toContainText('7,100');

    await page.locator('[data-testid="leaderboard-tabs"] button[data-scope="weekly"]').click();
    await expect(rows.first()).toContainText('8,800');
  });
});
