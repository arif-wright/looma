import type { PageServerLoad } from './$types';
import type { SupabaseClient } from '@supabase/supabase-js';
import { supabaseServer } from '$lib/supabaseClient';
import { getPlayerStats } from '$lib/server/queries/getPlayerStats';
import { reportHomeLoadIssue } from '$lib/server/logging';
import { recordAnalyticsEvent } from '$lib/server/analytics';
import type { FeedItem } from '$lib/social/types';
import { getWalletWithTransactions } from '$lib/server/econ/index';
import { ensureBlockedPeers, isBlockedPeer } from '$lib/server/blocks';
import type { ActiveCompanionSnapshot } from '$lib/stores/companions';
import { getCompanionRituals } from '$lib/server/companions/rituals';
import type { CompanionRitual } from '$lib/companions/rituals';
import { getDailySet, getWeeklySet } from '$lib/server/missions/rotation';

type MissionSummary = {
  id: string;
  title?: string | null;
  summary?: string | null;
  difficulty?: string | null;
  energy_reward?: number | null;
  xp_reward?: number | null;
  type?: 'identity' | 'action' | 'world' | null;
  cost?: { energy?: number } | null;
  requirements?: { minLevel?: number; minEnergy?: number } | null;
  requires?: Record<string, unknown> | null;
  min_level?: number | null;
  tags?: string[] | null;
  weight?: number | null;
  cooldown_ms?: number | null;
  cooldownMs?: number | null;
  privacy_tags?: string[] | null;
};

type CreatureMoment = {
  id: string;
  name?: string | null;
  species?: string | null;
  mood?: string | null;
  mood_label?: string | null;
  state?: string | null;
  is_active?: boolean | null;
  slot_index?: number | null;
  affection?: number | null;
  trust?: number | null;
  energy?: number | null;
  avatar_url?: string | null;
  updated_at?: string | null;
  stats?: Record<string, unknown> | Array<Record<string, unknown>> | null;
};

const DEFAULT_ENDCAP = {
  title: 'Welcome back',
  description: 'Explore your community for a quick boost.',
  href: '/app/home'
};

