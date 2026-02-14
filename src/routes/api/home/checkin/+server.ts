import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { createSupabaseServerClient } from '$lib/server/supabase';

const CACHE_HEADERS = { 'cache-control': 'no-store' } as const;
const MOODS = new Set(['calm', 'heavy', 'curious', 'energized', 'numb']);

const normalizeDate = (input: unknown) => {
  if (typeof input !== 'string') return null;
  const value = input.trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const ts = Date.parse(`${value}T00:00:00.000Z`);
  return Number.isFinite(ts) ? value : null;
};

export const GET: RequestHandler = async (event) => {
  const { supabase, session } = await createSupabaseServerClient(event);
  if (!session) {
    return json({ error: 'unauthorized' }, { status: 401, headers: CACHE_HEADERS });
  }

  const dateParam = normalizeDate(event.url.searchParams.get('date'));

  const [{ data: latest, error: latestError }, { data: today, error: todayError }] = await Promise.all([
    supabase
      .from('user_daily_checkins')
      .select('id, mood, checkin_date, created_at')
      .eq('user_id', session.user.id)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle(),
    supabase
      .from('user_daily_checkins')
      .select('id, mood, checkin_date, created_at')
      .eq('user_id', session.user.id)
      .eq('checkin_date', dateParam ?? new Date().toISOString().slice(0, 10))
      .limit(1)
      .maybeSingle()
  ]);

  if (latestError || todayError) {
    return json({ error: 'server_error' }, { status: 500, headers: CACHE_HEADERS });
  }

  return json({ latest: latest ?? null, today: today ?? null }, { headers: CACHE_HEADERS });
};

export const POST: RequestHandler = async (event) => {
  const { supabase, session } = await createSupabaseServerClient(event);
  if (!session) {
    return json({ error: 'unauthorized' }, { status: 401, headers: CACHE_HEADERS });
  }

  let payload: { mood?: unknown; date?: unknown };
  try {
    payload = (await event.request.json()) as { mood?: unknown; date?: unknown };
  } catch {
    return json({ error: 'bad_request', message: 'Invalid JSON body.' }, { status: 400, headers: CACHE_HEADERS });
  }

  const mood = typeof payload.mood === 'string' ? payload.mood.trim().toLowerCase() : '';
  if (!MOODS.has(mood)) {
    return json({ error: 'bad_request', message: 'Unsupported mood.' }, { status: 400, headers: CACHE_HEADERS });
  }

  const checkinDate = normalizeDate(payload.date) ?? new Date().toISOString().slice(0, 10);

  const { data: inserted, error: insertError } = await supabase
    .from('user_daily_checkins')
    .upsert(
      {
        user_id: session.user.id,
        mood,
        checkin_date: checkinDate
      },
      { onConflict: 'user_id,checkin_date', ignoreDuplicates: false }
    )
    .select('id, mood, checkin_date, created_at')
    .single();

  if (insertError) {
    return json({ error: 'server_error', message: insertError.message }, { status: 500, headers: CACHE_HEADERS });
  }

  return json({ ok: true, checkin: inserted }, { headers: CACHE_HEADERS });
};
