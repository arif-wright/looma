import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals }) => {
  const supabase = locals.supabase as App.Locals['supabase'];
  const userId = locals.session?.user?.id ?? locals.user?.id ?? null;

  if (!supabase || !userId) {
    return { companion: null, decor: [], placements: [], latestReaction: null, error: 'unauthorized' };
  }

  const [companionRes, decorRes, placementsRes, reactionRes] = await Promise.all([
    supabase
      .from('companions')
      .select('id, name, species, avatar_url, mood, is_active')
      .eq('owner_id', userId)
      .order('is_active', { ascending: false })
      .order('created_at', { ascending: true })
      .limit(1)
      .maybeSingle(),
    supabase
      .from('sanctuary_decor_catalog')
      .select('id, slug, title, description, tone, visual_key')
      .eq('starter', true)
      .order('sort', { ascending: true }),
    supabase
      .from('sanctuary_placements')
      .select(
        'id, slot_key, placed_at, updated_at, decor:decor_id (id, slug, title, description, tone, visual_key)'
      )
      .eq('owner_id', userId),
    supabase
      .from('companion_journal_entries')
      .select('id, title, body, created_at')
      .eq('owner_id', userId)
      .contains('meta_json', { category: 'sanctuary' })
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()
  ]);

  const error =
    companionRes.error?.message ??
    decorRes.error?.message ??
    placementsRes.error?.message ??
    reactionRes.error?.message ??
    null;

  return {
    companion: companionRes.data ?? null,
    decor: decorRes.data ?? [],
    placements: placementsRes.data ?? [],
    latestReaction: reactionRes.data ?? null,
    error
  };
};
