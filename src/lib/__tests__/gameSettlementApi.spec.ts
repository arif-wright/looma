import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { admin, effects } = vi.hoisted(() => ({
  admin: { from: vi.fn(), rpc: vi.fn() },
  effects: {
    audit: vi.fn(), analytics: vi.fn(), inspect: vi.fn(), ingest: vi.fn(),
    notification: vi.fn(), bond: vi.fn(), ritual: vi.fn()
  }
}));
vi.mock('$lib/server/supabase', () => ({ supabaseAdmin: admin }));
vi.mock('$lib/supabaseClient', () => ({ supabaseServer: (event: any) => event.locals.supabase }));
vi.mock('$lib/server/games/rate', () => ({ limit: vi.fn(async () => {}) }));
vi.mock('$lib/server/games/audit', () => ({ logGameAudit: effects.audit }));
vi.mock('$lib/server/analytics/log', () => ({ logEvent: effects.analytics }));
vi.mock('$lib/server/anti/inspect', () => ({ inspectSessionComplete: effects.inspect }));
vi.mock('$lib/server/events/ingest', () => ({ ingestServerEvent: effects.ingest }));
vi.mock('$lib/server/notifications', () => ({ createAchievementNotification: effects.notification }));
vi.mock('$lib/server/companions/bonds', () => ({ getActiveCompanionBond: effects.bond }));
vi.mock('$lib/server/companions/rituals', () => ({ incrementCompanionRitual: effects.ritual }));

import { POST as complete } from '../../routes/api/games/session/complete/+server';
import { POST as sign } from '../../routes/api/games/sign/+server';
import { GET as playerState } from '../../routes/api/games/player/state/+server';
import { makeSignature } from '$lib/server/games/hmac';

const OWNER = '10000000-0000-4000-8000-000000000001';
const FOREIGN = '10000000-0000-4000-8000-000000000002';
const SESSION = '20000000-0000-4000-8000-000000000001';
const GAME = '30000000-0000-4000-8000-000000000001';
const NONCE = 'server-issued-session-nonce';
const RESULT = { score: 850, durationMs: 30_000, success: true, stats: { waves: 3, bestCombo: 8 } };
const PLAY_RITUAL = { key: 'play_game_with_companion', title: 'Play together', description: 'Complete a game with a companion.', progressMax: 1, xpReward: 20, shardReward: 3, affectionReward: 1, trustReward: 1, progress: 1, status: 'completed', completedAt: '2026-10-04T12:01:00Z' };
const CANONICAL = {
  settlementVersion: 1, sessionId: SESSION,
  xpDelta: 9, baseXpDelta: 8, xpMultiplier: 1.1, baseXp: 8, finalXp: 9,
  xpFromCompanion: 1, xpFromStreak: 0,
  companionBonus: { companionId: '40000000-0000-4000-8000-000000000001', name: 'Fern', bondLevel: 8, xpMultiplier: 1.1 },
  currencyDelta: 22, baseCurrencyDelta: 17, currencyMultiplier: 1.3,
  rewardsGranted: { xpGained: 9, shardsGained: 22, xpMultiplier: 1.1, currencyMultiplier: 1.3 },
  achievements: [{ unlocked: true, achievementId: '50000000-0000-4000-8000-000000000001', key: 'first_clear', name: 'First clear', points: 25, shards: 125, icon: 'trophy', rarity: 'common', meta: { sessionId: SESSION } }],
  rituals: { list: [PLAY_RITUAL], completed: [PLAY_RITUAL] }
};
type QueryCall = { privileged: boolean; table: string; selected: string; filters: Array<[string, string, unknown]>; writes: Array<[string, unknown]>; limit: number | null };

