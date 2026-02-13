import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { createSupabaseServerClient } from '$lib/server/supabase';
import { CIRCLES_CACHE_HEADERS, isUuid } from '$lib/server/circles';

type KickPayload = {
  circleId?: string;
  userId?: string;
};

export const POST: RequestHandler = async (event) => {
  const { supabase, session } = await createSupabaseServerClient(event);
  if (!session) {
    return json({ error: 'unauthorized' }, { status: 401, headers: CIRCLES_CACHE_HEADERS });
  }

  let body: KickPayload;
  try {
    body = await event.request.json();
  } catch {
    return json({ error: 'bad_request' }, { status: 400, headers: CIRCLES_CACHE_HEADERS });
  }

  const circleId = typeof body.circleId === 'string' ? body.circleId : null;
  const userId = typeof body.userId === 'string' ? body.userId : null;

  if (!isUuid(circleId) || !isUuid(userId)) {
    return json({ error: 'bad_request' }, { status: 400, headers: CIRCLES_CACHE_HEADERS });
  }

  const { error } = await supabase.rpc('rpc_kick_circle_member', {
    p_circle_id: circleId,
    p_target_user_id: userId
  });

  if (error) {
    const status = error.message.includes('forbidden') ? 403 : 400;
    return json({ error: status === 403 ? 'forbidden' : 'bad_request', message: 'Could not remove member.' }, { status, headers: CIRCLES_CACHE_HEADERS });
  }

  return json({ ok: true }, { headers: CIRCLES_CACHE_HEADERS });
};
