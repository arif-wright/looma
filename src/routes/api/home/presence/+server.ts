import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { deriveAliveCompanionState } from '$lib/companions/effectiveState';
import { appendCompanionJournalEntry } from '$lib/server/companions/journal';
import { createSupabaseServerClient, tryGetSupabaseAdminClient } from '$lib/server/supabase';

const CACHE_HEADERS = { 'cache-control': 'no-store' } as const;
const ACTIONS = new Set(['sit', 'stay']);
const DELTA = 3;

type PresenceAction = 'sit' | 'stay';
type StatsRow = {
  last_meaningful_interaction_at?: string | null;
  repair_started_at?: string | null;
  repair_completed_at?: string | null;
};

const clamp = (value: number) => Math.max(0, Math.min(100, Math.round(value)));

const reactionFor = (name: string, action: PresenceAction) =>
  action === 'sit'
    ? `${name} does not ask anything of you. It simply moves a little closer.`
    : `Something between you feels settled again. ${name} is carrying this return with you.`;

export const POST: RequestHandler = async (event) => {
  const { supabase, session } = await createSupabaseServerClient(event);
  if (!session) return json({ error: 'unauthorized' }, { status: 401, headers: CACHE_HEADERS });
  const db = tryGetSupabaseAdminClient() ?? supabase;

  const payload = await event.request.json().catch(() => null);
  const companionId = typeof payload?.companionId === 'string' ? payload.companionId.trim() : '';
  const action = typeof payload?.action === 'string' ? payload.action.trim().toLowerCase() : '';
  if (!companionId || !ACTIONS.has(action)) {
    return json({ error: 'bad_request' }, { status: 400, headers: CACHE_HEADERS });
  }

  const { data: companion, error: companionError } = await db
    .from('companions')
    .select(
      'id, owner_id, name, affection, trust, energy, stats:companion_stats(last_meaningful_interaction_at, repair_started_at, repair_completed_at)'
    )
    .eq('id', companionId)
    .maybeSingle();
  if (companionError) {
    return json({ error: 'server_error', message: companionError.message }, { status: 500, headers: CACHE_HEADERS });
  }
  if (!companion) return json({ error: 'companion_not_found' }, { status: 404, headers: CACHE_HEADERS });
  if (companion.owner_id !== session.user.id) {
    return json({ error: 'forbidden' }, { status: 403, headers: CACHE_HEADERS });
  }

  const stats = (Array.isArray(companion.stats) ? companion.stats[0] : companion.stats) as StatsRow | null;
  const stateBefore = deriveAliveCompanionState(companion.name, stats);
  const expectedState = action === 'sit' ? 'quiet' : 'softening';
  if (stateBefore.state !== expectedState) {
    return json(
      { error: 'invalid_presence_transition', currentState: stateBefore.state },
      { status: 409, headers: CACHE_HEADERS }
    );
  }

  const nowIso = new Date().toISOString();
  const nextAffection = clamp((companion.affection ?? 0) + DELTA);
  const nextTrust = clamp((companion.trust ?? 0) + DELTA);
  const reaction = reactionFor(companion.name, action as PresenceAction);
  let memory: { id: string; title: string; body: string; createdAt: string } | null = null;
  let presenceEventId: string | null = null;

  if (action === 'stay') {
    const { data: eventRow, error: eventError } = await db
      .from('companion_care_events')
      .insert({
        companion_id: companion.id,
        owner_id: session.user.id,
        action: 'presence',
        affection_delta: DELTA,
        trust_delta: DELTA,
        energy_delta: 0,
        note: 'stay:softening_to_steady'
      })
      .select('id')
      .single();
    if (eventError || !eventRow) {
      return json({ error: 'server_error', message: 'Unable to record this return.' }, { status: 500, headers: CACHE_HEADERS });
    }
    presenceEventId = eventRow.id;
    const title = `You and ${companion.name} found your way back`;
    const body = `${companion.name} softened when you returned, and the quiet between you settled into closeness again.`;
    const journal = await appendCompanionJournalEntry(db, {
      ownerId: session.user.id,
      companionId: companion.id,
      sourceType: 'system',
      sourceId: presenceEventId,
      title,
      body,
      meta: {
        category: 'repair',
        generatedBy: 'home_presence',
        action,
        stateBefore: 'softening',
        stateAfter: 'steady',
        repairStartedAt: stats?.repair_started_at ?? null,
        repairCompletedAt: nowIso
      },
      rebuildSummary: false
    });
    if (!journal.ok || !journal.entry) {
      return json(
        { error: 'memory_persistence_failed', recoverable: true, currentState: 'softening' },
        { status: 503, headers: CACHE_HEADERS }
      );
    }
    memory = { id: journal.entry.id, title, body, createdAt: journal.entry.created_at };
  }

  const { data: updatedCompanion, error: updateError } = await db
    .from('companions')
    .update({ affection: nextAffection, trust: nextTrust })
    .eq('id', companion.id)
    .eq('owner_id', session.user.id)
    .select('id, name, affection, trust, energy')
    .single();
  if (updateError || !updatedCompanion) {
    if (memory?.id) await db.from('companion_journal_entries').delete().eq('id', memory.id);
    if (presenceEventId) await db.from('companion_care_events').delete().eq('id', presenceEventId);
    return json({ error: 'server_error', message: 'Unable to update companion.' }, { status: 500, headers: CACHE_HEADERS });
  }

  const statsPatch =
    action === 'sit'
      ? {
          companion_id: companion.id,
          last_meaningful_interaction_at: nowIso,
          repair_started_at: nowIso,
          repair_completed_at: null
        }
      : {
          companion_id: companion.id,
          last_meaningful_interaction_at: nowIso,
          repair_started_at: stats?.repair_started_at ?? nowIso,
          repair_completed_at: nowIso
        };
  const { error: statsError } = await db.from('companion_stats').upsert(statsPatch, { onConflict: 'companion_id' });
  if (statsError) {
    if (memory?.id) await db.from('companion_journal_entries').delete().eq('id', memory.id);
    if (presenceEventId) await db.from('companion_care_events').delete().eq('id', presenceEventId);
    return json({ error: 'server_error', message: 'Unable to preserve companion state.' }, { status: 500, headers: CACHE_HEADERS });
  }

  if (action === 'sit') {
    const { error: eventError } = await db.from('companion_care_events').insert({
      companion_id: companion.id,
      owner_id: session.user.id,
      action: 'presence',
      affection_delta: DELTA,
      trust_delta: DELTA,
      energy_delta: 0,
      note: 'sit:quiet_to_softening'
    });
    if (eventError) console.error('[home/presence] presence event insert failed', eventError);
  }

  return json(
    {
      ok: true,
      action,
      stateBefore: stateBefore.state,
      stateAfter: action === 'sit' ? 'softening' : 'steady',
      transitionAt: nowIso,
      reaction: { text: reaction, source: 'state_fallback' },
      companion: updatedCompanion,
      memory
    },
    { headers: CACHE_HEADERS }
  );
};
