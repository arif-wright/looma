import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { createSupabaseServerClient } from '$lib/server/supabase';
import {
  EVENTS_CACHE_HEADERS,
  cleanOptionalText,
  cleanText,
  hasCircleAdminRole,
  isUuid,
  parseIso
} from '$lib/server/circle-events';
import { enforceEventJoinActionRateLimit } from '$lib/server/circle-events/rate';
import { getClientIp } from '$lib/server/utils/ip';

type UpdatePayload = {
  eventId?: string;
  title?: string;
  description?: string;
  startsAt?: string;
  endsAt?: string | null;
  location?: string;
  isRecurring?: boolean;
  rrule?: string;
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

  let body: UpdatePayload;
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
    .select('id, circle_id, starts_at, ends_at')
    .eq('id', eventId)
    .maybeSingle<{ id: string; circle_id: string; starts_at: string; ends_at: string | null }>();

  if (!eventRow) {
    return json({ error: 'not_found' }, { status: 404, headers: EVENTS_CACHE_HEADERS });
  }

  const isAdmin = await hasCircleAdminRole(supabase, eventRow.circle_id, session.user.id);
  if (!isAdmin) {
    return json({ error: 'forbidden' }, { status: 403, headers: EVENTS_CACHE_HEADERS });
  }

  const updatePayload: Record<string, unknown> = {};

  if (body.title !== undefined) {
    const title = cleanText(body.title, 120);
    if (!title) return json({ error: 'bad_request', message: 'title must be non-empty.' }, { status: 400, headers: EVENTS_CACHE_HEADERS });
    updatePayload.title = title;
  }

  if (body.description !== undefined) {
    updatePayload.description = cleanOptionalText(body.description, 4000);
  }

  if (body.startsAt !== undefined) {
    const startsAt = parseIso(body.startsAt);
    if (!startsAt) return json({ error: 'bad_request', message: 'Invalid startsAt.' }, { status: 400, headers: EVENTS_CACHE_HEADERS });
    updatePayload.starts_at = startsAt;
  }

  if (body.endsAt !== undefined) {
    if (body.endsAt === null || body.endsAt === '') {
      updatePayload.ends_at = null;
    } else {
      const endsAt = parseIso(body.endsAt);
      if (!endsAt) return json({ error: 'bad_request', message: 'Invalid endsAt.' }, { status: 400, headers: EVENTS_CACHE_HEADERS });
      updatePayload.ends_at = endsAt;
    }
  }

  if (body.location !== undefined) {
    updatePayload.location = cleanOptionalText(body.location, 180);
  }

  if (body.isRecurring !== undefined) {
    updatePayload.is_recurring = body.isRecurring === true;
  }

  if (body.rrule !== undefined) {
    updatePayload.rrule = cleanOptionalText(body.rrule, 500);
  }

  const nextStartsAt = String(updatePayload.starts_at ?? eventRow.starts_at);
  const nextEndsAt = (updatePayload.ends_at ?? eventRow.ends_at) as string | null;
  if (nextEndsAt && Date.parse(nextEndsAt) < Date.parse(nextStartsAt)) {
    return json({ error: 'bad_request', message: 'End time must be after start time.' }, { status: 400, headers: EVENTS_CACHE_HEADERS });
  }

  const { error: updateError } = await supabase.from('circle_events').update(updatePayload).eq('id', eventId);
  if (updateError) {
    return json({ error: updateError.message }, { status: 400, headers: EVENTS_CACHE_HEADERS });
  }

  return json({ ok: true, eventId }, { headers: EVENTS_CACHE_HEADERS });
};
