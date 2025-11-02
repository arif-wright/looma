import type { SupabaseClient } from '@supabase/supabase-js';
import { supabaseAdmin } from '$lib/server/supabase';

type SupabaseService = SupabaseClient<any, 'public', any>;

export type Facts = {
  userId: string;
  slug: string;
  gameId?: string | null;
  score?: number;
  durationMs?: number;
  sessionId?: string;
  completedSessionsForGame?: number;
  currentStreakDays?: number;
  nowUtc?: string;
};

type BaseRule = {
  kind: string;
  slug?: string;
};

export type FirstClearRule = BaseRule & {
  kind: 'first_clear';
};

export type ScoreThresholdRule = BaseRule & {
  kind: 'score_threshold';
  gte: number;
};

export type SessionsCompletedRule = BaseRule & {
  kind: 'sessions_completed';
  gte: number;
};

export type StreakDaysRule = BaseRule & {
  kind: 'streak_days';
  gte: number;
};

export type WeeklyTopRankRule = BaseRule & {
  kind: 'weekly_top_rank';
  rank_lte: number;
};

export type AchievementRule =
  | FirstClearRule
  | ScoreThresholdRule
  | SessionsCompletedRule
  | StreakDaysRule
  | WeeklyTopRankRule;

export type AchievementDefinition = {
  id: string;
  key: string;
  name: string;
  description: string;
  icon: string;
  rarity: 'common' | 'rare' | 'epic' | 'legendary';
  points: number;
  game_id: string | null;
  rule: AchievementRule;
};

export type UnlockMeta = Record<string, unknown>;

export type UnlockSummary = {
  achievementId: string;
  key: string;
  name: string;
  icon: string;
  points: number;
  rarity: AchievementDefinition['rarity'];
  meta: UnlockMeta;
};

export type EvaluationResult = {
  unlocked: UnlockSummary[];
};

type InternalRule = AchievementRule | null;

const GLOBAL_CACHE_KEY = '__all__';

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null;

const toNumber = (value: unknown): number | null => {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string') {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return null;
};

const cleanMeta = (input: UnlockMeta | null | undefined): UnlockMeta => {
  if (!isRecord(input)) return {};
  const result: UnlockMeta = {};
  for (const [key, value] of Object.entries(input)) {
    if (
      value === null ||
      typeof value === 'number' ||
      typeof value === 'string' ||
      typeof value === 'boolean' ||
      Array.isArray(value) ||
      isRecord(value)
    ) {
      result[key] = value;
    }
  }
  return result;
};

const parseRule = (raw: unknown): InternalRule => {
  if (!isRecord(raw) || typeof raw.kind !== 'string') return null;
  const base: BaseRule = { kind: raw.kind, slug: typeof raw.slug === 'string' ? raw.slug : undefined };

  switch (raw.kind) {
    case 'first_clear':
      return base as FirstClearRule;
    case 'score_threshold': {
      const gte = toNumber(raw.gte);
      if (gte === null) return null;
      return { ...(base as BaseRule), kind: 'score_threshold', gte } as ScoreThresholdRule;
    }
    case 'sessions_completed': {
      const gte = toNumber(raw.gte);
      if (gte === null) return null;
      return { ...(base as BaseRule), kind: 'sessions_completed', gte } as SessionsCompletedRule;
    }
    case 'streak_days': {
      const gte = toNumber(raw.gte);
      if (gte === null) return null;
      return { ...(base as BaseRule), kind: 'streak_days', gte } as StreakDaysRule;
    }
    case 'weekly_top_rank': {
      const rank = toNumber(raw.rank_lte);
      if (rank === null) return null;
      return { ...(base as BaseRule), kind: 'weekly_top_rank', rank_lte: Math.max(1, Math.floor(rank)) } as WeeklyTopRankRule;
    }
    default:
      return null;
  }
};

const matchesSlug = (rule: AchievementRule, facts: Facts): boolean => {
  if (!rule.slug) return true;
  return rule.slug === facts.slug;
};

