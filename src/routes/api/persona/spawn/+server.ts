import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { createSupabaseServerClient } from '$lib/server/supabase';
import {
  archetypeToDefaultSeed,
  canonicalArchetypes,
  resolveCanonicalArchetypeId
} from '$lib/onboarding/archetypes';
import { canSpawnCompanion } from '$lib/launch/proofIntegrity';

export const POST: RequestHandler = async (event) => {
  const { supabase, session } = await createSupabaseServerClient(event);
  if (!session) {
    return json({ error: 'unauthorized' }, { status: 401 });
  }

  const { count, error: countError } = await supabase
    .from('companions')
    .select('id', { count: 'exact', head: true })
    .eq('owner_id', session.user.id);

  if (countError) {
    console.error('[persona/spawn] companion count failed', countError);
    return json({ error: 'spawn_eligibility_unconfirmed' }, { status: 503 });
  }

  if (!canSpawnCompanion(count, false)) {
    return json({ error: 'already_spawned' }, { status: 400 });
  }

  let traitsResult = await supabase
    .from('player_traits')
    .select('archetype, primary_archetype, companion_seed')
    .eq('user_id', session.user.id)
    .maybeSingle();
  if (traitsResult.error?.code === '42703' || traitsResult.error?.message?.includes('primary_archetype')) {
    traitsResult = await supabase
      .from('player_traits')
      .select('archetype')
      .eq('user_id', session.user.id)
      .maybeSingle();
  }

  const { data: traits, error: traitsError } = traitsResult;
  if (traitsError) {
    return json({ error: traitsError.message }, { status: 400 });
  }

  const primaryArchetype = resolveCanonicalArchetypeId(
    (traits as any)?.primary_archetype ?? (traits as any)?.archetype ?? null,
    'muse'
  );
  const companionSeed =
    typeof (traits as any)?.companion_seed === 'string' && (traits as any).companion_seed.trim()
      ? (traits as any).companion_seed.trim().toLowerCase()
      : archetypeToDefaultSeed[primaryArchetype];
  const config = canonicalArchetypes[primaryArchetype];

  const { data: inserted, error: insertError } = await supabase
    .from('companions')
    .insert({
      owner_id: session.user.id,
      name: config.displayName,
      species: companionSeed,
      rarity: 'common',
      level: 1,
      xp: 0,
      affection: 20,
      trust: 15,
      energy: 100,
      mood: 'neutral',
      avatar_url: null,
      is_active: true
    })
    .select('id')
    .single();

  if (insertError || !inserted) {
    return json({ error: insertError?.message ?? 'spawn_failed' }, { status: 400 });
  }

  return json({
    ok: true,
    companionId: inserted.id,
    archetype: primaryArchetype,
    companionSeed
  });
};
