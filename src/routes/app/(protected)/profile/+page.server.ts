import { error } from '@sveltejs/kit';
import { env } from '$env/dynamic/public';
import { createClient, type User } from '@supabase/supabase-js';
import type { PageServerLoad } from './$types';
import { requireUserServer } from '$lib/server/auth';
import { normalizeHandle } from '$lib/utils/handle';
import type { PostRow } from '$lib/social/types';
import { getFollowCounts } from '$lib/server/follows';
import { getFollowPrivacyStatus } from '$lib/server/privacy';
import { PUBLIC_SUPABASE_URL } from '$env/static/public';
import { SUPABASE_SERVICE_ROLE_KEY } from '$env/static/private';

const service = createClient(PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false }
});

type ProfileRow = {
  id: string;
  handle: string;
  display_name: string | null;
  avatar_url: string | null;
  banner_url: string | null;
  bio: string | null;
  links: Record<string, unknown>[] | null;
  is_private: boolean | null;
  account_private: boolean | null;
  joined_at: string | null;
  featured_companion_id: string | null;
  show_shards: boolean | null;
  show_level: boolean | null;
  show_joined: boolean | null;
  show_location: boolean | null;
  show_achievements: boolean | null;
  show_feed: boolean | null;
};

type StatsRow = {
  level: number | null;
  xp: number | null;
  xp_next: number | null;
  energy: number | null;
  energy_max: number | null;
};

type CompanionRow = {
  id: string;
  owner_id: string;
  name: string;
  species: string;
  avatar_url: string | null;
  rarity: string;
  level: number;
  xp: number;
  affection: number;
  trust: number;
  energy: number;
  mood: string;
  created_at: string;
  updated_at: string;
};

type AchievementRow = {
  unlocked_at: string | null;
  achievements: {
    name?: string | null;
    title?: string | null;
    key?: string | null;
    icon?: string | null;
  } | null;
};

const PROFILE_COLUMNS =
  'id, handle, display_name, avatar_url, banner_url, bio, pronouns, location, links, is_private, account_private, joined_at, featured_companion_id, show_shards, show_level, show_joined, show_location, show_achievements, show_feed';

const POSTS_PAGE_SIZE = 10;

const randomSuffix = () => Math.random().toString(36).slice(2, 8);

const buildHandleCandidate = (base: string, suffix: string) => {
  const sanitized = normalizeHandle(base) || 'player';
  const allowance = Math.max(3, 20 - (suffix.length + 1));
  const clipped = sanitized.slice(0, allowance);
  return `${clipped}_${suffix}`;
};

const resolveDisplayName = (user: User) => {
  const metadata = (user.user_metadata ?? {}) as Record<string, unknown>;
  return (
    (metadata.display_name as string) ??
    (metadata.full_name as string) ??
    (metadata.name as string) ??
    user.email?.split('@')[0] ??
    'Explorer'
  );
};

const ensureProfile = async (supabase: App.Locals['supabase'], user: User): Promise<ProfileRow> => {
  const { data, error: fetchError } = await supabase
    .from('profiles')
    .select(PROFILE_COLUMNS)
    .eq('id', user.id)
    .maybeSingle();

  if (fetchError) {
    console.error('[profile] profile lookup failed', fetchError);
    throw error(500, 'Unable to load profile');
  }

  if (data) {
    return data as ProfileRow;
  }

  const displayName = resolveDisplayName(user);
  const baseHandle =
    (user.user_metadata?.handle as string | undefined) ??
    (user.user_metadata?.preferred_username as string | undefined) ??
    user.email?.split('@')[0] ??
    'player';

  for (let attempt = 0; attempt < 6; attempt += 1) {
    const suffix = randomSuffix();
    const handle = buildHandleCandidate(baseHandle, suffix);
    const { data: inserted, error: insertError } = await supabase
      .from('profiles')
      .upsert(
        {
          id: user.id,
          handle,
          display_name: displayName,
          bio: '',
          links: [],
          is_private: false
        },
        { onConflict: 'id', ignoreDuplicates: false }
      )
      .select(PROFILE_COLUMNS)
      .single();

    if (!insertError && inserted) {
      return inserted as ProfileRow;
    }

    if (insertError?.code === '23505' || insertError?.message?.includes('handle')) {
      continue;
    }

    console.error('[profile] profile upsert failed', insertError);
    break;
  }

  throw error(500, 'Unable to create profile');
};

