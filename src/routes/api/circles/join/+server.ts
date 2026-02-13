import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { createSupabaseServerClient } from '$lib/server/supabase';
import { CIRCLES_CACHE_HEADERS, normalizeInviteCode } from '$lib/server/circles';
import { enforceCircleJoinRateLimit } from '$lib/server/circles/rate';
import { getClientIp } from '$lib/server/utils/ip';

type JoinPayload = { inviteCode?: string };

export const POST: RequestHandler = async (event) => {
  const { supabase, session } = await createSupabaseServerClient(event);
  if (!session) {
    return json({ error: 'unauthorized' }, { status: 401, headers: CIRCLES_CACHE_HEADERS });
  }

  const rate = enforceCircleJoinRateLimit(session.user.id, getClientIp(event));
  if (!rate.ok) {
    return json(
      { error: rate.code, message: rate.message, retryAfter: rate.retryAfter },
      { status: rate.status, headers: CIRCLES_CACHE_HEADERS }
    );
  }

  let body: JoinPayload;
  try {
    body = await event.request.json();
  } catch {
    return json({ error: 'bad_request' }, { status: 400, headers: CIRCLES_CACHE_HEADERS });
  }

  const inviteCode = normalizeInviteCode(body.inviteCode);
  if (!inviteCode) {
    return json({ error: 'invalid_code', message: 'Invite code is required.' }, { status: 400, headers: CIRCLES_CACHE_HEADERS });
  }

  const { data: circleId, error } = await supabase.rpc('rpc_join_circle_by_code', {
    p_invite_code: inviteCode
  });

  if (error || typeof circleId !== 'string') {
    const status = error?.message.includes('circle_not_found') ? 404 : 400;
    const code = status === 404 ? 'circle_not_found' : 'bad_request';
    const message = status === 404 ? 'Circle not found for that invite code.' : 'Could not join circle.';
    return json({ error: code, message }, { status, headers: CIRCLES_CACHE_HEADERS });
  }

  return json({ circleId }, { headers: CIRCLES_CACHE_HEADERS });
};
