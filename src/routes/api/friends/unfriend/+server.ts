import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { createSupabaseServerClient } from '$lib/server/supabase';
import { FRIENDS_CACHE_HEADERS, isUuid } from '$lib/server/friends';
import { enforceFriendDecisionRateLimit } from '$lib/server/friends/rate';
import { getClientIp } from '$lib/server/utils/ip';

type UnfriendPayload = { friendId?: string };

export const POST: RequestHandler = async (event) => {
  const { supabase, session } = await createSupabaseServerClient(event);
  if (!session) {
    return json({ error: 'unauthorized' }, { status: 401, headers: FRIENDS_CACHE_HEADERS });
  }

  const rate = enforceFriendDecisionRateLimit(session.user.id, getClientIp(event));
  if (!rate.ok) {
    return json(
      { error: rate.code, message: rate.message, retryAfter: rate.retryAfter },
      { status: rate.status, headers: FRIENDS_CACHE_HEADERS }
    );
  }

  let body: UnfriendPayload;
  try {
    body = await event.request.json();
  } catch {
    return json({ error: 'bad_request', message: 'Invalid request body.' }, { status: 400, headers: FRIENDS_CACHE_HEADERS });
  }

  const friendId = typeof body.friendId === 'string' ? body.friendId : null;
  if (!isUuid(friendId) || friendId === session.user.id) {
    return json({ error: 'bad_request', message: 'Invalid friend id.' }, { status: 400, headers: FRIENDS_CACHE_HEADERS });
  }

  const { error } = await supabase.rpc('rpc_unfriend', {
    p_friend_id: friendId
  });

  if (error) {
    const status = error.message.includes('invalid_friend') ? 400 : 400;
    return json(
      { error: 'bad_request', message: 'Unable to remove friend.' },
      { status, headers: FRIENDS_CACHE_HEADERS }
    );
  }

  return json({ ok: true }, { headers: FRIENDS_CACHE_HEADERS });
};
