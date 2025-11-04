import { test, expect } from '@playwright/test';
import { createClient } from '@supabase/supabase-js';
import { randomUUID, createHmac } from 'crypto';
import { runSeed } from './fixtures/env';
import { createAuthedRequest, VIEWER_CREDENTIALS } from './fixtures/auth';

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

test.describe.serial('Economy ledger', () => {
  let viewerCtx: Awaited<ReturnType<typeof createAuthedRequest>>;
  let viewerId: string;
  let tilesGameId: string;
  let streakGameId: string;

  test.beforeAll(async () => {
    const seed = await runSeed();
    viewerId = seed.viewer.id;

    viewerCtx = await createAuthedRequest(VIEWER_CREDENTIALS);
    const { data: tiles, error: tilesError } = await admin
      .from('game_titles')
      .select('id')
      .eq('slug', 'tiles-run')
      .maybeSingle();

    if (tilesError || !tiles) {
      throw tilesError ?? new Error('tiles-run game not found');
    }

    tilesGameId = tiles.id as string;

    const { data: streakGame, error: streakGameError } = await admin
      .from('game_titles')
      .upsert(
        {
          slug: 'test-econ',
          name: 'Econ Harness',
          min_version: '1.0.0',
          max_score: 200000
        },
        { onConflict: 'slug' }
      )
      .select('id')
      .single();

    if (streakGameError || !streakGame) {
      throw streakGameError ?? new Error('test-econ game insert failed');
    }

    streakGameId = streakGame.id as string;

    const now = new Date();
    const day = 86_400_000;

    const streakInsert = await admin.from('game_sessions').insert(
      [1, 2].map((offset) => {
        const completed = new Date(now.getTime() - offset * day).toISOString();
        return {
          id: randomUUID(),
          user_id: viewerId,
          game_id: streakGameId,
          status: 'completed',
          score: 500,
          duration_ms: 60_000,
          nonce: randomUUID().slice(0, 16),
          started_at: completed,
          completed_at: completed,
          client_ver: '1.0.0'
        };
      })
    );

    if (streakInsert.error) {
      throw streakInsert.error;
    }
  });

  test.afterAll(async () => {
    await viewerCtx.dispose();
  });

  test('wallet starts at zero', async () => {
    const response = await viewerCtx.get('/api/econ/wallet');
    expect(response.status(), 'wallet status').toBe(200);
    const body = await response.json();
    expect(body.balance, 'initial balance').toBe(0);
  });

  test('session completion applies streak multiplier and achievement grants', async () => {
    const sessionId = randomUUID();
    const nonce = randomUUID().slice(0, 16);
    const score = 1250;
    const durationMs = 92_000;

    await admin.from('game_sessions').insert({
      id: sessionId,
      user_id: viewerId,
      game_id: tilesGameId,
      status: 'started',
      nonce,
      started_at: new Date().toISOString(),
      client_ver: '1.0.0'
    });

    const signature = makeSignature(sessionId, score, durationMs, nonce);

    const completeRes = await viewerCtx.post('/api/games/session/complete', {
      data: {
        sessionId,
        score,
        durationMs,
        nonce,
        signature,
        clientVersion: '1.0.0'
      }
    });

    expect(completeRes.status(), 'complete status').toBe(200);
    const payload = await completeRes.json();

    expect(payload.currencyDelta).toBe(32);
    expect(payload.baseCurrencyDelta).toBe(25);
    expect(payload.currencyMultiplier).toBeCloseTo(1.3, 1);
    expect(Array.isArray(payload.achievements)).toBe(true);
    expect(payload.achievements.length).toBeGreaterThanOrEqual(1);

    const walletRes = await viewerCtx.get('/api/econ/wallet');
    const walletBody = await walletRes.json();
    expect(walletBody.balance).toBe(132);
    expect(walletBody.recentTx[0].amount).toBeGreaterThan(0);
  });

  test('spend deducts balance and blocks insufficient funds', async () => {
    const spendRes = await viewerCtx.post('/api/econ/spend', {
      data: {
        amount: 50,
        source: 'upgrade'
      }
    });

    expect(spendRes.status(), 'spend status').toBe(200);
    const spendBody = await spendRes.json();
    expect(spendBody.balance).toBe(82);

    const overspend = await viewerCtx.post('/api/econ/spend', {
      data: {
        amount: 500,
        source: 'upgrade'
      }
    });

    expect(overspend.status(), 'overspend status').toBe(400);
    const walletCheck = await viewerCtx.get('/api/econ/wallet');
    const walletBody = await walletCheck.json();
    expect(walletBody.balance).toBe(82);
  });

  test('economy endpoints enforce rate limits', async () => {
    const previousLimit = process.env.ECON_RATE_LIMIT_PER_MINUTE;
    process.env.ECON_RATE_LIMIT_PER_MINUTE = '2';

    const tempEmail = `econ-rate-${Date.now()}@example.com`;
    const tempPassword = 'Temp1234!';
    const { data: tempUser, error } = await admin.auth.admin.createUser({
      email: tempEmail,
      password: tempPassword,
      email_confirm: true
    });

    if (error || !tempUser.user?.id) {
      throw error ?? new Error('Failed to create temp user');
    }

    await admin.from('profiles').upsert({
      id: tempUser.user.id,
      handle: `econ-${tempUser.user.id.slice(0, 8)}`,
      display_name: 'Rate Test'
    });

    const tempCtx = await createAuthedRequest({ email: tempEmail, password: tempPassword });

    const first = await tempCtx.get('/api/econ/wallet');
    expect(first.status()).toBe(200);

    const second = await tempCtx.get('/api/econ/wallet');
    expect(second.status()).toBe(200);

    const third = await tempCtx.get('/api/econ/wallet');
    expect(third.status()).toBe(429);

    await tempCtx.dispose();
    await admin.auth.admin.deleteUser(tempUser.user.id);

    process.env.ECON_RATE_LIMIT_PER_MINUTE = previousLimit;
  });
});
