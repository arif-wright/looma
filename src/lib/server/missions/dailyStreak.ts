import type { SupabaseClient } from '@supabase/supabase-js';
import { PORTABLE_STATE_VERSION, type PortableState } from '$lib/types/portableState';
import { normalizePortableCompanions } from '$lib/server/context/portableCompanions';

const ITEM_KEY_DAILY_STREAK_DAYS = 'mission_daily_streak_days';
const ITEM_KEY_DAILY_STREAK_LAST_DAY = 'mission_daily_streak_last_day';
const ITEM_KEY_DAILY_STREAK_MILESTONES = 'mission_daily_streak_milestones';
const ITEM_SOURCE = 'mission_daily_streak';
const DAY_MS = 24 * 60 * 60 * 1000;

export type DailyStreakMilestone = {
  id: string;
  threshold: number;
  cosmeticId: string;
  title: string;
};

const DAILY_STREAK_MILESTONES: DailyStreakMilestone[] = [
  {
    id: 'daily_streak_3',
    threshold: 3,
    cosmeticId: 'daily-glow-3',
    title: 'Glow Seed'
  },
  {
    id: 'daily_streak_7',
    threshold: 7,
    cosmeticId: 'daily-glow-7',
    title: 'Lumen Thread'
  },
  {
    id: 'daily_streak_14',
    threshold: 14,
    cosmeticId: 'daily-glow-14',
    title: 'Aurora Weave'
  }
];

type DailyStreakProgress = {
  streakDays: number;
  completedToday: boolean;
  milestonesUnlocked: DailyStreakMilestone[];
};

const toPortableState = (input: unknown): PortableState => {
  const now = new Date().toISOString();
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    return {
      version: PORTABLE_STATE_VERSION,
      updatedAt: now,
      items: [],
      companions: normalizePortableCompanions(null)
    };
  }

  const payload = input as Record<string, unknown>;
  return {
    version: PORTABLE_STATE_VERSION,
    updatedAt: typeof payload.updatedAt === 'string' ? payload.updatedAt : now,
    items: Array.isArray(payload.items) ? (payload.items as PortableState['items']) : [],
    companions: normalizePortableCompanions(payload.companions),
    identity:
      payload.identity && typeof payload.identity === 'object' && !Array.isArray(payload.identity)
        ? ((payload.identity as PortableState['identity']) ?? null)
        : null
  };
};

const isoDay = (input: string | Date) => {
  const date = input instanceof Date ? input : new Date(input);
  return date.toISOString().slice(0, 10);
};

const previousDay = (dayIso: string) => {
  const current = new Date(`${dayIso}T00:00:00.000Z`);
  return isoDay(new Date(current.getTime() - DAY_MS));
};

const parseCsvSet = (value: unknown) => {
  if (typeof value !== 'string') return new Set<string>();
  return new Set(
    value
      .split(',')
      .map((entry) => entry.trim())
      .filter((entry) => entry.length > 0)
  );
};

const upsertPortableItem = (state: PortableState, key: string, value: string | number) => {
  const now = new Date().toISOString();
  const next = state.items.filter((entry) => entry.key !== key);
  next.push({
    key,
    value,
    updatedAt: now,
    source: ITEM_SOURCE
  });
  return next.slice(-20);
};

const computeStreakFromDays = (days: Set<string>, todayIso: string) => {
  let streak = 0;
  let cursor = todayIso;
  while (days.has(cursor)) {
    streak += 1;
    cursor = previousDay(cursor);
  }
  return streak;
};

const fetchDailyMissionIds = async (supabase: SupabaseClient): Promise<string[]> => {
  const { data, error } = await supabase.from('missions').select('id').contains('tags', ['daily']);
  if (error) {
    console.error('[missions/dailyStreak] daily mission id lookup failed', error);
    return [];
  }
  return ((data as Array<{ id?: unknown }> | null) ?? [])
    .map((row) => (typeof row.id === 'string' ? row.id : null))
    .filter((id): id is string => Boolean(id));
};

