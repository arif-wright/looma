import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { createSupabaseServerClient } from '$lib/server/supabase';

export const GET: RequestHandler = async (event) => {
  const { supabase, session } = await createSupabaseServerClient(event);
  if (!session) {
    return json({ error: 'unauthorized' }, { status: 401 });
  }

  const { data: maxSlotsResult, error: slotsError } = await supabase.rpc('ensure_slots');
  if (slotsError) {
    console.error('[companions:list] ensure_slots failed', slotsError);
  }

  const { data, error } = await supabase
    .from('companions')
    .select(
      'id,name,species,rarity,affection,trust,energy,mood,state,is_active,slot_index,created_at,stats:companion_stats(companion_id,care_streak,fed_at,played_at,groomed_at,last_passive_tick,last_daily_bonus_at,bond_level,bond_score)'
    )
    .eq('owner_id', session.user.id)
    .order('slot_index', { ascending: true, nullsFirst: false })
    .order('created_at', { ascending: true });

  if (error) {
    return json({ error: error.message ?? 'companions_fetch_failed' }, { status: 400 });
  }

  const maxSlots = typeof maxSlotsResult === 'number' && Number.isFinite(maxSlotsResult) ? maxSlotsResult : 3;

  return json({ items: data ?? [], maxSlots });
};
