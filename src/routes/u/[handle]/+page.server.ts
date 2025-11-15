import { error } from '@sveltejs/kit';
import { env } from '$env/dynamic/public';
import type { PageServerLoad } from './$types';
import { supabaseServer } from '$lib/supabaseClient';
import type { PostRow } from '$lib/social/types';
import { getFollowCounts } from '$lib/server/follows';
import { getFollowPrivacyStatus } from '$lib/server/privacy';
import { ensureBlockedPeers, isBlockedPeer } from '$lib/server/blocks';
import { getPersonaSummary } from '$lib/server/persona';

type ProfileRow = {
  id: string;
  user_id?: string | null;
  handle: string;
  display_name: string | null;
  avatar_url: string | null;
  banner_url: string | null;
  bio: string | null;
  pronouns: string | null;
  location: string | null;
  level?: number | null;
  shards_label?: string | null;
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
  state?: string | null;
  is_active?: boolean | null;
  slot_index?: number | null;
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
const EMPTY_STATS = {
  level: null,
  xp: null,
  xp_next: null,
  energy: null,
  energy_max: null
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
  supabase: ReturnType<typeof supabaseServer>,
  authorId: string,
  includePrivate: boolean
) => {
  const { data, error: postsError } = await supabase.rpc('get_user_posts', {
    p_user: authorId,
    p_limit: POSTS_PAGE_SIZE,
    p_before: new Date().toISOString()
  });

  if (postsError) {
    console.error('[public profile] feed lookup failed', postsError);
    return { items: [] as PostRow[], nextCursor: null };
  }

  const rows = Array.isArray(data) ? (data as PostRow[]) : [];
  const filtered = includePrivate ? rows : rows.filter((row) => row.is_public ?? true);
  return {
    items: filtered,
    nextCursor: filtered.length === POSTS_PAGE_SIZE ? encodeCursor(filtered.at(-1)) : null
  };
};

const COMPANION_COLUMNS =
  'id, owner_id, name, species, rarity, avatar_url, level, xp, affection, trust, energy, mood, state, is_active, slot_index, created_at, updated_at';

const fetchFeaturedCompanion = async (
  supabase: ReturnType<typeof supabaseServer>,
  ownerId: string | null
) => {
  if (!ownerId) return null;
  const { data, error: companionError } = await supabase
    .from('companions')
    .select(COMPANION_COLUMNS)
    .eq('owner_id', ownerId)
    .order('is_active', { ascending: false })
    .order('slot_index', { ascending: true, nullsFirst: false })
    .order('created_at', { ascending: true })
    .limit(1);

  if (companionError) {
    console.error('[public profile] featured companion lookup failed', companionError);
    return null;
  }

  return ((data as CompanionRow[] | null)?.[0] ?? null) as CompanionRow | null;
};

const fetchPinnedPreview = async (
  supabase: ReturnType<typeof supabaseServer>,
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
    console.error('[public profile] pinned post lookup failed', error);
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

const fetchRecentAchievements = async (
  supabase: ReturnType<typeof supabaseServer>,
  userId: string
) => {
  const { data, error } = await supabase
    .from('user_achievements')
    .select('unlocked_at, achievements:achievements!user_achievements_achievement_id_fkey ( name, title, key, icon )')
    .eq('user_id', userId)
    .order('unlocked_at', { ascending: false })
    .limit(8);

  if (error) {
    console.error('[public profile] achievements lookup failed', error);
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

const redactProfile = (profile: Record<string, any>) => {
  const out = { ...profile };
  if (profile?.show_level === false) {
    out.level = null;
  }
  if (profile?.show_shards === false) {
    out.shards_label = null;
  }
  if (profile?.show_location === false) {
    out.location = null;
  }
  return out;
};

export const load: PageServerLoad = async (event) => {
  const supabase = supabaseServer(event);
  const handle = event.params.handle;
  const viewerId = event.locals.user?.id ?? null;

  const { data: profileRow, error: profileError } = await supabase
    .from('profiles')
    .select(PROFILE_COLUMNS)
    .eq('handle', handle)
    .maybeSingle();

  if (profileError) {
    console.error('[public profile] profile lookup failed', profileError);
    throw error(500, 'Unable to load profile');
  }

  if (!profileRow) {
    throw error(404, 'Profile not found');
  }

  const isOwnProfile = viewerId === profileRow.id;
  const accountPrivate = Boolean(profileRow.account_private ?? profileRow.is_private ?? false);
  const blockPeers = await ensureBlockedPeers(event, supabase);
  const blocked = isBlockedPeer(blockPeers, profileRow.id);
  const blockedView = blocked && !isOwnProfile;
  const baseUrl = env.PUBLIC_APP_URL ?? event.url.origin;
  const shareUrl = `${baseUrl}/u/${profileRow.handle}`;
  const defaultDescription =
    profileRow.bio?.trim()?.slice(0, 160) ?? 'View this explorer on Looma';

  if (blockedView) {
    const followCounts = await getFollowCounts(profileRow.id);
    return {
      profile: {
        id: profileRow.id,
        user_id: profileRow.user_id ?? profileRow.id,
        handle: profileRow.handle,
        display_name: profileRow.display_name,
        avatar_url: profileRow.avatar_url,
        banner_url: profileRow.banner_url,
        bio: null,
        links: [],
        is_private: Boolean(profileRow.is_private),
        account_private: accountPrivate,
        achievements: []
      },
      stats: { ...EMPTY_STATS },
      isOwner: isOwnProfile,
      viewerId,
      isOwnProfile,
      isFollowing: false,
      requested: false,
      gated: true,
      blocked: true,
      followCounts,
      featuredCompanion: null,
      posts: [],
      nextCursor: null,
      pinnedPost: null,
      shareUrl,
      ogImageUrl: `${baseUrl}/og/default-profile.png`,
      metaDescription: 'This profile is not available',
      personaPublic: null,
      companionHidden: true
    };
  }

  const parsedLinks = parseLinks(profileRow.links);

  const [
    statsResult,
    companion,
    posts,
    pinned,
    achievements,
    followCounts,
    privacyStatus,
    personaSummary
  ] =
    await Promise.all([
      supabase
        .from('player_stats')
        .select('level, xp, xp_next, energy, energy_max')
        .eq('id', profileRow.id)
        .maybeSingle(),
      fetchFeaturedCompanion(supabase, profileRow.id),
      fetchPosts(supabase, profileRow.id, isOwnProfile),
      fetchPinnedPreview(supabase, profileRow.id, isOwnProfile),
      fetchRecentAchievements(supabase, profileRow.id),
      getFollowCounts(profileRow.id),
      getFollowPrivacyStatus(viewerId, profileRow.id),
      getPersonaSummary(profileRow.id)
    ]);

  if (statsResult.error) {
    console.error('[public profile] stats lookup failed', statsResult.error);
  }

  const stats = (statsResult.data as StatsRow | null) ?? { ...EMPTY_STATS };

  const isFollowing = blocked ? false : privacyStatus?.isFollowing ?? false;
  const requested = blocked ? false : privacyStatus?.requested ?? false;
  const gated = blockedView || (accountPrivate && !isOwnProfile && !isFollowing);
  const feedAllowed = !gated && profileRow.show_feed !== false;
  const achievementsAllowed = !gated && profileRow.show_achievements !== false;
  const safeAchievements = achievementsAllowed ? achievements : [];
  const safeFeed = feedAllowed ? posts.items : [];
  const safeNextCursor = feedAllowed ? posts.nextCursor : null;

  const profilePayload = redactProfile({
    ...profileRow,
    user_id: profileRow.user_id ?? profileRow.id,
    links: parsedLinks,
    is_private: Boolean(profileRow.is_private),
    account_private: accountPrivate,
    achievements: safeAchievements
  });

  const isGatedPublic = gated;
  const metaDescription = isGatedPublic ? 'This profile is private on Looma' : defaultDescription;
  const ogImageUrl = isGatedPublic
    ? `${baseUrl}/og/default-profile.png`
    : `${baseUrl}/api/og/profile?handle=${profileRow.handle}`;

  const personaPublic = gated ? null : personaSummary ?? null;

  const showCompanion = !gated && !blockedView;
  const displayedCompanion = showCompanion ? companion : null;

  return {
    profile: profilePayload,
    stats,
    isOwner: isOwnProfile,
    viewerId,
    isOwnProfile,
    isFollowing,
    requested,
    gated,
    blocked: blockedView,
    followCounts,
    featuredCompanion: displayedCompanion,
    posts: safeFeed,
    nextCursor: safeNextCursor,
    pinnedPost: pinned,
    shareUrl,
    ogImageUrl,
    metaDescription,
    personaPublic,
    companionHidden: !showCompanion
  };
};
