import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('$lib/server/supabase', () => ({
  createSupabaseServerClient: vi.fn(async (event: any) => event.locals),
  supabaseAdmin: { rpc: vi.fn(async () => ({ data: null, error: null })) }
}));
vi.mock('$lib/server/companions/bonds', () => ({ syncPlayerBondState: vi.fn(async () => ({ rows: [], milestones: [] })) }));
vi.mock('$lib/server/companions/rituals', () => ({ incrementCompanionRitual: vi.fn(async () => null) }));
vi.mock('$lib/server/emotionalState', () => ({ syncEmotionalStateFromCompanionStats: vi.fn(async () => null) }));

import { POST as care } from '../../routes/api/companions/care/+server';

// Exercise the real route handlers and effective-state helper, while keeping every database write local.
const fixture = (affection: number, trust: number, energy: number) => {
  const old = '2020-01-01T00:00:00Z';
  const companion = { id: 'c1', owner_id: 'u1', name: 'Root', affection, trust, energy,
    updated_at: old, stats: { companion_id: 'c1', fed_at: old, care_streak: 4, bond_score: 150, bond_level: 8 } };
  const writes: Array<Record<string, unknown>> = [];
  const from = (table: string) => {
    let operation = 'select';
    let payload: Record<string, unknown> = {};
    const result = () => {
      if (table === 'companions') return { data: { ...companion, ...payload }, error: null };
      if (table === 'sanctuary_placements') return { data: [{ id: 'p1', item: { id: 'i1', item_key: 'care-moss-seat', capabilities: ['interactive'] } }], error: null };
      if (table === 'sanctuary_interactions' && operation === 'select') return { data: null, error: null };
      return { data: { id: 'event1', created_at: new Date().toISOString(), ...payload }, error: null };
    };
    const query: any = {
      select: () => query, eq: () => query, not: () => query, order: () => query, limit: () => query,
      update: (value: Record<string, unknown>) => { operation = 'update'; payload = value; if (table === 'companions') writes.push(value); return query; },
      insert: (value: Record<string, unknown>) => { operation = 'insert'; payload = value; return query; },
      upsert: (value: Record<string, unknown>) => { operation = 'upsert'; payload = value; return query; },
      single: async () => result(), maybeSingle: async () => result(),
      then: (resolve: (value: unknown) => unknown) => Promise.resolve(result()).then(resolve)
    };
    return query;
  };
  return { writes, event: (action: string) => ({
    locals: { supabase: { from }, session: { user: { id: 'u1' } } },
    request: new Request('http://localhost/api/test', { method: 'POST', body: JSON.stringify({ companionId: 'c1', action }) })
  }) };
};

afterEach(() => { vi.useRealTimers(); });

// Shared-rest persistence now lives in the atomic RPC. Its real SQL no-absence
// and zero-energy regressions are in supabase/tests/atomic-shared-rest.sql;
// sanctuaryRestIdentity.spec.ts checks the companionId/requestId transport contract.
describe('relationship persistence after a long absence', () => {
  it.each([
    ['feed', 85, 77, 75], ['play', 88, 81, 50], ['groom', 84, 79, 55]
  ])('%s persists earned care gains without subtracting absence', async (action, affection, trust, energy) => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2030-01-01T00:00:00Z'));
    const { writes, event } = fixture(80, 75, 60);
    const response = await care(event(String(action)) as any);
    expect(response.status).toBe(200);
    expect(writes).toEqual([expect.objectContaining({ affection, trust, energy })]);
    expect((await response.json()).companion).toMatchObject({ affection, trust, energy });
  });

  it('feed can recover zero energy without reducing a full relationship', async () => {
    const { writes, event } = fixture(100, 100, 0);
    const response = await care(event('feed') as any);
    expect(response.status).toBe(200);
    expect(writes).toEqual([expect.objectContaining({ affection: 100, trust: 100, energy: 15 })]);
  });
});
