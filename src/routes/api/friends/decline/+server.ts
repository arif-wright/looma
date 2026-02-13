import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { createSupabaseServerClient } from '$lib/server/supabase';
import { FRIENDS_CACHE_HEADERS, isUuid } from '$lib/server/friends';
import { enforceFriendDecisionRateLimit } from '$lib/server/friends/rate';
import { getClientIp } from '$lib/server/utils/ip';

type DeclinePayload = { requestId?: string };

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

  let body: DeclinePayload;
  try {
    body = await event.request.json();
  } catch {
    return json({ error: 'bad_request', message: 'Invalid request body.' }, { status: 400, headers: FRIENDS_CACHE_HEADERS });
  }

  const requestId = typeof body.requestId === 'string' ? body.requestId : null;
  if (!isUuid(requestId)) {
    return json({ error: 'bad_request', message: 'Invalid request id.' }, { status: 400, headers: FRIENDS_CACHE_HEADERS });
  }

  const { error } = await supabase.rpc('rpc_decline_friend_request', {
    request_id: requestId
  });

  if (error) {
    const status = error.message.includes('request_not_found') ? 404 : 400;
    return json(
      { error: status === 404 ? 'request_not_found' : 'bad_request', message: status === 404 ? 'Friend request not found.' : 'Unable to decline request.' },
      { status, headers: FRIENDS_CACHE_HEADERS }
    );
  }

  return json({ ok: true }, { headers: FRIENDS_CACHE_HEADERS });
};
