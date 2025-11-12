import type { PageServerLoad } from './$types';

const COMPANION_COLUMNS =
  'id, owner_id, name, species, rarity, level, xp, affection, trust, energy, mood, state, is_active, slot_index, avatar_url, created_at, updated_at';

export const load: PageServerLoad = async ({ locals }) => {
  const supabase = locals.supabase as App.Locals['supabase'];
  const userId = locals.session?.user?.id ?? locals.user?.id ?? null;

  if (!supabase || !userId) {
    return { companions: [], maxSlots: 3, activeCompanionId: null };
  }

  const [companionsResult, slotsResult] = await Promise.all([
    supabase
      .from('companions')
      .select(COMPANION_COLUMNS)
      .eq('owner_id', userId)
      .order('slot_index', { ascending: true, nullsFirst: false })
      .order('created_at', { ascending: true }),
    supabase.rpc('ensure_slots')
  ]);

  const companions = companionsResult.data ?? [];
  const maxSlotsRaw = slotsResult.data;
  const maxSlots = typeof maxSlotsRaw === 'number' && Number.isFinite(maxSlotsRaw) ? maxSlotsRaw : 3;

  const activeCompanionId = companions.find((companion) => companion.is_active)?.id ?? companions[0]?.id ?? null;

  return {
    companions,
    maxSlots,
    activeCompanionId,
    error: companionsResult.error?.message ?? slotsResult.error?.message ?? null
  };
};
