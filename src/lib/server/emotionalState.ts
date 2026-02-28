import type { SupabaseClient } from '@supabase/supabase-js';
import { supabaseAdmin } from '$lib/server/supabase';

export type CompanionMood = 'steady' | 'luminous' | 'dim';

export type EmotionalStateRow = {
  id: string;
  user_id: string;
  companion_id: string;
  mood: CompanionMood;
  trust: number;
  bond: number;
  streak_momentum: number;
  volatility: number;
  recent_tone: string | null;
  last_milestone_at: string | null;
  created_at: string;
  updated_at: string;
};

export type EmotionalStateSnapshot = {
  mood: CompanionMood;
  trust: number;
  bond: number;
  streakMomentum: number;
  volatility: number;
  recentTone: string | null;
  lastMilestoneAt: string | null;
};

export type EmotionalStatePatch = Partial<EmotionalStateSnapshot>;

export type EmotionalStateEvent = {
  type: 'session.start' | 'mission.complete' | 'daily_streak_milestone' | 'companion.evolve';
  userId: string;
  companionId: string;
  occurredAt?: string;
  payload?: {
    isDailyCompletion?: boolean;
    hasDailyMilestone?: boolean;
  };
};

export type CompanionEmotionalSeed = {
  affection?: number | null;
  trust?: number | null;
  energy?: number | null;
  mood?: string | null;
};

const clamp01 = (value: number) => Math.max(0, Math.min(1, value));
const round3 = (value: number) => Math.round(value * 1000) / 1000;

const toSnapshot = (row: Partial<EmotionalStateRow> | null | undefined): EmotionalStateSnapshot => ({
  mood: row?.mood === 'luminous' || row?.mood === 'dim' ? row.mood : 'steady',
  trust: clamp01(Number(row?.trust ?? 0)),
  bond: clamp01(Number(row?.bond ?? 0)),
  streakMomentum: clamp01(Number(row?.streak_momentum ?? 0)),
  volatility: clamp01(Number(row?.volatility ?? 0)),
  recentTone: typeof row?.recent_tone === 'string' ? row.recent_tone : null,
  lastMilestoneAt: typeof row?.last_milestone_at === 'string' ? row.last_milestone_at : null
});

const deriveMood = (state: EmotionalStateSnapshot): CompanionMood => {
  if (state.streakMomentum >= 0.62 && state.bond >= 0.45) return 'luminous';
  if (state.streakMomentum <= 0.14 && state.bond <= 0.22 && state.trust <= 0.3) return 'dim';
  return 'steady';
};

const deriveTone = (mood: CompanionMood): string =>
  mood === 'luminous' ? 'uplifted' : mood === 'dim' ? 'reserved' : 'calm';

const deriveMoodFromCompanionStats = (seed: CompanionEmotionalSeed): CompanionMood => {
  const affection = Number(seed.affection ?? 0);
  const trust = Number(seed.trust ?? 0);
  const energy = Number(seed.energy ?? 0);
  const mood = (seed.mood ?? '').trim().toLowerCase();

  if (mood === 'luminous' || mood === 'happy') return 'luminous';
  if (mood === 'dim' || mood === 'stressed' || mood === 'low_energy' || mood === 'tired') return 'dim';
  if (energy >= 60 && affection >= 70 && trust >= 60) return 'luminous';
  if (energy <= 20 || (affection <= 30 && trust <= 30)) return 'dim';
  return 'steady';
};

export const deriveEmotionalStateFromCompanionStats = (
  seed: CompanionEmotionalSeed,
  base?: EmotionalStateSnapshot | null
): EmotionalStateSnapshot => {
  const trust = round3(clamp01(Number(seed.trust ?? 0) / 100));
  const bond = round3(clamp01(((Number(seed.affection ?? 0) + Number(seed.trust ?? 0)) / 2) / 100));
  const energy = clamp01(Number(seed.energy ?? 0) / 100);
  const streakMomentum = typeof base?.streakMomentum === 'number' ? base.streakMomentum : round3(energy * 0.6);
  const volatility =
    typeof base?.volatility === 'number'
      ? base.volatility
      : round3(clamp01(1 - ((trust + energy) / 2)));

  return normalizePatch(
    {
      trust,
      bond,
      streakMomentum,
      volatility,
      mood: deriveMoodFromCompanionStats(seed)
    },
    base ?? toSnapshot(null)
  );
};

const normalizePatch = (input: EmotionalStatePatch, base: EmotionalStateSnapshot): EmotionalStateSnapshot => {
  const next: EmotionalStateSnapshot = {
    mood: input.mood ?? base.mood,
    trust: round3(clamp01(typeof input.trust === 'number' ? input.trust : base.trust)),
    bond: round3(clamp01(typeof input.bond === 'number' ? input.bond : base.bond)),
    streakMomentum: round3(
      clamp01(typeof input.streakMomentum === 'number' ? input.streakMomentum : base.streakMomentum)
    ),
    volatility: round3(clamp01(typeof input.volatility === 'number' ? input.volatility : base.volatility)),
    recentTone:
      typeof input.recentTone === 'string' || input.recentTone === null ? input.recentTone : base.recentTone,
    lastMilestoneAt:
      typeof input.lastMilestoneAt === 'string' || input.lastMilestoneAt === null
        ? input.lastMilestoneAt
        : base.lastMilestoneAt
  };
  next.mood = deriveMood(next);
  next.recentTone = deriveTone(next.mood);
  return next;
};

