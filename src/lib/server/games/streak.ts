import type { SupabaseClient } from '@supabase/supabase-js';
import { supabaseAdmin } from '$lib/server/supabase';

type SupabaseService = SupabaseClient<any, 'public', any>;

const DAY_MS = 86_400_000;
const WINDOW_DAYS = 45;

const truncateUtc = (date: Date): Date =>
  new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));

const toKey = (date: Date): string => date.toISOString().slice(0, 10);

export const getCurrentStreakDays = async (
  userId: string,
  options?: { supabase?: SupabaseService; now?: Date }
): Promise<number> => {
  if (!userId) return 0;

  const supabase = options?.supabase ?? supabaseAdmin;
  const now = truncateUtc(options?.now ?? new Date());
  const since = new Date(now.getTime() - WINDOW_DAYS * DAY_MS);

  const { data, error } = await supabase
    .from('game_sessions')
    .select('completed_at')
    .eq('user_id', userId)
    .eq('status', 'completed')
    .gte('completed_at', since.toISOString());

  if (error) {
    console.error('[streak] failed to load sessions for streak', error, { userId });
    return 0;
  }

  const daysPlayed = new Set<string>();
  for (const row of data ?? []) {
    if (!row) continue;
    const completedAt = typeof row.completed_at === 'string' ? new Date(row.completed_at) : null;
    if (!completedAt || Number.isNaN(completedAt.valueOf())) continue;
    daysPlayed.add(toKey(truncateUtc(completedAt)));
  }

  let streak = 0;
  let cursor = new Date(now);

  while (streak <= WINDOW_DAYS) {
    const key = toKey(cursor);
    if (!daysPlayed.has(key)) {
      break;
    }
    streak += 1;
    cursor = new Date(cursor.getTime() - DAY_MS);
  }

  return streak;
};
