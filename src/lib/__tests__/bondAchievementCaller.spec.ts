import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { admin } = vi.hoisted(() => ({ admin: { rpc: vi.fn(), from: vi.fn() } }));
vi.mock('$lib/server/supabase', () => ({
  supabaseAdmin: admin,
  createSupabaseServerClient: vi.fn(async (event: any) => event.locals)
}));
vi.mock('$lib/server/companions/rituals', () => ({ incrementCompanionRitual: vi.fn(async () => null) }));
vi.mock('$lib/server/emotionalState', () => ({ syncEmotionalStateFromCompanionStats: vi.fn(async () => null) }));

import { recalculateBondsForPlayer, syncPlayerBondState } from '$lib/server/companions/bonds';
import { POST as care } from '../../routes/api/companions/care/+server';

const OWNER = '11111111-1111-4111-8111-111111111111';
const FOREIGN = '22222222-2222-4222-8222-222222222222';
const COMPANION = '33333333-3333-4333-8333-333333333333';
const catalogEntry = (overrides: Record<string, unknown> = {}) => ({
  id: '44444444-4444-4444-8444-444444444444', key: 'bond_first', name: 'First Bond',
  description: 'Reach bond level 1.', icon: 'heart', rarity: 'common', points: 25,
  rule: { kind: 'bond_level', gte: 1 }, game_id: null, is_active: true, ...overrides
});

