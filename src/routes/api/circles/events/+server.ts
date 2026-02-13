import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { createSupabaseServerClient } from '$lib/server/supabase';
import { EVENTS_CACHE_HEADERS, hasCircleMembership, isUuid } from '$lib/server/circle-events';

type CircleEventRow = {
  id: string;
  circle_id: string;
  creator_id: string;
  title: string;
  description: string | null;
  starts_at: string;
  ends_at: string | null;
  location: string | null;
  is_recurring: boolean;
  rrule: string | null;
  created_at: string;
  updated_at: string;
};

type RsvpRow = {
  event_id: string;
  status: 'going' | 'interested' | 'not_going';
};

export const GET: RequestHandler = async (event) => {
  const { supabase, session } = await createSupabaseServerClient(event);
  if (!session) {
    return json({ error: 'unauthorized' }, { status: 401, headers: EVENTS_CACHE_HEADERS });
  }

  const circleId = event.url.searchParams.get('circleId');
  if (!isUuid(circleId)) {
    return json({ error: 'bad_request', message: 'circleId is required.' }, { status: 400, headers: EVENTS_CACHE_HEADERS });
  }

  const isMember = await hasCircleMembership(supabase, circleId, session.user.id);
  if (!isMember) {
    return json({ error: 'forbidden' }, { status: 403, headers: EVENTS_CACHE_HEADERS });
  }

  const pastDays = 7;
  const futureDays = 90;
  const fromIso = new Date(Date.now() - pastDays * 24 * 60 * 60 * 1000).toISOString();
  const toIso = new Date(Date.now() + futureDays * 24 * 60 * 60 * 1000).toISOString();

  const { data: events, error: eventError } = await supabase
    .from('circle_events')
    .select('id, circle_id, creator_id, title, description, starts_at, ends_at, location, is_recurring, rrule, created_at, updated_at')
    .eq('circle_id', circleId)
    .gte('starts_at', fromIso)
    .lte('starts_at', toIso)
    .order('starts_at', { ascending: true })
    .limit(300);

  if (eventError) {
    return json({ error: eventError.message }, { status: 400, headers: EVENTS_CACHE_HEADERS });
  }

  const rows = (events ?? []) as CircleEventRow[];
  const eventIds = rows.map((row) => row.id);

  const [myRsvpResult, allRsvpResult] = await Promise.all([
    eventIds.length
      ? supabase
          .from('event_rsvps')
          .select('event_id, status')
          .eq('user_id', session.user.id)
          .in('event_id', eventIds)
      : Promise.resolve({ data: [], error: null }),
    eventIds.length
      ? supabase
          .from('event_rsvps')
          .select('event_id, status')
          .in('event_id', eventIds)
      : Promise.resolve({ data: [], error: null })
  ]);

  if (myRsvpResult.error || allRsvpResult.error) {
    return json(
      { error: myRsvpResult.error?.message ?? allRsvpResult.error?.message ?? 'bad_request' },
      { status: 400, headers: EVENTS_CACHE_HEADERS }
    );
  }

  const myRsvpByEvent = new Map(
    ((myRsvpResult.data ?? []) as RsvpRow[]).map((row) => [row.event_id, row.status])
  );

  const countsByEvent = new Map<string, { going: number; interested: number; notGoing: number }>();
  for (const row of (allRsvpResult.data ?? []) as RsvpRow[]) {
    const current = countsByEvent.get(row.event_id) ?? { going: 0, interested: 0, notGoing: 0 };
    if (row.status === 'going') current.going += 1;
    if (row.status === 'interested') current.interested += 1;
    if (row.status === 'not_going') current.notGoing += 1;
    countsByEvent.set(row.event_id, current);
  }

  const now = Date.now();
  const items = rows.map((row) => {
    const startsMs = Date.parse(row.starts_at);
    return {
      eventId: row.id,
      circleId: row.circle_id,
      creatorId: row.creator_id,
      title: row.title,
      description: row.description,
      startsAt: row.starts_at,
      endsAt: row.ends_at,
      location: row.location,
      isRecurring: row.is_recurring,
      rrule: row.rrule,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      phase: Number.isFinite(startsMs) && startsMs < now ? 'past' : 'upcoming',
      myRsvp: myRsvpByEvent.get(row.id) ?? null,
      counts: countsByEvent.get(row.id) ?? { going: 0, interested: 0, notGoing: 0 }
    };
  });

  return json({ items }, { headers: EVENTS_CACHE_HEADERS });
};