const parseLinks = (value: ProfileRow['links']) => {
  if (!Array.isArray(value)) return [];
  return value
    .map((entry) => {
      if (!entry || typeof entry !== 'object') return null;
      const label = String((entry as Record<string, unknown>).label ?? '').trim();
      const url = String((entry as Record<string, unknown>).url ?? '').trim();
      if (!label || !url) return null;
      return { label, url };
    })
    .filter((entry): entry is { label: string; url: string } => Boolean(entry));
};

const encodeCursor = (row: PostRow | null | undefined) =>
  row ? `${row.created_at}|${row.id}` : null;

const fetchPosts = async (
  supabase: App.Locals['supabase'],
  authorId: string,
  includePrivate: boolean
) => {
  const { data, error: postsError } = await supabase.rpc('get_user_posts', {
    p_user: authorId,
    p_limit: POSTS_PAGE_SIZE,
    p_before: new Date().toISOString()
  });

  if (postsError) {
    console.error('[profile] feed lookup failed', postsError);
    return { items: [] as PostRow[], nextCursor: null };
  }

  const rows = Array.isArray(data) ? (data as PostRow[]) : [];
  const filtered = includePrivate ? rows : rows.filter((row) => row.is_public ?? true);
  return {
    items: filtered,
    nextCursor: filtered.length === POSTS_PAGE_SIZE ? encodeCursor(filtered.at(-1)) : null
  };
};

const fetchFeaturedCompanion = async (
  supabase: App.Locals['supabase'],
  companionId: string | null
) => {
  if (!companionId) return null;
  const { data, error: companionError } = await supabase
    .from('companions')
    .select(
      'id, owner_id, name, species, rarity, avatar_url, level, xp, affection, trust, energy, mood, created_at, updated_at'
    )
    .eq('id', companionId)
    .maybeSingle();

  if (companionError) {
    console.error('[profile] featured companion lookup failed', companionError);
    return null;
  }

  return (data as CompanionRow | null) ?? null;
};

const fetchCompanionOptions = async (supabase: App.Locals['supabase'], ownerId: string) => {
  const { data, error } = await supabase
    .from('companions')
    .select(
      'id, owner_id, name, species, rarity, avatar_url, level, xp, affection, trust, energy, mood, created_at, updated_at'
    )
    .eq('owner_id', ownerId)
    .order('created_at', { ascending: false })
    .limit(20);

  if (error) {
    console.error('[profile] companion picker lookup failed', error);
    return [];
  }

  return (data as CompanionRow[]) ?? [];
};

const formatWhenLabel = (iso: string | null | undefined) => {
  if (!iso) return '';
  const timestamp = Date.parse(iso);
  if (Number.isNaN(timestamp)) return '';
  const diffMs = Date.now() - timestamp;
  const minute = 60 * 1000;
  const hour = minute * 60;
  const day = hour * 24;
  if (diffMs < hour) {
    const minutes = Math.max(1, Math.round(diffMs / minute));
    return `${minutes}m ago`;
  }
  if (diffMs < day) {
    const hours = Math.max(1, Math.round(diffMs / hour));
    return `${hours}h ago`;
  }
  if (diffMs < day * 30) {
    const days = Math.max(1, Math.round(diffMs / day));
    return `${days}d ago`;
  }
  const months = Math.round(diffMs / (day * 30));
  if (months < 12) {
    return `${Math.max(1, months)}mo ago`;
  }
  const years = Math.max(1, Math.round(months / 12));
  return `${years}y ago`;
};

const fetchRecentAchievements = async (supabase: App.Locals['supabase'], userId: string) => {
  const { data, error } = await supabase
    .from('user_achievements')
    .select(
      'unlocked_at, achievements:achievements!user_achievements_achievement_id_fkey ( name, title, key, icon )'
    )
    .eq('user_id', userId)
    .order('unlocked_at', { ascending: false })
    .limit(8);

  if (error) {
    console.error('[profile] achievements fetch failed', error);
    return [];
  }

  const rows = (data as AchievementRow[] | null) ?? [];
  return rows
    .map((row) => {
      const achievement = row.achievements;
      if (!achievement) return null;
      return {
        title: achievement.title ?? achievement.name ?? achievement.key ?? 'Achievement',
        icon: achievement.icon ?? null,
        when_label: formatWhenLabel(row.unlocked_at)
      };
    })
    .filter((entry): entry is NonNullable<typeof entry> => Boolean(entry));
};

