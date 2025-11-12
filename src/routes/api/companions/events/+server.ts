import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { createSupabaseServerClient } from '$lib/server/supabase';

export const GET: RequestHandler = async (event) => {
  const { supabase, session } = await createSupabaseServerClient(event);
  if (!session) {
    return json({ error: 'unauthorized' }, { status: 401 });
  }

  const companionId = event.url.searchParams.get('id');
  const limitParam = event.url.searchParams.get('limit');
  const limit = limitParam ? Number(limitParam) : 20;

  if (!companionId) {
    return json({ error: 'bad_request' }, { status: 400 });
  }

  const { data, error } = await supabase.rpc('get_companion_events', {
    p_owner: session.user.id,
    p_companion: companionId,
    p_limit: Number.isFinite(limit) && limit > 0 ? Math.min(Math.trunc(limit), 50) : 20
  });

  if (error) {
    return json({ error: error.message ?? 'events_failed' }, { status: 400 });
  }

  return json({ ok: true, events: Array.isArray(data) ? data : [] });
};