export const load: PageServerLoad = async (event) => {
  const parent = await event.parent();
  const session = event.locals.session ?? null;
  const userId = session?.user?.id ?? null;
  const parentActiveCompanion: ActiveCompanionSnapshot | null = (parent as Record<string, any>).activeCompanion ?? null;

  const diagnostics: string[] = [];
  const safe = {
    stats: null as Awaited<ReturnType<typeof getPlayerStats>>,
    feed: [] as FeedItem[],
    missions: [] as MissionSummary[],
    dailyMissions: [] as MissionSummary[],
    weeklyMissions: [] as MissionSummary[],
    creatures: [] as CreatureMoment[],
    endcap: DEFAULT_ENDCAP,
    landingVariant: parent.landingVariant ?? null,
    diagnostics,
    preferences: parent.preferences ?? null,
    notificationsUnread: parent.notificationsUnread ?? 0,
    wallet: null as Awaited<ReturnType<typeof getWalletWithTransactions>>['wallet'] | null,
    walletTx: [] as Awaited<ReturnType<typeof getWalletWithTransactions>>['transactions'],
    flags: { bond_genesis: false },
    companionCount: 0,
    rituals: [] as CompanionRitual[],
    activeCompanion: parentActiveCompanion
  };

  try {
    const supabase: SupabaseClient = event.locals.supabase ?? supabaseServer(event);
    const blockPeers = await ensureBlockedPeers(event, supabase);

    let stats = null;
    try {
      stats = await getPlayerStats(event, supabase);
    } catch (err) {
      diagnostics.push('stats_query_failed');
      reportHomeLoadIssue('stats_query_failed', { error: err instanceof Error ? err.message : String(err) });
    }

    let feedItems: FeedItem[] = [];
    try {
      const { data, error } = await supabase
        .from('feed_view')
        .select(
          [
            'id',
            'user_id',
            'author_id',
            'slug',
            'kind',
            'body',
            'text',
            'meta',
            'image_url',
            'is_public',
            'created_at',
            'deep_link_target',
            'author_name',
            'author_handle',
            'author_avatar',
            'comment_count',
            'reaction_like_count',
            'reaction_spark_count',
            'reaction_support_count',
            'current_user_reaction',
            'is_follow',
            'engagement',
            'recency',
            'score'
          ].join(', ')
        )
        .order('score', { ascending: false })
        .order('created_at', { ascending: false })
        .limit(20);

      if (error) {
        throw error;
      }

      feedItems = Array.isArray(data) ? ((data as unknown) as FeedItem[]) : [];
      if (blockPeers.size) {
        feedItems = feedItems.filter((item) => {
          const authorId = (item.author_id ?? item.user_id ?? null) as string | null;
          if (isBlockedPeer(blockPeers, authorId)) return false;
          if (item.sharedBy?.id && isBlockedPeer(blockPeers, item.sharedBy.id)) {
            return false;
          }
          return true;
        });
      }
    } catch (err) {
      diagnostics.push('feed_query_failed');
      reportHomeLoadIssue('feed_query_failed', { error: err instanceof Error ? err.message : String(err) });
    }

    let missionSuggestions: MissionSummary[] = [];
    let dailyMissionSuggestions: MissionSummary[] = [];
    let weeklyMissionSuggestions: MissionSummary[] = [];
    try {
      const { data } = await supabase
        .from('missions')
        .select(
          'id, title, summary, difficulty, status, energy_reward, xp_reward, type, cost, requirements, requires, min_level, tags, weight, cooldown_ms, privacy_tags'
        )
        .eq('status', 'available')
        .limit(32)
        .throwOnError();

      const missionPool = (data as MissionSummary[] | null)?.filter(Boolean) ?? [];
      const today = new Date().toISOString().slice(0, 10);
      const baseSeed = `${today}:${userId ?? 'anon'}`;
      const userLevel = typeof stats?.level === 'number' ? stats.level : 0;
      const now = new Date();
      const utcYear = now.getUTCFullYear();
      const janFirstUtc = new Date(Date.UTC(utcYear, 0, 1));
      const dayOfYear = Math.floor((Date.parse(today) - Date.UTC(utcYear, 0, 1)) / 86400000) + 1;
      const isoWeek = Math.ceil((dayOfYear + janFirstUtc.getUTCDay() + 1) / 7);
      const isoWeekSeed = `${utcYear}-W${String(isoWeek).padStart(2, '0')}`;

      dailyMissionSuggestions = getDailySet(missionPool, today, {
        limit: 3,
        requiredTags: ['daily'],
        userLevel,
        includeIdentityForEnergyDaily: false,
        globalSeed: 'looma-missions-v1',
        scopeKey: `${baseSeed}:daily`
      });

      weeklyMissionSuggestions = getWeeklySet(
        missionPool.filter((entry) => !dailyMissionSuggestions.some((pick) => pick.id === entry.id)),
        isoWeekSeed,
        {
          limit: 3,
          requiredTags: ['weekly'],
          userLevel,
          globalSeed: 'looma-missions-v1',
          scopeKey: `${baseSeed}:weekly`
        }
      );

      missionSuggestions = [...dailyMissionSuggestions, ...weeklyMissionSuggestions].slice(0, 3);
    } catch (err) {
      diagnostics.push('missions_query_failed');
      reportHomeLoadIssue('missions_query_failed', { error: err instanceof Error ? err.message : String(err) });
    }

    let creatureMoments: CreatureMoment[] = [];
    if (session?.user?.id) {
      try {
        const { data } = await supabase
          .from('companions')
          .select(
            'id, name, species, mood, state, is_active, slot_index, created_at, updated_at, affection, trust, energy, avatar_url, stats:companion_stats(fed_at, played_at, groomed_at, last_passive_tick, last_daily_bonus_at, bond_level, bond_score)'
          )
          .eq('owner_id', session.user.id)
          .order('is_active', { ascending: false })
          .order('slot_index', { ascending: true, nullsFirst: false })
          .order('created_at', { ascending: true })
          .limit(3)
          .throwOnError();

        creatureMoments =
          (data as CreatureMoment[] | null)?.map((row) => {
            const statsRaw = (row as any).stats ?? null;
            const stats = Array.isArray(statsRaw) ? statsRaw[0] ?? null : statsRaw;
            return {
              ...row,
              stats,
              mood_label: row.mood ?? row.state ?? 'steady'
            };
          }) ?? [];
      } catch (err) {
        diagnostics.push('creatures_query_failed');
        reportHomeLoadIssue('creatures_query_failed', { error: err instanceof Error ? err.message : String(err) });
      }
    }

    let wallet = safe.wallet;
    let walletTx = safe.walletTx;
    let flags = { ...safe.flags };
    let companionCount = safe.companionCount;
    let rituals: CompanionRitual[] = safe.rituals;

    if (session?.user?.id) {
      try {
        const summary = await getWalletWithTransactions(supabase, session.user.id, 10);
        wallet = summary.wallet;
        walletTx = summary.transactions;
      } catch (err) {
        diagnostics.push('wallet_query_failed');
        reportHomeLoadIssue('wallet_query_failed', {
          error: err instanceof Error ? err.message : String(err)
        });
      }

      try {
        const { count, error } = await supabase
          .from('companions')
          .select('id', { count: 'exact', head: true })
          .eq('owner_id', session.user.id);
        if (error) {
          throw error;
        }
        companionCount = count ?? 0;
      } catch (err) {
        diagnostics.push('companion_count_failed');
        reportHomeLoadIssue('companion_count_failed', {
          error: err instanceof Error ? err.message : String(err)
        });
      }
    }

    try {
      const { data, error } = await supabase
        .from('feature_flags')
        .select('key, enabled')
        .eq('key', 'bond_genesis')
        .maybeSingle();
      if (error) {
        throw error;
      }
      flags.bond_genesis = Boolean(data?.enabled);
    } catch (err) {
      diagnostics.push('flags_query_failed');
      reportHomeLoadIssue('flags_query_failed', {
        error: err instanceof Error ? err.message : String(err)
      });
    }

    if (userId) {
      try {
        rituals = await getCompanionRituals(supabase, userId);
      } catch (err) {
        console.error('[home] failed to fetch rituals', err);
      }
    }

    const endcap =
      missionSuggestions[0]
        ? {
            title: 'Knock out a mission',
            description: missionSuggestions[0].title ?? 'Pick up where you left off.',
            href: `/app/missions/${missionSuggestions[0].id}`
          }
        : creatureMoments[0]
        ? {
            title: 'Check on your companion',
            description: 'Spend a moment with your favourite creature before you go.',
            href: `/app/creatures?focus=${creatureMoments[0].id}`
          }
        : DEFAULT_ENDCAP;

    if (userId) {
      const landedAtCookie = event.cookies.get('looma_landing_at');
      const landedAt = landedAtCookie ? Number(landedAtCookie) : null;
      const dwellMs = landedAt && Number.isFinite(landedAt) ? Date.now() - landedAt : null;
      await recordAnalyticsEvent(supabase, userId, 'app_feed_load', {
        surface: 'home',
        variant: parent.landingVariant ?? null,
        payload: {
          dwell_ms: dwellMs ?? null,
          feed_items: feedItems.length
        }
      });
    }

    const rowToSnapshot = (row: CreatureMoment): ActiveCompanionSnapshot => {
      const statsRaw = (row.stats ?? null) as Record<string, any> | Array<Record<string, any>> | null;
      const statsRow = Array.isArray(statsRaw) ? statsRaw[0] ?? null : statsRaw;
      return {
        id: row.id,
        name: row.name ?? 'Companion',
        species: row.species ?? null,
        mood: row.mood ?? row.state ?? null,
        affection: row.affection ?? 0,
        trust: row.trust ?? 0,
        energy: row.energy ?? 0,
        avatar_url: row.avatar_url ?? null,
        bondLevel: 0,
        bondScore: 0,
        updated_at: row.updated_at ?? null,
        stats: statsRow
          ? {
              fed_at: (statsRow.fed_at as string | null) ?? null,
              played_at: (statsRow.played_at as string | null) ?? null,
              groomed_at: (statsRow.groomed_at as string | null) ?? null,
              last_passive_tick: (statsRow.last_passive_tick as string | null) ?? null,
              last_daily_bonus_at: (statsRow.last_daily_bonus_at as string | null) ?? null,
              bond_level: (statsRow.bond_level as number | null) ?? null,
              bond_score: (statsRow.bond_score as number | null) ?? null
            }
          : null
      };
    };

    const fallbackCompanion = creatureMoments.find((c) => c.is_active) ?? creatureMoments[0] ?? null;
    const activeCompanion =
      parentActiveCompanion ?? (fallbackCompanion ? rowToSnapshot(fallbackCompanion) : null);

    return {
      stats,
      feed: feedItems,
      missions: missionSuggestions,
      dailyMissions: dailyMissionSuggestions,
      weeklyMissions: weeklyMissionSuggestions,
      creatures: creatureMoments,
      endcap,
      landingVariant: parent.landingVariant ?? null,
      diagnostics,
      preferences: parent.preferences ?? null,
      notificationsUnread: parent.notificationsUnread ?? 0,
      wallet,
      walletTx,
      flags,
      companionCount,
      rituals,
      activeCompanion
    };
  } catch (err) {
    diagnostics.push('home_load_failed');
    reportHomeLoadIssue('home_load_failed', {
      error: err instanceof Error ? err.message : String(err)
    });

    return { ...safe, activeCompanion: parentActiveCompanion ?? null };
  }
};