const fetchPinnedPreview = async (
  supabase: App.Locals['supabase'],
  ownerId: string,
  includePrivate: boolean
) => {
  const { data, error } = await supabase
    .from('posts')
    .select('id, body, text, created_at, is_public, slug')
    .eq('user_id', ownerId)
    .eq('is_pinned', true)
    .eq('is_deleted', false)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    console.error('[profile] pinned post lookup failed', error);
    return null;
  }

  if (!data) return null;
  if (!includePrivate && data.is_public === false) return null;
  return {
    id: data.id as string,
    body: (data.text as string | null) ?? (data.body as string | null) ?? '',
    created_at: data.created_at as string,
    slug: (data.slug as string | null) ?? null
  };
};

export const load: PageServerLoad = async (event) => {
  const { supabase, user } = await requireUserServer(event);

  const profileRow = await ensureProfile(supabase, user);
  const parsedLinks = parseLinks(profileRow.links);

  const [
    statsResult,
    walletResult,
    companion,
    companionOptions,
    posts,
    pinned,
    achievements,
    followCounts,
    privacyStatus,
    companionCountResult,
    flagResult
  ] = await Promise.all([
    supabase
      .from('player_stats')
      .select('level, xp, xp_next, energy, energy_max')
      .eq('id', user.id)
      .maybeSingle(),
    supabase.from('user_wallets').select('shards').eq('user_id', user.id).maybeSingle(),
    fetchFeaturedCompanion(supabase, profileRow.featured_companion_id),
    fetchCompanionOptions(supabase, user.id),
    fetchPosts(supabase, user.id, true),
    fetchPinnedPreview(supabase, user.id, true),
    fetchRecentAchievements(supabase, user.id),
    getFollowCounts(user.id),
    getFollowPrivacyStatus(user.id, profileRow.id),
    supabase
      .from('companions')
      .select('id', { count: 'exact', head: true })
      .eq('owner_id', user.id),
    supabase
      .from('feature_flags')
      .select('key, enabled')
      .eq('key', 'bond_genesis')
      .maybeSingle()
  ]);

  if (statsResult.error) {
    console.error('[profile] stats lookup failed', statsResult.error);
  }
  if (walletResult.error) {
    console.error('[profile] wallet lookup failed', walletResult.error);
  }
  if (companionCountResult.error) {
    console.error('[profile] companion count lookup failed', companionCountResult.error);
  }
  if (flagResult.error) {
    console.error('[profile] feature flag lookup failed', flagResult.error);
  }

  const stats = (statsResult.data as StatsRow | null) ?? {
    level: null,
    xp: null,
    xp_next: null,
    energy: null,
    energy_max: null
  };

  const baseUrl = env.PUBLIC_APP_URL ?? event.url.origin;
  const isOwnProfile = true;
  const isFollowing = privacyStatus?.isFollowing ?? false;
  const requested = privacyStatus?.requested ?? false;
  const gated = false;

  const { data: reqs, error: reqError } = await service
    .from('follow_requests')
    .select('requester_id, created_at')
    .eq('target_id', profileRow.id)
    .order('created_at', { ascending: false })
    .limit(20);

  if (reqError) {
    console.error('[profile] follow requests lookup failed', reqError);
  }

  let followRequests: Array<{
    requester_id: string;
    display_name?: string | null;
    handle?: string | null;
    avatar_url?: string | null;
  }> = [];

  if (reqs?.length) {
    const ids = reqs.map((r) => r.requester_id);
    const { data: people, error: peopleError } = await service
      .from('profiles')
      .select('id, display_name, handle, avatar_url')
      .in('id', ids);

    if (peopleError) {
      console.error('[profile] follow request profile lookup failed', peopleError);
    }

    const map = new Map((people ?? []).map((person) => [person.id, person]));
    followRequests = ids.map((id) => {
      const person = map.get(id) ?? {};
      return {
        requester_id: id,
        display_name: person.display_name ?? 'Explorer',
        handle: person.handle ?? 'player',
        avatar_url: person.avatar_url ?? null
      };
    });
  }

  return {
    profile: {
      ...profileRow,
      user_id: profileRow.id,
      links: parsedLinks,
      is_private: Boolean(profileRow.is_private),
      account_private: Boolean(profileRow.account_private),
      achievements
    },
    stats,
    walletShards: walletResult.data?.shards ?? null,
    isOwner: true,
    isOwnProfile,
    isFollowing,
    requested,
    gated,
    featuredCompanion: companion,
    companionOptions,
    posts: posts.items,
    nextCursor: posts.nextCursor,
    pinnedPost: pinned,
    shareUrl: `${baseUrl}/app/u/${profileRow.handle}`,
    followCounts,
    followRequests,
    companionCount: companionCountResult.count ?? 0,
    flags: {
      bond_genesis: Boolean((flagResult.data as { enabled?: boolean } | null)?.enabled)
    }
  };
};
