import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { supabaseServer } from '$lib/supabaseClient';
import { SAFE_LOAD_MESSAGE, SAFE_UNAUTHORIZED_MESSAGE } from '$lib/safeMessages';

const ACTIVE_SELECT =
  'id, mission_id, mission_type, status, started_at, completed_at, cost_json, rewards_json';

const RECENT_SELECT =
  'id, mission_id, mission_type, status, started_at, completed_at, rewards_json';

export const GET: RequestHandler = async (event) => {
  const supabase = supabaseServer(event);
  const {
    data: { user },
    error: authError
  } = await supabase.auth.getUser();

  if (authError) {
    console.error('[api/missions/sessions] auth.getUser failed', authError);
    return json({ error: 'bad_request', message: SAFE_LOAD_MESSAGE }, { status: 400 });
  }

  if (!user) {
    return json({ error: 'unauthorized', message: SAFE_UNAUTHORIZED_MESSAGE }, { status: 401 });
  }

  const mode = event.url.searchParams.get('status');
  const includeActive = !mode || mode === 'active';
  const includeRecent = !mode || mode === 'recent';

  const [activeRes, recentRes] = await Promise.all([
    includeActive
      ? supabase
          .from('mission_sessions')
          .select(ACTIVE_SELECT)
          .eq('user_id', user.id)
          .eq('status', 'active')
          .order('started_at', { ascending: false })
      : Promise.resolve({ data: [], error: null } as const),
    includeRecent
      ? supabase
          .from('mission_sessions')
          .select(RECENT_SELECT)
          .eq('user_id', user.id)
          .eq('status', 'completed')
          .order('completed_at', { ascending: false })
          .limit(20)
      : Promise.resolve({ data: [], error: null } as const)
  ]);

  if (activeRes.error || recentRes.error) {
    console.error('[api/missions/sessions] query failed', {
      activeError: activeRes.error,
      recentError: recentRes.error
    });
    return json({ error: 'bad_request', message: SAFE_LOAD_MESSAGE }, { status: 400 });
  }

  return json({
    ok: true,
    active: (activeRes.data ?? []).map((row: Record<string, any>) => ({
      sessionId: row.id,
      missionId: row.mission_id,
      missionType: row.mission_type,
      status: row.status,
      startedAt: row.started_at,
      completedAt: row.completed_at,
      cost: row.cost_json ?? null,
      rewards: row.rewards_json ?? null
    })),
    recent: (recentRes.data ?? []).map((row: Record<string, any>) => ({
      sessionId: row.id,
      missionId: row.mission_id,
      missionType: row.mission_type,
      status: row.status,
      startedAt: row.started_at,
      completedAt: row.completed_at,
      rewards: row.rewards_json ?? null
    }))
  });
};
