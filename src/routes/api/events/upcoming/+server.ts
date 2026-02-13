import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { createSupabaseServerClient } from '$lib/server/supabase';
import { EVENTS_CACHE_HEADERS, isUuid, parseWindowDays } from '$lib/server/circle-events';

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

type CircleRow = {
  id: string;
  name: string;
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

  const days = parseWindowDays(event.url.searchParams.get('days') ?? undefined, 14);
  const circleIdFilter = event.url.searchParams.get('circleId');
  const fromIso = new Date().toISOString();
  const toIso = new Date(Date.now() + days * 24 * 60 * 60 * 1000).toISOString();

  const { data: memberships, error: membershipError } = await supabase
    .from('circle_members')
    .select('circle_id')
    .eq('user_id', session.user.id);

  if (membershipError) {
    return json({ error: membershipError.message }, { status: 400, headers: EVENTS_CACHE_HEADERS });
  }

  const circleIds = (memberships ?? [])
    .map((row) => (typeof row?.circle_id === 'string' ? row.circle_id : null))
    .filter((id): id is string => Boolean(id));

  const scopedCircleIds =
    isUuid(circleIdFilter) && circleIds.includes(circleIdFilter)
      ? [circleIdFilter]
      : circleIds;

  if (!scopedCircleIds.length) {
    return json({ items: [], windowDays: days }, { headers: EVENTS_CACHE_HEADERS });
  }

  const [eventsResult, circlesResult] = await Promise.all([
    supabase
      .from('circle_events')
      .select('id, circle_id, creator_id, title, description, starts_at, ends_at, location, is_recurring, rrule, created_at, updated_at')
      .in('circle_id', scopedCircleIds)
      .gte('starts_at', fromIso)
      .lte('starts_at', toIso)
      .order('starts_at', { ascending: true })
      .limit(200),
    supabase.from('circles').select('id, name').in('id', scopedCircleIds)
  ]);

  if (eventsResult.error || circlesResult.error) {
    return json(
      { error: eventsResult.error?.message ?? circlesResult.error?.message ?? 'bad_request' },
      { status: 400, headers: EVENTS_CACHE_HEADERS }
    );
  }

  const events = (eventsResult.data ?? []) as CircleEventRow[];
  if (!events.length) {
    return json({ items: [], windowDays: days }, { headers: EVENTS_CACHE_HEADERS });
  }

  const eventIds = events.map((row) => row.id);
  const { data: rsvps, error: rsvpError } = await supabase
    .from('event_rsvps')
    .select('event_id, status')
    .eq('user_id', session.user.id)
    .in('event_id', eventIds);

  if (rsvpError) {
    return json({ error: rsvpError.message }, { status: 400, headers: EVENTS_CACHE_HEADERS });
  }

  const circleNameById = new Map((circlesResult.data ?? []).map((row) => [row.id as string, (row as CircleRow).name]));
  const rsvpByEvent = new Map((rsvps ?? []).map((row) => [row.event_id as string, (row as RsvpRow).status]));

  const items = events.map((row) => ({
    eventId: row.id,
    circleId: row.circle_id,
    circleName: circleNameById.get(row.circle_id) ?? 'Circle',
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
    myRsvp: rsvpByEvent.get(row.id) ?? null
  }));

  return json({ items, windowDays: days }, { headers: EVENTS_CACHE_HEADERS });
};
