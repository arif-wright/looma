import { error } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import { requireUserServer } from '$lib/server/auth';
import { getPlayerStats } from '$lib/server/queries/getPlayerStats';
import { parseMissionDefinition } from '$lib/server/missions/config';
import type { MissionSessionRow } from '$lib/server/missions/types';

const MISSION_SELECT =
  'id, owner_id, title, summary, difficulty, status, energy_reward, xp_reward, type, cost, requirements, requires, min_level, tags, weight, cooldown_ms, privacy_tags';

const SESSION_SELECT =
  'id, mission_id, mission_type, status, started_at, completed_at, cost_json, rewards_json, idempotency_key';

export const load: PageServerLoad = async (event) => {
  const parent = await event.parent();
  const { supabase, user } = await requireUserServer(event);
  const missionId = event.params.id;

  const [missionRes, activeRes, completedRes, stats] = await Promise.all([
    supabase.from('missions').select(MISSION_SELECT).eq('id', missionId).maybeSingle(),
    supabase
      .from('mission_sessions')
      .select(SESSION_SELECT)
      .eq('user_id', user.id)
      .eq('mission_id', missionId)
      .eq('status', 'active')
      .order('started_at', { ascending: false })
      .limit(1)
      .maybeSingle(),
    supabase
      .from('mission_sessions')
      .select(SESSION_SELECT)
      .eq('user_id', user.id)
      .eq('mission_id', missionId)
      .eq('status', 'completed')
      .order('completed_at', { ascending: false })
      .limit(1)
      .maybeSingle(),
    getPlayerStats(event, supabase)
  ]);

  const mission = missionRes.data ? parseMissionDefinition(missionRes.data as Record<string, unknown>) : null;

  if (!mission) {
    throw error(404, 'Mission not found');
  }

  return {
    activeCompanion: parent.activeCompanion ?? null,
    mission,
    stats: stats ?? null,
    activeSession: (activeRes.data as MissionSessionRow | null) ?? null,
    completedSession: (completedRes.data as MissionSessionRow | null) ?? null
  };
};
