import type { PageServerLoad } from './$types';
import { supabaseServer } from '$lib/supabaseClient';
import type { PostRow } from '$lib/social/types';
import { env } from '$env/dynamic/public';

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
  } | null;
};

const POSTS_PAGE_SIZE = 10;
const encodeCursor = (row: PostRow | null | undefined) =>
  row ? `${row.created_at}|${row.id}` : null;

const fetchPosts = async (
  supabase: ReturnType<typeof supabaseServer>,
  authorId: string,
  includePrivate: boolean
) => {
  const { data, error } = await supabase.rpc('get_user_posts', {
    p_user: authorId,
    p_limit: POSTS_PAGE_SIZE,
    p_before: new Date().toISOString()
  });

  if (error) {
    console.error('[public profile] feed lookup failed', error);
    return { items: [] as PostRow[], nextCursor: null };
  }

  const rows = Array.isArray(data) ? (data as PostRow[]) : [];
  const filtered = includePrivate ? rows : rows.filter((row) => row.is_public ?? true);
  return {
    items: filtered,
    nextCursor: filtered.length === POSTS_PAGE_SIZE ? encodeCursor(filtered.at(-1)) : null
  };
};

const fetchFeaturedCompanion = async (supabase: ReturnType<typeof supabaseServer>, companionId: string | null) => {
  if (!companionId) return null;
  const { data, error } = await supabase
    .from('companions')
    .select('id, name, species, avatar_url, bond_level, bond_xp, bond_next, mood, created_at')
    .eq('id', companionId)
    .maybeSingle();

  if (error) {
    console.error('[public profile] companion lookup failed', error);
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
    .select('id, body, text, created_at, is_public, slug, is_pinned, is_deleted')
    .eq('user_id', ownerId)
    .eq('is_pinned', true)
    .eq('is_deleted', false)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    console.error('[public profile] pinned lookup failed', error);
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

const fetchRecentAchievements = async (supabase: ReturnType<typeof supabaseServer>, userId: string) => {
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

export const load: PageServerLoad = async (event) => {
  const parentData = await event.parent();
  const supabase = supabaseServer(event);
  const profile = parentData.profile;
  const isOwner = parentData.isOwner ?? false;
  const gated = parentData.gated ?? false;

  const [companion, posts, pinned, achievements] = await Promise.all([
    fetchFeaturedCompanion(supabase, profile.featured_companion_id ?? null),
    fetchPosts(supabase, profile.id, isOwner),
    fetchPinnedPreview(supabase, profile.id, isOwner),
    fetchRecentAchievements(supabase, profile.id)
  ]);

  const showShards = isOwner ? true : profile.show_shards ?? true;
  const showLevel = isOwner ? true : profile.show_level ?? true;
  const showJoined = isOwner ? true : profile.show_joined ?? true;
  const showLocation = isOwner ? true : profile.show_location ?? true;
  const showAchievements = !gated && (isOwner ? true : profile.show_achievements ?? true);
  const showFeed = !gated && (isOwner ? true : profile.show_feed ?? true);
  const sanitizedProfile = {
    ...profile,
    show_shards: showShards,
    show_level: showLevel,
    show_joined: showJoined,
    show_feed: showFeed,
    show_achievements: showAchievements,
    show_location: showLocation,
    joined_at: showJoined ? profile.joined_at : null,
    location: showLocation ? profile.location : null,
    achievements: showAchievements ? achievements : []
  };

  const baseUrl = env.PUBLIC_APP_URL ?? event.url.origin;
  const profileUrl = `${baseUrl}/app/u/${profile.handle}`;
  const metaTitle =
    profile.display_name?.trim()?.length
      ? `${profile.display_name} (@${profile.handle}) · Looma`
      : `@${profile.handle} · Looma`;
  const metaDescription =
    profile.bio && profile.bio.trim().length > 0
      ? profile.bio.trim().slice(0, 160)
      : 'Explore this Looma profile.';
  const metaImage = profile.banner_url ?? profile.avatar_url ?? null;

  const feed = showFeed
    ? posts.items.map((item) => ({
        id: item.id,
        text: item.text ?? item.body ?? '',
        html: (item.meta as Record<string, any> | undefined)?.html ?? null,
        when_label: formatWhenLabel(item.created_at),
        kind: item.kind ?? null,
        media: (item.meta as Record<string, any> | undefined)?.media ?? [],
        author_avatar: item.author_avatar ?? sanitizedProfile.avatar_url,
        author_name: item.author_name ?? sanitizedProfile.display_name
      }))
    : [];

  return {
    profile: sanitizedProfile,
    viewerId: parentData.viewerId ?? null,
    isOwner,
    featuredCompanion: companion,
    feed,
    pinnedPost: pinned,
    meta: {
      title: metaTitle,
      description: metaDescription,
      image: metaImage,
      url: profileUrl
    },
    shareUrl: profileUrl,
    followCounts: parentData.followCounts,
    isFollowing: parentData.isFollowing,
    requested: parentData.requested ?? false,
    gated
  };
};
