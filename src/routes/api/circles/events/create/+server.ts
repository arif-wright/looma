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
import { enforceEventCreateRateLimit } from '$lib/server/circle-events/rate';
import { getClientIp } from '$lib/server/utils/ip';
import { enforceSocialActionAllowed } from '$lib/server/moderation';
import { enforceTrustActionAllowed } from '$lib/server/trust';

const toBoolean = (value: unknown) => value === true;

type CreatePayload = {
  circleId?: string;
  title?: string;
  description?: string;
  startsAt?: string;
  endsAt?: string;
  location?: string;
  isRecurring?: boolean;
  rrule?: string;
};

export const POST: RequestHandler = async (event) => {
  const { supabase, session } = await createSupabaseServerClient(event);
  if (!session) {
    return json({ error: 'unauthorized' }, { status: 401, headers: EVENTS_CACHE_HEADERS });
  }

  const moderationCheck = await enforceSocialActionAllowed(supabase, session.user.id, 'circle_create');
  if (!moderationCheck.ok) {
    return json(
      {
        error: moderationCheck.code,
        message: moderationCheck.message,
        moderationStatus: moderationCheck.moderationStatus
      },
      { status: moderationCheck.status, headers: EVENTS_CACHE_HEADERS }
    );
  }

  const trustCheck = await enforceTrustActionAllowed(supabase, session.user.id, {
    scope: 'event_create'
  });
  if (!trustCheck.ok) {
    return json(
      {
        error: trustCheck.code,
        message: trustCheck.message,
        retryAfter: trustCheck.retryAfter,
        trustTier: trustCheck.trust.tier
      },
      { status: trustCheck.status, headers: EVENTS_CACHE_HEADERS }
    );
  }

  const rate = enforceEventCreateRateLimit(
    session.user.id,
    getClientIp(event),
    trustCheck.trust.tier
  );
  if (!rate.ok) {
    return json(
      { error: rate.code, message: rate.message, retryAfter: rate.retryAfter },
      { status: rate.status, headers: EVENTS_CACHE_HEADERS }
    );
  }

  let body: CreatePayload;
  try {
    body = await event.request.json();
  } catch {
    return json({ error: 'bad_request' }, { status: 400, headers: EVENTS_CACHE_HEADERS });
  }

  const circleId = typeof body.circleId === 'string' ? body.circleId : null;
  const title = cleanText(body.title, 120);
  const description = cleanOptionalText(body.description, 4000);
  const location = cleanOptionalText(body.location, 180);
  const startsAt = parseIso(body.startsAt);
  const endsAt = body.endsAt ? parseIso(body.endsAt) : null;
  const isRecurring = toBoolean(body.isRecurring);
  const rrule = isRecurring ? cleanOptionalText(body.rrule, 500) : null;

  if (!isUuid(circleId) || !title || !startsAt) {
    return json({ error: 'bad_request', message: 'Invalid event payload.' }, { status: 400, headers: EVENTS_CACHE_HEADERS });
  }

  if (endsAt && Date.parse(endsAt) < Date.parse(startsAt)) {
    return json({ error: 'bad_request', message: 'End time must be after start time.' }, { status: 400, headers: EVENTS_CACHE_HEADERS });
  }

  const isAdmin = await hasCircleAdminRole(supabase, circleId, session.user.id);
  if (!isAdmin) {
    return json({ error: 'forbidden' }, { status: 403, headers: EVENTS_CACHE_HEADERS });
  }

  const { data: inserted, error: insertError } = await supabase
    .from('circle_events')
    .insert({
      circle_id: circleId,
      creator_id: session.user.id,
      title,
      description,
      starts_at: startsAt,
      ends_at: endsAt,
      location,
      is_recurring: isRecurring,
      rrule
    })
    .select('id')
    .maybeSingle<{ id: string }>();

  if (insertError || !inserted?.id) {
    return json({ error: insertError?.message ?? 'bad_request' }, { status: 400, headers: EVENTS_CACHE_HEADERS });
  }

  const { data: circleRow } = await supabase
    .from('circles')
    .select('name, conversation_id')
    .eq('id', circleId)
    .maybeSingle<{ name: string; conversation_id: string | null }>();

  if (circleRow?.conversation_id) {
    const timeLabel = new Date(startsAt).toLocaleString('en-US', {
      dateStyle: 'medium',
      timeStyle: 'short'
    });
    const snippet = `[Event] ${title} · ${timeLabel}`;
    await supabase.from('messages').insert({
      conversation_id: circleRow.conversation_id,
      sender_id: session.user.id,
      body: snippet
    });

    await supabase
      .from('conversations')
      .update({
        last_message_at: new Date().toISOString(),
        last_message_preview: snippet.slice(0, 140)
      })
      .eq('id', circleRow.conversation_id);
  }

  return json({ ok: true, eventId: inserted.id }, { headers: EVENTS_CACHE_HEADERS });
};