const computeDailyStreak = async ({
  supabase,
  userId,
  nowIso
}: {
  supabase: SupabaseClient;
  userId: string;
  nowIso: string;
}) => {
  const dailyMissionIds = await fetchDailyMissionIds(supabase);
  const todayIso = isoDay(nowIso);
  if (dailyMissionIds.length === 0) {
    return { streakDays: 0, completedToday: false };
  }

  const { data, error } = await supabase
    .from('mission_sessions')
    .select('completed_at')
    .eq('user_id', userId)
    .eq('status', 'completed')
    .in('mission_id', dailyMissionIds)
    .not('completed_at', 'is', null)
    .order('completed_at', { ascending: false })
    .limit(730);

  if (error) {
    console.error('[missions/dailyStreak] streak session lookup failed', error);
    return { streakDays: 0, completedToday: false };
  }

  const uniqueDays = new Set(
    ((data as Array<{ completed_at?: unknown }> | null) ?? [])
      .map((row) => (typeof row.completed_at === 'string' ? isoDay(row.completed_at) : null))
      .filter((day): day is string => Boolean(day))
  );

  return {
    streakDays: computeStreakFromDays(uniqueDays, todayIso),
    completedToday: uniqueDays.has(todayIso)
  };
};

export const applyDailyMissionStreakProgress = async ({
  supabase,
  userId,
  nowIso = new Date().toISOString()
}: {
  supabase: SupabaseClient;
  userId: string;
  nowIso?: string;
}): Promise<DailyStreakProgress> => {
  const streak = await computeDailyStreak({ supabase, userId, nowIso });

  const { data, error } = await supabase
    .from('user_preferences')
    .select('portable_state')
    .eq('user_id', userId)
    .maybeSingle();

  if (error && error.code !== 'PGRST116') {
    console.error('[missions/dailyStreak] portable_state fetch failed', error);
    return {
      streakDays: streak.streakDays,
      completedToday: streak.completedToday,
      milestonesUnlocked: []
    };
  }

  const portable = toPortableState(data?.portable_state);
  const milestoneItem = portable.items.find((entry) => entry.key === ITEM_KEY_DAILY_STREAK_MILESTONES);
  const claimedMilestones = parseCsvSet(milestoneItem?.value);
  const milestonesUnlocked = DAILY_STREAK_MILESTONES.filter(
    (milestone) => streak.streakDays >= milestone.threshold && !claimedMilestones.has(milestone.id)
  );

  let items = portable.items;
  items = upsertPortableItem({ ...portable, items }, ITEM_KEY_DAILY_STREAK_DAYS, streak.streakDays);
  if (streak.completedToday) {
    items = upsertPortableItem({ ...portable, items }, ITEM_KEY_DAILY_STREAK_LAST_DAY, isoDay(nowIso));
  }

  if (milestonesUnlocked.length > 0) {
    for (const milestone of milestonesUnlocked) {
      claimedMilestones.add(milestone.id);
    }
    items = upsertPortableItem(
      { ...portable, items },
      ITEM_KEY_DAILY_STREAK_MILESTONES,
      [...claimedMilestones].sort().join(',')
    );
  }

  const companions = normalizePortableCompanions(portable.companions);
  if (milestonesUnlocked.length > 0) {
    const activeId = companions.activeId;
    companions.roster = companions.roster.map((entry) => {
      if (entry.id !== activeId) return entry;
      const unlocked = new Set(entry.cosmeticsUnlocked ?? []);
      for (const milestone of milestonesUnlocked) {
        unlocked.add(milestone.cosmeticId);
      }
      return {
        ...entry,
        cosmeticsUnlocked: [...unlocked].slice(0, 64)
      };
    });
  }

  const nextPortable: PortableState = {
    ...portable,
    updatedAt: nowIso,
    items,
    companions
  };

  const update = await supabase
    .from('user_preferences')
    .upsert(
      {
        user_id: userId,
        portable_state: nextPortable
      },
      { onConflict: 'user_id', ignoreDuplicates: false }
    );

  if (update.error) {
    console.error('[missions/dailyStreak] portable_state update failed', update.error);
  }

  return {
    streakDays: streak.streakDays,
    completedToday: streak.completedToday,
    milestonesUnlocked
  };
};
