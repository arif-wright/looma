import type { RequestEvent } from '@sveltejs/kit';
import type { SupabaseClient } from '@supabase/supabase-js';
import { supabaseServer } from '$lib/supabaseClient';

export type PlayerStats = {
  id: string;
  level: number | null;
  xp: number | null;
  xp_next: number | null;
  energy: number | null;
  energy_max: number | null;
  bonded_count: number;
  triad_species_count: number;
  missions_completed: number;
};

export async function getPlayerStats(
  event: RequestEvent,
  client?: SupabaseClient
): Promise<PlayerStats | null> {
  const supabase = client ?? event.locals.supabase ?? supabaseServer(event);
  const user = event.locals.user ?? (await supabase.auth.getUser()).data.user ?? null;

  if (!user) return null;

  const { data, error } = await supabase
    .from('player_stats')
    .select('*')
    .eq('id', user.id)
    .single();

  if (error) {
    console.error('getPlayerStats error', error);
    return null;
  }

  return data as PlayerStats;
}
