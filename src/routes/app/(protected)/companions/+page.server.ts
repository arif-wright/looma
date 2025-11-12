import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals }) => {
  const supabase = (locals as any)?.supabase;
  const userId = locals.session?.user?.id ?? locals.user?.id ?? null;

  if (!supabase || !userId) {
    return { companions: [], events: [], goal: null, error: 'Missing Supabase client' };
  }

  const today = new Date().toISOString().slice(0, 10);

  const [companionsResult, eventsResult, goalResult] = await Promise.all([
    supabase
      .from('companions')
      .select(
        'id, owner_id, name, species, rarity, level, xp, affection, trust, energy, mood, avatar_url, created_at, updated_at, stats:companion_stats(companion_id, care_streak, fed_at, played_at, groomed_at)'
      )
      .order('created_at', { ascending: true }),
    supabase
      .from('companion_care_events')
      .select('id, companion_id, owner_id, action, affection_delta, trust_delta, energy_delta, created_at')
      .eq('owner_id', userId)
      .order('created_at', { ascending: false })
      .limit(20),
    supabase
      .from('companion_daily_goals')
      .select('actions_count, completed, action_date')
      .eq('owner_id', userId)
      .eq('action_date', today)
      .maybeSingle()
  ]);

  const error = companionsResult.error?.message ?? eventsResult.error?.message ?? goalResult.error?.message ?? null;

  return {
    companions: companionsResult.data ?? [],
    events: eventsResult.data ?? [],
    goal: goalResult.data ?? null,
    error
  };
};
