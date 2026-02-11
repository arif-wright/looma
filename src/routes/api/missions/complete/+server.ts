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

export const POST: RequestHandler = async (event) => {
  const supabase = supabaseServer(event);
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

  const body = await event.request.json().catch(() => ({}));
  const sessionId = typeof body?.sessionId === 'string' ? body.sessionId : null;
  const localIdentityResult = sanitizeIdentityResult(body?.identityResult);
  const suppressMemory = body?.suppressMemory === true;
  const suppressAdaptation = body?.suppressAdaptation === true;
  const suppressReactions = body?.suppressReactions === true;
  if (!sessionId) {
    return json({ error: 'session_id_required', message: 'Session id is required.' }, { status: 400 });
  }

  const { data: sessionRow, error: sessionError } = await supabase
    .from('mission_sessions')
    .select('id, mission_id, user_id, status, cost_snapshot, started_at, completed_at')
    .eq('id', sessionId)
    .maybeSingle();

  if (sessionError) {
    console.error('[api/missions/complete] session lookup failed', sessionError);
    return json({ error: 'bad_request', message: SAFE_LOAD_MESSAGE }, { status: 400 });
  }

  const completionValidation = validateMissionComplete(
    { id: user.id },
    (sessionRow as MissionSessionRow | null) ?? null
  );
  if (!completionValidation.ok) {
    return json(
      { error: completionValidation.code, message: completionValidation.message },
      { status: completionValidation.status }
    );
  }
  const activeSession = sessionRow as MissionSessionRow;

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

  const consent = await getConsentFlags(event, supabase);
  const identitySuppressed =
    suppressMemory ||
    suppressAdaptation ||
    !consent.memory ||
    !consent.adaptation;

  const { data: session, error: updateError } = await supabase
    .from('mission_sessions')
    .update({
      status: 'completed',
      completed_at: new Date().toISOString()
    })
    .eq('id', sessionId)
    .eq('user_id', user.id)
    .eq('status', 'started')
    .select('id, mission_id, user_id, status, cost_snapshot, started_at, completed_at')
    .single();

  if (updateError || !session) {
    console.error('[api/missions/complete] session update failed', updateError);
    return json({ error: 'bad_request', message: SAFE_LOAD_MESSAGE }, { status: 400 });
  }

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

  const grantResult = await grantMissionRewards({
    supabase,
    userId: user.id,
    xp: mission.xp_reward ?? 0,
    energy: mission.energy_reward ?? 0,
    energyCap
  });

  if (!grantResult.ok) {
    await supabase
      .from('mission_sessions')
      .update({
        status: 'started',
        completed_at: null
      })
      .eq('id', session.id)
      .eq('user_id', user.id);
    return json({ error: grantResult.code, message: grantResult.message }, { status: grantResult.status });
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
      sessionId: session.id,
      missionType: mission.type,
      rewards: {
        xpGranted: grantResult.xpGranted,
        energyGranted: grantResult.energyGranted
      }
    },
    { sessionId: session.id }
  );

  if (mission.type === 'identity' && localIdentityResult) {
    await ingestServerEvent(
      event,
      'identity.complete',
      {
        missionId: mission.id,
        sessionId: session.id,
        result: localIdentityResult,
        stored: identityStored
      },
      {
        sessionId: session.id,
        suppressMemory: identitySuppressed,
        suppressAdaptation: identitySuppressed,
        suppressReactions: suppressReactions || !consent.reactions
      }
    );
  }

  return json({
    ok: true,
    session,
    rewards: {
      xpGranted: grantResult.xpGranted,
      energyGranted: grantResult.energyGranted
    },
    identity: {
      result: localIdentityResult,
      stored: identityStored,
      suppressed: identitySuppressed
    }
  });
};