// The real bond service, evaluator, shard conversion and care route execute.
// Only the network boundary is replaced. This is not a live-grant/RLS test.
const fixture = () => {
  const state = {
    catalog: [catalogEntry()], level: 1, points: 0, shards: 0,
    unlocks: [] as Array<Record<string, any>>,
    authUser: { id: OWNER } as { id: string } | null,
    authError: null as object | null,
    recalcError: null as object | null,
    insertError: null as object | null,
    pointsError: null as object | null,
    shardError: null as object | null,
    careEventError: null as object | null,
    careEventMissingId: false,
    keepsakeError: null as object | null,
    keepsake: null as Record<string, unknown> | null,
    companionOwner: OWNER,
    order: [] as string[],
    sessionWrites: [] as Array<{ table: string; value: unknown }>
  };
  const companion = () => ({
    id: COMPANION, owner_id: state.companionOwner, name: 'Root', affection: 40,
    trust: 30, energy: 60, mood: 'neutral', updated_at: new Date().toISOString(),
    stats: { companion_id: COMPANION, care_streak: 0, bond_level: 0, bond_score: 0 }
  });

  const query = (table: string, privileged: boolean) => {
    let operation = 'select';
    let payload: any;
    const filters: Record<string, unknown> = {};
    const result = (single = false): any => {
      if (table === 'achievements') {
        if (!privileged) throw new Error('Catalog should use the private reward boundary');
        return { data: state.catalog, error: null };
      }
      if (table === 'user_achievements') {
        if (!privileged) throw new Error('Session client cannot write reward claims');
        if (operation !== 'select') throw new Error('Reward writes must use one settlement RPC');
        const matches = (row: Record<string, unknown>) => Object.entries(filters).every(([key, value]) => row[key] === value);
        return { data: null, count: state.unlocks.filter(matches).length, error: null };
      }
      if (privileged) {
        throw new Error(`Unexpected privileged access: ${table}`);
      }
      if (table === 'companions') return { data: single ? { ...companion(), ...payload } : [companion()], error: null };
      if (table === 'companion_care_events') {
        if (operation === 'insert' && !Array.isArray(payload) && state.careEventError) {
          return { data: null, error: state.careEventError };
        }
        const rows = operation === 'insert'
          ? (Array.isArray(payload) ? payload : [payload]).map((row, index) => ({ id: `event-${index}`, ...row }))
          : [];
        if (single && state.careEventMissingId && rows[0]) delete rows[0].id;
        return { data: single ? rows[0] ?? null : rows, error: null };
      }
      if (table === 'companion_stats') return { data: null, error: null };
      throw new Error(`Unexpected session access: ${table}`);
    };
    const change = (kind: string, value: unknown) => {
      operation = kind; payload = value;
      if (!privileged) state.sessionWrites.push({ table, value });
      return builder;
    };
    const builder: any = {
      select: () => builder,
      eq: (key: string, value: unknown) => { filters[key] = value; return builder; },
      in: () => builder,
      insert: (value: unknown) => change('insert', value),
      update: (value: unknown) => change('update', value),
      upsert: (value: unknown) => change('upsert', value),
      delete: () => { operation = 'delete'; return builder; },
      single: async () => result(true), maybeSingle: async () => result(true),
      then: (resolve: (value: unknown) => unknown) => Promise.resolve(result()).then(resolve)
    };
    return builder;
  };

  admin.from.mockImplementation((table: string) => query(table, true));
  admin.rpc.mockImplementation(async (name: string, args: Record<string, any>) => {
    state.order.push(name);
    if (name === 'recalculate_bonds_for_player') return {
      data: [{ companion_id: COMPANION, bond_level: state.level, bond_score: 10 }], error: state.recalcError
    };
    if (name === 'fn_settle_achievement_reward') {
      if (state.insertError && (state.insertError as any).code !== '23505') return { data: null, error: state.insertError };
      if (state.insertError || state.unlocks.some((row) => row.user_id === args.p_user && row.achievement_id === args.p_achievement)) {
        return { data: { unlocked: false, reason: 'already_unlocked' }, error: null };
      }
      // This mock models the RPC contract. Real rollback is tested in the SQL suite.
      const error = state.pointsError ?? state.shardError;
      if (error) return { data: null, error };
      const achievement = state.catalog.find((row) => row.id === args.p_achievement)!;
      const shards = achievement.points * args.p_shard_factor;
      state.unlocks.push({ id: `unlock-${state.unlocks.length + 1}`, user_id: args.p_user, achievement_id: args.p_achievement, meta: args.p_meta });
      state.points += achievement.points;
      state.shards += shards;
      return { data: { unlocked: true, achievementId: achievement.id, key: achievement.key,
        name: achievement.name, icon: achievement.icon, rarity: achievement.rarity,
        points: achievement.points, shards, meta: args.p_meta }, error: null };
    }
    if (name === 'unlock_care_moss_seat') return { data: state.keepsake, error: state.keepsakeError };
    throw new Error(`Unexpected privileged RPC: ${name}`);
  });
  const sessionClient = {
    auth: { getUser: vi.fn(async () => {
      state.order.push('getUser');
      return { data: { user: state.authUser }, error: state.authError };
    }) },
    from: vi.fn((table: string) => query(table, false)),
    rpc: vi.fn(async () => ({ data: null, error: { code: '42501', message: 'permission denied' } }))
  };
  const sync = (owner = OWNER) => syncPlayerBondState(sessionClient as any, owner);
  const careEvent = (body: Record<string, unknown>, authenticated = true) => ({
    locals: { supabase: sessionClient, session: authenticated ? { user: { id: OWNER } } : null },
    request: new Request('http://localhost/api/companions/care', { method: 'POST', body: JSON.stringify(body) })
  });
  return { state, sessionClient, sync, careEvent };
};

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv('ECON_ACH_POINT_TO_SHARDS', '5');
  vi.spyOn(console, 'error').mockImplementation(() => {});
});
afterEach(() => { vi.unstubAllEnvs(); vi.restoreAllMocks(); });

