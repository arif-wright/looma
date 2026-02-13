import type { SupabaseClient } from '@supabase/supabase-js';
import { isUuid, parseDurationMinutes } from '$lib/server/moderation';
import { applyTrustDelta } from '$lib/server/trust';

export type ModerationActionType =
  | 'warn'
  | 'mute'
  | 'suspend'
  | 'ban'
  | 'message_delete'
  | 'circle_kick';

export type ApplyModerationActionInput = {
  actorId: string;
  userId: string;
  action: ModerationActionType;
  reason: string;
  targetId?: string | null;
  durationMinutes?: number | null;
};

const nowIso = () => new Date().toISOString();
const TRUST_DELTAS: Record<ModerationActionType, number> = {
  warn: -3,
  mute: -8,
  suspend: -20,
  ban: -40,
  message_delete: 0,
  circle_kick: 0
};

export const parseModerationActionType = (value: unknown): ModerationActionType | null => {
  if (
    value === 'warn' ||
    value === 'mute' ||
    value === 'suspend' ||
    value === 'ban' ||
    value === 'message_delete' ||
    value === 'circle_kick'
  ) {
    return value;
  }
  return null;
};

export const applyModerationAction = async (
  adminSupabase: SupabaseClient,
  input: ApplyModerationActionInput
): Promise<{ ok: true; actionId: string } | { ok: false; status: number; code: string; message: string }> => {
  const reason = input.reason.trim();
  if (!reason) {
    return { ok: false, status: 400, code: 'bad_request', message: 'Reason is required.' };
  }

  const targetId = input.targetId ?? null;
  const now = nowIso();
  let durationMinutes: number | null = null;

  if (input.action === 'mute' || input.action === 'suspend') {
    durationMinutes = parseDurationMinutes(input.durationMinutes ?? 60, 60);
  }

  if (input.action === 'message_delete') {
    if (!isUuid(targetId)) {
      return { ok: false, status: 400, code: 'bad_request', message: 'targetId message id is required.' };
    }

    await adminSupabase
      .from('messages')
      .update({ deleted_at: now })
      .eq('id', targetId)
      .is('deleted_at', null);
  }

  if (input.action === 'circle_kick') {
    if (!isUuid(targetId)) {
      return { ok: false, status: 400, code: 'bad_request', message: 'targetId circle id is required.' };
    }

    const { data: circle } = await adminSupabase
      .from('circles')
      .select('conversation_id')
      .eq('id', targetId)
      .maybeSingle<{ conversation_id: string | null }>();

    await adminSupabase
      .from('circle_members')
      .delete()
      .eq('circle_id', targetId)
      .eq('user_id', input.userId);

    if (circle?.conversation_id) {
      await adminSupabase
        .from('conversation_members')
        .delete()
        .eq('conversation_id', circle.conversation_id)
        .eq('user_id', input.userId);
    }
  }

  if (input.action === 'mute') {
    const until = new Date(Date.now() + (durationMinutes ?? 60) * 60_000).toISOString();
    await adminSupabase.from('user_preferences').upsert(
      {
        user_id: input.userId,
        moderation_status: 'muted',
        moderation_until: until
      },
      { onConflict: 'user_id', ignoreDuplicates: false }
    );
  }

  if (input.action === 'suspend') {
    const until = new Date(Date.now() + (durationMinutes ?? 60) * 60_000).toISOString();
    await adminSupabase.from('user_preferences').upsert(
      {
        user_id: input.userId,
        moderation_status: 'suspended',
        moderation_until: until
      },
      { onConflict: 'user_id', ignoreDuplicates: false }
    );
  }

  if (input.action === 'ban') {
    await adminSupabase.from('user_preferences').upsert(
      {
        user_id: input.userId,
        moderation_status: 'banned',
        moderation_until: null
      },
      { onConflict: 'user_id', ignoreDuplicates: false }
    );
  }

  const { data: actionRow, error: actionError } = await adminSupabase
    .from('moderation_actions')
    .insert({
      user_id: input.userId,
      action: input.action,
      target_id: targetId,
      duration_minutes: durationMinutes,
      reason,
      created_by: input.actorId
    })
    .select('id')
    .maybeSingle<{ id: string }>();

  if (actionError || !actionRow?.id) {
    return {
      ok: false,
      status: 400,
      code: 'bad_request',
      message: actionError?.message ?? 'Failed to insert moderation action.'
    };
  }

  const trustDelta = TRUST_DELTAS[input.action];
  if (trustDelta !== 0) {
    await applyTrustDelta(adminSupabase, input.userId, input.action, trustDelta, {
      moderationActionId: actionRow.id,
      createdBy: input.actorId,
      reason
    });
  }

  return { ok: true, actionId: actionRow.id };
};
