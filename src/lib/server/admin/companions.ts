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
      .select('bond_level, last_passive_tick')
      .limit(5000);
    if (error) {
      console.error('[admin] companion stats aggregate failed', error);
    } else if (Array.isArray(data) && data.length > 0) {
      let levelTotal = 0;
      let levelCount = 0;
      let latestTick: string | null = null;
      for (const row of data) {
        const level = typeof row?.bond_level === 'number' ? row.bond_level : Number(row?.bond_level ?? NaN);
        if (Number.isFinite(level)) {
          levelTotal += level;
          levelCount += 1;
        }
        const tick = typeof row?.last_passive_tick === 'string' ? row.last_passive_tick : null;
        if (tick && (!latestTick || tick > latestTick)) {
          latestTick = tick;
        }
      }
      avgBondLevel = levelCount > 0 ? levelTotal / levelCount : 0;
      lastPassiveTick = latestTick;
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
