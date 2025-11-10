import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals }) => {
  const supabase = (locals as any)?.supabase;

  if (!supabase) {
    return { companions: [], events: [], error: 'Missing Supabase client' };
  }

  const [companionsResult, eventsResult] = await Promise.all([
    supabase
      .from('companions')
      .select(
        'id, owner_id, name, species, rarity, level, xp, affection, trust, energy, mood, avatar_url, created_at, updated_at, stats:companion_stats(companion_id, care_streak, fed_at, played_at, groomed_at)'
      )
      .order('created_at', { ascending: true }),
    supabase
      .from('bond_events')
      .select('id, companion_id, owner_id, kind, delta_affection, delta_trust, delta_energy, meta, created_at')
      .order('created_at', { ascending: false })
      .limit(10)
  ]);

  const error = companionsResult.error?.message ?? eventsResult.error?.message ?? null;

  return {
    companions: companionsResult.data ?? [],
    events: eventsResult.data ?? [],
    error
  };
};
