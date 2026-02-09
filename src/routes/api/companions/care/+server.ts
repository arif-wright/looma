import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { createSupabaseServerClient } from '$lib/server/supabase';
import { syncPlayerBondState } from '$lib/server/companions/bonds';
import { incrementCompanionRitual } from '$lib/server/companions/rituals';

type CareAction = 'feed' | 'play' | 'groom';
type CompanionStatsRow = {
  companion_id: string;
  care_streak: number;
  fed_at: string | null;
  played_at: string | null;
  groomed_at: string | null;
  last_passive_tick: string | null;
  last_daily_bonus_at: string | null;
  bond_level: number | null;
  bond_score: number | null;
};

const ACTION_DELTAS: Record<CareAction, { affection: number; trust: number; energy: number }> = {
  feed: { affection: 5, trust: 2, energy: 15 },
  play: { affection: 8, trust: 6, energy: -10 },
  groom: { affection: 4, trust: 4, energy: -5 }
};

const clamp = (value: number) => Math.max(0, Math.min(100, Math.round(value)));

const deriveMood = (affection: number, trust: number, energy: number) => {
  if (energy <= 5) return 'low_energy';
  if (energy < 20) return 'tired';
  if (affection > 70 && trust > 60) return 'happy';
  if (affection < 30 && trust < 30) return 'stressed';
  return 'neutral';
};

export const POST: RequestHandler = async (event) => {
  const { supabase, session } = await createSupabaseServerClient(event);
  if (!session) {
    return json({ error: 'unauthorized' }, { status: 401 });
  }

  let payload: { companionId?: string; action?: CareAction };
  try {
    payload = (await event.request.json()) as typeof payload;
  } catch {
    return json({ error: 'bad_request' }, { status: 400 });
  }

  const companionId = typeof payload.companionId === 'string' ? payload.companionId : null;
  const action = (typeof payload.action === 'string' ? payload.action.toLowerCase() : null) as CareAction | null;

  if (!companionId || !action || !(action in ACTION_DELTAS)) {
    return json({ error: 'bad_request' }, { status: 400 });
  }

  const { data: companion, error: fetchError } = await supabase
    .from('companions')
    .select(
      'id, owner_id, name, affection, trust, energy, mood, stats:companion_stats(companion_id, care_streak, fed_at, played_at, groomed_at, last_passive_tick, last_daily_bonus_at, bond_level, bond_score)'
    )
    .eq('id', companionId)
    .maybeSingle();

  if (fetchError) {
    return json({ error: fetchError.message ?? 'care_lookup_failed' }, { status: 400 });
  }

  if (!companion) {
    return json({ error: 'not_found' }, { status: 404 });
  }

  if (companion.owner_id !== session.user.id) {
    return json({ error: 'forbidden' }, { status: 403 });
  }

  if (companion.energy <= 0) {
    return json({ error: 'low_energy', message: `${companion.name} is too tired right now.` }, { status: 400 });
  }

  const deltas = ACTION_DELTAS[action];
  const affection = clamp((companion.affection ?? 0) + deltas.affection);
  const trust = clamp((companion.trust ?? 0) + deltas.trust);
  const energy = clamp((companion.energy ?? 0) + deltas.energy);
  const mood = deriveMood(affection, trust, energy);

  const { data: updated, error: updateError } = await supabase
    .from('companions')
    .update({ affection, trust, energy, mood })
    .eq('id', companion.id)
    .select('id, name, affection, trust, energy, mood, updated_at')
    .maybeSingle();

  if (updateError || !updated) {
    return json({ error: updateError?.message ?? 'care_failed' }, { status: 400 });
  }

  const statsBase = companion.stats ?? {
    companion_id: companion.id,
    care_streak: 0,
    fed_at: null,
    played_at: null,
    groomed_at: null,
    last_passive_tick: null,
    last_daily_bonus_at: null,
    bond_level: null,
    bond_score: null
  };
  const normalizedStats = (Array.isArray(statsBase) ? statsBase[0] : statsBase) as CompanionStatsRow | undefined;
  const stats = normalizedStats ?? {
    companion_id: companion.id,
    care_streak: 0,
    fed_at: null,
    played_at: null,
    groomed_at: null,
    last_passive_tick: null,
    last_daily_bonus_at: null,
    bond_level: null,
    bond_score: null
  };
  const nowIso = new Date().toISOString();
  const nextStats = {
    companion_id: companion.id,
    care_streak: (stats.care_streak ?? 0) + 1,
    fed_at: action === 'feed' ? nowIso : stats.fed_at,
    played_at: action === 'play' ? nowIso : stats.played_at,
    groomed_at: action === 'groom' ? nowIso : stats.groomed_at,
    last_passive_tick: stats.last_passive_tick ?? null,
    last_daily_bonus_at: stats.last_daily_bonus_at ?? null,
    bond_level: stats.bond_level ?? null,
    bond_score: stats.bond_score ?? null
  };

  const { error: statsError } = await supabase.from('companion_stats').upsert(nextStats, { onConflict: 'companion_id' });
  if (statsError) {
    console.error('[companion care] failed to persist stats', statsError);
  }

  const { data: eventRow, error: eventError } = await supabase
    .from('companion_care_events')
    .insert({
      companion_id: companion.id,
      owner_id: session.user.id,
      action,
      affection_delta: deltas.affection,
      trust_delta: deltas.trust,
      energy_delta: deltas.energy
    })
    .select('id, action, affection_delta, trust_delta, energy_delta, created_at')
    .single();

  if (eventError) {
    console.error('[companion care] failed to insert event', eventError);
  }

  let bondLevel = stats.bond_level ?? 0;
  let bondScore = stats.bond_score ?? 0;
  let milestoneEvents: { action: string; note?: string | null }[] = [];
  let ritualUpdate = null;
  try {
    const { rows, milestones } = await syncPlayerBondState(supabase, session.user.id);
    const bondRow = rows.find((row) => row.companion_id === companion.id);
    if (bondRow) {
      bondLevel = bondRow.bond_level ?? bondLevel;
      bondScore = bondRow.bond_score ?? bondScore;
    }
    milestoneEvents = milestones
      ?.filter((row) => row.companion_id === companion.id)
      .map((row) => ({ action: row.action, note: row.note })) ?? [];
    ritualUpdate = await incrementCompanionRitual(supabase, session.user.id, 'care_once', {
      companionName: companion.name
    });
  } catch (err) {
    console.error('[companion care] bond sync failed', err);
  }

  const statsWithBond = {
    ...nextStats,
    bond_level: bondLevel,
    bond_score: bondScore
  };

  return json({
    ok: true,
    companion: { ...updated, bond_level: bondLevel, bond_score: bondScore, stats: statsWithBond },
    event: eventRow ?? null,
    milestones: milestoneEvents,
    rituals: ritualUpdate
  });
};
