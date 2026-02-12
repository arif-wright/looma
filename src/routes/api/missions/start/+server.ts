import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { supabaseServer } from '$lib/supabaseClient';
import { SAFE_LOAD_MESSAGE, SAFE_UNAUTHORIZED_MESSAGE } from '$lib/safeMessages';
import { parseMissionDefinition } from '$lib/server/missions/config';
import { spend } from '$lib/server/missions/spend';
import { validateMissionStart } from '$lib/server/missions/validation';
import type { MissionSessionRow } from '$lib/server/missions/types';
import { getPlayerStats } from '$lib/server/queries/getPlayerStats';
import { ingestServerEvent } from '$lib/server/events/ingest';
import { grantMissionRewards } from '$lib/server/missions/grant';

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
  'requirements',
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
  const idempotencyKey =
    typeof body?.idempotencyKey === 'string' && body.idempotencyKey.trim().length > 0
      ? body.idempotencyKey.trim()
      : crypto.randomUUID();
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
    .select('id, mission_id, user_id, mission_type, status, cost_snapshot, cost, rewards, idempotency_key, started_at, completed_at')
    .eq('mission_id', mission.id)
    .eq('user_id', user.id)
    .order('started_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (lastSessionError) {
    console.error('[api/missions/start] last session lookup failed', lastSessionError);
    return json({ error: 'bad_request', message: SAFE_LOAD_MESSAGE }, { status: 400 });
  }

  const stats = await getPlayerStats(event, supabase).catch(() => null);
  const validated = validateMissionStart(
    { id: user.id },
    mission,
    (lastSessionRow as MissionSessionRow | null) ?? null,
    {
      level: typeof stats?.level === 'number' ? stats.level : 0,
      energy: typeof stats?.energy === 'number' ? stats.energy : 0
    }
  );
  if (!validated.ok) {
    return json({ error: validated.code, message: validated.message }, { status: validated.status });
  }

  // Identity missions must never spend resources.
  let energySpent = 0;
  if ((mission.type === 'action' || mission.type === 'world') && mission.cost) {
    const spendResult = await spend({
      supabase,
      userId: user.id,
      energy: mission.cost.energy ?? 0,
      source: `mission.start:${mission.id}`,
      idempotencyKey,
      meta: {
        missionId: mission.id,
        missionType: mission.type
      }
    });
    if (!spendResult.ok) {
      return json({ error: spendResult.code, message: spendResult.message }, { status: spendResult.status });
    }
    energySpent = spendResult.energySpent;
  }

  const { data: session, error: sessionError } = await supabase
    .from('mission_sessions')
    .insert({
      mission_id: mission.id,
      user_id: user.id,
      mission_type: mission.type,
      status: 'started',
      cost_snapshot: mission.cost,
      cost: mission.cost,
      rewards: null,
      idempotency_key: idempotencyKey,
      meta: {
        missionType: mission.type,
        privacyTags: mission.privacy_tags ?? [],
        idempotencyKey
      }
    })
    .select('id, mission_id, user_id, mission_type, status, cost_snapshot, cost, rewards, idempotency_key, started_at, completed_at')
    .single();

  if (sessionError || !session) {
    if ((sessionError as { code?: string | null } | null)?.code === '23505') {
      const { data: existingSession } = await supabase
        .from('mission_sessions')
        .select('id, mission_id, user_id, mission_type, status, cost_snapshot, cost, rewards, idempotency_key, started_at, completed_at')
        .eq('user_id', user.id)
        .eq('idempotency_key', idempotencyKey)
        .maybeSingle();

      if (existingSession) {
        return json({
          ok: true,
          idempotent: true,
          session: existingSession,
          mission: {
            id: mission.id,
            type: mission.type,
            cost: mission.cost,
            requirements: mission.requirements,
            cooldownMs: mission.cooldown_ms,
            privacyTags: mission.privacy_tags ?? []
          }
        });
      }
    }

    console.error('[api/missions/start] session insert failed', sessionError);
    if (energySpent > 0) {
      await grantMissionRewards({
        supabase,
        userId: user.id,
        xp: 0,
        energy: energySpent,
        source: `mission.start.refund:${mission.id}`,
        idempotencyKey: `refund:${idempotencyKey}`,
        meta: {
          missionId: mission.id,
          missionSessionId: null,
          reason: 'session_insert_failed'
        }
      });
    }
    return json({ error: 'bad_request', message: SAFE_LOAD_MESSAGE }, { status: 400 });
  }

  await ingestServerEvent(
    event,
    'mission.start',
    {
      missionId: mission.id,
      sessionId: session.id,
      missionType: mission.type,
      cost: mission.cost,
      requirements: mission.requirements,
      cooldownMs: mission.cooldown_ms ?? null,
      idempotencyKey
    },
    { sessionId: session.id }
  );

  return json({
    ok: true,
    session,
    mission: {
      id: mission.id,
      type: mission.type,
      cost: mission.cost,
      requirements: mission.requirements,
      cooldownMs: mission.cooldown_ms,
      privacyTags: mission.privacy_tags ?? []
    },
    idempotencyKey
  });
};
