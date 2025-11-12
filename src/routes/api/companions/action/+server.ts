import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { createSupabaseServerClient } from '$lib/server/supabase';

const ACTIONS = new Set(['feed', 'play', 'groom']);

type CareRequest = {
  companionId?: string;
  action?: string;
};

const parseCooldownDetail = (detail?: string | null) => {
  if (!detail) return null;
  const value = Number(detail);
  return Number.isFinite(value) ? value : null;
};

export const POST: RequestHandler = async (event) => {
  const { supabase, session } = await createSupabaseServerClient(event);
  if (!session) {
    return json({ error: 'unauthorized' }, { status: 401 });
  }

  let payload: CareRequest;
  try {
    payload = (await event.request.json()) as CareRequest;
  } catch {
    return json({ error: 'bad_request' }, { status: 400 });
  }

  const companionId = typeof payload.companionId === 'string' ? payload.companionId : null;
  const action = typeof payload.action === 'string' ? payload.action : null;

  if (!companionId || !action || !ACTIONS.has(action)) {
    return json({ error: 'bad_request' }, { status: 400 });
  }

  const { data, error } = await supabase.rpc('perform_care_action', {
    p_owner: session.user.id,
    p_companion: companionId,
    p_action: action
  });

  if (error) {
    const detailSeconds = parseCooldownDetail(error.details);
    if (error.message === 'cooldown_active' && detailSeconds !== null) {
      return json({ error: 'cooldown', cooldownSecsRemaining: detailSeconds }, { status: 429 });
    }
    if (error.message === 'insufficient_energy') {
      return json({ error: 'insufficient_energy' }, { status: 400 });
    }
    return json({ error: error.message ?? 'care_failed' }, { status: 400 });
  }

  return json({ ok: true, result: data ?? null });
};
