import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { createSupabaseServerClient } from '$lib/server/supabase';
import { EVENTS_CACHE_HEADERS } from '$lib/server/circle-events';
import { enforceReminderPullRateLimit } from '$lib/server/circle-events/rate';
import { getClientIp } from '$lib/server/utils/ip';

type ReminderCandidateRow = {
  id: string;
  title: string;
  starts_at: string;
  circle_id: string;
};

type CircleRow = {
  id: string;
  name: string;
};

const parseWindowMinutes = (value: string | null, fallback = 60) => {
  const parsed = value ? Number.parseInt(value, 10) : Number.NaN;
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(5, Math.min(240, Math.floor(parsed)));
};

export const POST: RequestHandler = async (event) => {
  const { supabase, session } = await createSupabaseServerClient(event);
  if (!session) {
    return json({ error: 'unauthorized' }, { status: 401, headers: EVENTS_CACHE_HEADERS });
  }

  const rate = enforceReminderPullRateLimit(session.user.id, getClientIp(event));
  if (!rate.ok) {
    return json(
      { error: rate.code, message: rate.message, retryAfter: rate.retryAfter },
      { status: rate.status, headers: EVENTS_CACHE_HEADERS }
    );
  }

  const windowMinutes = parseWindowMinutes(event.url.searchParams.get('windowMinutes'));
  const now = Date.now();
  const fromIso = new Date(now).toISOString();
  const toIso = new Date(now + windowMinutes * 60_000).toISOString();

  const { data: rsvps, error: rsvpError } = await supabase
    .from('event_rsvps')
    .select('event_id')
    .eq('user_id', session.user.id)
    .eq('status', 'going');

  if (rsvpError) {
    return json({ error: rsvpError.message }, { status: 400, headers: EVENTS_CACHE_HEADERS });
  }

  const eventIds = (rsvps ?? [])
    .map((row) => (typeof row?.event_id === 'string' ? row.event_id : null))
    .filter((id): id is string => Boolean(id));

  if (!eventIds.length) {
    return json({ inserted: 0, windowMinutes }, { headers: EVENTS_CACHE_HEADERS });
  }

  const { data: candidates, error: candidateError } = await supabase
    .from('circle_events')
    .select('id, title, starts_at, circle_id')
    .in('id', eventIds)
    .gte('starts_at', fromIso)
    .lte('starts_at', toIso)
    .order('starts_at', { ascending: true });

  if (candidateError) {
    return json({ error: candidateError.message }, { status: 400, headers: EVENTS_CACHE_HEADERS });
  }

  const rows = (candidates ?? []) as ReminderCandidateRow[];
  if (!rows.length) {
    return json({ inserted: 0, windowMinutes }, { headers: EVENTS_CACHE_HEADERS });
  }

  const { data: existing, error: existingError } = await supabase
    .from('notifications')
    .select('target_id, metadata')
    .eq('user_id', session.user.id)
    .eq('kind', 'event_reminder')
    .eq('target_kind', 'event')
    .in('target_id', rows.map((row) => row.id));

  if (existingError) {
    return json({ error: existingError.message }, { status: 400, headers: EVENTS_CACHE_HEADERS });
  }

  const existingKeys = new Set<string>();
  for (const row of existing ?? []) {
    const eventId = typeof row?.target_id === 'string' ? row.target_id : null;
    const metadata = (row?.metadata ?? null) as Record<string, unknown> | null;
    const windowValue = typeof metadata?.windowMinutes === 'number' ? metadata.windowMinutes : null;
    if (eventId && windowValue !== null) {
      existingKeys.add(`${eventId}:${windowValue}`);
    }
  }

  const circleIds = Array.from(new Set(rows.map((row) => row.circle_id)));
  const { data: circles } = await supabase.from('circles').select('id, name').in('id', circleIds);
  const circleNameById = new Map((circles ?? []).map((row) => [row.id as string, (row as CircleRow).name]));

  const inserts = rows
    .filter((row) => !existingKeys.has(`${row.id}:${windowMinutes}`))
    .map((row) => {
      const circleName = circleNameById.get(row.circle_id) ?? 'Circle';
      const startLabel = new Date(row.starts_at).toLocaleString('en-US', {
        dateStyle: 'medium',
        timeStyle: 'short'
      });
      const title = `${row.title} starts soon`;
      const body = `${circleName} · ${startLabel}`;
      const payloadMeta = {
        eventId: row.id,
        circleId: row.circle_id,
        circleName,
        startsAt: row.starts_at,
        windowMinutes
      };

      return {
        user_id: session.user.id,
        actor_id: session.user.id,
        kind: 'event_reminder',
        target_id: row.id,
        target_kind: 'event',
        metadata: payloadMeta,
        read: false,
        type: 'event_reminder',
        title,
        body,
        meta: payloadMeta,
        read_at: null
      };
    });

  if (!inserts.length) {
    return json({ inserted: 0, windowMinutes }, { headers: EVENTS_CACHE_HEADERS });
  }

  const { error: insertError } = await supabase.from('notifications').insert(inserts);
  if (insertError) {
    return json({ error: insertError.message }, { status: 400, headers: EVENTS_CACHE_HEADERS });
  }

  return json({ inserted: inserts.length, windowMinutes }, { headers: EVENTS_CACHE_HEADERS });
};
