import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { createSupabaseServerClient } from '$lib/server/supabase';
import { EVENTS_CACHE_HEADERS, hasCircleAdminRole, isUuid } from '$lib/server/circle-events';
import { enforceEventJoinActionRateLimit } from '$lib/server/circle-events/rate';
import { getClientIp } from '$lib/server/utils/ip';

type DeletePayload = {
  eventId?: string;
};

export const POST: RequestHandler = async (event) => {
  const { supabase, session } = await createSupabaseServerClient(event);
  if (!session) {
    return json({ error: 'unauthorized' }, { status: 401, headers: EVENTS_CACHE_HEADERS });
  }

  const rate = enforceEventJoinActionRateLimit(session.user.id, getClientIp(event));
  if (!rate.ok) {
    return json(
      { error: rate.code, message: rate.message, retryAfter: rate.retryAfter },
      { status: rate.status, headers: EVENTS_CACHE_HEADERS }
    );
  }

  let body: DeletePayload;
  try {
    body = await event.request.json();
  } catch {
    return json({ error: 'bad_request' }, { status: 400, headers: EVENTS_CACHE_HEADERS });
  }

  const eventId = typeof body.eventId === 'string' ? body.eventId : null;
  if (!isUuid(eventId)) {
    return json({ error: 'bad_request', message: 'eventId is required.' }, { status: 400, headers: EVENTS_CACHE_HEADERS });
  }

  const { data: eventRow } = await supabase
    .from('circle_events')
    .select('id, circle_id')
    .eq('id', eventId)
    .maybeSingle<{ id: string; circle_id: string }>();

  if (!eventRow) {
    return json({ error: 'not_found' }, { status: 404, headers: EVENTS_CACHE_HEADERS });
  }

  const isAdmin = await hasCircleAdminRole(supabase, eventRow.circle_id, session.user.id);
  if (!isAdmin) {
    return json({ error: 'forbidden' }, { status: 403, headers: EVENTS_CACHE_HEADERS });
  }

  const { error: deleteError } = await supabase.from('circle_events').delete().eq('id', eventId);
  if (deleteError) {
    return json({ error: deleteError.message }, { status: 400, headers: EVENTS_CACHE_HEADERS });
  }

  return json({ ok: true, eventId }, { headers: EVENTS_CACHE_HEADERS });
};
