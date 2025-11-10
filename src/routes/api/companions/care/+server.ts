import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { createSupabaseServerClient } from '$lib/server/supabase';

const ACTIONS = new Set(['feed', 'play', 'groom']);

type CarePayload = {
  companionId?: string;
  action?: string;
};

export const POST: RequestHandler = async (event) => {
  const { supabase, session } = await createSupabaseServerClient(event);
  if (!session) {
    return json({ error: 'unauthorized' }, { status: 401 });
  }

  let payload: CarePayload;
  try {
    payload = (await event.request.json()) as CarePayload;
  } catch {
    return json({ error: 'bad_request' }, { status: 400 });
  }

  const companionId = typeof payload.companionId === 'string' ? payload.companionId : null;
  const action = typeof payload.action === 'string' ? payload.action : null;

  if (!companionId || !action || !ACTIONS.has(action)) {
    return json({ error: 'bad_request' }, { status: 400 });
  }

  const { data, error } = await supabase.rpc('care_action', {
    p_companion: companionId,
    p_kind: action
  });

  if (error) {
    return json({ error: error.message }, { status: 400 });
  }

  return json({ ok: true, state: Array.isArray(data) ? data[0] ?? null : null });
};