describe('owner-bound server bond achievements', () => {
  it('awards the authenticated owner through the server while session EXECUTE is denied', async () => {
    const { state, sessionClient, sync } = fixture();
    state.level = 2; // Also crosses a journal milestone; its write stays session-scoped.
    const result = await sync();
    expect(state.order).toEqual(['getUser', 'recalculate_bonds_for_player', 'fn_settle_achievement_reward']);
    expect(admin.rpc).toHaveBeenCalledWith('recalculate_bonds_for_player', { p_player_id: OWNER });
    expect(admin.rpc).toHaveBeenCalledWith('fn_settle_achievement_reward', { p_user: OWNER, p_achievement: state.catalog[0]!.id, p_shard_factor: 5, p_meta: { bondLevel: 2, source: 'companion_bond' } });
    expect(state.unlocks).toEqual([expect.objectContaining({ user_id: OWNER, achievement_id: state.catalog[0]!.id })]);
    expect(state.points).toBe(25);
    expect(state.shards).toBe(125);
    expect(result.rows[0]?.bond_level).toBe(2);
    expect(sessionClient.rpc).not.toHaveBeenCalled();
    expect(admin.from.mock.calls.map(([table]) => table)).toEqual(['achievements', 'user_achievements']);
    expect(state.sessionWrites).toEqual([expect.objectContaining({ table: 'companion_care_events' })]);
  });

  it('rejects a foreign owner before any privileged call or database access', async () => {
    const { sessionClient, sync } = fixture();
    await expect(sync(FOREIGN)).rejects.toThrow('bond_owner_mismatch');
    expect(admin.rpc).not.toHaveBeenCalled();
    expect(admin.from).not.toHaveBeenCalled();
    expect(sessionClient.from).not.toHaveBeenCalled();
  });

  it.each(['missing user', 'auth error', 'stale user with auth error'])('rejects %s before privilege', async (reason) => {
    const { state, sync } = fixture();
    if (reason !== 'stale user with auth error') state.authUser = null;
    if (reason !== 'missing user') state.authError = { message: 'Invalid access token' };
    await expect(sync()).rejects.toThrow('bond_authentication_required');
    expect(admin.rpc).not.toHaveBeenCalled();
    expect(admin.from).not.toHaveBeenCalled();
  });

  it('also guards direct recalculation, including a missing owner', async () => {
    const { sessionClient } = fixture();
    await expect(recalculateBondsForPlayer(sessionClient as any, '')).rejects.toThrow('bond_owner_mismatch');
    expect(admin.rpc).not.toHaveBeenCalled();
  });

  it('fails closed when Auth throws', async () => {
    const { sessionClient, sync } = fixture();
    sessionClient.auth.getUser.mockRejectedValueOnce(new Error('Auth unavailable'));
    await expect(sync()).rejects.toThrow('Auth unavailable');
    expect(admin.rpc).not.toHaveBeenCalled();
    expect(admin.from).not.toHaveBeenCalled();
  });

  it('uses the protected catalog amount and recalculated level despite forged care payload fields', async () => {
    const { state, careEvent, sessionClient } = fixture();
    state.catalog = [catalogEntry({ points: 37 })];
    const response = await care(careEvent({
      companionId: COMPANION, action: 'feed', userId: FOREIGN, playerId: FOREIGN,
      points: 999999, p_delta: 999999, bondLevel: 10, achievement: catalogEntry({ points: 999999 })
    }) as any);
    expect(response.status).toBe(200);
    expect(state.points).toBe(37);
    expect(state.shards).toBe(185);
    expect(admin.rpc).toHaveBeenCalledWith('fn_settle_achievement_reward', { p_user: OWNER, p_achievement: state.catalog[0]!.id, p_shard_factor: 5, p_meta: { bondLevel: 1, source: 'companion_bond' } });
    expect(state.unlocks[0]?.meta).toEqual({ bondLevel: 1, source: 'companion_bond' });
    expect(sessionClient.rpc).not.toHaveBeenCalled();
  });

  it('rejects unauthenticated care and foreign-companion care before rewards', async () => {
    const { state, careEvent } = fixture();
    const body = { companionId: COMPANION, action: 'feed' };
    expect((await care(careEvent(body, false) as any)).status).toBe(401);
    state.companionOwner = FOREIGN;
    expect((await care(careEvent(body) as any)).status).toBe(403);
    expect(admin.rpc).not.toHaveBeenCalled();
    expect(admin.from).not.toHaveBeenCalled();
  });

  it('integrates the real care handler with owner-checked bond rewards and the persisted-event keepsake RPC', async () => {
    const { state, careEvent, sessionClient } = fixture();
    state.keepsake = { id: 'owned-seat', itemKey: 'care-moss-seat', title: 'Moss Seat', description: 'Soft seat' };
    const response = await care(careEvent({
      companionId: COMPANION, action: 'feed', ownerId: FOREIGN,
      p_owner_id: FOREIGN, careEventId: 'forged-event', points: 999999
    }) as any);
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ ok: true, itemUnlock: state.keepsake });
    expect(state.order).toEqual(['getUser', 'recalculate_bonds_for_player', 'fn_settle_achievement_reward', 'unlock_care_moss_seat']);
    expect(admin.rpc).toHaveBeenCalledWith('unlock_care_moss_seat', {
      p_owner_id: OWNER, p_companion_id: COMPANION, p_care_event_id: 'event-0'
    });
    expect(state.points).toBe(25);
    expect(state.shards).toBe(125);
    expect(sessionClient.rpc).not.toHaveBeenCalled();
    expect(console.error).not.toHaveBeenCalled();
  });

  it.each(['insert error', 'missing event id'])('never evaluates a keepsake after %s with the real bond service active', async (failure) => {
    const { state, careEvent } = fixture();
    if (failure === 'insert error') state.careEventError = { message: 'care event insert failed' };
    else state.careEventMissingId = true;
    const response = await care(careEvent({ companionId: COMPANION, action: 'feed' }) as any);
    expect((await response.json()).itemUnlock).toBeNull();
    expect(state.order).toEqual(['getUser', 'recalculate_bonds_for_player', 'fn_settle_achievement_reward']);
    expect(admin.rpc.mock.calls.some(([name]) => name === 'unlock_care_moss_seat')).toBe(false);
  });

  it('reports no keepsake on atomic award failure without replaying already-completed bond rewards', async () => {
    const { state, careEvent } = fixture();
    state.keepsakeError = { message: 'journal failure' };
    const response = await care(careEvent({ companionId: COMPANION, action: 'feed' }) as any);
    expect((await response.json()).itemUnlock).toBeNull();
    expect(state.points).toBe(25);
    expect(state.shards).toBe(125);
    expect(state.order.filter((name) => name === 'fn_settle_achievement_reward')).toHaveLength(1);
    expect(console.error).toHaveBeenCalledWith('[companion care] moss seat unlock failed', state.keepsakeError);
  });

  it.each(['pointsError', 'shardError'] as const)('preserves a qualified keepsake when achievement settlement returns %s', async (stage) => {
    const { state, careEvent, sessionClient } = fixture();
    state[stage] = { message: 'atomic settlement rolled back' };
    state.keepsake = { id: 'owned-seat', itemKey: 'care-moss-seat', title: 'Moss Seat', description: 'Soft seat' };
    const response = await care(careEvent({ companionId: COMPANION, action: 'feed' }) as any);
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ ok: true, itemUnlock: state.keepsake });
    expect(state.order).toEqual(['getUser', 'recalculate_bonds_for_player', 'fn_settle_achievement_reward', 'unlock_care_moss_seat']);
    expect(state.unlocks).toEqual([]);
    expect(state.points).toBe(0);
    expect(state.shards).toBe(0);
    expect(admin.rpc).toHaveBeenCalledWith('unlock_care_moss_seat', {
      p_owner_id: OWNER, p_companion_id: COMPANION, p_care_event_id: 'event-0'
    });
    expect(sessionClient.rpc).not.toHaveBeenCalled();
    expect(console.error).toHaveBeenCalledWith('[companions] failed to unlock bond achievement', state[stage], expect.any(Object));
    state[stage] = null;
    await syncPlayerBondState(sessionClient as any, OWNER);
    await syncPlayerBondState(sessionClient as any, OWNER);
    expect(state.unlocks).toHaveLength(1);
    expect(state.points).toBe(25);
    expect(state.shards).toBe(125);
  });

  it('keeps bond Auth failure closed while preserving the independent persisted-care keepsake path', async () => {
    const { state, careEvent } = fixture();
    // The route already has its verified session; the later bond revalidation fails.
    state.authError = { message: 'Auth unavailable during bond sync' };
    const response = await care(careEvent({ companionId: COMPANION, action: 'feed' }) as any);
    expect((await response.json()).itemUnlock).toBeNull();
    expect(state.order).toEqual(['getUser', 'unlock_care_moss_seat']);
    expect(admin.rpc).toHaveBeenCalledTimes(1);
    expect(admin.rpc).toHaveBeenCalledWith('unlock_care_moss_seat', {
      p_owner_id: OWNER, p_companion_id: COMPANION, p_care_event_id: 'event-0'
    });
    expect(admin.from).not.toHaveBeenCalled();
    expect(state.points).toBe(0);
    expect(state.shards).toBe(0);
    expect(state.unlocks).toEqual([]);
    expect(console.error).toHaveBeenCalledWith('[companion care] bond sync failed', expect.any(Error));
  });

  it.each([
    { is_active: false }, { key: 'unknown_bond' }, { game_id: 'some-game' },
    { rule: { kind: 'first_clear' } }, { rule: { kind: 'bond_level', gte: 2 } }
  ])('does not award an inactive, unlisted or ineligible catalog entry: %j', async (overrides) => {
    const { state, sync } = fixture();
    state.catalog = [catalogEntry(overrides)];
    await sync();
    expect(state.points).toBe(0);
    expect(state.unlocks).toEqual([]);
    expect(admin.rpc).toHaveBeenCalledTimes(1);
  });

  it.each([0, NaN, Infinity])('does not grant rewards for unusable calculated level %s', async (level) => {
    const { state, sync } = fixture();
    state.level = level;
    await sync();
    expect(state.points).toBe(0);
    expect(state.unlocks).toEqual([]);
  });

  it('does not award again when the owner repeats a successful sync', async () => {
    const { state, sync } = fixture();
    await sync();
    await sync();
    expect(state.unlocks).toHaveLength(1);
    expect(state.points).toBe(25);
    expect(state.shards).toBe(125);
  });

  it.each([[1, 25, 1], [4, 75, 2], [8, 175, 3]])('awards eligible catalog tiers at level %s', async (level, points, claims) => {
    const { state, sync } = fixture();
    state.level = level;
    state.catalog = [
      catalogEntry(),
      catalogEntry({ id: 'growing', key: 'bond_growing', points: 50, rule: { kind: 'bond_level', gte: 4 } }),
      catalogEntry({ id: 'unbreakable', key: 'bond_unbreakable', points: 100, rule: { kind: 'bond_level', gte: 8 } })
    ];
    await sync();
    expect(state.points).toBe(points);
    expect(state.shards).toBe(points * 5);
    expect(state.unlocks).toHaveLength(claims);
  });

  it('handles a concurrent duplicate claim without paying again', async () => {
    const { state, sync } = fixture();
    state.insertError = { code: '23505' };
    await sync();
    expect(state.points).toBe(0);
    expect(state.shards).toBe(0);
    expect(admin.rpc).toHaveBeenCalledTimes(2);
  });

  it('does not award after recalculation or claim-insert failure', async () => {
    const { state, sync } = fixture();
    state.recalcError = { message: 'recalculation unavailable' };
    expect((await sync()).rows).toEqual([]);
    expect(admin.from).not.toHaveBeenCalled();
    state.recalcError = null;
    state.insertError = { code: '42501', message: 'claim insert denied' };
    await sync();
    expect(state.points).toBe(0);
    expect(state.shards).toBe(0);
    expect(admin.rpc.mock.calls.filter(([name]) => name === 'fn_settle_achievement_reward')).toHaveLength(1);
    expect(console.error).toHaveBeenCalled();
  });
});

