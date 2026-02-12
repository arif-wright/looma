import type { SupabaseClient } from '@supabase/supabase-js';
import { supabaseAdmin } from '$lib/server/supabase';
import { normalizePortableCompanions } from '$lib/server/context/portableCompanions';
import { resolveMuseEvolutionStage } from '$lib/companions/evolution';

type SummaryHighlight = string;

export type CompanionMemorySummary = {
  summary_text: string;
  highlights_json: SummaryHighlight[];
  source_window_json: {
    from: string;
    to: string;
    windowDays: number;
    counts: {
      missionCompletions: number;
      gameCompletions: number;
      missionStarts: number;
    };
  };
  last_built_at: string;
};

type EmotionalStateRow = {
  mood: string | null;
  trust: number | null;
  bond: number | null;
  streak_momentum: number | null;
  volatility: number | null;
  recent_tone: string | null;
  last_milestone_at: string | null;
};

const toIso = (date: Date) => date.toISOString();
const clampInt = (value: number, min: number, max: number) => Math.max(min, Math.min(max, Math.floor(value)));
const safeNum = (value: unknown, fallback = 0) =>
  typeof value === 'number' && Number.isFinite(value) ? value : fallback;

const safeTone = (value: unknown): string | null => {
  if (typeof value !== 'string') return null;
  const normalized = value.trim().toLowerCase();
  return normalized === 'direct' || normalized === 'warm' ? normalized : null;
};

const readPortableItem = (items: unknown, key: string) => {
  if (!Array.isArray(items)) return null;
  for (const raw of items) {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) continue;
    const entry = raw as Record<string, unknown>;
    if (entry.key === key) return entry.value;
  }
  return null;
};

const buildSentenceSummary = (args: {
  mood: string;
  trust: number;
  bond: number;
  streakDays: number;
  missionCompletions: number;
  gameCompletions: number;
  stageLabel: string;
  lastActiveIso: string | null;
}): string => {
  const sentences: string[] = [];

  sentences.push(`Muse feels ${args.mood} right now, with trust ${Math.round(args.trust * 100)}% and bond ${Math.round(args.bond * 100)}%.`);
  sentences.push(
    args.streakDays > 0
      ? `You are on a ${args.streakDays}-day daily streak, and activity has stayed consistent.`
      : 'Daily streak momentum is currently reset, with room to rebuild gently.'
  );
  sentences.push(
    args.gameCompletions > args.missionCompletions
      ? `Recent activity leans toward games (${args.gameCompletions}) over missions (${args.missionCompletions}).`
      : `Recent activity leans toward missions (${args.missionCompletions}) with ${args.gameCompletions} game completions.`
  );
  sentences.push(
    args.lastActiveIso
      ? `Current companion stage is ${args.stageLabel}, last active at ${new Date(args.lastActiveIso).toLocaleString()}.`
      : `Current companion stage is ${args.stageLabel}.`
  );

  return sentences.slice(0, 4).join(' ');
};

