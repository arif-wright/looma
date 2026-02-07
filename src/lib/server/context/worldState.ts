import type { SupabaseClient } from '@supabase/supabase-js';
import { PORTABLE_STATE_VERSION, type PortableState, type PortableStateItem } from '$lib/types/portableState';

export type WorldMood = 'steady' | 'bright' | 'low';

export type StoredWorldState = {
  lastSessionStart: string | null;
  lastSessionEnd: string | null;
  streakDays: number;
  previousStreakDays: number;
  moodValue: number;
  mood: WorldMood;
  lastPagesVisited: number;
  lastGamesPlayed: number;
  lastWhisperAt: string | null;
  lastWhisperStreak: number;
};

const KEY_LAST_START = 'world_last_session_start';
const KEY_LAST_END = 'world_last_session_end';
const KEY_STREAK_DAYS = 'world_streak_days';
const KEY_MOOD_VALUE = 'world_mood_value';
const KEY_MOOD_LABEL = 'world_mood_label';
const KEY_LAST_PAGES = 'world_last_pages_visited';
const KEY_LAST_GAMES = 'world_last_games_played';
const KEY_PREV_STREAK_DAYS = 'world_prev_streak_days';
const KEY_LAST_WHISPER_AT = 'world_last_whisper_at';
const KEY_LAST_WHISPER_STREAK = 'world_last_whisper_streak';

const DAY_MS = 24 * 60 * 60 * 1000;

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));
const round = (value: number) => Math.round(value * 100) / 100;

const toDate = (value: string | null | undefined): Date | null => {
  if (!value) return null;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
};

const dayDiff = (a: Date, b: Date) => {
  const aDay = Date.UTC(a.getUTCFullYear(), a.getUTCMonth(), a.getUTCDate());
  const bDay = Date.UTC(b.getUTCFullYear(), b.getUTCMonth(), b.getUTCDate());
  return Math.floor((aDay - bDay) / DAY_MS);
};

const moodFromValue = (value: number): WorldMood => {
  if (value > 0.28) return 'bright';
  if (value < -0.28) return 'low';
  return 'steady';
};

const readItem = (items: PortableStateItem[], key: string) => items.find((entry) => entry.key === key)?.value;

const toPortable = (input: unknown): PortableState => {
  const now = new Date().toISOString();
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    return { version: PORTABLE_STATE_VERSION, updatedAt: now, items: [] };
  }
  const payload = input as Record<string, unknown>;
  const rawItems = Array.isArray(payload.items) ? payload.items : [];
  const items = rawItems
    .slice(0, 50)
    .map((entry) => (entry && typeof entry === 'object' && !Array.isArray(entry) ? (entry as Record<string, unknown>) : null))
    .filter(Boolean)
    .map((entry) => ({
      key: typeof entry?.key === 'string' ? entry.key.slice(0, 80) : 'unknown',
      value:
        typeof entry?.value === 'string' ||
        typeof entry?.value === 'number' ||
        typeof entry?.value === 'boolean'
          ? entry.value
          : null,
      updatedAt: typeof entry?.updatedAt === 'string' ? entry.updatedAt : now,
      source: typeof entry?.source === 'string' ? entry.source.slice(0, 80) : null
    }));

  return {
    version: PORTABLE_STATE_VERSION,
    updatedAt: typeof payload.updatedAt === 'string' ? payload.updatedAt : now,
    items
  };
};

const upsertItem = (items: PortableStateItem[], key: string, value: string | number | boolean | null, source = 'world_state') => {
  const now = new Date().toISOString();
  const next = items.filter((entry) => entry.key !== key);
  next.push({ key, value, updatedAt: now, source });
  return next;
};

