import { test, expect } from '@playwright/test';
import { createClient } from '@supabase/supabase-js';
import { randomUUID } from 'crypto';
import { runSeed, type SeedResult } from '../fixtures/env';
import { createAuthedRequest, VIEWER_CREDENTIALS, AUTHOR_CREDENTIALS } from '../fixtures/auth';

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
  userId: string;
  gameId: string;
  score?: number;
  durationMs?: number;
}): Promise<{ sessionId: string }> => {
  const sessionId = randomUUID();
  const score = Math.max(0, Math.floor(params.score ?? 1200));
  const durationMs = Math.max(1000, Math.floor(params.durationMs ?? 90_000));
  const nonce = randomUUID().slice(0, 16);
  const playedAt = new Date().toISOString();

  const sessionInsert = await admin.from('game_sessions').insert({
    id: sessionId,
    user_id: params.userId,
    game_id: params.gameId,
    status: 'completed',
    started_at: playedAt,
    completed_at: playedAt,
    score,
    duration_ms: durationMs,
    nonce,
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

  return { sessionId };
};

const ensureTestAchievement = async (key: string) => {
  const { data, error } = await admin
    .from('achievements')
    .upsert(
      {
        key,
        name: 'Test Achievement',
        description: 'Automation generated achievement',
        icon: 'trophy',
        rarity: 'rare',
        points: 10,
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

const createTempUser = async () => {
  const email = `sharetester+${Date.now()}@example.com`;
  const password = 'Passw0rd!';
  const { data, error } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true
  });

  if (error || !data.user?.id) {
    throw error ?? new Error('Unable to create temp user');
  }

  const profileUpsert = await admin.from('profiles').upsert({
    id: data.user.id,
    handle: `share-${data.user.id.slice(0, 8)}`,
    display_name: 'Share Test User'
  });

  if (profileUpsert.error) {
    throw profileUpsert.error;
  }

  return {
    id: data.user.id,
    credentials: { email, password }
  };
};

test.describe.serial('Social share API', () => {
  let seed: SeedResult;
  let gameId: string;
  let viewerId: string;
  let authorId: string;
  const createdUserIds: string[] = [];

  test.beforeAll(async () => {
    seed = await runSeed();
    viewerId = seed.viewer.id;
    authorId = seed.author.id;
    gameId = await ensureGameId('tiles-run');
  });

  test.afterAll(async () => {
    await Promise.all(
      createdUserIds.map((userId) => admin.auth.admin.deleteUser(userId).catch(() => undefined))
    );
  });

  test('shares a completed run session successfully', async () => {
    const { sessionId } = await insertCompletedSession({ userId: viewerId, gameId, score: 4200 });

    const apiContext = await createAuthedRequest(VIEWER_CREDENTIALS);
    const response = await apiContext.post('/api/social/share/run', {
      data: {
        sessionId,
        score: 4200,
        durationMs: 95_000,
        slug: 'tiles-run',
        text: 'Loved this run!'
      }
    });

    expect(response.status(), 'run share status').toBe(200);
    const body = await response.json();
    expect(typeof body.postId).toBe('string');
    await apiContext.dispose();
  });

  test('rejects sharing a session that belongs to another user', async () => {
    const { sessionId } = await insertCompletedSession({ userId: authorId, gameId, score: 3200 });

    const apiContext = await createAuthedRequest(VIEWER_CREDENTIALS);
    const response = await apiContext.post('/api/social/share/run', {
      data: {
        sessionId,
        score: 3200,
        durationMs: 80_000,
        slug: 'tiles-run'
      }
    });

    expect(response.status(), 'foreign session share status').toBe(400);
    const payload = await response.json();
    expect(payload.code).toBe('forbidden');
    await apiContext.dispose();
  });

  test('rejects captions longer than 280 characters', async () => {
    const { sessionId } = await insertCompletedSession({ userId: viewerId, gameId, score: 2100 });
    const longText = 'x'.repeat(281);

    const apiContext = await createAuthedRequest(VIEWER_CREDENTIALS);
    const response = await apiContext.post('/api/social/share/run', {
      data: {
        sessionId,
        score: 2100,
        durationMs: 70_000,
        slug: 'tiles-run',
        text: longText
      }
    });

    expect(response.status(), 'long caption status').toBe(400);
    const payload = await response.json();
    expect(payload.code).toBe('invalid_text');
    await apiContext.dispose();
  });

  test('rate limits run shares after 10 attempts within window', async () => {
    const tempUser = await createTempUser();
    createdUserIds.push(tempUser.id);
    const { sessionId } = await insertCompletedSession({
      userId: tempUser.id,
      gameId,
      score: 1500,
      durationMs: 60_000
    });

    const apiContext = await createAuthedRequest(tempUser.credentials);

    for (let attempt = 0; attempt < 10; attempt += 1) {
      const res = await apiContext.post('/api/social/share/run', {
        data: {
          sessionId,
          score: 1500,
          durationMs: 60_000,
          slug: 'tiles-run'
        }
      });
      expect(res.status(), `rate limit attempt ${attempt + 1}`).toBe(200);
    }

    const blocked = await apiContext.post('/api/social/share/run', {
      data: {
        sessionId,
        score: 1500,
        durationMs: 60_000,
        slug: 'tiles-run'
      }
    });

    expect(blocked.status(), 'rate limit block status').toBe(429);
    await apiContext.dispose();
  });

  test('shares an unlocked achievement', async () => {
    const key = 'automation.badge';
    const achievementId = await ensureTestAchievement(key);
    await grantAchievementToUser(viewerId, achievementId);

    const apiContext = await createAuthedRequest(VIEWER_CREDENTIALS);
    const response = await apiContext.post('/api/social/share/achievement', {
      data: {
        key,
        text: 'Unlocked something special!'
      }
    });

    expect(response.status(), 'achievement share status').toBe(200);
    const body = await response.json();
    expect(typeof body.postId).toBe('string');
    await apiContext.dispose();
  });

  test('rejects sharing achievements that are not unlocked', async () => {
    const apiContext = await createAuthedRequest(VIEWER_CREDENTIALS);
    const response = await apiContext.post('/api/social/share/achievement', {
      data: {
        key: 'missing.badge'
      }
    });

    expect(response.status(), 'locked achievement share status').toBe(400);
    const payload = await response.json();
    expect(payload.code).toBe('achievement_not_found');
    await apiContext.dispose();
  });
});
