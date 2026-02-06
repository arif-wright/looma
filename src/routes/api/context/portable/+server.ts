import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { createSupabaseServerClient } from '$lib/server/supabase';
import { getConsentFlags } from '$lib/server/consent';
import { PORTABLE_STATE_VERSION, type PortableState } from '$lib/types/portableState';

const coercePortableState = (input: unknown): PortableState => {
  const now = new Date().toISOString();
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    return { version: PORTABLE_STATE_VERSION, updatedAt: now, items: [] };
  }

  const payload = input as Record<string, unknown>;
  const itemsRaw = Array.isArray(payload.items) ? payload.items : [];
  const items = itemsRaw
    .slice(0, 20)
    .map((entry) => (entry && typeof entry === 'object' && !Array.isArray(entry) ? (entry as Record<string, unknown>) : null))
    .filter(Boolean)
    .map((entry) => ({
      key: typeof entry?.key === 'string' ? entry.key.slice(0, 80) : 'unknown',
      value:
        typeof entry?.value === 'string' ||
        typeof entry?.value === 'number' ||
        typeof entry?.value === 'boolean'
          ? entry.value
          : null,
      updatedAt: typeof entry?.updatedAt === 'string' ? entry.updatedAt : now,
      source: typeof entry?.source === 'string' ? entry.source.slice(0, 80) : null
    }));

  return {
    version: PORTABLE_STATE_VERSION,
    updatedAt: typeof payload.updatedAt === 'string' ? payload.updatedAt : now,
    items
  };
};

export const GET: RequestHandler = async (event) => {
  const { supabase, session } = await createSupabaseServerClient(event);
  if (!session) {
    return json({ error: 'unauthorized' }, { status: 401 });
  }

  const consent = await getConsentFlags(event, supabase);
  const { data, error } = await supabase
    .from('user_preferences')
    .select('portable_state, consent_memory, consent_adaptation')
    .eq('user_id', session.user.id)
    .maybeSingle();

  if (error && error.code !== 'PGRST116') {
    console.error('[portable_state] fetch failed', error);
  }

  const portableState = consent.memory ? coercePortableState(data?.portable_state) : null;

  return json({
    consent,
    portableState
  });
};

export const PUT: RequestHandler = async (event) => {
  const { supabase, session } = await createSupabaseServerClient(event);
  if (!session) {
    return json({ error: 'unauthorized' }, { status: 401 });
  }

  let payload: Record<string, unknown>;
  try {
    payload = (await event.request.json()) as Record<string, unknown>;
  } catch {
    return json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const consentMemory = typeof payload.consentMemory === 'boolean' ? payload.consentMemory : undefined;
  const consentAdaptation =
    typeof payload.consentAdaptation === 'boolean' ? payload.consentAdaptation : undefined;
  const reset = payload.reset === true;

  const nextState = reset ? { version: PORTABLE_STATE_VERSION, updatedAt: new Date().toISOString(), items: [] } : undefined;
  const portableState = payload.portableState ? coercePortableState(payload.portableState) : nextState;

  const upsertPayload: Record<string, unknown> = {
    user_id: session.user.id
  };

  if (typeof consentMemory === 'boolean') upsertPayload.consent_memory = consentMemory;
  if (typeof consentAdaptation === 'boolean') upsertPayload.consent_adaptation = consentAdaptation;
  if (portableState) upsertPayload.portable_state = portableState;

  if (typeof consentMemory === 'boolean' && !consentMemory) {
    upsertPayload.portable_state = { version: PORTABLE_STATE_VERSION, updatedAt: new Date().toISOString(), items: [] };
  }

  const { error } = await supabase
    .from('user_preferences')
    .upsert(upsertPayload, { onConflict: 'user_id', ignoreDuplicates: false });

  if (error) {
    console.error('[portable_state] update failed', error);
    return json({ error: 'update_failed' }, { status: 500 });
  }

  return json({ ok: true });
};