// Routes, owner checks, signature verification and receipt handling remain real.
// Only network calls and optional post-commit effects are replaced. Transaction
// rollback, database grants and competing PostgreSQL sessions need the SQL suite.
const fixture = () => {
  const state = {
    user: { id: OWNER } as { id: string } | null,
    authError: null as unknown,
    cachedUser: undefined as { id: string } | undefined,
    session: { id: SESSION, user_id: OWNER, nonce: NONCE, status: 'started', completed_at: null as string | null, game_id: GAME, started_at: '2026-10-04T12:00:00Z' } as Record<string, any> | null,
    game: { id: GAME, slug: 'dodge', name: 'Orbfield', max_score: 100_000, is_active: true },
    config: { game_id: GAME, max_duration_ms: 600_000, min_duration_ms: 10_000, max_score_per_min: 8_000, min_client_ver: '1.0.0' },
    receipt: null as Record<string, any> | null,
    receiptError: null as unknown,
    settlementError: null as unknown,
    settlementReject: null as unknown,
    settlementResult: { receipt: structuredClone(CANONICAL), replayed: false } as unknown,
    recentRewards: 0,
    stats: { id: OWNER, xp: 109, level: 2, xp_next: 200, energy: 7, energy_max: 10 } as Record<string, unknown> | null,
    statsError: null as unknown,
    wallet: { balance: 347, currency: 'shards', updated_at: '2026-10-04T12:01:00Z' } as Record<string, any>,
    walletError: null as unknown,
    rewardsError: null as unknown,
    rewards: [{ id: 'reward-1', xp_delta: 9, currency_delta: 22, inserted_at: '2026-10-04T12:01:00Z', meta: { base_currency: 17, multiplier: 1.3 }, session: { id: SESSION, user_id: OWNER, game: { slug: 'dodge', name: 'Orbfield' } } }],
    calls: [] as QueryCall[], order: [] as string[]
  };
  const query = (table: string, privileged: boolean) => {
    const call: QueryCall = { privileged, table, selected: '', filters: [], writes: [], limit: null };
    state.calls.push(call);
    state.order.push(`${privileged ? 'admin' : 'session'}:${table}`);
    const result = () => {
      if (call.writes.length) throw new Error(`Split write forbidden: ${table}`);
      if (table === 'game_sessions') return { data: state.session, error: null, count: 1 };
      if (table === 'game_titles') return { data: state.game, error: null };
      if (table === 'game_config') return { data: state.config, error: null };
      if (table === 'economy_transactions') return { data: state.receipt, error: state.receiptError };
      if (table === 'game_grants') return { data: null, count: state.recentRewards, error: null };
      if (table === 'wallets') return { data: state.wallet, error: state.walletError };
      if (table === 'user_wallets') return { data: { shards: 999_999 }, error: null };
      if (table === 'game_rewards') return { data: state.rewards, error: state.rewardsError };
      if (table === 'player_stats') return { data: state.stats, error: state.statsError };
      if (table === 'user_subscriptions') return { data: null, error: null };
      throw new Error(`Unexpected ${privileged ? 'service' : 'session'} table: ${table}`);
    };
    const builder: any = {
      select: (columns: string) => { call.selected = columns; return builder; },
      eq: (column: string, value: unknown) => { call.filters.push(['eq', column, value]); return builder; },
      gte: (column: string, value: unknown) => { call.filters.push(['gte', column, value]); return builder; },
      order: () => builder,
      limit: (limit: number) => { call.limit = limit; return builder; },
      insert: (value: unknown) => { call.writes.push(['insert', value]); return builder; },
      update: (value: unknown) => { call.writes.push(['update', value]); return builder; },
      upsert: (value: unknown) => { call.writes.push(['upsert', value]); return builder; },
      single: async () => result(), maybeSingle: async () => result(),
      then: (resolve: any, reject: any) => Promise.resolve().then(result).then(resolve, reject)
    };
    return builder;
  };
  admin.from.mockImplementation((table: string) => query(table, true));
  admin.rpc.mockImplementation(async (name: string) => {
    state.order.push(name);
    if (name === 'fn_settle_game_session') {
      if (state.settlementReject) throw state.settlementReject;
      return { data: state.settlementResult, error: state.settlementError };
    }
    if (name === 'fn_leader_refresh') return { data: null, error: null };
    throw new Error(`Unexpected privileged RPC: ${name}`);
  });
  const supabase = {
    from: vi.fn((table: string) => query(table, false)),
    auth: { getUser: vi.fn(async () => ({ data: { user: state.user }, error: state.authError })) },
    rpc: vi.fn(async () => { throw new Error('Settlement may not use the session client'); })
  };
  const event = (overrides: Record<string, unknown> = {}, endpoint = 'session/complete') => ({
    locals: { supabase, user: state.cachedUser },
    request: new Request(`http://localhost/api/games/${endpoint}`, { method: 'POST', body: JSON.stringify({
      sessionId: SESSION, ...RESULT, nonce: NONCE, clientVersion: '1.0.0',
      signature: makeSignature(SESSION, RESULT.score, RESULT.durationMs, NONCE), ...overrides
    }) }),
    getClientAddress: () => '127.0.0.1', cookies: { get: () => undefined },
    url: new URL(`http://localhost/api/games/${endpoint}`)
  }) as any;
  const completeSession = (overrides: Record<string, unknown> = {}) => complete(event(overrides));
  const signSession = async (overrides: Record<string, unknown> = {}) => {
    try { return await sign(event(overrides, 'sign')); } catch (failure) {
      const http = failure as { status?: number; body?: unknown };
      if (typeof http.status !== 'number' || !http.body) throw failure;
      return new Response(JSON.stringify(http.body), { status: http.status });
    }
  };
  return { state, supabase, event, completeSession, signSession };
};

