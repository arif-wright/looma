import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { computeCompanionEffectiveState } from '$lib/companions/effectiveState';
import { buildSharedRestReaction } from '$lib/sanctuary';
import { syncEmotionalStateFromCompanionStats } from '$lib/server/emotionalState';
import type { Companion } from '$lib/stores/companions';

const REST_COOLDOWN_MS = 4 * 60 * 60 * 1000;
const REST_ENERGY = 35;

const clamp = (value: number) => Math.max(0, Math.min(100, Math.round(value)));

const deriveMood = (affection: number, trust: number, energy: number) => {
  if (energy <= 5) return 'low_energy';
  if (energy < 20) return 'tired';
  if (affection > 70 && trust > 60) return 'happy';
  if (affection < 30 && trust < 30) return 'stressed';
  return 'neutral';
};

export const POST: RequestHandler = async ({ locals, request }) => {
  const supabase = locals.supabase as App.Locals['supabase'];
  const userId = locals.session?.user?.id ?? locals.user?.id ?? null;
  if (!supabase || !userId) {
    return json({ error: 'unauthorized' }, { status: 401 });
  }

  const payload = await request.json().catch(() => null);
  if (payload?.action !== 'shared_rest') {
    return json({ error: 'unsupported_interaction' }, { status: 400 });
  }

  const [{ data: placement, error: placementError }, { data: companion, error: companionError }] =
    await Promise.all([
      supabase
        .from('sanctuary_placements')
        .select('id, item_id, item:item_id (id, item_key, title, capabilities)')
        .eq('owner_id', userId)
        .not('item_id', 'is', null)
        .limit(20),
      supabase
        .from('companions')
        .select(
          'id, owner_id, name, species, rarity, level, xp, affection, trust, energy, mood, state, avatar_url, created_at, updated_at, stats:companion_stats(companion_id, care_streak, fed_at, played_at, groomed_at, last_passive_tick, last_daily_bonus_at, bond_level, bond_score)'
        )
        .eq('owner_id', userId)
        .order('is_active', { ascending: false })
        .order('created_at', { ascending: true })
        .limit(1)
        .maybeSingle()
    ]);

  if (placementError || companionError) {
    console.error('[sanctuary interaction] lookup failed', placementError ?? companionError);
    return json({ error: 'interaction_lookup_failed' }, { status: 500 });
  }
  if (!companion) {
    return json({ error: 'companion_required' }, { status: 404 });
  }

  const mossPlacement = (placement ?? []).find((row: any) => {
    const item = Array.isArray(row.item) ? row.item[0] : row.item;
    return item?.item_key === 'care-moss-seat' && item?.capabilities?.includes('interactive');
  });
  if (!mossPlacement) {
    return json({ error: 'moss_seat_must_be_placed' }, { status: 409 });
  }

  const { data: latestInteraction, error: latestError } = await supabase
    .from('sanctuary_interactions')
    .select('created_at')
    .eq('owner_id', userId)
    .eq('companion_id', companion.id)
    .eq('action', 'shared_rest')
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (latestError) {
    console.error('[sanctuary interaction] cooldown lookup failed', latestError);
    return json({ error: 'interaction_lookup_failed' }, { status: 500 });
  }

  const latestStamp = latestInteraction?.created_at ? Date.parse(latestInteraction.created_at) : Number.NaN;
  if (Number.isFinite(latestStamp) && Date.now() - latestStamp < REST_COOLDOWN_MS) {
    const retryAfter = Math.ceil((REST_COOLDOWN_MS - (Date.now() - latestStamp)) / 1000);
    return json(
      { error: 'rest_cooldown', message: `${companion.name} is still carrying the quiet from your last rest.`, retryAfter },
      { status: 429 }
    );
  }

  const normalizedCompanion = {
    ...companion,
    stats: Array.isArray(companion.stats) ? companion.stats[0] ?? null : companion.stats
  } as Companion;
  const effective = computeCompanionEffectiveState(normalizedCompanion);
  const affection = clamp(effective.affection + 2);
  const trust = clamp(effective.trust + 3);
  const energy = clamp(effective.energy + REST_ENERGY);
  const mood = deriveMood(affection, trust, energy);
  const nowIso = new Date().toISOString();
  const reaction = buildSharedRestReaction(companion.name, effective.energy, energy);

  const { data: updated, error: updateError } = await supabase
    .from('companions')
    .update({ affection, trust, energy, mood, state: 'resting' })
    .eq('id', companion.id)
    .eq('owner_id', userId)
    .select('id, name, affection, trust, energy, mood, state, updated_at')
    .single();
  if (updateError) {
    console.error('[sanctuary interaction] companion update failed', updateError);
    return json({ error: 'interaction_update_failed' }, { status: 500 });
  }

  const stats = normalizedCompanion.stats;
  const { error: statsError } = await supabase.from('companion_stats').upsert(
    {
      companion_id: companion.id,
      care_streak: stats?.care_streak ?? 0,
      fed_at: stats?.fed_at ?? null,
      played_at: stats?.played_at ?? null,
      groomed_at: stats?.groomed_at ?? null,
      last_passive_tick: nowIso,
      last_daily_bonus_at: stats?.last_daily_bonus_at ?? null,
      bond_level: stats?.bond_level ?? null,
      bond_score: stats?.bond_score ?? null
    },
    { onConflict: 'companion_id' }
  );
  if (statsError) console.error('[sanctuary interaction] stats update failed', statsError);

  const item = Array.isArray(mossPlacement.item) ? mossPlacement.item[0] : mossPlacement.item;
  if (!item) {
    return json({ error: 'moss_seat_must_be_placed' }, { status: 409 });
  }
  const { data: interaction, error: interactionError } = await supabase
    .from('sanctuary_interactions')
    .insert({
      owner_id: userId,
      companion_id: companion.id,
      placement_id: mossPlacement.id,
      item_id: item.id,
      action: 'shared_rest',
      response_text: reaction,
      energy_before: effective.energy,
      energy_after: energy
    })
    .select('id, created_at')
    .single();
  if (interactionError || !interaction) {
    console.error('[sanctuary interaction] interaction insert failed', interactionError);
    return json({ error: 'interaction_record_failed' }, { status: 500 });
  }

  const [careEventResult, journalResult] = await Promise.all([
    supabase.from('companion_care_events').insert({
      companion_id: companion.id,
      owner_id: userId,
      action: 'sanctuary_rest',
      affection_delta: 2,
      trust_delta: 3,
      energy_delta: energy - effective.energy,
      note: reaction
    }),
    supabase.from('companion_journal_entries').insert({
      owner_id: userId,
      companion_id: companion.id,
      source_type: 'system',
      source_id: interaction.id,
      title: `A quiet rest with ${companion.name}`,
      body: reaction,
      meta_json: {
        category: 'sanctuary',
        interactionType: 'shared_rest',
        action: 'shared_rest',
        itemKey: 'care-moss-seat',
        energyBefore: effective.energy,
        energyAfter: energy
      }
    })
  ]);
  if (careEventResult.error) {
    console.error('[sanctuary interaction] care event record failed', careEventResult.error);
  }
  if (journalResult.error) {
    console.error('[sanctuary interaction] journal record failed', journalResult.error);
  }
  await syncEmotionalStateFromCompanionStats(userId, companion.id, { affection, trust, energy, mood }, supabase).catch(
    (error) => console.error('[sanctuary interaction] emotional state sync failed', error)
  );

  return json({
    ok: true,
    action: 'shared_rest',
    companion: updated,
    reaction,
    restoredEnergy: energy - effective.energy,
    nextAvailableAt: new Date(Date.now() + REST_COOLDOWN_MS).toISOString()
  });
};
