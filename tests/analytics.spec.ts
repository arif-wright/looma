import { test, expect } from '@playwright/test';
import { createClient } from '@supabase/supabase-js';
import { randomUUID, createHmac } from 'crypto';
import { runSeed } from './fixtures/env';
import {
  createAuthedRequest,
  VIEWER_CREDENTIALS,
  AUTHOR_CREDENTIALS,
  loginAs
} from './fixtures/auth';
import { BASE_URL } from './fixtures/env';

process.env.ADMIN_EMAILS = process.env.ADMIN_EMAILS
  ? `${process.env.ADMIN_EMAILS},author@test.local`
  : 'author@test.local';

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

test.describe.serial('Analytics pipeline', () => {
  let viewerCtx: Awaited<ReturnType<typeof createAuthedRequest>>;
  let viewerId: string;

  test.beforeAll(async () => {
    const seed = await runSeed();
    viewerId = seed.viewer.id;
    viewerCtx = await createAuthedRequest(VIEWER_CREDENTIALS);
  });

  test.afterAll(async () => {
    await viewerCtx.dispose();
  });

  test('logs start and completion events', async () => {
    const startRes = await viewerCtx.post('/api/games/session/start', {
      data: { slug: 'tiles-run', clientVersion: '1.0.0' }
    });

    expect(startRes.status(), 'start status').toBe(200);
    const startPayload = await startRes.json();
    const sessionId = startPayload.sessionId as string;
    const nonce = startPayload.nonce as string;

    const score = 4200;
    const durationMs = 68_000;
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

    const { data: events } = await admin
      .from('analytics_events')
      .select('kind')
      .eq('session_id', sessionId)
      .order('inserted_at', { ascending: true });

    const kinds = (events ?? []).map((row) => row.kind);
    expect(kinds).toEqual(expect.arrayContaining(['game_start', 'game_complete']));
    expect(kinds.length).toBeGreaterThanOrEqual(2);
  });

  test('flags impossible score rate as anomaly', async () => {
    const startRes = await viewerCtx.post('/api/games/session/start', {
      data: { slug: 'tiles-run', clientVersion: '1.0.0' }
    });
    const startPayload = await startRes.json();
    const sessionId = startPayload.sessionId as string;
    const nonce = startPayload.nonce as string;

    const score = 90000;
    const durationMs = 10_000;
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
    expect(completeRes.status()).toBe(200);

    const { data: anomalies } = await admin
      .from('anomalies')
      .select('type, severity')
      .eq('session_id', sessionId);

    const types = new Set((anomalies ?? []).map((row) => row.type));
    expect(types.has('impossible_score_rate')).toBeTruthy();
  });

  test('failed spend does not create wallet events', async () => {
    const { data: before } = await admin
      .from('analytics_events')
      .select('id')
      .eq('user_id', viewerId)
      .eq('kind', 'wallet_spend');
    const beforeCount = before?.length ?? 0;

    const overspend = await viewerCtx.post('/api/econ/spend', {
      data: {
        amount: 999999,
        source: 'upgrade'
      }
    });
    expect(overspend.status(), 'overspend status').toBe(400);

    const { data: after } = await admin
      .from('analytics_events')
      .select('id')
      .eq('user_id', viewerId)
      .eq('kind', 'wallet_spend');
    const afterCount = after?.length ?? 0;

    expect(afterCount).toBe(beforeCount);
  });

  test('admin dashboards render analytics and anomaly data', async ({ page }) => {
    await loginAs(page, AUTHOR_CREDENTIALS);

    await page.goto(`${BASE_URL}/app/admin/analytics`);
    await expect(page.getByTestId('admin-analytics-funnel')).toBeVisible();
    await expect(page.getByTestId('admin-analytics-score-dist')).toBeVisible();

    await page.goto(`${BASE_URL}/app/admin/anti-cheat`);
    await expect(page.getByTestId('admin-anti-table')).toBeVisible();
  });
});
