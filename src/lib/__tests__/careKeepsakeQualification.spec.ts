import { afterEach, beforeEach, expect, it, vi } from 'vitest';
const { rpc } = vi.hoisted(() => ({ rpc: vi.fn() }));
vi.mock('$lib/server/supabase', () => ({
  createSupabaseServerClient: vi.fn(async (event: any) => event.locals),
  supabaseAdmin: { rpc }
}));
vi.mock('$lib/server/companions/bonds', () => ({ syncPlayerBondState: vi.fn(async () => ({ rows: [], milestones: [] })) }));
vi.mock('$lib/server/companions/rituals', () => ({ incrementCompanionRitual: vi.fn(async () => null) }));
vi.mock('$lib/server/emotionalState', () => ({ syncEmotionalStateFromCompanionStats: vi.fn(async () => null) }));
import { POST } from '../../routes/api/companions/care/+server';
const fixture = (careData: unknown, careError: unknown = null) => {
  const companion = { id: 'c1', owner_id: 'u1', name: 'Fern', affection: 70, trust: 60, energy: 50,
    updated_at: new Date().toISOString(), stats: null };
  const from = (table: string) => {
    const result = () => table === 'companions' ? { data: companion, error: null }
      : table === 'companion_care_events' ? { data: careData, error: careError }
      : { data: null, error: null };
    const query: any = {
      select: () => query, eq: () => query, update: () => query, insert: () => query, upsert: () => query,
      single: async () => result(), maybeSingle: async () => result(),
      then: (resolve: (value: unknown) => unknown) => Promise.resolve(result()).then(resolve)
    };
    return query;
  };
  return { locals: { supabase: { from }, session: { user: { id: 'u1' } } },
    request: new Request('http://localhost/api/companions/care', { method: 'POST', body: JSON.stringify({ companionId: 'c1', action: 'feed' }) }) };
};
beforeEach(() => { rpc.mockReset(); vi.spyOn(console,'error').mockImplementation(() => {}); });
afterEach(() => { vi.restoreAllMocks(); });
it.each([[null, { message: 'insert failed' }], [null, null], [{ id: 'event1' }, { message: 'insert failed' }]])(
  'does not evaluate acquisition unless care insertion succeeds with an ID', async (data, error) => {
    const response = await POST(fixture(data,error) as any);
    expect((await response.json()).itemUnlock).toBeNull();
    expect(rpc).not.toHaveBeenCalled();
  }
);
it('uses the persisted care ID and returns only the atomic RPC result', async () => {
  const unlock = { id: 'owned1', itemKey: 'care-moss-seat', title: 'Moss Seat', description: 'Soft seat' };
  rpc.mockResolvedValue({ data: unlock, error: null });
  const response = await POST(fixture({ id: 'event1' }) as any);
  expect(rpc).toHaveBeenCalledTimes(1);
  expect(rpc).toHaveBeenCalledWith('unlock_care_moss_seat', {
    p_owner_id: 'u1', p_companion_id: 'c1', p_care_event_id: 'event1'
  });
  expect((await response.json()).itemUnlock).toEqual(unlock);
});
it('does not announce an unlock when the atomic RPC fails', async () => {
  rpc.mockResolvedValue({ data: null, error: { message: 'journal failure' } });
  const response = await POST(fixture({ id: 'event1' }) as any);
  expect((await response.json()).itemUnlock).toBeNull();
});
it('does not announce an unlock when the atomic RPC request rejects', async () => {
  const failure = new Error('network request failed');
  rpc.mockRejectedValue(failure);
  const response = await POST(fixture({ id: 'event1' }) as any);
  expect(response.status).toBe(200);
  expect((await response.json()).itemUnlock).toBeNull();
  expect(console.error).toHaveBeenCalledWith('[companion care] item unlock evaluation failed', failure);
});
