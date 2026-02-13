import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { createSupabaseServerClient } from '$lib/server/supabase';
import { serviceClient } from '$lib/server/admin';
import { MODERATION_CACHE_HEADERS, isUuid, requireModerator } from '$lib/server/moderation';
import { applyModerationAction, parseModerationActionType } from '$lib/server/moderation/actions';

type ResolvePayload = {
  caseId?: string;
  resolution?: string;
  action?: {
    action?: 'warn' | 'mute' | 'suspend' | 'ban' | 'message_delete' | 'circle_kick';
    userId?: string;
    durationMinutes?: number;
    targetId?: string;
    reason?: string;
  } | null;
};

export const POST: RequestHandler = async (event) => {
  const { supabase, session } = await createSupabaseServerClient(event);
  if (!session) {
    return json({ error: 'unauthorized' }, { status: 401, headers: MODERATION_CACHE_HEADERS });
  }

  const auth = await requireModerator(supabase, session.user.id, session.user.email ?? null);
  if (!auth.ok) {
    return json({ error: 'forbidden' }, { status: 403, headers: MODERATION_CACHE_HEADERS });
  }

  let body: ResolvePayload;
  try {
    body = await event.request.json();
  } catch {
    return json({ error: 'bad_request' }, { status: 400, headers: MODERATION_CACHE_HEADERS });
  }

  const caseId = typeof body.caseId === 'string' ? body.caseId : null;
  const resolution = typeof body.resolution === 'string' ? body.resolution.trim().slice(0, 1000) : '';

  if (!isUuid(caseId) || !resolution) {
    return json({ error: 'bad_request', message: 'caseId and resolution are required.' }, { status: 400, headers: MODERATION_CACHE_HEADERS });
  }

  const admin = serviceClient();
  let actionId: string | null = null;

  if (body.action) {
    const actionType = parseModerationActionType(body.action.action);
    const actionUserId = typeof body.action.userId === 'string' ? body.action.userId : null;
    const actionReason =
      typeof body.action.reason === 'string' && body.action.reason.trim().length > 0
        ? body.action.reason.trim().slice(0, 500)
        : resolution;

    if (!actionType || !isUuid(actionUserId)) {
      return json(
        { error: 'bad_request', message: 'Valid action.userId and action.action are required.' },
        { status: 400, headers: MODERATION_CACHE_HEADERS }
      );
    }

    const result = await applyModerationAction(admin, {
      actorId: session.user.id,
      userId: actionUserId,
      action: actionType,
      reason: actionReason,
      targetId: typeof body.action.targetId === 'string' ? body.action.targetId : null,
      durationMinutes: body.action.durationMinutes ?? null
    });

    if (!result.ok) {
      return json({ error: result.code, message: result.message }, { status: result.status, headers: MODERATION_CACHE_HEADERS });
    }

    actionId = result.actionId;
  }

  const nextStatus = body.action ? 'resolved' : 'dismissed';
  const { error } = await admin
    .from('moderation_cases')
    .update({
      status: nextStatus,
      resolution,
      assigned_to: session.user.id
    })
    .eq('id', caseId);

  if (error) {
    return json({ error: error.message }, { status: 400, headers: MODERATION_CACHE_HEADERS });
  }

  return json({ ok: true, caseId, status: nextStatus, actionId }, { headers: MODERATION_CACHE_HEADERS });
};