beforeEach(() => {
  vi.clearAllMocks();
  for (const effect of Object.values(effects)) effect.mockReset().mockResolvedValue(null);
  vi.stubEnv('ECON_ACH_POINT_TO_SHARDS', '5');
  vi.stubEnv('ECON_STREAK_MULTIPLIER_CAP', '2');
  vi.spyOn(console, 'error').mockImplementation(() => {});
  vi.spyOn(console, 'warn').mockImplementation(() => {});
});
afterEach(() => { vi.useRealTimers(); vi.unstubAllEnvs(); vi.restoreAllMocks(); });

const expectSafeFailure = async (response: Response, status: number) => {
  expect(response.status).toBe(status);
  const body = await response.json();
  expect(typeof body.code).toBe('string');
  expect(typeof body.message).toBe('string');
  expect(JSON.stringify(body)).not.toMatch(/private|database|postgres|sensitive|secret|constraint/i);
  expect(body).not.toHaveProperty('xpDelta');
  return body;
};

const receiptReads = (calls: QueryCall[]) => calls.filter((call) => call.table === 'economy_transactions');
const markSettled = (test: ReturnType<typeof fixture>) => {
  test.state.session!.status = 'completed';
  test.state.session!.completed_at = '2026-10-04T12:01:00Z';
  test.state.receipt = {
    user_id: OWNER, source: 'game_session', idempotency_key: `game-session:${SESSION}`, applied: true,
    result: structuredClone(CANONICAL),
    meta: { request: { ...structuredClone(RESULT), nonce: NONCE, clientVersion: '1.0.0' }, gameId: GAME, gameSlug: 'dodge' }
  };
};

