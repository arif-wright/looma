import type { SupabaseClient } from '@supabase/supabase-js';
import { supabaseAdmin } from '$lib/server/supabase';
import { normalizePortableCompanions } from '$lib/server/context/portableCompanions';
import { buildCompanionMemorySummary } from '$lib/server/memorySummary';
import { resolveMuseEvolutionStage } from '$lib/companions/evolution';

type ConsentRow = {
  consent_adaptation?: boolean | null;
  consent_reactions?: boolean | null;
  consent_emotional_adaptation?: boolean | null;
  consent_cross_app_continuity?: boolean | null;
  portable_state?: unknown;
};

type EmotionalRow = {
  mood?: string | null;
  trust?: number | null;
  bond?: number | null;
  streak_momentum?: number | null;
  volatility?: number | null;
  recent_tone?: string | null;
  last_milestone_at?: string | null;
  updated_at?: string | null;
};

type MemorySummaryRow = {
  summary_text?: string | null;
  highlights_json?: unknown;
};

type CompanionRow = {
  updated_at?: string | null;
  stats?: { bond_level?: number | null } | null;
};

export type CloudWeaveExport = {
  version: 'cw-0.1';
  userId: string;
  companionId: string;
  generatedAt: string;
  consent: {
    emotionalAdaptation: boolean;
    crossAppContinuity: boolean;
  };
  emotionalState: {
    mood: string;
    trust: number;
    bond: number;
    streakMomentum: number;
    volatility: number;
    recentTone: string | null;
    lastMilestoneAt: string | null;
    updatedAt: string | null;
  };
  memorySummary: {
    summaryText: string;
    highlights: string[];
  };
  progression: {
    bondLevel: number;
    stage: string;
    streak: number;
  };
  prefs: {
    tone: string | null;
    reactionsEnabled: boolean;
    reducedMotion: boolean;
  };
};

const clampNumber = (value: unknown, fallback = 0): number => {
  if (typeof value !== 'number' || !Number.isFinite(value)) return fallback;
  return Math.max(0, value);
};

const readPortableItem = (items: unknown, key: string): unknown => {
  if (!Array.isArray(items)) return null;
  for (const raw of items) {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) continue;
    const entry = raw as Record<string, unknown>;
    if (entry.key === key) return entry.value;
  }
  return null;
};

const asStringArray = (input: unknown): string[] => {
  if (!Array.isArray(input)) return [];
  return input.filter((item): item is string => typeof item === 'string').slice(0, 7);
};

