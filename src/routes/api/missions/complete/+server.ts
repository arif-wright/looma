import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { supabaseServer } from '$lib/supabaseClient';
import { SAFE_LOAD_MESSAGE, SAFE_UNAUTHORIZED_MESSAGE } from '$lib/safeMessages';
import { validateMissionComplete } from '$lib/server/missions/validation';
import type { MissionSessionRow } from '$lib/server/missions/types';

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

  return json({ ok: true, session });
};
