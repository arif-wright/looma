import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { createSupabaseServerClient } from '$lib/server/supabase';
import { serviceClient } from '$lib/server/admin';
import { MODERATION_CACHE_HEADERS, isUuid, requireModerator } from '$lib/server/moderation';
import { applyModerationAction, parseModerationActionType } from '$lib/server/moderation/actions';

type ActionPayload = {
  userId?: string;
  action?: 'warn' | 'mute' | 'suspend' | 'ban' | 'message_delete' | 'circle_kick';
  durationMinutes?: number;
  reason?: string;
  targetId?: string;
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

  let body: ActionPayload;
  try {
    body = await event.request.json();
  } catch {
    return json({ error: 'bad_request' }, { status: 400, headers: MODERATION_CACHE_HEADERS });
  }

  const userId = typeof body.userId === 'string' ? body.userId : null;
  const action = parseModerationActionType(body.action);
  const reason = typeof body.reason === 'string' ? body.reason.trim().slice(0, 500) : '';
  const targetId = typeof body.targetId === 'string' ? body.targetId : null;

  if (!isUuid(userId) || !action || !reason) {
    return json({ error: 'bad_request', message: 'userId, action, and reason are required.' }, { status: 400, headers: MODERATION_CACHE_HEADERS });
  }

  const admin = serviceClient();
  const result = await applyModerationAction(admin, {
    actorId: session.user.id,
    userId,
    action,
    reason,
    targetId,
    durationMinutes: body.durationMinutes ?? null
  });

  if (!result.ok) {
    return json({ error: result.code, message: result.message }, { status: result.status, headers: MODERATION_CACHE_HEADERS });
  }

  return json({ ok: true, actionId: result.actionId }, { headers: MODERATION_CACHE_HEADERS });
};