export const buildCloudWeaveExport = async (
  userId: string,
  companionId: string,
  client: SupabaseClient = supabaseAdmin
): Promise<CloudWeaveExport> => {
  const generatedAt = new Date().toISOString();

  const [preferencesRes, emotionalRes, summaryRes, companionRes] = await Promise.all([
    client
      .from('user_preferences')
      .select(
        'consent_adaptation, consent_reactions, consent_emotional_adaptation, consent_cross_app_continuity, portable_state'
      )
      .eq('user_id', userId)
      .maybeSingle(),
    client
      .from('companion_emotional_state')
      .select('mood, trust, bond, streak_momentum, volatility, recent_tone, last_milestone_at, updated_at')
      .eq('user_id', userId)
      .eq('companion_id', companionId)
      .maybeSingle(),
    client
      .from('companion_memory_summary')
      .select('summary_text, highlights_json')
      .eq('user_id', userId)
      .eq('companion_id', companionId)
      .maybeSingle(),
    client
      .from('companions')
      .select('updated_at, stats:companion_stats(bond_level)')
      .eq('owner_id', userId)
      .eq('id', companionId)
      .maybeSingle()
  ]);

  if (preferencesRes.error && preferencesRes.error.code !== 'PGRST116') {
    console.error('[cloudweave] failed to fetch preferences', preferencesRes.error);
  }
  if (emotionalRes.error && emotionalRes.error.code !== 'PGRST116') {
    console.error('[cloudweave] failed to fetch emotional state', emotionalRes.error);
  }
  if (summaryRes.error && summaryRes.error.code !== 'PGRST116') {
    console.error('[cloudweave] failed to fetch memory summary', summaryRes.error);
  }
  if (companionRes.error && companionRes.error.code !== 'PGRST116') {
    console.error('[cloudweave] failed to fetch companion progression', companionRes.error);
  }

  const preferenceRow = (preferencesRes.data ?? {}) as ConsentRow;
  const emotionalRow = (emotionalRes.data ?? {}) as EmotionalRow;
  const summaryRow = (summaryRes.data ?? {}) as MemorySummaryRow;
  const companionRow = (companionRes.data ?? {}) as CompanionRow;

  const portableState =
    preferenceRow.portable_state && typeof preferenceRow.portable_state === 'object'
      ? (preferenceRow.portable_state as Record<string, unknown>)
      : {};
  const portableItems = Array.isArray(portableState.items) ? portableState.items : [];

  let summaryText = typeof summaryRow.summary_text === 'string' ? summaryRow.summary_text : '';
  let highlights = asStringArray(summaryRow.highlights_json);

  if (!summaryText || highlights.length === 0) {
    const rebuilt = await buildCompanionMemorySummary(userId, companionId, 14, client);
    summaryText = rebuilt.summary_text;
    highlights = rebuilt.highlights_json;
  }

  const companions = normalizePortableCompanions(portableState.companions);
  const companionPortable = companions.roster.find((entry) => entry.id === companionId) ?? null;
  const stage = resolveMuseEvolutionStage({
    companionId,
    unlockedCosmetics: companionPortable?.cosmeticsUnlocked ?? []
  });

  const streakValue = readPortableItem(portableItems, 'mission_daily_streak_days');
  const toneValue = readPortableItem(portableItems, 'tone');
  const reactionsValue =
    readPortableItem(portableItems, 'reactions_enabled') ?? readPortableItem(portableItems, 'reactionsEnabled');
  const reducedMotionValue =
    readPortableItem(portableItems, 'reduced_motion') ?? readPortableItem(portableItems, 'reducedMotion');

  return {
    version: 'cw-0.1',
    userId,
    companionId,
    generatedAt,
    consent: {
      emotionalAdaptation:
        typeof preferenceRow.consent_emotional_adaptation === 'boolean'
          ? preferenceRow.consent_emotional_adaptation
          : typeof preferenceRow.consent_adaptation === 'boolean'
            ? preferenceRow.consent_adaptation
            : true,
      crossAppContinuity:
        typeof preferenceRow.consent_cross_app_continuity === 'boolean'
          ? preferenceRow.consent_cross_app_continuity
          : false
    },
    emotionalState: {
      mood:
        emotionalRow.mood === 'luminous' || emotionalRow.mood === 'dim' || emotionalRow.mood === 'steady'
          ? emotionalRow.mood
          : 'steady',
      trust: clampNumber(emotionalRow.trust),
      bond: clampNumber(emotionalRow.bond),
      streakMomentum: clampNumber(emotionalRow.streak_momentum),
      volatility: clampNumber(emotionalRow.volatility),
      recentTone: typeof emotionalRow.recent_tone === 'string' ? emotionalRow.recent_tone : null,
      lastMilestoneAt: typeof emotionalRow.last_milestone_at === 'string' ? emotionalRow.last_milestone_at : null,
      updatedAt: typeof emotionalRow.updated_at === 'string' ? emotionalRow.updated_at : null
    },
    memorySummary: {
      summaryText,
      highlights
    },
    progression: {
      bondLevel: Math.max(0, Math.floor(companionRow.stats?.bond_level ?? 0)),
      stage: stage.key,
      streak: Math.max(0, Math.floor(typeof streakValue === 'number' ? streakValue : 0))
    },
    prefs: {
      tone: typeof toneValue === 'string' ? toneValue : null,
      reactionsEnabled:
        typeof reactionsValue === 'boolean'
          ? reactionsValue
          : typeof preferenceRow.consent_reactions === 'boolean'
            ? preferenceRow.consent_reactions
            : true,
      reducedMotion: typeof reducedMotionValue === 'boolean' ? reducedMotionValue : false
    }
  };
};
