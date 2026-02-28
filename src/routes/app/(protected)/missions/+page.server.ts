import type { PageServerLoad } from './$types';
import { requireUserServer } from '$lib/server/auth';
import { getPlayerStats } from '$lib/server/queries/getPlayerStats';
import { parseMissionDefinition } from '$lib/server/missions/config';
import type { MissionDefinition, MissionSessionRow } from '$lib/server/missions/types';

const MISSION_SELECT =
  'id, owner_id, title, summary, difficulty, status, energy_reward, xp_reward, type, cost, requirements, requires, min_level, tags, weight, cooldown_ms, privacy_tags, created_at';

const SESSION_SELECT =
  'id, mission_id, mission_type, status, started_at, completed_at, cost_json, rewards_json';

type MissionCard = MissionDefinition & {
  created_at?: string | null;
};

const byCreatedDesc = (a: MissionCard, b: MissionCard) =>
  Date.parse(b.created_at ?? '') - Date.parse(a.created_at ?? '');

export const load: PageServerLoad = async (event) => {
  const parent = await event.parent();
  const { supabase, user } = await requireUserServer(event);

  const [stats, availableRes, activeRes, recentRes] = await Promise.all([
    getPlayerStats(event, supabase),
    supabase.from('missions').select(MISSION_SELECT).eq('status', 'available').limit(32),
    supabase
      .from('mission_sessions')
      .select(SESSION_SELECT)
      .eq('user_id', user.id)
      .eq('status', 'active')
      .order('started_at', { ascending: false })
      .limit(8),
    supabase
      .from('mission_sessions')
      .select(SESSION_SELECT)
      .eq('user_id', user.id)
      .eq('status', 'completed')
      .order('completed_at', { ascending: false })
      .limit(8)
  ]);

  const activeSessions = ((activeRes.data ?? []) as MissionSessionRow[]) ?? [];
  const recentSessions = ((recentRes.data ?? []) as MissionSessionRow[]) ?? [];

  const missionIds = Array.from(
    new Set(
      [...activeSessions, ...recentSessions]
        .map((row) => row.mission_id)
        .filter((value): value is string => typeof value === 'string' && value.length > 0)
    )
  );

  const lookupRes =
    missionIds.length > 0
      ? await supabase.from('missions').select(MISSION_SELECT).in('id', missionIds)
      : { data: [] as Record<string, unknown>[] };

  const missionById = new Map<string, MissionCard>();

  for (const row of ((availableRes.data ?? []) as Record<string, unknown>[]).filter(Boolean)) {
    const mission = parseMissionDefinition(row);
    if (mission) {
      missionById.set(mission.id, {
        ...mission,
        created_at: typeof row.created_at === 'string' ? row.created_at : null
      });
    }
  }

  for (const row of ((lookupRes.data ?? []) as Record<string, unknown>[]).filter(Boolean)) {
    const mission = parseMissionDefinition(row);
    if (mission) {
      missionById.set(mission.id, {
        ...mission,
        created_at: typeof row.created_at === 'string' ? row.created_at : null
      });
    }
  }

  const activeMissionIds = new Set(activeSessions.map((row) => row.mission_id));

  const activeMissions = activeSessions
    .map((session) => {
      const mission = missionById.get(session.mission_id);
      if (!mission) return null;
      return { mission, session };
    })
    .filter((entry): entry is { mission: MissionCard; session: MissionSessionRow } => Boolean(entry));

  const availableMissions = Array.from(missionById.values())
    .filter((mission) => !activeMissionIds.has(mission.id) && mission.status === 'available')
    .sort(byCreatedDesc)
    .slice(0, 18);

  const recentCompletions = recentSessions
    .map((session) => {
      const mission = missionById.get(session.mission_id);
      if (!mission) return null;
      return { mission, session };
    })
    .filter((entry): entry is { mission: MissionCard; session: MissionSessionRow } => Boolean(entry));

  return {
    stats: stats ?? null,
    activeCompanion: parent.activeCompanion ?? null,
    activeMissions,
    availableMissions,
    recentCompletions
  };
};
