import type { PageServerLoad } from './$types';
import { supabaseServer } from '$lib/supabaseClient';
import type { PostRow } from '$lib/social/types';

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

  return {
    profile,
    viewerId: parentData.viewerId ?? null,
    isOwner,
    featuredCompanion: companion,
    posts: posts.items,
    nextCursor: posts.nextCursor,
    pinnedPost: pinned
  };
};
