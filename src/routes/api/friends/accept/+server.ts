import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { createSupabaseServerClient } from '$lib/server/supabase';
import { FRIENDS_CACHE_HEADERS, isUuid } from '$lib/server/friends';
import { enforceFriendDecisionRateLimit } from '$lib/server/friends/rate';
import { getClientIp } from '$lib/server/utils/ip';

type AcceptPayload = { requestId?: string };

const mapError = (message: string | undefined) => {
  if (!message) return { status: 400, code: 'bad_request', message: 'Unable to accept request.' };
  if (message.includes('request_not_found')) return { status: 404, code: 'request_not_found', message: 'Friend request not found.' };
  if (message.includes('forbidden')) return { status: 403, code: 'forbidden', message: 'You cannot accept this request.' };
  if (message.includes('blocked')) return { status: 403, code: 'blocked', message: 'Blocked users cannot become friends.' };
  return { status: 400, code: 'bad_request', message: 'Unable to accept request.' };
};

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

  let body: AcceptPayload;
  try {
    body = await event.request.json();
  } catch {
    return json({ error: 'bad_request', message: 'Invalid request body.' }, { status: 400, headers: FRIENDS_CACHE_HEADERS });
  }

  const requestId = typeof body.requestId === 'string' ? body.requestId : null;
  if (!isUuid(requestId)) {
    return json({ error: 'bad_request', message: 'Invalid request id.' }, { status: 400, headers: FRIENDS_CACHE_HEADERS });
  }

  const { data: friendId, error } = await supabase.rpc('rpc_accept_friend_request', {
    request_id: requestId
  });

  if (error) {
    const mapped = mapError(error.message);
    return json({ error: mapped.code, message: mapped.message }, { status: mapped.status, headers: FRIENDS_CACHE_HEADERS });
  }

  return json({ ok: true, friendId: typeof friendId === 'string' ? friendId : null }, { headers: FRIENDS_CACHE_HEADERS });
};
