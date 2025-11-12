import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { createSupabaseServerClient } from '$lib/server/supabase';

type StatePayload = {
  companionId?: string;
  state?: string;
};

const STATES = new Set(['idle', 'resting', 'active']);

export const POST: RequestHandler = async (event) => {
  const { supabase, session } = await createSupabaseServerClient(event);
  if (!session) {
    return json({ error: 'unauthorized' }, { status: 401 });
  }

  let payload: StatePayload;
  try {
    payload = (await event.request.json()) as StatePayload;
  } catch {
    return json({ error: 'bad_request' }, { status: 400 });
  }

  const companionId = typeof payload.companionId === 'string' ? payload.companionId : null;
  const state = typeof payload.state === 'string' ? payload.state.toLowerCase() : null;

  if (!companionId || !state || !STATES.has(state)) {
    return json({ error: 'bad_request' }, { status: 400 });
  }

  const { data, error } = await supabase.rpc('set_companion_state', {
    p_companion: companionId,
    p_state: state
  });

  if (error) {
    return json({ error: error.message ?? 'state_failed' }, { status: 400 });
  }

  return json({ ok: true, state: data ?? state });
};
