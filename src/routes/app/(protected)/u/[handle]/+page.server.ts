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

export const load: PageServerLoad = async (event) => {
  const parentData = await event.parent();
  const supabase = supabaseServer(event);
  const profile = parentData.profile;
  const isOwner = parentData.isOwner ?? false;

  const [companion, posts, pinned] = await Promise.all([
    fetchFeaturedCompanion(supabase, profile.featured_companion_id ?? null),
    fetchPosts(supabase, profile.id, isOwner),
    fetchPinnedPreview(supabase, profile.id, isOwner)
  ]);

  const showShards = isOwner ? true : profile.show_shards ?? true;
  const showLevel = isOwner ? true : profile.show_level ?? true;
  const showJoined = isOwner ? true : profile.show_joined ?? true;
  const sanitizedProfile = {
    ...profile,
    show_shards: showShards,
    show_level: showLevel,
    show_joined: showJoined,
    joined_at: showJoined ? profile.joined_at : null
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

  return {
    profile: sanitizedProfile,
    viewerId: parentData.viewerId ?? null,
    isOwner,
    featuredCompanion: companion,
    posts: posts.items,
    nextCursor: posts.nextCursor,
    pinnedPost: pinned,
    meta: {
      title: metaTitle,
      description: metaDescription,
      image: metaImage,
      url: profileUrl
    },
    shareUrl: profileUrl
  };
};
