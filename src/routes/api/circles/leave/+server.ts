import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { createSupabaseServerClient } from '$lib/server/supabase';
import { CIRCLES_CACHE_HEADERS, isUuid } from '$lib/server/circles';

type LeavePayload = { circleId?: string };

export const POST: RequestHandler = async (event) => {
  const { supabase, session } = await createSupabaseServerClient(event);
  if (!session) {
    return json({ error: 'unauthorized' }, { status: 401, headers: CIRCLES_CACHE_HEADERS });
  }

  let body: LeavePayload;
  try {
    body = await event.request.json();
  } catch {
    return json({ error: 'bad_request' }, { status: 400, headers: CIRCLES_CACHE_HEADERS });
  }

  const circleId = typeof body.circleId === 'string' ? body.circleId : null;
  if (!isUuid(circleId)) {
    return json({ error: 'bad_request' }, { status: 400, headers: CIRCLES_CACHE_HEADERS });
  }

  const { error } = await supabase.rpc('rpc_leave_circle', {
    p_circle_id: circleId
  });

  if (error) {
    if (error.message.includes('owner_cannot_leave')) {
      return json(
        { error: 'owner_cannot_leave', message: 'Owner must transfer ownership before leaving.' },
        { status: 400, headers: CIRCLES_CACHE_HEADERS }
      );
    }
    const status = error.message.includes('not_member') ? 403 : 400;
    return json(
      { error: status === 403 ? 'forbidden' : 'bad_request', message: 'Could not leave circle.' },
      { status, headers: CIRCLES_CACHE_HEADERS }
    );
  }

  return json({ ok: true }, { headers: CIRCLES_CACHE_HEADERS });
};