describe('atomic game completion API boundary', () => {
  it('rejects signed-out completion before reading a receipt or invoking a service RPC', async () => {
    const test = fixture(); test.state.user = null;
    await expectSafeFailure(await test.completeSession(), 401);
    expect(test.state.calls).toEqual([]);
    expect(admin.rpc).not.toHaveBeenCalled();
  });

  it.each(['missing', 'foreign'])('rejects a %s session before privileged receipt reads and settlement', async (kind) => {
    const test = fixture();
    if (kind === 'missing') test.state.session = null;
    else test.state.session!.user_id = FOREIGN;
    const response = await test.completeSession();
    expect([403, 404]).toContain(response.status);
    expect(receiptReads(test.state.calls)).toEqual([]);
    expect(admin.rpc).not.toHaveBeenCalled();
    expect(test.state.calls.filter((call) => call.privileged)).toEqual([]);
  });

  it.each(['missing', 'foreign', 'invalid token'])('revalidates a cached owner against %s Auth before service access', async (kind) => {
    const test = fixture(); test.state.cachedUser = { id: OWNER };
    test.state.user = kind === 'foreign' ? { id: FOREIGN } : kind === 'missing' ? null : { id: OWNER };
    if (kind === 'invalid token') test.state.authError = { message: 'private invalid token details' };
    const response = await test.completeSession();
    expect([401, 403]).toContain(response.status);
    expect(admin.from).not.toHaveBeenCalled();
    expect(admin.rpc).not.toHaveBeenCalled();
    expect(test.supabase.auth.getUser).toHaveBeenCalled();
  });

  it('replays the immutable receipt before config, game availability and hourly-cap checks', async () => {
    const test = fixture(); markSettled(test);
    test.state.config.min_duration_ms = 90_000;
    test.state.config.min_client_ver = '99.0.0';
    test.state.game.is_active = false;
    test.state.game.max_score = 1;
    test.state.recentRewards = 999;
    const first = await test.completeSession();
    expect(first.status).toBe(200);
    expect(await first.json()).toEqual(CANONICAL);
    expect(admin.rpc).not.toHaveBeenCalled();
    expect(test.state.calls.map((call) => call.table)).toEqual(['game_sessions', 'economy_transactions']);
    const read = receiptReads(test.state.calls)[0]!;
    expect(read.privileged).toBe(true);
    expect(read.filters).toEqual(expect.arrayContaining([
      ['eq', 'user_id', OWNER], ['eq', 'source', 'game_session'], ['eq', 'idempotency_key', `game-session:${SESSION}`]
    ]));
    for (const effect of [effects.analytics, effects.inspect, effects.ingest, effects.notification, effects.ritual]) expect(effect).not.toHaveBeenCalled();
    const repeated = await test.completeSession();
    expect(repeated.status).toBe(200);
    expect(await repeated.json()).toEqual(CANONICAL);
    expect(admin.rpc).not.toHaveBeenCalled();
  });

  it.each([
    { score: RESULT.score + 1 }, { durationMs: RESULT.durationMs + 1 },
    { clientVersion: '1.0.1' }, { success: false }, { stats: { ...RESULT.stats, waves: 4 } }
  ])('rejects changed completed-session submission with a conflict: %j', async (change) => {
    const test = fixture(); markSettled(test);
    const response = await test.completeSession({ ...change, signature: makeSignature(SESSION, change.score ?? RESULT.score, change.durationMs ?? RESULT.durationMs, NONCE) });
    await expectSafeFailure(response, 409);
    expect(admin.rpc).not.toHaveBeenCalled();
    expect(test.state.calls.flatMap((call) => call.writes)).toEqual([]);
    expect(effects.ingest).not.toHaveBeenCalled();
  });

  it('compares stats structurally so reordered JSON keys preserve canonical replay', async () => {
    const test = fixture(); markSettled(test);
    const response = await test.completeSession({ stats: { bestCombo: 8, waves: 3 } });
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual(CANONICAL);
    expect(admin.rpc).not.toHaveBeenCalled();
  });

  it('rejects a changed nonce before revealing a receipt', async () => {
    const test = fixture(); markSettled(test);
    await expectSafeFailure(await test.completeSession({ nonce: 'other-nonce', signature: makeSignature(SESSION, RESULT.score, RESULT.durationMs, 'other-nonce') }), 403);
    expect(receiptReads(test.state.calls)).toEqual([]);
    expect(admin.rpc).not.toHaveBeenCalled();
  });

  it('does not rerun optional effects when the atomic RPC reports a racing request replay', async () => {
    const test = fixture(); test.state.settlementResult = { receipt: structuredClone(CANONICAL), replayed: true };
    const response = await test.completeSession();
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual(CANONICAL);
    expect(admin.rpc.mock.calls.map(([name]) => name)).toEqual(['fn_settle_game_session']);
    for (const effect of [effects.analytics, effects.inspect, effects.ingest, effects.notification, effects.ritual]) expect(effect).not.toHaveBeenCalled();
  });

  it('passes authenticated identity and bounded policy to one service settlement, preserving its exact receipt', async () => {
    const test = fixture();
    const response = await test.completeSession({ userId: FOREIGN, xpDelta: 999_999, currencyDelta: 999_999 });
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual(CANONICAL);
    const settlement = admin.rpc.mock.calls.filter(([name]) => name === 'fn_settle_game_session');
    expect(settlement).toHaveLength(1);
    expect(settlement[0]?.[1]).toEqual({
      p_user: OWNER, p_session: SESSION, p_score: RESULT.score, p_duration_ms: RESULT.durationMs,
      p_nonce: NONCE, p_client_version: '1.0.0', p_success: true, p_stats: RESULT.stats,
      p_max_rewards_per_hour: 60, p_streak_multiplier_cap: 2, p_achievement_shard_factor: 5
    });
    expect(test.supabase.rpc).not.toHaveBeenCalled();
    expect(test.state.calls.flatMap((call) => call.writes)).toEqual([]);
    expect(admin.rpc.mock.calls.some(([name]) => ['fn_game_complete', 'fn_award_game_xp', 'fn_wallet_grant', 'fn_settle_achievement_reward'].includes(name))).toBe(false);
  });

  it('accepts the nested SDK results envelope and normalizes score and duration once', async () => {
    const test = fixture();
    const response = await test.completeSession({ score: 1, durationMs: 1, success: false, stats: { forged: true }, results: { ...RESULT, score: RESULT.score + 0.9, durationMs: RESULT.durationMs + 0.8 } });
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual(CANONICAL);
    expect(admin.rpc).toHaveBeenCalledWith('fn_settle_game_session', expect.objectContaining({ p_score: RESULT.score, p_duration_ms: RESULT.durationMs, p_success: true, p_stats: RESULT.stats }));
  });

  it.each([
    ['string score', { score: '850' }], ['boolean score', { score: true }],
    ['negative score', { score: -1 }], ['score integer overflow', { score: 2_147_483_648 }],
    ['zero duration', { durationMs: 0 }], ['string duration', { durationMs: '30000' }],
    ['duration integer overflow', { durationMs: 2_147_483_648 }],
    ['invalid session ID', { sessionId: 'not-a-session-uuid' }], ['empty nonce', { nonce: '' }],
    ['oversized nonce', { nonce: 'x'.repeat(257) }], ['nonboolean success', { success: 'yes' }],
    ['array stats', { stats: [] }], ['oversized stats', { stats: { payload: 'x'.repeat(16_385) } }]
  ] as Array<[string, Record<string, unknown>]>)('rejects %s before privileged reads', async (_label, body) => {
    const test = fixture();
    await expectSafeFailure(await test.completeSession(body), 400);
    expect(admin.from).not.toHaveBeenCalled();
    expect(admin.rpc).not.toHaveBeenCalled();
  });

  it('rejects an invalid signature before settlement', async () => {
    const test = fixture();
    await expectSafeFailure(await test.completeSession({ signature: 'invalid-signature' }), 403);
    expect(admin.rpc).not.toHaveBeenCalled();
  });

  it('fails closed on a completed legacy session without a canonical receipt', async () => {
    const test = fixture(); test.state.session!.status = 'completed'; test.state.session!.completed_at = '2026-10-04T12:01:00Z';
    await expectSafeFailure(await test.completeSession(), 409);
    expect(admin.rpc).not.toHaveBeenCalled();
  });

  it.each([
    ['conflict', 409], ['legacy_unreconciled', 409], ['nonce_mismatch', 403], ['not_found', 404],
    ['cap_rewards_hourly', 429], ['invalid_score', 400], ['invalid_duration', 400],
    ['invalid_score_rate', 400], ['client_outdated', 400]
  ])('maps the settlement %s error to HTTP %i without leaking database details', async (suffix, status) => {
    const test = fixture();
    test.state.settlementError = { code: 'P0001', message: `game_settlement_${suffix}`, details: 'private database secret' };
    await expectSafeFailure(await test.completeSession(), Number(status));
    expect(admin.rpc).toHaveBeenCalledWith('fn_settle_game_session', expect.any(Object));
    expect(effects.ingest).not.toHaveBeenCalled();
    expect(test.state.calls.flatMap((call) => call.writes)).toEqual([]);
  });

  it('fails closed on an unavailable receipt lookup without attempting a fresh settlement', async () => {
    const test = fixture(); markSettled(test);
    test.state.receiptError = { message: 'private database secret' };
    await expectSafeFailure(await test.completeSession(), 500);
    expect(receiptReads(test.state.calls)).toHaveLength(1);
    expect(admin.rpc).not.toHaveBeenCalled();
  });

  it.each(['unapplied', 'malformed', 'foreign session'])('does not replay a %s receipt', async (kind) => {
    const test = fixture(); markSettled(test);
    if (kind === 'unapplied') test.state.receipt!.applied = false;
    if (kind === 'malformed') test.state.receipt!.result = {};
    if (kind === 'foreign session') test.state.receipt!.result.sessionId = 'other-session';
    const response = await test.completeSession();
    expect([409, 500]).toContain(response.status);
    expect(admin.rpc).not.toHaveBeenCalled();
    expect(await response.json()).not.toHaveProperty('xpDelta');
  });

  it('returns a safe retryable failure when settlement rejects at the transport boundary', async () => {
    const test = fixture(); test.state.settlementReject = new Error('private postgres connection secret');
    await expectSafeFailure(await test.completeSession(), 500);
    expect(admin.rpc).toHaveBeenCalledWith('fn_settle_game_session', expect.any(Object));
    expect(test.state.calls.flatMap((call) => call.writes)).toEqual([]);
    expect(effects.ingest).not.toHaveBeenCalled();
  });

  it('recovers a lost committed response from the persisted receipt without another grant or side effect', async () => {
    const test = fixture();
    admin.rpc.mockImplementation(async (name: string) => {
      if (name !== 'fn_settle_game_session') throw new Error(`Unexpected RPC: ${name}`);
      markSettled(test);
      throw new Error('private transport response lost after commit');
    });
    await expectSafeFailure(await test.completeSession(), 500);
    const retry = await test.completeSession();
    expect(retry.status).toBe(200);
    expect(await retry.json()).toEqual(CANONICAL);
    expect(admin.rpc.mock.calls.map(([name]) => name)).toEqual(['fn_settle_game_session']);
    expect(test.state.calls.flatMap((call) => call.writes)).toEqual([]);
    for (const effect of [effects.analytics, effects.inspect, effects.ingest, effects.notification, effects.ritual]) expect(effect).not.toHaveBeenCalled();
  });

  it('does not expose unknown database details or fabricate rewards after a failed settlement', async () => {
    const test = fixture(); test.state.settlementError = { code: '23514', message: 'private sensitive constraint', details: 'postgres secret' };
    await expectSafeFailure(await test.completeSession(), 500);
    expect(admin.rpc).toHaveBeenCalledWith('fn_settle_game_session', expect.any(Object));
    expect(test.state.calls.flatMap((call) => call.writes)).toEqual([]);
    expect(effects.ingest).not.toHaveBeenCalled();
  });

  it.each([null, {}, { receipt: null, replayed: false }, { receipt: CANONICAL }, { receipt: { ...CANONICAL, sessionId: 'foreign-session' }, replayed: false }, { receipt: { ...CANONICAL, xpDelta: -1 }, replayed: false }])('fails closed on a malformed settlement acknowledgement: %j', async (data) => {
    const test = fixture(); test.state.settlementResult = data;
    await expectSafeFailure(await test.completeSession(), 500);
    expect(admin.rpc).toHaveBeenCalledWith('fn_settle_game_session', expect.any(Object));
    expect(effects.ingest).not.toHaveBeenCalled();
  });

  it('returns the committed receipt within the bound even when an optional effect never settles', async () => {
    vi.useFakeTimers();
    const test = fixture(); effects.ingest.mockImplementation(() => new Promise(() => {}));
    const pending = test.completeSession();
    await vi.advanceTimersByTimeAsync(2_000);
    const response = await pending;
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual(CANONICAL);
    expect(effects.ingest).toHaveBeenCalledTimes(1);
    expect(admin.rpc.mock.calls.filter(([name]) => name === 'fn_settle_game_session')).toHaveLength(1);
  });

  it('keeps a committed canonical receipt successful when every optional effect rejects', async () => {
    const test = fixture();
    for (const effect of [effects.audit, effects.analytics, effects.inspect, effects.ingest, effects.notification]) {
      effect.mockRejectedValue(new Error('private optional side effect failure'));
    }
    admin.rpc.mockImplementation(async (name: string) => {
      if (name === 'fn_settle_game_session') return { data: test.state.settlementResult, error: null };
      throw new Error('private leaderboard failure');
    });
    const response = await test.completeSession();
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual(CANONICAL);
    expect(admin.rpc.mock.calls.filter(([name]) => name === 'fn_settle_game_session')).toHaveLength(1);
  });
});

