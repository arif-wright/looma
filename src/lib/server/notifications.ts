import type { SupabaseClient } from '@supabase/supabase-js';

type SocialNotificationKind = 'reaction' | 'comment' | 'share';
type AchievementNotificationKind = 'achievement_unlocked';

type NotificationKind = SocialNotificationKind | AchievementNotificationKind;
type TargetKind = 'post' | 'comment' | 'achievement';

export type NotificationParams = {
  actorId: string;
  userId: string;
  kind: SocialNotificationKind;
  targetId: string;
  targetKind: TargetKind;
  metadata?: Record<string, unknown>;
};

type NotificationOptions = {
  allowSelf?: boolean;
};

export async function createNotification(
  supabase: SupabaseClient,
  params: NotificationParams,
  options?: NotificationOptions
): Promise<void> {
  const { actorId, userId, kind, targetId, targetKind, metadata } = params;
  const allowSelf = options?.allowSelf ?? false;

  if (!actorId || !userId || (!allowSelf && actorId === userId)) {
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

export type AchievementNotificationParams = {
  userId: string;
  achievementId: string;
  metadata?: Record<string, unknown>;
};

export async function createAchievementNotification(
  supabase: SupabaseClient,
  params: AchievementNotificationParams
): Promise<void> {
  const { userId, achievementId, metadata } = params;
  if (!userId || !achievementId) return;

  const insertPayload = {
    actor_id: null,
    user_id: userId,
    kind: 'achievement_unlocked' as const,
    target_id: achievementId,
    target_kind: 'achievement' as const,
    metadata: metadata ?? {},
    read: false
  };

  const { error } = await supabase.from('notifications').insert(insertPayload);
  if (error) {
    console.error('[notifications] failed to insert achievement notification', error, insertPayload);
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
