import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { createSupabaseServerClient } from '$lib/server/supabase';

const parseReason = (value: unknown) => {
  const text = typeof value === 'string' ? value.trim() : '';
  return text.length ? text.slice(0, 64) : 'manual';
};

export const GET: RequestHandler = async (event) => {
  const { supabase, session } = await createSupabaseServerClient(event);
  if (!session) {
    return json({ error: 'unauthorized' }, { status: 401 });
  }

  const { data, error } = await supabase
    .from('player_companion_slots')
    .select('max_slots')
    .eq('user_id', session.user.id)
    .maybeSingle();

  if (error) {
    return json({ error: error.message ?? 'slots_fetch_failed' }, { status: 400 });
  }

  return json({ maxSlots: data?.max_slots ?? 3 });
};

export const POST: RequestHandler = async (event) => {
  const { supabase, session } = await createSupabaseServerClient(event);
  if (!session) {
    return json({ error: 'unauthorized' }, { status: 401 });
  }

  const body = await event.request.json().catch(() => ({}));
  const reason = parseReason((body as Record<string, unknown>)?.reason);

  const { data, error } = await supabase.rpc('unlock_companion_slot', { p_reason: reason });

  if (error) {
    return json({ error: error.message ?? 'unlock_failed' }, { status: 400 });
  }

  const latest = Array.isArray(data) ? data[0]?.max_slots : (data as { max_slots?: number } | null)?.max_slots;
  const maxSlots = typeof latest === 'number' ? latest : 3;

  return json({ ok: true, maxSlots });
};