describe('completed game signing recovery', () => {
  it('cannot issue a signature for a signed-out visitor', async () => {
    const test = fixture(); test.state.user = null;
    expect((await test.signSession()).status).toBe(401);
    expect(test.state.calls).toEqual([]);
    expect(admin.rpc).not.toHaveBeenCalled();
  });

  it('revalidates a stale cached owner before signing or reading service receipts', async () => {
    const test = fixture(); test.state.cachedUser = { id: OWNER }; test.state.user = { id: FOREIGN };
    const response = await test.signSession();
    expect([401, 403]).toContain(response.status);
    expect(admin.from).not.toHaveBeenCalled();
    expect(admin.rpc).not.toHaveBeenCalled();
  });

  it('requires current authentication and session ownership before any receipt read', async () => {
    const test = fixture(); markSettled(test); test.state.session!.user_id = FOREIGN;
    const response = await test.signSession();
    expect([403, 404]).toContain(response.status);
    expect(admin.from).not.toHaveBeenCalled();
    expect(admin.rpc).not.toHaveBeenCalled();
  });

  it('can re-sign the unchanged completed result without consulting changed game configuration', async () => {
    const test = fixture(); markSettled(test);
    test.state.config.min_client_ver = '99.0.0'; test.state.game.is_active = false;
    const response = await test.signSession();
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      signature: makeSignature(SESSION, RESULT.score, RESULT.durationMs, NONCE),
      payload: `${SESSION}|${RESULT.score}|${RESULT.durationMs}|${NONCE}`
    });
    expect(test.state.calls.map((call) => call.table)).toEqual(['game_sessions', 'economy_transactions']);
    expect(admin.rpc).not.toHaveBeenCalled();
  });

  it.each([{ score: RESULT.score + 1 }, { durationMs: RESULT.durationMs + 1 }, { clientVersion: '1.0.1' }])('cannot re-sign changed receipt identity: %j', async (change) => {
    const test = fixture(); markSettled(test);
    expect((await test.signSession(change)).status).toBe(409);
    expect(admin.rpc).not.toHaveBeenCalled();
  });

  it('fails closed for a completed legacy run with no receipt', async () => {
    const test = fixture(); test.state.session!.status = 'completed'; test.state.session!.completed_at = '2026-10-04T12:01:00Z';
    expect((await test.signSession()).status).toBe(409);
    expect(admin.rpc).not.toHaveBeenCalled();
  });
});

