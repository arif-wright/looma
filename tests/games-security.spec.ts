import { test, expect } from '@playwright/test';
import { createAuthedRequest, VIEWER_CREDENTIALS } from './fixtures/auth';

const START_PAYLOAD = { slug: 'tiles-run', clientVersion: '1.0.0' } as const;

const startSession = async () => {
  const authed = await createAuthedRequest(VIEWER_CREDENTIALS);
  const response = await authed.post('/api/games/session/start', { data: START_PAYLOAD });
  expect(response.ok()).toBeTruthy();
  const payload = await response.json();
  await authed.dispose();
  // Shared settlement now checks reported duration against the server start.
  // Authenticated integration tests must let real time pass, not invent a run.
  await new Promise((resolve) => setTimeout(resolve, 10_050));
  return payload as {
    sessionId: string;
    nonce: string;
    serverTime: number;
    caps: Record<string, unknown>;
  };
};

const signPayload = async (args: {
  sessionId: string;
  score: number;
  durationMs: number;
  nonce: string;
  clientVersion?: string;
}) => {
  const authed = await createAuthedRequest(VIEWER_CREDENTIALS);
  const response = await authed.post('/api/games/sign', { data: args });
  await authed.dispose();
  return response;
};

const completeSession = async (args: {
  sessionId: string;
  score: number;
  durationMs: number;
  nonce: string;
  signature: string;
  clientVersion?: string;
}) => {
  const authed = await createAuthedRequest(VIEWER_CREDENTIALS);
  const response = await authed.post('/api/games/session/complete', { data: args });
  await authed.dispose();
  return response;
};

test.describe.serial('Game session security', () => {
  test('rejects mismatched nonce', async () => {
    const start = await startSession();
    const score = 1000;
    const durationMs = 10000;

    const signResponse = await signPayload({
      sessionId: start.sessionId,
      score,
      durationMs,
      nonce: start.nonce,
      clientVersion: '1.0.0'
    });
    expect(signResponse.ok()).toBeTruthy();
    const { signature } = await signResponse.json();

    const response = await completeSession({
      sessionId: start.sessionId,
      score,
      durationMs,
      nonce: `${start.nonce}-x`,
      signature,
      clientVersion: '1.0.0'
    });

    expect(response.status()).toBe(403);
    const payload = await response.json();
    expect(payload.code).toBe('forbidden');
  });

  test('returns the same saved receipt for an identical replay', async () => {
    const start = await startSession();
    const score = 1000;
    const durationMs = 10000;

    const signResponse = await signPayload({
      sessionId: start.sessionId,
      score,
      durationMs,
      nonce: start.nonce,
      clientVersion: '1.0.0'
    });
    const { signature } = await signResponse.json();

    const first = await completeSession({
      sessionId: start.sessionId,
      score,
      durationMs,
      nonce: start.nonce,
      signature,
      clientVersion: '1.0.0'
    });
    expect(first.ok()).toBeTruthy();

    const second = await completeSession({
      sessionId: start.sessionId,
      score,
      durationMs,
      nonce: start.nonce,
      signature,
      clientVersion: '1.0.0'
    });
    expect(second.status()).toBe(200);
    expect(await second.json()).toEqual(await first.json());
  });

  test('rejects excessive score rate', async () => {
    const start = await startSession();
    const score = 50000;
    const durationMs = 10000; // fast score rate

    const signResponse = await signPayload({
      sessionId: start.sessionId,
      score,
      durationMs,
      nonce: start.nonce,
      clientVersion: '1.0.0'
    });

    expect(signResponse.status()).toBe(400);
    const payload = await signResponse.json();
    expect(['invalid_score_rate', 'invalid_score'].includes(payload.code)).toBeTruthy();
  });

  test('rejects sessions shorter than minimum duration', async () => {
    const start = await startSession();

    const signResponse = await signPayload({
      sessionId: start.sessionId,
      score: 100,
      durationMs: 1000,
      nonce: start.nonce,
      clientVersion: '1.0.0'
    });

    expect(signResponse.status()).toBe(400);
    const payload = await signResponse.json();
    expect(payload.code).toBe('invalid_duration');
  });

  test('happy path clamps rewards and updates player state', async () => {
    const start = await startSession();
    const score = 1000;
    const durationMs = 10000;

    const signResponse = await signPayload({
      sessionId: start.sessionId,
      score,
      durationMs,
      nonce: start.nonce,
      clientVersion: '1.0.0'
    });
    expect(signResponse.ok()).toBeTruthy();
    const { signature } = await signResponse.json();

    const completion = await completeSession({
      sessionId: start.sessionId,
      score,
      durationMs,
      nonce: start.nonce,
      signature,
      clientVersion: '1.0.0'
    });

    expect(completion.ok()).toBeTruthy();
    const rewards = await completion.json();
    expect(rewards.xpDelta).toBeGreaterThan(0);
    expect(rewards.xpDelta).toBeLessThanOrEqual(100);
    expect(rewards.currencyDelta).toBeGreaterThan(0);
    expect(rewards.currencyDelta).toBeLessThanOrEqual(200);

    const authed = await createAuthedRequest(VIEWER_CREDENTIALS);
    const stateResponse = await authed.get('/api/games/player/state');
    expect(stateResponse.ok()).toBeTruthy();
    const state = await stateResponse.json();
    expect(state.currency).toBeGreaterThanOrEqual(rewards.currencyDelta);
    await authed.dispose();
  });

  test('rate limit caps rapid requests', async () => {
    const attempts = (rateLimitPerMinute: number) =>
      Array.from({ length: rateLimitPerMinute + 1 }, (_, i) => i);
    const limit = Number.parseInt(process.env.GAME_RATE_LIMIT_PER_MINUTE ?? '20', 10) || 20;

    let lastStatus = 200;
    for (const _ of attempts(limit)) {
      const authed = await createAuthedRequest(VIEWER_CREDENTIALS);
      const response = await authed.post('/api/games/session/start', { data: START_PAYLOAD });
      await authed.dispose();
      lastStatus = response.status();
      if (lastStatus === 429) {
        break;
      }
    }

    expect(lastStatus).toBe(429);
  });
});
