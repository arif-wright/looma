import type { SupabaseClient } from '@supabase/supabase-js';

export type CompanionHealthSummary = {
  totalCompanions: number;
  avgBondLevel: number;
  avgRitualsToday: number;
  lastPassiveTick: string | null;
};

const todayKey = () => new Date().toISOString().slice(0, 10);

export const getCompanionHealthSummary = async (client: SupabaseClient): Promise<CompanionHealthSummary> => {
  let totalCompanions = 0;
  let avgBondLevel = 0;
  let avgRitualsToday = 0;
  let lastPassiveTick: string | null = null;

  try {
    const { count, error } = await client.from('companions').select('id', { count: 'exact', head: true });
    if (error) {
      console.error('[admin] companion count failed', error);
    } else {
      totalCompanions = count ?? 0;
    }
  } catch (err) {
    console.error('[admin] companion count threw', err);
  }

  try {
    const { data, error } = await client
      .from('companion_stats')
      .select('avg_level:avg(bond_level), max_tick:max(last_passive_tick)')
      .maybeSingle();
    if (error) {
      console.error('[admin] companion stats aggregate failed', error);
    } else if (data) {
      avgBondLevel = typeof data.avg_level === 'number' ? data.avg_level : Number(data.avg_level ?? 0);
      lastPassiveTick = (data.max_tick as string | null) ?? null;
    }
  } catch (err) {
    console.error('[admin] companion stats aggregate threw', err);
  }

  try {
    const today = todayKey();
    const { data, error } = await client
      .from('companion_rituals')
      .select('owner_id, completed')
      .eq('ritual_date', today);
    if (error) {
      console.error('[admin] ritual sample failed', error);
    } else if (Array.isArray(data) && data.length) {
      const owners = new Set<string>();
      let completed = 0;
      for (const row of data) {
        if (row?.owner_id) owners.add(row.owner_id as string);
        if (row?.completed) completed += 1;
      }
      const playerCount = owners.size;
      if (playerCount > 0) {
        avgRitualsToday = completed / playerCount;
      }
    }
  } catch (err) {
    console.error('[admin] ritual sample threw', err);
  }

  return {
    totalCompanions,
    avgBondLevel,
    avgRitualsToday,
    lastPassiveTick
  };
};