const applyEvent = (current: EmotionalStateSnapshot, event: EmotionalStateEvent): EmotionalStateSnapshot => {
  const next = { ...current };
  const eventAt = event.occurredAt ?? new Date().toISOString();
  const isDailyCompletion = event.payload?.isDailyCompletion === true;
  const hasDailyMilestone = event.payload?.hasDailyMilestone === true;

  if (event.type === 'session.start') {
    next.volatility = round3(clamp01(next.volatility - 0.04));
    next.trust = round3(clamp01(next.trust + 0.004));
    next.streakMomentum = round3(clamp01(next.streakMomentum - 0.01));
  } else if (event.type === 'mission.complete') {
    next.bond = round3(clamp01(next.bond + 0.025));
    next.trust = round3(clamp01(next.trust + 0.01));
    next.volatility = round3(clamp01(next.volatility - 0.015));
    next.streakMomentum = round3(clamp01(next.streakMomentum + (isDailyCompletion ? 0.08 : 0.02)));
    if (hasDailyMilestone) {
      next.lastMilestoneAt = eventAt;
      next.streakMomentum = round3(clamp01(next.streakMomentum + 0.06));
      next.trust = round3(clamp01(next.trust + 0.015));
    }
  } else if (event.type === 'daily_streak_milestone') {
    next.lastMilestoneAt = eventAt;
    next.streakMomentum = round3(clamp01(next.streakMomentum + 0.12));
    next.trust = round3(clamp01(next.trust + 0.02));
  } else if (event.type === 'companion.evolve') {
    next.lastMilestoneAt = eventAt;
    next.bond = round3(clamp01(next.bond + 0.05));
    next.trust = round3(clamp01(next.trust + 0.03));
    next.streakMomentum = round3(clamp01(next.streakMomentum + 0.05));
    next.volatility = round3(clamp01(next.volatility - 0.02));
  }

  next.mood = deriveMood(next);
  next.recentTone = deriveTone(next.mood);
  return next;
};

export const getEmotionalState = async (
  userId: string,
  companionId: string,
  client: SupabaseClient = supabaseAdmin
): Promise<EmotionalStateSnapshot> => {
  if (!userId || !companionId) {
    return toSnapshot(null);
  }
  const { data, error } = await client
    .from('companion_emotional_state')
    .select(
      'id, user_id, companion_id, mood, trust, bond, streak_momentum, volatility, recent_tone, last_milestone_at, created_at, updated_at'
    )
    .eq('user_id', userId)
    .eq('companion_id', companionId)
    .maybeSingle();

  if (error) {
    console.error('[emotionalState] lookup failed', { error, userId, companionId });
    return toSnapshot(null);
  }

  return toSnapshot((data as EmotionalStateRow | null) ?? null);
};

export const updateEmotionalState = async (
  userId: string,
  companionId: string,
  patch: EmotionalStatePatch,
  client: SupabaseClient = supabaseAdmin
): Promise<EmotionalStateSnapshot> => {
  const current = await getEmotionalState(userId, companionId, client);
  const next = normalizePatch(patch, current);
  const nowIso = new Date().toISOString();

  const { error } = await client.from('companion_emotional_state').upsert(
    {
      user_id: userId,
      companion_id: companionId,
      mood: next.mood,
      trust: next.trust,
      bond: next.bond,
      streak_momentum: next.streakMomentum,
      volatility: next.volatility,
      recent_tone: next.recentTone,
      last_milestone_at: next.lastMilestoneAt,
      updated_at: nowIso
    },
    { onConflict: 'user_id,companion_id', ignoreDuplicates: false }
  );

  if (error) {
    console.error('[emotionalState] upsert failed', { error, userId, companionId });
  }

  return next;
};

export const syncEmotionalStateFromCompanionStats = async (
  userId: string,
  companionId: string,
  seed: CompanionEmotionalSeed,
  client: SupabaseClient = supabaseAdmin
): Promise<EmotionalStateSnapshot> => {
  const current = await getEmotionalState(userId, companionId, client);
  const next = deriveEmotionalStateFromCompanionStats(seed, current);
  return updateEmotionalState(userId, companionId, next, client);
};

export const applyEventToEmotionalState = async (
  event: EmotionalStateEvent,
  options?: { client?: SupabaseClient; persist?: boolean }
): Promise<EmotionalStateSnapshot> => {
  const client = options?.client ?? supabaseAdmin;
  const persist = options?.persist !== false;
  const current = await getEmotionalState(event.userId, event.companionId, client);
  const next = applyEvent(current, event);
  if (!persist) return next;
  return updateEmotionalState(event.userId, event.companionId, next, client);
};
