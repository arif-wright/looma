import type { PageServerLoad } from './$types';
import { getPlayerStats } from '$lib/server/queries/getPlayerStats';
import { requireUserServer } from '$lib/server/auth';

export const load: PageServerLoad = async (event) => {
  const parent = await event.parent();
  const { supabase, user } = await requireUserServer(event);

  try {
    const [stats, latestCheckinTodayRes, activeMissionRes, recentGameRes, memorySummaryRes] = await Promise.all([
      getPlayerStats(event, supabase),
      supabase
        .from('user_daily_checkins')
        .select('id, mood, checkin_date, created_at')
        .eq('user_id', user.id)
        .eq('checkin_date', new Date().toISOString().slice(0, 10))
        .limit(1)
        .maybeSingle(),
      supabase
        .from('mission_sessions')
        .select('id, mission_id, mission_type, started_at, mission:missions(title)')
        .eq('user_id', user.id)
        .eq('status', 'active')
        .order('started_at', { ascending: false })
        .limit(1)
        .maybeSingle(),
      supabase
        .from('game_sessions')
        .select('id, score, completed_at, game:game_titles(name, slug)')
        .eq('user_id', user.id)
        .eq('status', 'completed')
        .order('completed_at', { ascending: false })
        .limit(1)
        .maybeSingle(),
      parent.activeCompanion?.id
        ? supabase
            .from('companion_memory_summary')
            .select('summary_text, highlights_json, last_built_at')
            .eq('user_id', user.id)
            .eq('companion_id', parent.activeCompanion.id)
            .maybeSingle()
        : Promise.resolve({ data: null })
    ]);

    const activeMissionRaw = activeMissionRes.data as
      | {
          id: string;
          mission_id: string;
          mission_type: string | null;
          started_at: string | null;
          mission?: { title?: string | null } | Array<{ title?: string | null }> | null;
        }
      | null;
    const missionRef = Array.isArray(activeMissionRaw?.mission)
      ? (activeMissionRaw?.mission[0] ?? null)
      : (activeMissionRaw?.mission ?? null);
    const recentGameRaw = recentGameRes.data as
      | {
          id: string;
          score: number | null;
          completed_at: string | null;
          game?: { name?: string | null; slug?: string | null } | Array<{ name?: string | null; slug?: string | null }> | null;
        }
      | null;
    const gameRef = Array.isArray(recentGameRaw?.game)
      ? (recentGameRaw?.game[0] ?? null)
      : (recentGameRaw?.game ?? null);

    return {
      stats: stats ?? null,
      latestCheckinToday: latestCheckinTodayRes.data ?? null,
      activeMission: activeMissionRaw
        ? {
            id: activeMissionRaw.id,
            missionId: activeMissionRaw.mission_id,
            missionType: activeMissionRaw.mission_type,
            startedAt: activeMissionRaw.started_at,
            title: missionRef?.title ?? null
          }
        : null,
      recentGame: recentGameRaw
        ? {
            id: recentGameRaw.id,
            score: recentGameRaw.score,
            completedAt: recentGameRaw.completed_at,
            name: gameRef?.name ?? null,
            slug: gameRef?.slug ?? null
          }
        : null,
      memorySummary: memorySummaryRes.data ?? null
    };
  } catch (err) {
    console.error('dashboard load error', err);
    return {
      stats: null,
      latestCheckinToday: null,
      activeMission: null,
      recentGame: null,
      memorySummary: null
    };
  }
};
