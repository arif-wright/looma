import { describe, expect, it, vi } from 'vitest';
import { POST } from '../../routes/api/items/moonberry/share/+server';
import { canShareMoonberry, isMoonberryUseRequest } from '$lib/items/moonberryUse';

const id = (n: number) => `50000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const payload = { action: 'share_moonberry', userItemId: id(1), companionId: id(2), requestId: id(3) };
const result = { ok: true, status: 'shared', userItemId: id(1), companionId: id(2), requestId: id(3), quantityAfter: 0, replayed: false };
const run = async (body: unknown = payload, response: any = { data: result, error: null }, signedIn = true) => {
  const rpc = vi.fn().mockResolvedValue(response);
  const res = await POST({ locals: { user: signedIn ? { id: id(4) } : null, supabase: { rpc } },
    request: new Request('http://localhost/api/items/moonberry/share', { method: 'POST', headers: { 'x-memvoya-owner-id': id(4) }, body: JSON.stringify(body) }) } as any);
  return { rpc, status: res.status, body: await res.json(), headers: res.headers };
};
describe('Moonberry use request and authenticated API', () => {
  it('passes only exact item, recipient and request UUID to authenticated RPC', async () => {
    const res = await run();
    expect(res.status).toBe(200); expect(res.body).toEqual(result);
    expect(res.rpc).toHaveBeenCalledTimes(1);
    expect(res.rpc).toHaveBeenCalledWith('share_moonberry', {
      p_user_item_id: id(1), p_companion_id: id(2), p_request_id: id(3)
    });
    expect(res.headers.get('cache-control')).toBe('no-store');
  });
  it('rejects signed-out users before an RPC', async () => {
    const res = await run(payload, undefined, false);
    expect(res.status).toBe(401); expect(res.rpc).not.toHaveBeenCalled();
  });
  it.each([null, 'bad', id(99)])('preserves uncertainty on a stale or missing account guard (%s)', async (expectedOwner) => {
    const rpc = vi.fn();
    const res = await POST({ locals: { user: { id: id(4) }, supabase: { rpc } },
      request: new Request('http://localhost/api/items/moonberry/share', { method: 'POST',
        headers: expectedOwner ? { 'x-memvoya-owner-id': expectedOwner } : {}, body: JSON.stringify(payload) }) } as any);
    expect(res.status).toBe(401); expect(await res.json()).toEqual({ error: 'account_changed' });
    expect(rpc).not.toHaveBeenCalled();
  });
  it('canonicalizes valid uppercase UUID inputs before receipt comparison and retry', async () => {
    const canonical = { userItemId: 'abcdefab-0000-4000-8000-000000000001',
      companionId: 'abcdefab-0000-4000-8000-000000000002', requestId: 'abcdefab-0000-4000-8000-000000000003' };
    const upper = { action: 'share_moonberry', ...Object.fromEntries(Object.entries(canonical).map(([key, value]) => [key, value.toUpperCase()])) };
    for (const replayed of [false, true]) {
      const res = await run(upper, { data: { ...result, ...canonical, replayed }, error: null });
      expect(res.status).toBe(200); expect(res.body).toMatchObject({ ...canonical, replayed });
      expect(res.rpc).toHaveBeenCalledWith('share_moonberry', { p_user_item_id: canonical.userItemId,
        p_companion_id: canonical.companionId, p_request_id: canonical.requestId });
    }
  });
  it.each([null, [], {}, { ...payload, quantity: 2 }, { ...payload, ownerId: id(4) },
    { ...payload, requestId: 'bad' }, { ...payload, userItemId: 'catalog-key' }, { ...payload, action: 'feed' }])('rejects malformed or expanded request %j', async (body) => {
    expect(isMoonberryUseRequest(body)).toBe(false);
    const res = await run(body); expect(res.status).toBe(400); expect(res.rpc).not.toHaveBeenCalled();
  });
  it('returns terminal empty rather than a successful snack', async () => {
    const res = await run(payload, { data: { ...result, ok: false, status: 'empty' }, error: null });
    expect(res.status).toBe(409); expect(res.body.status).toBe('empty');
  });
  it.each(['request_target_mismatch', 'item_required', 'companion_required', 'item_not_supported'])('preserves %s without exposing database details', async (error) => {
    const res = await run(payload, { data: { error, private: 'secret' } });
    expect(res.status).toBe(409); expect(res.body).toEqual({ error });
  });
  it.each([null, {}, { ...result, userItemId: id(99) }, { ...result, companionId: id(99) },
    { ...result, requestId: id(99) }, { ...result, quantityAfter: -1 }, { ...result, quantityAfter: 1.5 },
    { ...result, replayed: null }, { ...result, ok: false }, { ...result, status: 'unknown' }])('treats an invalid RPC response as uncertain %j', async (data) => {
    const res = await run(payload, { data, error: null });
    expect(res.status).toBe(500); expect(res.body).toEqual({ error: 'share_unconfirmed' });
  });
  it('does not return replayed reactions or unrequested receipt metadata', async () => {
    const res = await run(payload, { data: { ...result, replayed: true, reaction: 'Old reaction', memory: { id: id(9), body: 'hidden' } } });
    expect(res.body).toEqual({ ...result, replayed: true });
  });
  it('allows only the bounded fresh response', async () => {
    const res = await run(payload, { data: { ...result, reaction: 'Lumi receives it gently.' } });
    expect(res.body.reaction).toBe('Lumi receives it gently.');
  });
  it('returns uncertainty for RPC errors and throws', async () => {
    expect((await run(payload, { error: { message: 'private failure' } })).body).toEqual({ error: 'share_unconfirmed' });
    const res = await POST({ locals: { user: { id: id(4) }, supabase: { rpc: vi.fn().mockRejectedValue(new Error('transport')) } },
      request: new Request('http://localhost/', { method: 'POST', headers: { 'x-memvoya-owner-id': id(4) }, body: JSON.stringify(payload) }) } as any);
    expect(res.status).toBe(500);
  });
});
describe('Moonberry available action', () => {
  const owned = { quantity: 1, source_type: 'world', source_key: 'moonberry-bush',
    item: { item_key: 'world-moonberry', kind: 'consumable', capabilities: ['consumable', 'giftable'] } };
  it('offers only positive eligible stock and exact source/capability', () => {
    expect(canShareMoonberry(owned)).toBe(true);
    for (const changes of [{ quantity: 0 }, { quantity: -1 }, { quantity: 1.5 }, { source_type: 'other' }, { source_key: 'other' },
      { item: null }, { item: { ...owned.item, item_key: 'other' } }, { item: { ...owned.item, capabilities: ['consumable'] } },
      { item: { ...owned.item, capabilities: ['consumable', 'giftable', 'placeable'] } }]) {
      expect(canShareMoonberry({ ...owned, ...changes })).toBe(false);
    }
  });
});