describe('canonical player-state reward reads', () => {
  it('reads the canonical wallet and uses a bounded inner session-owner join for reward history', async () => {
    const test = fixture();
    const response = await playerState(test.event());
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.currency).toBe(347);
    expect(body.wallet).toEqual({ balance: 347, currency: 'shards', updatedAt: test.state.wallet.updated_at });
    const walletRead = test.state.calls.find((call) => call.table === 'wallets');
    expect(walletRead?.filters).toContainEqual(['eq', 'user_id', OWNER]);
    expect(walletRead?.selected).toContain('balance');
    expect(test.state.calls.some((call) => call.table === 'user_wallets')).toBe(false);
    const rewardsRead = test.state.calls.find((call) => call.table === 'game_rewards');
    expect(rewardsRead?.selected).toContain('session:game_sessions!inner(');
    expect(rewardsRead?.filters).toContainEqual(['eq', 'session.user_id', OWNER]);
    expect(rewardsRead?.limit).toBe(5);
    expect(body.rewards).toEqual([{ id: 'reward-1', xpDelta: 9, currencyDelta: 22, insertedAt: '2026-10-04T12:01:00Z', game: 'dodge', gameName: 'Orbfield', baseCurrencyDelta: 17, currencyMultiplier: 1.3 }]);
  });

  it.each([
    ['wallet', { message: 'private database connection details' }],
    ['wallet', { code: 'PGRST205', message: 'private wallet schema unavailable' }],
    ['history', { message: 'private database connection details' }],
    ['history', { code: 'PGRST205', message: 'private history schema unavailable' }]
  ])('does not invent reward data when canonical %s reading fails', async (source, failure) => {
    const test = fixture();
    if (source === 'wallet') test.state.walletError = failure;
    else test.state.rewardsError = failure;
    const response = await playerState(test.event());
    const body = await expectSafeFailure(response, 500);
    expect(body).not.toHaveProperty('wallet');
    expect(body).not.toHaveProperty('rewards');
  });

  it.each(['missing', 'query failure'])('fails closed when canonical player stats are %s', async (kind) => {
    const test = fixture();
    if (kind === 'missing') test.state.stats = null;
    else test.state.statsError = { message: 'private stats database details' };
    const body = await expectSafeFailure(await playerState(test.event()), 500);
    expect(body).not.toHaveProperty('xp');
    expect(body).not.toHaveProperty('wallet');
  });

  it.each([null, -1, 0.5, '109', NaN, Infinity, Number.MAX_SAFE_INTEGER + 1])('fails closed on malformed canonical XP %j', async (xp) => {
    const test = fixture(); test.state.stats!.xp = xp;
    const body = await expectSafeFailure(await playerState(test.event()), 500);
    expect(body).not.toHaveProperty('xp');
    expect(body).not.toHaveProperty('wallet');
  });

  it.each([-1, 0.5, 'not-a-balance', NaN, Infinity, Number.MAX_SAFE_INTEGER + 1])('fails closed on malformed canonical wallet balance %j', async (balance) => {
    const test = fixture(); test.state.wallet.balance = balance;
    const body = await expectSafeFailure(await playerState(test.event()), 500);
    expect(body).not.toHaveProperty('currency');
    expect(body).not.toHaveProperty('wallet');
  });

  it('does not query private state for a signed-out request', async () => {
    const test = fixture(); test.state.user = null;
    await expectSafeFailure(await playerState(test.event()), 401);
    expect(test.state.calls).toEqual([]);
  });
});
