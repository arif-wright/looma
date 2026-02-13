import type { SupabaseClient } from '@supabase/supabase-js';

type SocialNotificationKind = 'reaction' | 'comment' | 'share';
type AchievementNotificationKind = 'achievement_unlocked';
type CompanionNotificationKind = 'companion_nudge';

type NotificationKind = SocialNotificationKind | AchievementNotificationKind | CompanionNotificationKind;
type TargetKind = 'post' | 'comment' | 'achievement' | 'companion';

export type NotificationParams = {
  actorId: string | null;
  userId: string;
  kind: SocialNotificationKind | CompanionNotificationKind;
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
    if (!(kind === 'companion_nudge' && userId)) {
      return;
    }
  }

  if (kind !== 'companion_nudge' && (!actorId || (!allowSelf && actorId === userId))) {
    return;
  }

  const insertPayload = {
    actor_id: actorId,
    user_id: userId,
    kind,
    target_id: targetId,
    target_kind: targetKind,
    metadata: metadata ?? {},
    meta: metadata ?? {},
    read_at: null
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
    meta: metadata ?? {},
    read: false,
    read_at: null
  };

  const { error } = await supabase.from('notifications').insert(insertPayload);
  if (error) {
    console.error('[notifications] failed to insert achievement notification', error, insertPayload);
  }
}

export type CompanionNudgeNotificationParams = {
  userId: string;
  companionId: string;
  reason: 'low_energy' | 'care_due';
  companionName?: string | null;
  mood?: string | null;
  energy?: number | null;
};

export async function createCompanionNudgeNotification(
  supabase: SupabaseClient,
  params: CompanionNudgeNotificationParams
): Promise<void> {
  const { userId, companionId, reason, companionName, mood, energy } = params;
  if (!userId || !companionId) return;

  await createNotification(
    supabase,
    {
      actorId: userId,
      userId,
      kind: 'companion_nudge',
      targetId: companionId,
      targetKind: 'companion',
      metadata: {
        reason,
        companionName: companionName ?? null,
        mood: mood ?? null,
        energy: typeof energy === 'number' ? Math.max(0, Math.min(100, Math.round(energy))) : null
      }
    },
    { allowSelf: true }
  );
}

export async function markNotificationsRead(
  supabase: SupabaseClient,
  userId: string,
  ids?: string[]
): Promise<void> {
  if (!userId) return;

  const query = supabase
    .from('notifications')
    .update({ read: true, read_at: new Date().toISOString() })
    .eq('user_id', userId)
    .eq('read', false);

  const finalQuery = Array.isArray(ids) && ids.length > 0 ? query.in('id', ids) : query;

  const { error } = await finalQuery;
  if (error) {
    console.error('[notifications] failed to mark notifications read', error, { userId, ids });
  }
}
