import type { PageServerLoad } from './$types';
import type { SupabaseClient } from '@supabase/supabase-js';
import { supabaseServer } from '$lib/supabaseClient';
import { getPlayerStats } from '$lib/server/queries/getPlayerStats';
import { reportHomeLoadIssue } from '$lib/server/logging';
import { recordAnalyticsEvent } from '$lib/server/analytics';
import type { FeedItem } from '$lib/social/types';

type MissionSummary = {
  id: string;
  title?: string | null;
  summary?: string | null;
  difficulty?: string | null;
  energy_reward?: number | null;
  xp_reward?: number | null;
};

type CreatureMoment = {
  id: string;
  name?: string | null;
  species?: string | null;
  mood?: string | null;
  mood_label?: string | null;
  next_care_at?: string | null;
};

const DEFAULT_ENDCAP = {
  title: 'Welcome back',
  description: 'Explore your community for a quick boost.',
  href: '/app/home'
};

export const load: PageServerLoad = async (event) => {
  const parent = await event.parent();
  const { session } = parent;

  const diagnostics: string[] = [];
  const safe = {
    stats: null as Awaited<ReturnType<typeof getPlayerStats>>,
    feed: [] as FeedItem[],
    missions: [] as MissionSummary[],
    creatures: [] as CreatureMoment[],
    endcap: DEFAULT_ENDCAP,
    landingVariant: parent.landingVariant ?? null,
    diagnostics,
    preferences: parent.preferences ?? null,
    notificationsUnread: parent.notificationsUnread ?? 0
  };

  try {
    const supabase: SupabaseClient = event.locals.supabase ?? supabaseServer(event);

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

      feedItems = Array.isArray(data) ? (data as FeedItem[]) : [];
    } catch (err) {
      diagnostics.push('feed_query_failed');
      reportHomeLoadIssue('feed_query_failed', { error: err instanceof Error ? err.message : String(err) });
    }

    let missionSuggestions: MissionSummary[] = [];
    try {
      const { data } = await supabase
        .from('missions')
        .select('id, title, summary, difficulty, energy_reward, xp_reward')
        .limit(4)
        .throwOnError();

      missionSuggestions = (data as MissionSummary[] | null)?.filter(Boolean).slice(0, 2) ?? [];
    } catch (err) {
      diagnostics.push('missions_query_failed');
      reportHomeLoadIssue('missions_query_failed', { error: err instanceof Error ? err.message : String(err) });
    }

    let creatureMoments: CreatureMoment[] = [];
    if (session?.user?.id) {
      try {
        const { data } = await supabase
          .from('creatures')
          .select('id, name, species, mood, mood_label, next_care_at')
          .eq('owner_id', session.user.id)
          .order('next_care_at', { ascending: true })
          .limit(3)
          .throwOnError();

        creatureMoments = (data as CreatureMoment[] | null)?.filter(Boolean) ?? [];
      } catch (err) {
        diagnostics.push('creatures_query_failed');
        reportHomeLoadIssue('creatures_query_failed', { error: err instanceof Error ? err.message : String(err) });
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

    if (session?.user?.id) {
      const landedAtCookie = event.cookies.get('looma_landing_at');
      const landedAt = landedAtCookie ? Number(landedAtCookie) : null;
      const dwellMs = landedAt && Number.isFinite(landedAt) ? Date.now() - landedAt : null;
      await recordAnalyticsEvent(supabase, session.user.id, 'app_feed_load', {
        surface: 'home',
        variant: parent.landingVariant ?? null,
        payload: {
          dwell_ms: dwellMs ?? null,
          feed_items: feedItems.length
        }
      });
    }

    return {
      stats,
      feed: feedItems,
      missions: missionSuggestions,
      creatures: creatureMoments,
      endcap,
      landingVariant: parent.landingVariant ?? null,
      diagnostics,
      preferences: parent.preferences ?? null,
      notificationsUnread: parent.notificationsUnread ?? 0
    };
  } catch (err) {
    diagnostics.push('home_load_failed');
    reportHomeLoadIssue('home_load_failed', {
      error: err instanceof Error ? err.message : String(err)
    });

    return safe;
  }
};
