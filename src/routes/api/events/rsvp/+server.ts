import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { createSupabaseServerClient } from '$lib/server/supabase';
import { EVENTS_CACHE_HEADERS, isUuid, parseRsvpStatus } from '$lib/server/circle-events';
import { enforceEventJoinActionRateLimit } from '$lib/server/circle-events/rate';
import { getClientIp } from '$lib/server/utils/ip';

type RsvpPayload = {
  eventId?: string;
  status?: 'going' | 'interested' | 'not_going';
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

  let body: RsvpPayload;
  try {
    body = await event.request.json();
  } catch {
    return json({ error: 'bad_request' }, { status: 400, headers: EVENTS_CACHE_HEADERS });
  }

  const eventId = typeof body.eventId === 'string' ? body.eventId : null;
  const status = parseRsvpStatus(body.status);

  if (!isUuid(eventId) || !status) {
    return json({ error: 'bad_request', message: 'eventId and status are required.' }, { status: 400, headers: EVENTS_CACHE_HEADERS });
  }

  const { data: eventRow, error: eventError } = await supabase
    .from('circle_events')
    .select('id, circle_id')
    .eq('id', eventId)
    .maybeSingle<{ id: string; circle_id: string }>();

  if (eventError || !eventRow) {
    return json({ error: 'not_found' }, { status: 404, headers: EVENTS_CACHE_HEADERS });
  }

  const { data: membership } = await supabase
    .from('circle_members')
    .select('circle_id')
    .eq('circle_id', eventRow.circle_id)
    .eq('user_id', session.user.id)
    .maybeSingle();

  if (!membership) {
    return json({ error: 'forbidden' }, { status: 403, headers: EVENTS_CACHE_HEADERS });
  }

  const { error: upsertError } = await supabase.from('event_rsvps').upsert(
    {
      event_id: eventId,
      user_id: session.user.id,
      status
    },
    { onConflict: 'event_id,user_id', ignoreDuplicates: false }
  );

  if (upsertError) {
    return json({ error: upsertError.message }, { status: 400, headers: EVENTS_CACHE_HEADERS });
  }

  return json({ ok: true, eventId, status }, { headers: EVENTS_CACHE_HEADERS });
};
