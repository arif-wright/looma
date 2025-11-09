import { error } from '@sveltejs/kit';
import { env } from '$env/dynamic/public';
import type { PageServerLoad } from './$types';
import { supabaseServer } from '$lib/supabaseClient';
import type { PostRow } from '$lib/social/types';
import { getFollowCounts } from '$lib/server/follows';

type ProfileRow = {
  id: string;
  handle: string;
  display_name: string | null;
  avatar_url: string | null;
  banner_url: string | null;
  bio: string | null;
  pronouns: string | null;
  location: string | null;
  links: Record<string, unknown>[] | null;
  is_private: boolean | null;
  joined_at: string | null;
  featured_companion_id: string | null;
  show_shards: boolean | null;
  show_level: boolean | null;
  show_joined: boolean | null;
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
  name: string;
  species: string;
  avatar_url: string | null;
  bond_level: number;
  bond_xp: number;
  bond_next: number;
  mood: string;
  created_at: string;
};

type AchievementRow = {
  unlocked_at: string | null;
  achievements: {
    name?: string | null;
    title?: string | null;
    key?: string | null;
    icon?: string | null;
    icon_url?: string | null;
  } | null;
};

const PROFILE_COLUMNS =
  'id, handle, display_name, avatar_url, banner_url, bio, pronouns, location, links, is_private, joined_at, featured_companion_id, show_shards, show_level, show_joined';

const POSTS_PAGE_SIZE = 10;

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

const fetchFeaturedCompanion = async (
  supabase: ReturnType<typeof supabaseServer>,
  companionId: string | null
) => {
  if (!companionId) return null;
  const { data, error: companionError } = await supabase
    .from('companions')
    .select('id, name, species, avatar_url, bond_level, bond_xp, bond_next, mood, created_at')
    .eq('id', companionId)
    .maybeSingle();

  if (companionError) {
    console.error('[public profile] featured companion lookup failed', companionError);
    return null;
  }

  return (data as CompanionRow | null) ?? null;
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
    .select(
      'unlocked_at, achievements:achievements!user_achievements_achievement_id_fkey ( name, title, key, icon, icon_url )'
    )
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
        icon: achievement.icon_url ?? achievement.icon ?? null,
        when_label: formatWhenLabel(row.unlocked_at)
      };
    })
    .filter((entry): entry is NonNullable<typeof entry> => Boolean(entry));
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

  const isOwner = viewerId === profileRow.id;
  if (profileRow.is_private && !isOwner) {
    throw error(404, 'Profile not found');
  }

  const parsedLinks = parseLinks(profileRow.links);

  const [statsResult, companion, posts, pinned, achievements, followCounts] = await Promise.all([
    supabase
      .from('player_stats')
      .select('level, xp, xp_next, energy, energy_max')
      .eq('id', profileRow.id)
      .maybeSingle(),
    fetchFeaturedCompanion(supabase, profileRow.featured_companion_id),
    fetchPosts(supabase, profileRow.id, isOwner),
    fetchPinnedPreview(supabase, profileRow.id, isOwner),
    fetchRecentAchievements(supabase, profileRow.id),
    getFollowCounts(profileRow.id)
  ]);

  if (statsResult.error) {
    console.error('[public profile] stats lookup failed', statsResult.error);
  }

  const stats = (statsResult.data as StatsRow | null) ?? {
    level: null,
    xp: null,
    xp_next: null,
    energy: null,
    energy_max: null
  };

  let isFollowing = false;
  if (viewerId && !isOwner) {
    const { data: followEdge, error: followError } = await supabase
      .from('follows')
      .select('followee_id')
      .eq('follower_id', viewerId)
      .eq('followee_id', profileRow.id)
      .maybeSingle();

    if (followError) {
      console.error('[public profile] follow edge lookup failed', followError);
    }

    isFollowing = Boolean(followEdge);
  }

  const baseUrl = env.PUBLIC_APP_URL ?? event.url.origin;
  const shareUrl = `${baseUrl}/u/${profileRow.handle}`;
  const metaDescription = profileRow.bio?.trim()?.slice(0, 160) ?? 'View this explorer on Looma';

  return {
    profile: {
      ...profileRow,
      links: parsedLinks,
      is_private: Boolean(profileRow.is_private),
      achievements
    },
    stats,
    isOwner,
    viewerId,
    followCounts,
    isFollowing,
    featuredCompanion: companion,
    posts: posts.items,
    nextCursor: posts.nextCursor,
    pinnedPost: pinned,
    shareUrl,
    ogImageUrl: `${baseUrl}/api/og/profile?handle=${profileRow.handle}`,
    metaDescription
  };
};