export const extractWorldState = (portableState: unknown): StoredWorldState => {
  const state = toPortable(portableState);
  const items = state.items;
  const moodValueRaw = Number(readItem(items, KEY_MOOD_VALUE) ?? 0);
  const moodValue = Number.isFinite(moodValueRaw) ? clamp(moodValueRaw, -1, 1) : 0;
  const moodLabelRaw = readItem(items, KEY_MOOD_LABEL);
  const moodLabel = moodLabelRaw === 'bright' || moodLabelRaw === 'low' || moodLabelRaw === 'steady' ? moodLabelRaw : null;
  const streakRaw = Number(readItem(items, KEY_STREAK_DAYS) ?? 0);
  const streakDays = Number.isFinite(streakRaw) && streakRaw > 0 ? Math.floor(streakRaw) : 0;
  const previousStreakRaw = Number(readItem(items, KEY_PREV_STREAK_DAYS) ?? 0);
  const previousStreakDays =
    Number.isFinite(previousStreakRaw) && previousStreakRaw >= 0 ? Math.floor(previousStreakRaw) : 0;

  return {
    lastSessionStart: typeof readItem(items, KEY_LAST_START) === 'string' ? (readItem(items, KEY_LAST_START) as string) : null,
    lastSessionEnd: typeof readItem(items, KEY_LAST_END) === 'string' ? (readItem(items, KEY_LAST_END) as string) : null,
    streakDays,
    previousStreakDays,
    moodValue,
    mood: moodLabel ?? moodFromValue(moodValue),
    lastPagesVisited: Number.isFinite(Number(readItem(items, KEY_LAST_PAGES) ?? 0))
      ? Math.max(0, Math.floor(Number(readItem(items, KEY_LAST_PAGES) ?? 0)))
      : 0,
    lastGamesPlayed: Number.isFinite(Number(readItem(items, KEY_LAST_GAMES) ?? 0))
      ? Math.max(0, Math.floor(Number(readItem(items, KEY_LAST_GAMES) ?? 0)))
      : 0,
    lastWhisperAt:
      typeof readItem(items, KEY_LAST_WHISPER_AT) === 'string' ? (readItem(items, KEY_LAST_WHISPER_AT) as string) : null,
    lastWhisperStreak: Number.isFinite(Number(readItem(items, KEY_LAST_WHISPER_STREAK) ?? 0))
      ? Math.max(0, Math.floor(Number(readItem(items, KEY_LAST_WHISPER_STREAK) ?? 0)))
      : 0
  };
};

const applyStartDrift = (previous: StoredWorldState, nowIso: string): StoredWorldState => {
  const now = toDate(nowIso) ?? new Date();
  const previousStart = toDate(previous.lastSessionStart);
  const previousEnd = toDate(previous.lastSessionEnd);

  const startGapDays = previousStart ? dayDiff(now, previousStart) : null;
  let streakDays = previous.streakDays > 0 ? previous.streakDays : 1;
  if (startGapDays === null) {
    streakDays = 1;
  } else if (startGapDays === 1) {
    streakDays = streakDays + 1;
  } else if (startGapDays > 1) {
    streakDays = 1;
  }

  const daysSinceEnd = previousEnd ? Math.max(0, dayDiff(now, previousEnd)) : 0;
  let delta = 0;
  if (daysSinceEnd <= 1) delta += 0.04;
  if (daysSinceEnd >= 2) delta -= Math.min(0.16, 0.04 * (daysSinceEnd - 1));
  if (previous.lastGamesPlayed >= 1) delta += 0.02;
  if (previous.lastPagesVisited >= 4) delta += 0.01;
  if (previous.lastGamesPlayed === 0 && previous.lastPagesVisited <= 1) delta -= 0.02;
  if (streakDays >= 3) delta += 0.03;
  if (streakDays >= 7) delta += 0.03;

  const moodValue = round(clamp(previous.moodValue + delta, -1, 1));

  return {
    lastSessionStart: nowIso,
    lastSessionEnd: previous.lastSessionEnd,
    streakDays,
    previousStreakDays: previous.streakDays,
    moodValue,
    mood: moodFromValue(moodValue),
    lastPagesVisited: previous.lastPagesVisited,
    lastGamesPlayed: previous.lastGamesPlayed,
    lastWhisperAt: previous.lastWhisperAt,
    lastWhisperStreak: previous.lastWhisperStreak
  };
};

