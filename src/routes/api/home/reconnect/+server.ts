import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { createSupabaseServerClient, tryGetSupabaseAdminClient } from '$lib/server/supabase';
import { ingestServerEvent } from '$lib/server/events/ingest';
import { incrementCompanionRitual } from '$lib/server/companions/rituals';

const CACHE_HEADERS = { 'cache-control': 'no-store' } as const;
const MOODS = new Set(['calm', 'heavy', 'curious', 'energized', 'numb']);

const clamp = (value: number, min = 0, max = 100) => Math.max(min, Math.min(max, Math.round(value)));

const normalizeMood = (input: unknown) => (typeof input === 'string' ? input.trim().toLowerCase() : '');
const normalizeReflection = (input: unknown) => (typeof input === 'string' ? input.trim() : '');

export const POST: RequestHandler = async (event) => {
  const { supabase, session } = await createSupabaseServerClient(event);
  if (!session) {
    return json({ error: 'unauthorized' }, { status: 401, headers: CACHE_HEADERS });
  }
  const db = tryGetSupabaseAdminClient() ?? supabase;

  let payload: { companionId?: unknown; mood?: unknown; reflection?: unknown } = {};
  try {
    payload = (await event.request.json()) as typeof payload;
  } catch {
    return json({ error: 'bad_request', message: 'Invalid JSON body.' }, { status: 400, headers: CACHE_HEADERS });
  }

  const mood = normalizeMood(payload.mood);
  if (!MOODS.has(mood)) {
    return json({ error: 'bad_request', message: 'Unsupported mood.' }, { status: 400, headers: CACHE_HEADERS });
  }

  const reflection = normalizeReflection(payload.reflection);
  if (reflection.length < 3 || reflection.length > 480) {
    return json(
      { error: 'bad_request', message: 'Reflection must be between 3 and 480 characters.' },
      { status: 400, headers: CACHE_HEADERS }
    );
  }

  const companionId = typeof payload.companionId === 'string' ? payload.companionId.trim() : '';
  if (!companionId) {
    return json({ error: 'bad_request', message: 'Companion is required.' }, { status: 400, headers: CACHE_HEADERS });
  }

  const userId = session.user.id;
  const checkinDate = new Date().toISOString().slice(0, 10);

  const { data: checkin, error: checkinError } = await db
    .from('user_daily_checkins')
    .upsert(
      {
        user_id: userId,
        mood,
        checkin_date: checkinDate
      },
      { onConflict: 'user_id,checkin_date', ignoreDuplicates: false }
    )
    .select('id, mood, checkin_date, created_at')
    .single();

  if (checkinError || !checkin) {
    return json(
      { error: 'server_error', message: checkinError?.message ?? 'Unable to save check-in.' },
      { status: 500, headers: CACHE_HEADERS }
    );
  }

  const { data: companion, error: companionError } = await db
    .from('companions')
    .select('id, owner_id, name, affection, trust, energy, mood, updated_at')
    .eq('id', companionId)
    .maybeSingle();

  if (companionError) {
    return json(
      { error: 'server_error', message: companionError.message ?? 'Unable to load companion.' },
      { status: 500, headers: CACHE_HEADERS }
    );
  }

  if (!companion || companion.owner_id !== userId) {
    return json({ error: 'forbidden', message: 'Companion not available.' }, { status: 403, headers: CACHE_HEADERS });
  }

  const reflectionWeight = reflection.length >= 140 ? 2 : reflection.length >= 60 ? 1 : 0;
  const trustDelta = 4 + reflectionWeight + (mood === 'heavy' || mood === 'numb' ? 2 : 0);
  const affectionDelta = 3 + reflectionWeight + (mood === 'curious' || mood === 'energized' ? 1 : 0);
  const energyDelta = 4 + reflectionWeight + (mood === 'numb' ? 1 : 0);

  const nextTrust = clamp((companion.trust ?? 0) + trustDelta);
  const nextAffection = clamp((companion.affection ?? 0) + affectionDelta);
  const nextEnergy = clamp((companion.energy ?? 0) + energyDelta);

  const { data: updatedCompanion, error: updateCompanionError } = await db
    .from('companions')
    .update({
      trust: nextTrust,
      affection: nextAffection,
      energy: nextEnergy,
      mood
    })
    .eq('id', companion.id)
    .select('id, name, trust, affection, energy, mood, updated_at')
    .single();

  if (updateCompanionError || !updatedCompanion) {
    return json(
      { error: 'server_error', message: updateCompanionError?.message ?? 'Unable to update companion.' },
      { status: 500, headers: CACHE_HEADERS }
    );
  }

  const checkInAt = new Date().toISOString();
  try {
    await db
      .from('companion_stats')
      .upsert(
        {
          companion_id: updatedCompanion.id,
          played_at: checkInAt,
          last_passive_tick: checkInAt
        },
        { onConflict: 'companion_id', ignoreDuplicates: false }
      );
  } catch (err) {
    console.error('[home/reconnect] companion stats upsert failed', err);
  }

  let rituals = null;
  try {
    rituals = await incrementCompanionRitual(db, userId, 'care_once', {
      companionName: updatedCompanion.name
    });
  } catch (err) {
    console.error('[home/reconnect] ritual increment failed', err);
  }

  let eventResponse: unknown = null;
  try {
    eventResponse = await ingestServerEvent(
      event,
      'companion.ritual.listen',
      {
        companionId: updatedCompanion.id,
        companionName: updatedCompanion.name,
        mood,
        reflection,
        reflectionChars: reflection.length
      },
      { ts: new Date().toISOString() }
    );
  } catch (err) {
    console.error('[home/reconnect] event ingest failed', err);
  }

  const reaction =
    eventResponse &&
    typeof eventResponse === 'object' &&
    (eventResponse as Record<string, unknown>).output &&
    typeof (eventResponse as Record<string, unknown>).output === 'object'
      ? ((eventResponse as Record<string, any>).output?.reaction ?? null)
      : null;
  const reactionOutput =
    eventResponse &&
    typeof eventResponse === 'object' &&
    (eventResponse as Record<string, unknown>).output &&
    typeof (eventResponse as Record<string, unknown>).output === 'object'
      ? ((eventResponse as Record<string, any>).output as Record<string, unknown>)
      : null;
  const responseSource =
    reaction && typeof (reaction as Record<string, unknown>).source === 'string'
      ? String((reaction as Record<string, unknown>).source)
      : 'fallback';
  const responseNote = reactionOutput && typeof reactionOutput.note === 'string' ? reactionOutput.note : null;
  const traceId =
    eventResponse &&
    typeof eventResponse === 'object' &&
    typeof (eventResponse as Record<string, unknown>).traceId === 'string'
      ? String((eventResponse as Record<string, unknown>).traceId)
      : null;

  return json(
    {
      ok: true,
      checkin,
      companion: updatedCompanion,
      checkInAt,
      deltas: {
        trust: nextTrust - (companion.trust ?? 0),
        affection: nextAffection - (companion.affection ?? 0),
        energy: nextEnergy - (companion.energy ?? 0)
      },
      rituals,
      reaction,
      debug: {
        responseSource,
        responseNote,
        traceId
      }
    },
    { headers: CACHE_HEADERS }
  );
};
