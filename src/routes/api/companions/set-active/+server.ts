import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { createSupabaseServerClient } from '$lib/server/supabase';
import { PORTABLE_STATE_VERSION, type PortableState } from '$lib/types/portableState';
import { normalizePortableCompanions } from '$lib/server/context/portableCompanions';
import { coercePortableIdentity } from '$lib/server/context/portableIdentity';

type SetActivePayload = {
  id?: unknown;
};

const coercePortableState = (input: unknown): PortableState => {
  const now = new Date().toISOString();
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    return {
      version: PORTABLE_STATE_VERSION,
      updatedAt: now,
      items: [],
      companions: normalizePortableCompanions(null)
    };
  }

  const payload = input as Record<string, unknown>;
  const items = Array.isArray(payload.items) ? (payload.items as PortableState['items']) : [];

  return {
    version: PORTABLE_STATE_VERSION,
    updatedAt: typeof payload.updatedAt === 'string' ? payload.updatedAt : now,
    items,
    identity: coercePortableIdentity(payload.identity),
    companions: normalizePortableCompanions(payload.companions)
  };
};

export const POST: RequestHandler = async (event) => {
  const { supabase, session } = await createSupabaseServerClient(event);
  if (!session) {
    return json({ error: 'unauthorized' }, { status: 401 });
  }

  let payload: SetActivePayload = {};
  try {
    payload = (await event.request.json()) as SetActivePayload;
  } catch {
    return json({ error: 'bad_request', details: 'Invalid JSON body.' }, { status: 400 });
  }

  const id = typeof payload.id === 'string' ? payload.id.trim() : '';
  if (!id) {
    return json({ error: 'bad_request', details: 'Companion id is required.' }, { status: 400 });
  }

  const { data, error: fetchError } = await supabase
    .from('user_preferences')
    .select('portable_state')
    .eq('user_id', session.user.id)
    .maybeSingle();

  if (fetchError && fetchError.code !== 'PGRST116') {
    console.error('[companions/set-active] fetch failed', fetchError);
    return json({ error: 'server_error' }, { status: 500 });
  }

  const current = coercePortableState(data?.portable_state);
  const roster = current.companions?.roster ?? [];
  const target = roster.find((entry) => entry.id === id);

  if (!target) {
    return json({ error: 'not_found', details: 'Companion id not found in roster.' }, { status: 404 });
  }

  if (!target.unlocked) {
    return json({ error: 'forbidden', details: 'Companion is not unlocked.' }, { status: 403 });
  }

  const nextState: PortableState = {
    ...current,
    updatedAt: new Date().toISOString(),
    companions: {
      activeId: target.id,
      roster
    }
  };

  const { error: upsertError } = await supabase
    .from('user_preferences')
    .upsert(
      {
        user_id: session.user.id,
        portable_state: nextState
      },
      { onConflict: 'user_id', ignoreDuplicates: false }
    );

  if (upsertError) {
    console.error('[companions/set-active] update failed', upsertError);
    return json({ error: 'update_failed' }, { status: 500 });
  }

  return json({
    ok: true,
    activeId: target.id,
    active: target
  });
};