// The network fixture verifies caller behavior; tests/sql/achievement-rewards.mjs
// executes the actual SQL and fault injection for every transaction stage.
describe('atomic settlement failure handling', () => {
  it.each(['pointsError', 'shardError'] as const)('keeps rewards untouched after %s and retries once', async (stage) => {
    const { state, sessionClient, sync } = fixture();
    state[stage] = { message: `${stage} failure` };
    await sync();
    expect(state.unlocks).toEqual([]);
    expect(state.points).toBe(0);
    expect(state.shards).toBe(0);
    expect(console.error).toHaveBeenCalledWith('[achievements] failed to settle reward', state[stage], expect.any(Object));
    state[stage] = null;
    await sync();
    await sync();
    expect(state.unlocks).toHaveLength(1);
    expect(state.points).toBe(25);
    expect(state.shards).toBe(125);
    expect(sessionClient.rpc).not.toHaveBeenCalled();
  });

  it('does not infer or repair payment for an already-unlocked legacy achievement', async () => {
    const { state, sync } = fixture();
    state.unlocks.push({ user_id: OWNER, achievement_id: state.catalog[0]!.id });
    await sync();
    expect(state.points).toBe(0);
    expect(state.shards).toBe(0);
    expect(state.order).toEqual(['getUser', 'recalculate_bonds_for_player']);
  });
});