const toDate = (input?: string): Date => {
  if (input) {
    const parsed = new Date(input);
    if (!Number.isNaN(parsed.valueOf())) return parsed;
  }
  return new Date();
};

export const evalFirstClear = (rule: FirstClearRule, facts: Facts): UnlockMeta | null => {
  if (!matchesSlug(rule, facts)) return null;
  if (facts.completedSessionsForGame !== 1) return null;
  return cleanMeta({ sessionId: facts.sessionId ?? null });
};

export const evalScoreThreshold = (rule: ScoreThresholdRule, facts: Facts): UnlockMeta | null => {
  if (!matchesSlug(rule, facts)) return null;
  const score = facts.score;
  if (typeof score !== 'number' || !Number.isFinite(score)) return null;
  if (score < rule.gte) return null;
  return cleanMeta({ score, threshold: rule.gte });
};

export const evalSessionsCompleted = (
  rule: SessionsCompletedRule,
  facts: Facts
): UnlockMeta | null => {
  if (!matchesSlug(rule, facts)) return null;
  const total = facts.completedSessionsForGame ?? 0;
  if (total < rule.gte) return null;
  return cleanMeta({ sessions: total, requirement: rule.gte });
};

export const evalStreakDays = (rule: StreakDaysRule, facts: Facts): UnlockMeta | null => {
  if (!matchesSlug(rule, facts)) return null;
  const streak = facts.currentStreakDays ?? 0;
  if (streak < rule.gte) return null;
  return cleanMeta({ streakDays: streak, requirement: rule.gte });
};

export const evalWeeklyTopRank = async (
  rule: WeeklyTopRankRule,
  facts: Facts,
  supabase: SupabaseService
): Promise<UnlockMeta | null> => {
  if (!matchesSlug(rule, facts)) return null;
  const gameId = facts.gameId;
  if (!gameId) return null;

  const now = toDate(facts.nowUtc).toISOString();

  const { data, error } = await supabase.rpc('fn_leader_weekly_rank', {
    p_game: gameId,
    p_user: facts.userId,
    p_now: now
  });

  if (error) {
    console.error('[achievements] weekly rank rpc failed', error, { gameId, userId: facts.userId });
    return null;
  }

  const rank = Array.isArray(data) ? (data[0] as number | null | undefined) : (data as number | null | undefined);
  if (!Number.isFinite(rank ?? NaN)) return null;
  if ((rank as number) > rule.rank_lte) return null;

  return cleanMeta({ rank: rank ?? null, cutoff: rule.rank_lte });
};