const applyEndBoundary = (
  previous: StoredWorldState,
  endIso: string,
  engagement?: { pagesVisitedCount?: number | null; gamesPlayedCount?: number | null }
): StoredWorldState => {
  const pagesVisitedCount =
    typeof engagement?.pagesVisitedCount === 'number' && Number.isFinite(engagement.pagesVisitedCount)
      ? Math.max(0, Math.floor(engagement.pagesVisitedCount))
      : previous.lastPagesVisited;
  const gamesPlayedCount =
    typeof engagement?.gamesPlayedCount === 'number' && Number.isFinite(engagement.gamesPlayedCount)
      ? Math.max(0, Math.floor(engagement.gamesPlayedCount))
      : previous.lastGamesPlayed;
  return {
    ...previous,
    lastSessionEnd: endIso,
    lastPagesVisited: pagesVisitedCount,
    lastGamesPlayed: gamesPlayedCount
  };
};

const writeWorldState = async (
  supabase: SupabaseClient,
  userId: string,
  portableState: PortableState,
  worldState: StoredWorldState
) => {
  let nextItems = portableState.items;
  nextItems = upsertItem(nextItems, KEY_LAST_START, worldState.lastSessionStart);
  nextItems = upsertItem(nextItems, KEY_LAST_END, worldState.lastSessionEnd);
  nextItems = upsertItem(nextItems, KEY_STREAK_DAYS, worldState.streakDays);
  nextItems = upsertItem(nextItems, KEY_PREV_STREAK_DAYS, worldState.previousStreakDays);
  nextItems = upsertItem(nextItems, KEY_MOOD_VALUE, worldState.moodValue);
  nextItems = upsertItem(nextItems, KEY_MOOD_LABEL, worldState.mood);
  nextItems = upsertItem(nextItems, KEY_LAST_PAGES, worldState.lastPagesVisited);
  nextItems = upsertItem(nextItems, KEY_LAST_GAMES, worldState.lastGamesPlayed);
  nextItems = upsertItem(nextItems, KEY_LAST_WHISPER_AT, worldState.lastWhisperAt);
  nextItems = upsertItem(nextItems, KEY_LAST_WHISPER_STREAK, worldState.lastWhisperStreak);

  const nextPortable: PortableState = {
    version: PORTABLE_STATE_VERSION,
    updatedAt: new Date().toISOString(),
    items: nextItems.slice(-20)
  };

  const { error } = await supabase.from('user_preferences').upsert(
    {
      user_id: userId,
      portable_state: nextPortable
    },
    { onConflict: 'user_id', ignoreDuplicates: false }
  );

  if (error) {
    throw error;
  }

  return worldState;
};

export const applyWorldStateBoundary = async (args: {
  supabase: SupabaseClient;
  userId: string;
  type: 'session.start' | 'session.end';
  endIso?: string | null;
  engagement?: { pagesVisitedCount?: number | null; gamesPlayedCount?: number | null };
}) => {
  const { supabase, userId, type } = args;
  const nowIso = new Date().toISOString();
  const { data, error } = await supabase
    .from('user_preferences')
    .select('portable_state')
    .eq('user_id', userId)
    .maybeSingle();

  if (error && error.code !== 'PGRST116') {
    throw error;
  }

  const portableState = toPortable(data?.portable_state);
  const current = extractWorldState(portableState);
  const next =
    type === 'session.start'
      ? applyStartDrift(current, nowIso)
      : applyEndBoundary(current, args.endIso ?? nowIso, args.engagement);

  return writeWorldState(supabase, userId, portableState, next);
};

export const markWorldWhisperShown = async (args: {
  supabase: SupabaseClient;
  userId: string;
  whisperAt: string;
  whisperStreak: number;
}) => {
  const { supabase, userId, whisperAt, whisperStreak } = args;
  const { data, error } = await supabase
    .from('user_preferences')
    .select('portable_state')
    .eq('user_id', userId)
    .maybeSingle();

  if (error && error.code !== 'PGRST116') {
    throw error;
  }

  const portableState = toPortable(data?.portable_state);
  const current = extractWorldState(portableState);
  const next: StoredWorldState = {
    ...current,
    lastWhisperAt: whisperAt,
    lastWhisperStreak: whisperStreak
  };
  return writeWorldState(supabase, userId, portableState, next);
};
