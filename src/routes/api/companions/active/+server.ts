import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { createSupabaseServerClient } from '$lib/server/supabase';

type ActivePayload = {
  companionId?: string;
};

export const POST: RequestHandler = async (event) => {
  const { supabase, session } = await createSupabaseServerClient(event);
  if (!session) {
    return json({ error: 'unauthorized' }, { status: 401 });
  }

  let payload: ActivePayload;
  try {
    payload = (await event.request.json()) as ActivePayload;
  } catch {
    return json({ error: 'bad_request' }, { status: 400 });
  }

  const companionId = typeof payload.companionId === 'string' ? payload.companionId : null;
  if (!companionId) {
    return json({ error: 'bad_request' }, { status: 400 });
  }

  const { data, error } = await supabase.rpc('set_active_companion', { p_companion: companionId });
  if (error) {
    return json({ error: error.message ?? 'set_active_failed' }, { status: 400 });
  }

  return json({ ok: true, data: data ?? null });
};