export const createAchievementEvaluator = (options?: { supabase?: SupabaseService }) => {
  const supabase = options?.supabase ?? supabaseAdmin;
  const catalogCache = new Map<string, AchievementDefinition[]>();
  const unlockedCache = new Map<string, Set<string>>();

  const getCatalogForGame = async (slug?: string, gameId?: string | null): Promise<AchievementDefinition[]> => {
    const cacheKey = slug ?? (gameId ?? GLOBAL_CACHE_KEY);
    if (catalogCache.has(cacheKey)) {
      return catalogCache.get(cacheKey) ?? [];
    }

    const { data, error } = await supabase
      .from('achievements')
      .select('id, key, name, description, icon, rarity, points, game_id, rule, is_active');

    if (error) {
      console.error('[achievements] failed to load catalog', error);
      catalogCache.set(cacheKey, []);
      return [];
    }

    const rows = Array.isArray(data) ? data : [];
    const parsed: AchievementDefinition[] = [];

    for (const row of rows) {
      if (!row || row.is_active === false) continue;
      if (typeof row.id !== 'string' || typeof row.key !== 'string') continue;
      if (typeof row.name !== 'string' || typeof row.description !== 'string') continue;
      const rule = parseRule(row.rule);
      if (!rule) continue;

      parsed.push({
        id: row.id,
        key: row.key,
        name: row.name,
        description: row.description,
        icon: typeof row.icon === 'string' && row.icon ? row.icon : 'trophy',
        rarity: (typeof row.rarity === 'string' ? row.rarity : 'common') as AchievementDefinition['rarity'],
        points: typeof row.points === 'number' && Number.isFinite(row.points) ? row.points : 0,
        game_id: typeof row.game_id === 'string' ? row.game_id : null,
        rule
      });
    }

    catalogCache.set(GLOBAL_CACHE_KEY, parsed);

    const filtered = parsed.filter((item) => {
      if (!slug && !gameId) return true;
      if (item.game_id === null) return true;
      if (gameId && item.game_id === gameId) return true;
      return false;
    });

    catalogCache.set(cacheKey, filtered);
    return filtered;
  };

  const userHas = async (userId: string, achievementId: string): Promise<boolean> => {
    if (!userId || !achievementId) return false;
    const existing = unlockedCache.get(userId);
    if (existing && existing.has(achievementId)) {
      return true;
    }

    const { error, count } = await supabase
      .from('user_achievements')
      .select('id', { head: true, count: 'exact' })
      .eq('user_id', userId)
      .eq('achievement_id', achievementId);

    if (error) {
      console.error('[achievements] failed to check unlock', error, { userId, achievementId });
      return false;
    }

    if (count && count > 0) {
      if (!existing) {
        unlockedCache.set(userId, new Set([achievementId]));
      } else {
        existing.add(achievementId);
      }
      return true;
    }

    return false;
  };

  const unlock = async (
    userId: string,
    achievement: AchievementDefinition,
    meta: UnlockMeta
  ): Promise<UnlockSummary | null> => {
    if (!userId) return null;
    const payload = {
      user_id: userId,
      achievement_id: achievement.id,
      meta
    };

    const insert = await supabase
      .from('user_achievements')
      .insert(payload)
      .select('id')
      .single();

    if (insert.error) {
      if (insert.error.code === '23505') {
        return null;
      }
      console.error('[achievements] failed to unlock', insert.error, payload);
      throw insert.error;
    }

    let cache = unlockedCache.get(userId);
    if (!cache) {
      cache = new Set([achievement.id]);
      unlockedCache.set(userId, cache);
    } else {
      cache.add(achievement.id);
    }

    if (achievement.points > 0) {
      const { error } = await supabase.rpc('fn_add_points', {
        p_user: userId,
        p_delta: achievement.points
      });

      if (error) {
        console.error('[achievements] failed to add points', error, {
          userId,
          achievementId: achievement.id
        });
      }
    }

    return {
      achievementId: achievement.id,
      key: achievement.key,
      name: achievement.name,
      icon: achievement.icon,
      points: achievement.points,
      rarity: achievement.rarity,
      meta
    };
  };

  const evaluateRule = async (
    achievement: AchievementDefinition,
    facts: Facts
  ): Promise<UnlockMeta | null> => {
    switch (achievement.rule.kind) {
      case 'first_clear':
        return evalFirstClear(achievement.rule, facts);
      case 'score_threshold':
        return evalScoreThreshold(achievement.rule, facts);
      case 'sessions_completed':
        return evalSessionsCompleted(achievement.rule, facts);
      case 'streak_days':
        return evalStreakDays(achievement.rule, facts);
      case 'weekly_top_rank':
        return evalWeeklyTopRank(achievement.rule, facts, supabase);
      default:
        return null;
    }
  };

  const evaluate = async (facts: Facts): Promise<EvaluationResult> => {
    if (!facts.userId) return { unlocked: [] };
    const catalog = await getCatalogForGame(facts.slug, facts.gameId);
    const unlocked: UnlockSummary[] = [];

    for (const achievement of catalog) {
      const meta = await evaluateRule(achievement, facts);
      if (!meta) continue;
      if (await userHas(facts.userId, achievement.id)) continue;

      const summary = await unlock(facts.userId, achievement, meta);
      if (summary) {
        unlocked.push(summary);
      }
    }

    return { unlocked };
  };

  return {
    getCatalogForGame,
    userHas,
    unlock,
    evaluate
  };
};

export type AchievementEvaluator = ReturnType<typeof createAchievementEvaluator>;
