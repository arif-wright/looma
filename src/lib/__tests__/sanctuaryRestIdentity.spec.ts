import { beforeEach, expect, it, vi } from 'vitest';
import { POST } from '../../routes/api/sanctuary/interact/+server';
import { syncEmotionalStateFromCompanionStats } from '$lib/server/emotionalState';
vi.mock('$lib/server/emotionalState', () => ({ syncEmotionalStateFromCompanionStats: vi.fn().mockResolvedValue(undefined) }));
const companionId = '20000000-0000-0000-0000-000000000001';
const requestId = '50000000-0000-0000-0000-000000000001';
const fixture = (data: unknown, error: unknown = null, payload: unknown = { action: 'shared_rest', companionId, requestId }) => {
  const rpc = vi.fn().mockResolvedValue({ data, error });
  const from = vi.fn();
  return { rpc, from, event: {
    locals: { supabase: { rpc, from }, user: { id: 'owner-1' } },
    request: new Request('https://example.test', { method: 'POST', body: JSON.stringify(payload) })
  } as any };
};
const result = { ok: true, replayed: false, companion: { id: companionId, energy: 35 }, memory: { id: 'memory-1', companion_id: companionId } };
beforeEach(() => { vi.clearAllMocks(); });
it('passes only companion/request identity to the authenticated RPC', async () => {
  const { event, rpc, from } = fixture(result, null, { action: 'shared_rest', companionId, requestId, energy: 100, owner_id: 'other', provenance: 'forged' });
  const response = await POST(event);
  expect(response.status).toBe(200);
  expect(rpc).toHaveBeenCalledTimes(1);
  expect(rpc).toHaveBeenCalledWith('perform_sanctuary_shared_rest', { p_companion_id: companionId, p_request_id: requestId });
  expect(from).not.toHaveBeenCalled();
  expect(await response.json()).toEqual(result);
});
it('returns the same persisted Journal on replay without resyncing old projected stats', async () => {
  const { event } = fixture({ ...result, replayed: true });
  expect(await (await POST(event)).json()).toMatchObject({ memory: { id: 'memory-1' }, replayed: true });
  expect(syncEmotionalStateFromCompanionStats).not.toHaveBeenCalled();
});
it('returns retryable failure rather than success without a committed Journal', async () => {
  const { event } = fixture({ ok: true, memory: null });
  expect((await POST(event)).status).toBe(500);
  expect(syncEmotionalStateFromCompanionStats).not.toHaveBeenCalled();
});
it('propagates cooldown and next availability without a second write', async () => {
  const data = { error: 'rest_cooldown', retryAfter: 300, nextAvailableAt: '2030-01-01T01:00:00Z' };
  const { event } = fixture(data);
  const response = await POST(event);
  expect(response.status).toBe(429);
  expect(await response.json()).toEqual(data);
});
it('rejects absent or invalid request UUIDs before database access', async () => {
  for (const payload of [{ action: 'shared_rest' }, { action: 'shared_rest', requestId: 'bad', companionId }]) {
    const { event, rpc } = fixture(null, null, payload);
    expect((await POST(event)).status).toBe(400);
    expect(rpc).not.toHaveBeenCalled();
  }
});
it('rejects unauthenticated requests before database access', async () => {
  const { event, rpc } = fixture(null);
  event.locals.user = null;
  expect((await POST(event)).status).toBe(401);
  expect(rpc).not.toHaveBeenCalled();
});
it('keeps database internals out of the error response', async () => {
  const log = vi.spyOn(console, 'error').mockImplementation(() => {});
  try {
    const { event } = fixture(null, { message: 'injected database failure' });
    const response = await POST(event);
    expect(response.status).toBe(500);
    expect(await response.json()).toEqual({ error: 'interaction_failed' });
  } finally { log.mockRestore(); }
});
