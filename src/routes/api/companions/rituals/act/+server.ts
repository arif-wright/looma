import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { createSupabaseServerClient } from '$lib/server/supabase';
import { OPTIONAL_COMPANION_RITUAL_MAP, type OptionalCompanionRitualKey } from '$lib/companions/optionalRituals';
import { ingestServerEvent } from '$lib/server/events/ingest';
import { getLoomaTuningConfig } from '$lib/server/tuning/config';

type RitualActPayload = {
  companionId?: unknown;
  ritualKey?: unknown;
  suppressReactions?: unknown;
};

export const POST: RequestHandler = async (event) => {
  const { supabase, session } = await createSupabaseServerClient(event);
  if (!session) {
    return json({ error: 'unauthorized' }, { status: 401 });
  }

  let payload: RitualActPayload = {};
  try {
    payload = (await event.request.json()) as RitualActPayload;
  } catch {
    return json({ error: 'bad_request', message: 'Invalid JSON body.' }, { status: 400 });
  }

  const companionId = typeof payload.companionId === 'string' ? payload.companionId.trim() : '';
  const ritualKeyRaw = typeof payload.ritualKey === 'string' ? payload.ritualKey.trim().toLowerCase() : '';
  const ritualKey = ritualKeyRaw as OptionalCompanionRitualKey;
  const ritual = OPTIONAL_COMPANION_RITUAL_MAP.get(ritualKey);
  const tuning = await getLoomaTuningConfig();
  const ritualCooldownMs = ritual
    ? (tuning.rituals.cooldownMs[ritual.key] ?? ritual.cooldownMs)
    : 60 * 60 * 1000;
  const suppressReactions = payload.suppressReactions === true;

  if (!companionId || !ritual) {
    return json({ error: 'bad_request', message: 'Companion and ritual are required.' }, { status: 400 });
  }

  const { data: companion, error: companionError } = await supabase
    .from('companions')
    .select('id, owner_id, name, mood')
    .eq('id', companionId)
    .maybeSingle();

  if (companionError) {
    console.error('[companions/rituals/act] companion lookup failed', companionError);
    return json({ error: 'server_error', message: 'Unable to run ritual right now.' }, { status: 500 });
  }
  if (!companion || companion.owner_id !== session.user.id) {
    return json({ error: 'forbidden', message: 'Companion not available.' }, { status: 403 });
  }

  const { data: latest, error: latestError } = await supabase
    .from('companion_optional_ritual_events')
    .select('inserted_at')
    .eq('owner_id', session.user.id)
    .eq('companion_id', companion.id)
    .eq('ritual_key', ritual.key)
    .order('inserted_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (latestError) {
    console.error('[companions/rituals/act] cooldown lookup failed', latestError);
    return json({ error: 'server_error', message: 'Unable to run ritual right now.' }, { status: 500 });
  }

  const now = Date.now();
  const latestAt = latest?.inserted_at ? Date.parse(latest.inserted_at) : NaN;
  const remainingMs =
    Number.isFinite(latestAt) && latestAt > 0 ? Math.max(0, ritualCooldownMs - (now - latestAt)) : 0;
  if (remainingMs > 0) {
    return json(
      {
        error: 'ritual_cooldown',
        message: 'This ritual is resting. Try again soon.',
        retryAfter: Math.max(1, Math.ceil(remainingMs / 1000))
      },
      { status: 409 }
    );
  }

  const insertedAtIso = new Date(now).toISOString();
  const { error: insertError } = await supabase.from('companion_optional_ritual_events').insert({
    owner_id: session.user.id,
    companion_id: companion.id,
    ritual_key: ritual.key,
    meta: {
      eventType: ritual.eventType,
      temporaryMood: ritual.temporaryMood ?? null
    }
  });

  if (insertError) {
    console.error('[companions/rituals/act] ritual insert failed', insertError);
    return json({ error: 'server_error', message: 'Unable to run ritual right now.' }, { status: 500 });
  }

  const eventResponse = await ingestServerEvent(
    event,
    ritual.eventType,
    {
      companionId: companion.id,
      companionName: companion.name,
      ritualKey: ritual.key
    },
    {
      ts: insertedAtIso,
      suppressReactions
    }
  );

  const maybeReaction =
    eventResponse &&
    typeof eventResponse === 'object' &&
    (eventResponse as Record<string, unknown>).output &&
    typeof (eventResponse as Record<string, unknown>).output === 'object'
      ? ((eventResponse as Record<string, any>).output?.reaction ?? null)
      : null;

  return json({
    ok: true,
    ritual: {
      key: ritual.key,
      title: ritual.title,
      cooldownMs: ritualCooldownMs,
      startedAt: insertedAtIso
    },
    reaction: maybeReaction,
    temporaryMood: ritual.temporaryMood
      ? {
          key: ritual.temporaryMood,
        label: 'Focused',
        expiresAt: new Date(now + tuning.rituals.focusMoodDurationMs).toISOString(),
        durationMs: tuning.rituals.focusMoodDurationMs
      }
      : null
  });
};
