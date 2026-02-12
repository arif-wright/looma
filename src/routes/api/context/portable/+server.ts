import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { createSupabaseServerClient } from '$lib/server/supabase';
import { getConsentFlags } from '$lib/server/consent';
import { PORTABLE_STATE_VERSION, type PortableState } from '$lib/types/portableState';
import { normalizePortableCompanions, withNormalizedCompanions } from '$lib/server/context/portableCompanions';
import { coercePortableIdentity } from '$lib/server/context/portableIdentity';
import { ingestServerEvent } from '$lib/server/events/ingest';

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
    items,
    identity: coercePortableIdentity(payload.identity),
    companions: normalizePortableCompanions(payload.companions)
  };
};

const isMissingConsentColumn = (error: { code?: string | null; message?: string | null } | null | undefined) => {
  if (!error) return false;
  if (error.code === '42703' || error.code === 'PGRST204') return true;
  return (
    typeof error.message === 'string' &&
    (error.message.includes('consent_reactions') ||
      error.message.includes('consent_emotional_adaptation') ||
      error.message.includes('consent_cross_app_continuity'))
  );
};

const upsertPortableBool = (state: PortableState, key: string, value: boolean, source = 'preferences'): PortableState => {
  const now = new Date().toISOString();
  const items = (state.items ?? []).filter((entry) => entry.key !== key);
  items.push({ key, value, updatedAt: now, source });
  return {
    version: state.version || PORTABLE_STATE_VERSION,
    updatedAt: now,
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
    .select('portable_state')
    .eq('user_id', session.user.id)
    .maybeSingle();

  if (error && error.code !== 'PGRST116') {
    console.error('[portable_state] fetch failed', error);
  }

  const portableState = consent.memory ? withNormalizedCompanions(coercePortableState(data?.portable_state)) : null;

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
  const consentReactions =
    typeof payload.consentReactions === 'boolean' ? payload.consentReactions : undefined;
  const consentEmotionalAdaptation =
    typeof payload.consentEmotionalAdaptation === 'boolean' ? payload.consentEmotionalAdaptation : undefined;
  const consentCrossAppContinuity =
    typeof payload.consentCrossAppContinuity === 'boolean' ? payload.consentCrossAppContinuity : undefined;
  const reset = payload.reset === true;

  const nextState = reset ? { version: PORTABLE_STATE_VERSION, updatedAt: new Date().toISOString(), items: [] } : undefined;
  let portableState = payload.portableState ? coercePortableState(payload.portableState) : nextState;

  if (typeof consentReactions === 'boolean') {
    if (!portableState) {
      const { data } = await supabase
        .from('user_preferences')
        .select('portable_state')
        .eq('user_id', session.user.id)
        .maybeSingle();
      portableState = coercePortableState(data?.portable_state);
    }
    portableState = upsertPortableBool(portableState, 'reactions_enabled', consentReactions);
  }

  if (portableState) {
    portableState = withNormalizedCompanions(portableState);
  }

  const upsertPayload: Record<string, unknown> = {
    user_id: session.user.id
  };

  if (typeof consentMemory === 'boolean') upsertPayload.consent_memory = consentMemory;
  if (typeof consentAdaptation === 'boolean') upsertPayload.consent_adaptation = consentAdaptation;
  if (typeof consentReactions === 'boolean') upsertPayload.consent_reactions = consentReactions;
  if (typeof consentEmotionalAdaptation === 'boolean') {
    upsertPayload.consent_emotional_adaptation = consentEmotionalAdaptation;
  }
  if (typeof consentCrossAppContinuity === 'boolean') {
    upsertPayload.consent_cross_app_continuity = consentCrossAppContinuity;
  }
  if (portableState) upsertPayload.portable_state = portableState;

  if (typeof consentMemory === 'boolean' && !consentMemory) {
    upsertPayload.portable_state = withNormalizedCompanions({
      version: PORTABLE_STATE_VERSION,
      updatedAt: new Date().toISOString(),
      items: []
    });
  }

  const { error } = await supabase
    .from('user_preferences')
    .upsert(upsertPayload, { onConflict: 'user_id', ignoreDuplicates: false });

  if (isMissingConsentColumn(error)) {
    const retryPayload = { ...upsertPayload };
    delete retryPayload.consent_reactions;
    delete retryPayload.consent_emotional_adaptation;
    delete retryPayload.consent_cross_app_continuity;
    const retry = await supabase
      .from('user_preferences')
      .upsert(retryPayload, { onConflict: 'user_id', ignoreDuplicates: false });
    if (retry.error) {
      console.error('[portable_state] update retry failed', retry.error);
      return json({ error: 'update_failed' }, { status: 500 });
    }
    return json({ ok: true });
  }

  if (error) {
    console.error('[portable_state] update failed', error);
    return json({ error: 'update_failed' }, { status: 500 });
  }

  const toggleEvents: Array<{ key: string; value: boolean }> = [];
  if (typeof consentMemory === 'boolean') toggleEvents.push({ key: 'consent_memory', value: consentMemory });
  if (typeof consentAdaptation === 'boolean') {
    toggleEvents.push({ key: 'consent_adaptation', value: consentAdaptation });
  }
  if (typeof consentReactions === 'boolean') {
    toggleEvents.push({ key: 'consent_reactions', value: consentReactions });
  }
  if (typeof consentEmotionalAdaptation === 'boolean') {
    toggleEvents.push({ key: 'consent_emotional_adaptation', value: consentEmotionalAdaptation });
  }
  if (typeof consentCrossAppContinuity === 'boolean') {
    toggleEvents.push({ key: 'consent_cross_app_continuity', value: consentCrossAppContinuity });
  }

  for (const toggle of toggleEvents) {
    await ingestServerEvent(
      event,
      'preference.toggle',
      {
        key: toggle.key,
        value: toggle.value
      },
      { sessionId: null }
    );
  }

  return json({ ok: true });
};
