import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { isMoonberryUseRequest } from '$lib/items/moonberryUse';
import { isOwnedItemId } from '$lib/items/story';

const reply = (body: unknown, status = 200) => json(body, { status, headers: { 'cache-control': 'no-store' } });
const failures = new Set(['invalid_request', 'request_target_mismatch', 'companion_required', 'item_required', 'item_not_supported']);

export const POST: RequestHandler = async ({ locals, request }) => {
  const owner = locals.session?.user?.id ?? locals.user?.id;
  if (!owner || !locals.supabase) return reply({ error: 'unauthorized' }, 401);
  // This is a stale-page guard only. Authentication still supplies all RPC authority.
  const expectedOwner = request.headers.get('x-memvoya-owner-id');
  if (!isOwnedItemId(expectedOwner) || expectedOwner.toLowerCase() !== owner.toLowerCase()) {
    return reply({ error: 'account_changed' }, 401);
  }
  const input = await request.json().catch(() => null);
  if (!isMoonberryUseRequest(input)) return reply({ error: 'invalid_request' }, 400);
  // PostgreSQL UUID output is canonical lowercase, independent of accepted input casing.
  const payload = { ...input, userItemId: input.userItemId.toLowerCase(),
    companionId: input.companionId.toLowerCase(), requestId: input.requestId.toLowerCase() };
  try {
    // The authenticated RPC derives auth.uid(); no service client or caller owner ID.
    const { data, error } = await locals.supabase.rpc('share_moonberry', {
      p_user_item_id: payload.userItemId, p_companion_id: payload.companionId, p_request_id: payload.requestId
    });
    if (error) return reply({ error: 'share_unconfirmed' }, 500);
    if (failures.has(data?.error)) return reply({ error: data.error }, data.error === 'invalid_request' ? 400 : 409);
    if (!data || !['shared', 'empty'].includes(data.status) || data.ok !== (data.status === 'shared') ||
      data.requestId !== payload.requestId || data.userItemId !== payload.userItemId || data.companionId !== payload.companionId ||
      !Number.isInteger(data.quantityAfter) || data.quantityAfter < 0 || typeof data.replayed !== 'boolean') {
      return reply({ error: 'share_unconfirmed' }, 500);
    }
    return reply({ ok: data.ok, status: data.status, requestId: data.requestId, userItemId: data.userItemId,
      companionId: data.companionId, quantityAfter: data.quantityAfter, replayed: data.replayed,
      ...(data.ok && !data.replayed && typeof data.reaction === 'string' && data.reaction.length <= 300
        ? { reaction: data.reaction } : {}) }, data.ok ? 200 : 409);
  } catch {
    // A transport failure does not establish whether the transaction committed.
    return reply({ error: 'share_unconfirmed' }, 500);
  }
};
