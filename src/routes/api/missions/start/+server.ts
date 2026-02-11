import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { supabaseServer } from '$lib/supabaseClient';
import { SAFE_LOAD_MESSAGE, SAFE_UNAUTHORIZED_MESSAGE } from '$lib/safeMessages';
import { parseMissionDefinition } from '$lib/server/missions/config';
import { spend } from '$lib/server/missions/spend';
import { validateMissionStart } from '$lib/server/missions/validation';
import type { MissionSessionRow } from '$lib/server/missions/types';

const MISSION_SELECT = [
  'id',
  'owner_id',
  'title',
  'summary',
  'difficulty',
  'status',
  'energy_reward',
  'xp_reward',
  'type',
  'cost',
  'cooldown_ms',
  'privacy_tags'
].join(', ');

export const POST: RequestHandler = async (event) => {
  const supabase = supabaseServer(event);
  const {
    data: { user },
    error: authError
  } = await supabase.auth.getUser();

  if (authError) {
    console.error('[api/missions/start] auth.getUser failed', authError);
    return json({ error: 'bad_request', message: SAFE_LOAD_MESSAGE }, { status: 400 });
  }

  if (!user) {
    return json({ error: 'unauthorized', message: SAFE_UNAUTHORIZED_MESSAGE }, { status: 401 });
  }

  const body = await event.request.json().catch(() => ({}));
  const missionId = typeof body?.missionId === 'string' ? body.missionId : null;
  if (!missionId) {
    return json({ error: 'mission_id_required', message: 'Mission id is required.' }, { status: 400 });
  }

  const { data: missionRow, error: missionError } = await supabase
    .from('missions')
    .select(MISSION_SELECT)
    .eq('id', missionId)
    .maybeSingle();

  if (missionError) {
    console.error('[api/missions/start] mission lookup failed', missionError);
    return json({ error: 'bad_request', message: SAFE_LOAD_MESSAGE }, { status: 400 });
  }

  const mission = missionRow ? parseMissionDefinition(missionRow as Record<string, unknown>) : null;
  if (!mission) {
    return json({ error: 'mission_not_found', message: 'Mission not found.' }, { status: 404 });
  }

  const { data: lastSessionRow, error: lastSessionError } = await supabase
    .from('mission_sessions')
    .select('id, mission_id, user_id, status, cost_snapshot, started_at, completed_at')
    .eq('mission_id', mission.id)
    .eq('user_id', user.id)
    .order('started_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (lastSessionError) {
    console.error('[api/missions/start] last session lookup failed', lastSessionError);
    return json({ error: 'bad_request', message: SAFE_LOAD_MESSAGE }, { status: 400 });
  }

  const startValidation = validateMissionStart(
    { id: user.id },
    mission,
    (lastSessionRow as MissionSessionRow | null) ?? null
  );
  if (!startValidation.ok) {
    return json({ error: startValidation.code, message: startValidation.message }, { status: startValidation.status });
  }

  // Identity missions must never spend resources.
  if (mission.type === 'action' && mission.cost) {
    const spendResult = await spend({
      supabase,
      userId: user.id,
      energy: mission.cost.energy ?? 0
    });
    if (!spendResult.ok) {
      return json({ error: spendResult.code, message: spendResult.message }, { status: spendResult.status });
    }
  }

  const { data: session, error: sessionError } = await supabase
    .from('mission_sessions')
    .insert({
      mission_id: mission.id,
      user_id: user.id,
      status: 'started',
      cost_snapshot: mission.cost,
      meta: {
        missionType: mission.type,
        privacyTags: mission.privacy_tags ?? []
      }
    })
    .select('id, mission_id, user_id, status, cost_snapshot, started_at, completed_at')
    .single();

  if (sessionError || !session) {
    console.error('[api/missions/start] session insert failed', sessionError);
    return json({ error: 'bad_request', message: SAFE_LOAD_MESSAGE }, { status: 400 });
  }

  return json({
    ok: true,
    session,
    mission: {
      id: mission.id,
      type: mission.type,
      cost: mission.cost,
      cooldownMs: mission.cooldown_ms,
      privacyTags: mission.privacy_tags ?? []
    }
  });
};