export const buildCompanionMemorySummary = async (
  userId: string,
  companionId: string,
  windowDays = 14,
  client: SupabaseClient = supabaseAdmin
): Promise<CompanionMemorySummary> => {
  const safeWindow = clampInt(windowDays, 1, 60);
  const now = new Date();
  const from = new Date(now.getTime() - safeWindow * 24 * 60 * 60 * 1000);
  const fromIso = toIso(from);
  const toIsoNow = toIso(now);

  const [emotionalRes, missionCompletionsRes, missionStartsRes, gameCompletionsRes, preferencesRes, companionRes] =
    await Promise.all([
      client
        .from('companion_emotional_state')
        .select('mood, trust, bond, streak_momentum, volatility, recent_tone, last_milestone_at')
        .eq('user_id', userId)
        .eq('companion_id', companionId)
        .maybeSingle(),
      client
        .from('mission_sessions')
        .select('id', { head: true, count: 'exact' })
        .eq('user_id', userId)
        .eq('status', 'completed')
        .gte('completed_at', fromIso),
      client
        .from('mission_sessions')
        .select('id', { head: true, count: 'exact' })
        .eq('user_id', userId)
        .gte('started_at', fromIso),
      client
        .from('game_sessions')
        .select('id', { head: true, count: 'exact' })
        .eq('user_id', userId)
        .eq('status', 'completed')
        .gte('completed_at', fromIso),
      client
        .from('user_preferences')
        .select('portable_state')
        .eq('user_id', userId)
        .maybeSingle(),
      client
        .from('companions')
        .select('updated_at')
        .eq('owner_id', userId)
        .eq('id', companionId)
        .maybeSingle()
    ]);

  const emotional = (emotionalRes.data as EmotionalStateRow | null) ?? null;
  const missionCompletions = missionCompletionsRes.count ?? 0;
  const missionStarts = missionStartsRes.count ?? 0;
  const gameCompletions = gameCompletionsRes.count ?? 0;
  const portableState =
    preferencesRes.data && typeof preferencesRes.data.portable_state === 'object' && preferencesRes.data.portable_state
      ? (preferencesRes.data.portable_state as Record<string, unknown>)
      : {};
  const items = Array.isArray(portableState.items) ? portableState.items : [];
  const tone = safeTone(readPortableItem(items, 'tone'));
  const streakDays = Math.max(0, safeNum(readPortableItem(items, 'mission_daily_streak_days'), 0));
  const streakMilestonesRaw = readPortableItem(items, 'mission_daily_streak_milestones');
  const streakMilestones =
    typeof streakMilestonesRaw === 'string'
      ? streakMilestonesRaw
          .split(',')
          .map((entry) => entry.trim())
          .filter(Boolean)
      : [];

  const companions = normalizePortableCompanions(portableState.companions);
  const targetCompanion = companions.roster.find((entry) => entry.id === companionId) ?? null;
  const stage = resolveMuseEvolutionStage({
    companionId,
    unlockedCosmetics: targetCompanion?.cosmeticsUnlocked ?? []
  });

  const mood = emotional?.mood === 'luminous' || emotional?.mood === 'dim' ? emotional.mood : 'steady';
  const trust = safeNum(emotional?.trust, 0);
  const bond = safeNum(emotional?.bond, 0);
  const lastMilestoneAt = emotional?.last_milestone_at ?? null;
  const lastActiveIso = typeof companionRes.data?.updated_at === 'string' ? companionRes.data.updated_at : null;

  const highlights: SummaryHighlight[] = [];
  highlights.push(`Streak: ${Math.round(streakDays)} day${Math.round(streakDays) === 1 ? '' : 's'}`);
  highlights.push(`Mood: ${mood}`);
  highlights.push(`Companion stage: ${stage.label}`);
  if (tone === 'direct') highlights.push('Prefers direct tone');
  if (gameCompletions > missionCompletions && gameCompletions > 0) {
    highlights.push('Most active in games');
  }
  if (lastMilestoneAt) {
    highlights.push(`Recent milestone: ${new Date(lastMilestoneAt).toLocaleDateString()}`);
  } else if (streakMilestones.length > 0) {
    highlights.push('Recent milestone: Aurora Weave unlocked');
  }

  const dedupHighlights = [...new Set(highlights)].slice(0, 7);
  while (dedupHighlights.length < 3) {
    dedupHighlights.push('Steady progress this week');
  }

  const summaryText = buildSentenceSummary({
    mood,
    trust,
    bond,
    streakDays,
    missionCompletions,
    gameCompletions,
    stageLabel: stage.label,
    lastActiveIso
  });

  return {
    summary_text: summaryText,
    highlights_json: dedupHighlights,
    source_window_json: {
      from: fromIso,
      to: toIsoNow,
      windowDays: safeWindow,
      counts: {
        missionCompletions,
        gameCompletions,
        missionStarts
      }
    },
    last_built_at: toIsoNow
  };
};

export const upsertCompanionMemorySummary = async (
  userId: string,
  companionId: string,
  windowDays = 14,
  client: SupabaseClient = supabaseAdmin
): Promise<CompanionMemorySummary> => {
  const built = await buildCompanionMemorySummary(userId, companionId, windowDays, client);

  const { error } = await client.from('companion_memory_summary').upsert(
    {
      user_id: userId,
      companion_id: companionId,
      summary_text: built.summary_text,
      highlights_json: built.highlights_json,
      source_window_json: built.source_window_json,
      last_built_at: built.last_built_at
    },
    { onConflict: 'user_id,companion_id', ignoreDuplicates: false }
  );

  if (error) {
    console.error('[memorySummary] upsert failed', { error, userId, companionId });
  }

  return built;
};
