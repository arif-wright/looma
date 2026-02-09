import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { createSupabaseServerClient } from '$lib/server/supabase';
import { PORTABLE_STATE_VERSION, type PortableState } from '$lib/types/portableState';
import { normalizePortableCompanions } from '$lib/server/context/portableCompanions';
import { normalizeCompanionCosmetics } from '$lib/companions/cosmetics';

type CustomizePayload = {
  id?: unknown;
  cosmetics?: unknown;
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
    companions: normalizePortableCompanions(payload.companions)
  };
};

export const POST: RequestHandler = async (event) => {
  const { supabase, session } = await createSupabaseServerClient(event);
  if (!session) {
    return json({ error: 'unauthorized' }, { status: 401 });
  }

  let payload: CustomizePayload = {};
  try {
    payload = (await event.request.json()) as CustomizePayload;
  } catch {
    return json({ error: 'bad_request', details: 'Invalid JSON body.' }, { status: 400 });
  }

  const { data, error: fetchError } = await supabase
    .from('user_preferences')
    .select('portable_state')
    .eq('user_id', session.user.id)
    .maybeSingle();

  if (fetchError && fetchError.code !== 'PGRST116') {
    console.error('[companions/customize] fetch failed', fetchError);
    return json({ error: 'server_error' }, { status: 500 });
  }

  const current = coercePortableState(data?.portable_state);
  const companions = normalizePortableCompanions(current.companions);
  const targetId = typeof payload.id === 'string' && payload.id.trim() ? payload.id.trim() : companions.activeId;
  const targetIndex = companions.roster.findIndex((entry) => entry.id === targetId);
  if (targetIndex < 0) {
    return json({ error: 'not_found', details: 'Companion id not found in roster.' }, { status: 404 });
  }

  const target = companions.roster[targetIndex];
  if (!target.unlocked) {
    return json({ error: 'forbidden', details: 'Companion is not unlocked.' }, { status: 403 });
  }

  const normalizedCosmetics = normalizeCompanionCosmetics(payload.cosmetics);
  const nextRoster = companions.roster.slice();
  nextRoster[targetIndex] = {
    ...target,
    cosmetics: normalizedCosmetics
  };

  const nextState: PortableState = {
    ...current,
    updatedAt: new Date().toISOString(),
    companions: {
      ...companions,
      roster: nextRoster
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
    console.error('[companions/customize] update failed', upsertError);
    return json({ error: 'update_failed' }, { status: 500 });
  }

  return json({
    ok: true,
    id: target.id,
    cosmetics: normalizedCosmetics
  });
};

