import type { SupabaseClient } from '@supabase/supabase-js';

type NotificationKind = 'reaction' | 'comment' | 'share';
type TargetKind = 'post' | 'comment';

export type NotificationParams = {
  actorId: string;
  userId: string;
  kind: NotificationKind;
  targetId: string;
  targetKind: TargetKind;
  metadata?: Record<string, unknown>;
};

export async function createNotification(
  supabase: SupabaseClient,
  params: NotificationParams
): Promise<void> {
  const { actorId, userId, kind, targetId, targetKind, metadata } = params;

  if (!actorId || !userId || actorId === userId) {
    return;
  }

  const insertPayload = {
    actor_id: actorId,
    user_id: userId,
    kind,
    target_id: targetId,
    target_kind: targetKind,
    metadata: metadata ?? {}
  };

  const { error } = await supabase.from('notifications').insert(insertPayload);
  if (error) {
    console.error('[notifications] failed to insert notification', error, insertPayload);
  }
}

export async function markNotificationsRead(
  supabase: SupabaseClient,
  userId: string,
  ids?: string[]
): Promise<void> {
  if (!userId) return;

  const query = supabase
    .from('notifications')
    .update({ read: true })
    .eq('user_id', userId)
    .eq('read', false);

  const finalQuery = Array.isArray(ids) && ids.length > 0 ? query.in('id', ids) : query;

  const { error } = await finalQuery;
  if (error) {
    console.error('[notifications] failed to mark notifications read', error, { userId, ids });
  }
}
