import type { PortableState } from '$lib/types/portableState';

export const MEMORY_SUMMARY_ITEM_KEY = 'memory_summary_v1';
const MEMORY_SUMMARY_SOURCE = 'deterministic-memory-summary';
const MEMORY_SUMMARY_VERSION = 1;

export type MemorySummaryPayload = {
  version: number;
  source: string;
  generatedAt: string;
  bullets: string[];
};

const readItemValue = (state: PortableState | null | undefined, key: string) => {
  const entry = state?.items?.find((item) => item.key === key);
  return entry?.value;
};

const readNumber = (state: PortableState | null | undefined, key: string) => {
  const value = readItemValue(state, key);
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
};

const readString = (state: PortableState | null | undefined, key: string) => {
  const value = readItemValue(state, key);
  return typeof value === 'string' ? value : null;
};

const moodLabel = (raw: string | null) => {
  if (raw === 'bright') return 'bright';
  if (raw === 'low') return 'low';
  return 'steady';
};

export const buildDeterministicMemorySummary = (state: PortableState | null | undefined): string[] => {
  if (!state) return ['No summary available yet.'];

  const tone = readString(state, 'tone');
  const mood = moodLabel(readString(state, 'world_mood_label'));
  const streakDays = Math.max(0, Math.floor(readNumber(state, 'world_streak_days') ?? 0));
  const gamesPlayed = Math.max(0, Math.floor(readNumber(state, 'world_last_games_played') ?? 0));
  const rosterCount = Array.isArray(state.companions?.roster) ? state.companions?.roster.length : 0;

  const bullets: string[] = [];
  bullets.push(`Recent world mood: ${mood}.`);
  bullets.push(`Current streak: ${streakDays} day${streakDays === 1 ? '' : 's'}.`);
  bullets.push(`Games in last session: ${gamesPlayed}.`);
  bullets.push(`Companion roster size: ${rosterCount}.`);
  if (tone) bullets.push(`Preferred tone: ${tone}.`);

  return bullets.slice(0, 5);
};

export const encodeMemorySummary = (bullets: string[], generatedAt = new Date().toISOString()): string => {
  const payload: MemorySummaryPayload = {
    version: MEMORY_SUMMARY_VERSION,
    source: MEMORY_SUMMARY_SOURCE,
    generatedAt,
    bullets: bullets
      .map((line) => line.trim())
      .filter(Boolean)
      .slice(0, 5)
      .map((line) => line.slice(0, 120))
  };
  return JSON.stringify(payload);
};

export const decodeStoredMemorySummary = (state: PortableState | null | undefined): MemorySummaryPayload | null => {
  const raw = readItemValue(state, MEMORY_SUMMARY_ITEM_KEY);
  if (typeof raw !== 'string') return null;

  try {
    const payload = JSON.parse(raw) as Partial<MemorySummaryPayload>;
    if (payload.version !== MEMORY_SUMMARY_VERSION) return null;
    if (payload.source !== MEMORY_SUMMARY_SOURCE) return null;
    if (!Array.isArray(payload.bullets)) return null;

    const bullets = payload.bullets
      .filter((line): line is string => typeof line === 'string')
      .map((line) => line.trim())
      .filter(Boolean)
      .slice(0, 5)
      .map((line) => line.slice(0, 120));

    if (bullets.length === 0) return null;

    return {
      version: MEMORY_SUMMARY_VERSION,
      source: MEMORY_SUMMARY_SOURCE,
      generatedAt: typeof payload.generatedAt === 'string' ? payload.generatedAt : new Date().toISOString(),
      bullets
    };
  } catch {
    return null;
  }
};
