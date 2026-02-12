import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { supabaseServer } from '$lib/supabaseClient';
import { SAFE_LOAD_MESSAGE, SAFE_UNAUTHORIZED_MESSAGE } from '$lib/safeMessages';
import { validateMissionComplete } from '$lib/server/missions/validation';
import type { MissionSessionRow } from '$lib/server/missions/types';
import { parseMissionDefinition } from '$lib/server/missions/config';
import { grantMissionRewards } from '$lib/server/missions/grant';
import { ingestServerEvent } from '$lib/server/events/ingest';
import { getPlayerStats } from '$lib/server/queries/getPlayerStats';
import { getActiveCompanionBond } from '$lib/server/companions/bonds';
import { computeEffectiveEnergyMax } from '$lib/player/energy';
import { getConsentFlags } from '$lib/server/consent';
import {
  sanitizeIdentityResult,
  writeIdentityResultToPortableState
} from '$lib/server/missions/identityResult';
import { enforceMissionRateLimit, getMissionCaps } from '$lib/server/missions/rate';

export const POST: RequestHandler = async (event) => {
  const supabase = supabaseServer(event);
  const clientIp = typeof event.getClientAddress === 'function' ? event.getClientAddress() : null;
  const {
    data: { user },
    error: authError
  } = await supabase.auth.getUser();

  if (authError) {
    console.error('[api/missions/complete] auth.getUser failed', authError);
    return json({ error: 'bad_request', message: SAFE_LOAD_MESSAGE }, { status: 400 });
  }

  if (!user) {
    return json({ error: 'unauthorized', message: SAFE_UNAUTHORIZED_MESSAGE }, { status: 401 });
  }

  const rateResult = enforceMissionRateLimit('complete', user.id, clientIp);
  if (!rateResult.ok) {
    return json(
      { error: rateResult.code, message: rateResult.message, retryAfter: rateResult.retryAfter },
      { status: rateResult.status }
    );
  }

  const body = await event.request.json().catch(() => ({}));
  const sessionId = typeof body?.sessionId === 'string' ? body.sessionId : null;
  const requestIdempotencyKey =
    typeof body?.idempotencyKey === 'string' && body.idempotencyKey.trim().length > 0
      ? body.idempotencyKey.trim()
      : null;
  const localIdentityResult = sanitizeIdentityResult(body?.identityResult);
  const suppressMemory = body?.suppressMemory === true;
  const suppressAdaptation = body?.suppressAdaptation === true;
  const suppressReactions = body?.suppressReactions === true;
  if (!sessionId) {
    return json({ error: 'session_id_required', message: 'Session id is required.' }, { status: 400 });
  }

  const { data: sessionRow, error: sessionError } = await supabase
    .from('mission_sessions')
    .select('id, mission_id, user_id, mission_type, status, cost_json, rewards_json, idempotency_key, started_at, completed_at')
    .eq('id', sessionId)
    .maybeSingle();

  if (sessionError) {
    console.error('[api/missions/complete] session lookup failed', sessionError);
    return json({ error: 'bad_request', message: SAFE_LOAD_MESSAGE }, { status: 400 });
  }

  const sessionRecord = (sessionRow as MissionSessionRow | null) ?? null;
  if (sessionRecord?.id && sessionRecord.user_id === user.id && sessionRecord.status === 'completed') {
    const existingRewards =
      sessionRecord.rewards_json ?? sessionRecord.rewards ?? { xpGranted: 0, energyGranted: 0 };
    return json({
      ok: true,
      idempotent: true,
      sessionId: sessionRecord.id,
      status: sessionRecord.status,
      completedAt: sessionRecord.completed_at,
      rewardsGranted: existingRewards,
      session: sessionRecord,
      rewards: existingRewards
    });
  }

  const completionValidation = validateMissionComplete({ id: user.id }, sessionRecord);
  if (!completionValidation.ok) {
    return json({ error: completionValidation.code, message: completionValidation.message }, { status: completionValidation.status });
  }
  const activeSession = sessionRecord as MissionSessionRow;

  const { data: missionRow, error: missionError } = await supabase
    .from('missions')
    .select(
      'id, owner_id, title, summary, difficulty, status, energy_reward, xp_reward, type, cost, requirements, cooldown_ms, privacy_tags'
    )
    .eq('id', activeSession.mission_id)
    .maybeSingle();

  if (missionError) {
    console.error('[api/missions/complete] mission lookup failed', missionError);
    return json({ error: 'bad_request', message: SAFE_LOAD_MESSAGE }, { status: 400 });
  }

  const mission = missionRow ? parseMissionDefinition(missionRow as Record<string, unknown>) : null;
  if (!mission) {
    return json({ error: 'mission_not_found', message: 'Mission not found.' }, { status: 404 });
  }

  if (mission.type === 'action') {
    const caps = getMissionCaps();
    const now = Date.now();
    const hourWindowStartIso = new Date(now - 60 * 60 * 1000).toISOString();
    const dayWindowStartIso = new Date(now - 24 * 60 * 60 * 1000).toISOString();

    const [hourlyRewards, dailyRewards] = await Promise.all([
      supabase
        .from('mission_sessions')
        .select('id', { head: true, count: 'exact' })
        .eq('user_id', user.id)
        .eq('mission_type', 'action')
        .eq('status', 'completed')
        .gte('completed_at', hourWindowStartIso),
      supabase
        .from('mission_sessions')
        .select('id', { head: true, count: 'exact' })
        .eq('user_id', user.id)
        .eq('mission_type', 'action')
        .eq('status', 'completed')
        .gte('completed_at', dayWindowStartIso)
    ]);

    if (hourlyRewards.error || dailyRewards.error) {
      console.error('[api/missions/complete] reward cap check failed', {
        hourlyError: hourlyRewards.error,
        dailyError: dailyRewards.error
      });
      return json({ error: 'bad_request', message: SAFE_LOAD_MESSAGE }, { status: 400 });
    }

    if (typeof hourlyRewards.count === 'number' && hourlyRewards.count >= caps.actionRewardsPerHour) {
      return json(
        {
          error: 'cap_mission_rewards_hourly',
          message: 'Action mission reward cap reached for this hour. Please try again soon.'
        },
        { status: 429 }
      );
    }

    if (typeof dailyRewards.count === 'number' && dailyRewards.count >= caps.actionRewardsPerDay) {
      return json(
        {
          error: 'cap_mission_rewards_daily',
          message: 'Action mission reward cap reached for today. Please come back tomorrow.'
        },
        { status: 429 }
      );
    }
  }

  const timingValidation = validateMissionComplete({ id: user.id }, activeSession, mission);
  if (!timingValidation.ok) {
    return json({ error: timingValidation.code, message: timingValidation.message }, { status: timingValidation.status });
  }

  const consent = await getConsentFlags(event, supabase);
  const identitySuppressed =
    suppressMemory ||
    suppressAdaptation ||
    !consent.memory ||
    !consent.adaptation;

  const [stats, bond] = await Promise.all([
    getPlayerStats(event, supabase).catch(() => null),
    getActiveCompanionBond(user.id, supabase).catch(() => null)
  ]);
  const energyCapBase = stats?.energy_max ?? null;
  const missionEnergyBonus = bond?.bonus?.missionEnergyBonus ?? 0;
  const energyCap =
    typeof energyCapBase === 'number'
      ? computeEffectiveEnergyMax(energyCapBase, missionEnergyBonus)
      : null;

  const completionIdempotencyKey = requestIdempotencyKey ?? `mission-complete:${activeSession.id}`;
  const grantResult = await grantMissionRewards({
    supabase,
    userId: user.id,
    xp: mission.xp_reward ?? 0,
    energy: mission.energy_reward ?? 0,
    energyCap,
    source: `mission.complete:${mission.id}`,
    idempotencyKey: completionIdempotencyKey,
    meta: {
      missionId: mission.id,
      missionSessionId: activeSession.id,
      missionType: mission.type
    }
  });

  if (!grantResult.ok) {
    return json({ error: grantResult.code, message: grantResult.message }, { status: grantResult.status });
  }

  const rewardsSnapshot = {
    xpGranted: grantResult.xpGranted,
    energyGranted: grantResult.energyGranted
  };

  const completedAt = new Date().toISOString();
  const { data: session, error: updateError } = await supabase
    .from('mission_sessions')
    .update({
      mission_type: mission.type,
      status: 'completed',
      completed_at: completedAt,
      rewards: rewardsSnapshot,
      rewards_json: rewardsSnapshot,
      idempotency_key: activeSession.idempotency_key ?? completionIdempotencyKey
    })
    .eq('id', activeSession.id)
    .eq('user_id', user.id)
    .eq('status', 'active')
    .select('id, mission_id, user_id, mission_type, status, cost_json, rewards_json, idempotency_key, started_at, completed_at')
    .maybeSingle();

  if (updateError) {
    console.error('[api/missions/complete] session update failed', updateError);
    return json({ error: 'bad_request', message: SAFE_LOAD_MESSAGE }, { status: 400 });
  }

  let finalizedSession = session;
  if (!finalizedSession) {
    const { data: latestSession, error: latestSessionError } = await supabase
      .from('mission_sessions')
      .select('id, mission_id, user_id, mission_type, status, cost_json, rewards_json, idempotency_key, started_at, completed_at')
      .eq('id', activeSession.id)
      .eq('user_id', user.id)
      .maybeSingle();

    if (latestSessionError) {
      console.error('[api/missions/complete] post-update session lookup failed', latestSessionError);
      return json({ error: 'bad_request', message: SAFE_LOAD_MESSAGE }, { status: 400 });
    }

    const resolvedSession = (latestSession as MissionSessionRow | null) ?? null;
    if (resolvedSession?.status !== 'completed') {
      return json({ error: 'session_not_active', message: 'Mission session is not active.' }, { status: 409 });
    }
    finalizedSession = resolvedSession;
  }

  let identityStored = false;
  if (mission.type === 'identity' && localIdentityResult && !identitySuppressed) {
    const store = await writeIdentityResultToPortableState({
      supabase,
      userId: user.id,
      result: localIdentityResult,
      source: 'mission_identity'
    });
    if (!store.ok) {
      console.error('[api/missions/complete] identity portable_state write failed', store.error);
    } else {
      identityStored = true;
    }
  }

  await ingestServerEvent(
    event,
    'mission.complete',
    {
      missionId: mission.id,
      sessionId: finalizedSession.id,
      missionType: mission.type,
      rewardsGranted: {
        xpGranted: grantResult.xpGranted,
        energyGranted: grantResult.energyGranted
      },
      idempotencyKey: completionIdempotencyKey
    },
    { sessionId: finalizedSession.id }
  );

  if (mission.type === 'identity' && localIdentityResult) {
    await ingestServerEvent(
      event,
      'identity.complete',
      {
        missionId: mission.id,
        sessionId: finalizedSession.id,
        result: localIdentityResult,
        stored: identityStored
      },
      {
        sessionId: finalizedSession.id,
        suppressMemory: identitySuppressed,
        suppressAdaptation: identitySuppressed,
        suppressReactions: suppressReactions || !consent.reactions
      }
    );
  }

  return json({
    ok: true,
    sessionId: finalizedSession.id,
    status: finalizedSession.status,
    completedAt: finalizedSession.completed_at,
    session: finalizedSession,
    rewardsGranted: {
      xpGranted: grantResult.xpGranted,
      energyGranted: grantResult.energyGranted
    },
    idempotencyKey: completionIdempotencyKey,
    identity: {
      result: localIdentityResult,
      stored: identityStored,
      suppressed: identitySuppressed
    }
  });
};
