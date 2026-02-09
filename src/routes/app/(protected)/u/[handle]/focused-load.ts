import { error, redirect, fail } from '@sveltejs/kit';
import type { RequestEvent } from '@sveltejs/kit';
import { supabaseServer } from '$lib/supabaseClient';
import type { ProfileSummary } from '$lib/profile/types';
import type { Comment, Thread } from '$lib/threads/types';
import type { PostRow } from '$lib/social/types';
import { canonicalPostPath, commentHash } from '$lib/threads/permalink';
import { recordAnalyticsEvent } from '$lib/server/analytics';
import { buildCommentTree, fetchTreeRows, hydrateAuthors } from '$lib/server/comments/tree';
import { ensureBlockedPeers, isBlockedPeer } from '$lib/server/blocks';

const MAX_VISIBLE_DEPTH = 2;

type FocusedAuthor = {
  id: string | null;
  handle: string | null;
  display_name: string | null;
  avatar_url: string | null;
};

type FocusedPostRow = {
  id: string;
  slug: string | null;
  kind: string | null;
  body: string | null;
  text: string | null;
  meta: Record<string, unknown> | null;
  created_at: string;
  author_id: string;
  author: FocusedAuthor | FocusedAuthor[] | null;
};

type Lookup =
  | { kind: 'slug'; slug: string }
  | { kind: 'id'; id: string };

type FocusedPostResult = {
  post: Thread;
  comments: Comment[];
  pagination: { hasMore: boolean; before: string | null };
  morePosts: PostRow[];
};

const safe = (value: string) => encodeURIComponent(value);
const normalizeAuthor = (value: FocusedAuthor | FocusedAuthor[] | null | undefined): FocusedAuthor | null => {
  if (!value) return null;
  return Array.isArray(value) ? value[0] ?? null : value;
};

export async function loadFocusedPost(
  event: RequestEvent,
  profile: ProfileSummary,
  lookup: Lookup
): Promise<FocusedPostResult> {
  const supabase = supabaseServer(event);
  const blockPeers = await ensureBlockedPeers(event, supabase);
  const viewerId = event.locals.user?.id ?? null;
  const search = event.url.search;

  if (isBlockedPeer(blockPeers, profile.id) && viewerId !== profile.id) {
    throw redirect(302, `/app/u/${safe(profile.handle)}${search}`);
  }

  const postQuery = supabase
    .from('posts')
    .select(
      `
        id,
        slug,
        kind,
        body,
        text,
        meta,
        created_at,
        author_id,
        author:profiles!posts_author_fk(
          id,
          handle,
          display_name,
          avatar_url
        )
      `
    )
    .eq('author_id', profile.id)
    .limit(1);

  if (lookup.kind === 'slug') {
    postQuery.eq('slug', lookup.slug);
  } else {
    postQuery.eq('id', lookup.id);
  }

  const { data: rawPost, error: postError } = await postQuery.maybeSingle();
  const postRow = (rawPost as unknown as FocusedPostRow | null) ?? null;

  if (postError) {
    console.error('[profile focused post] post lookup failed', postError);
    throw error(500, 'Unable to load post');
  }

  if (!postRow?.id) {
    throw error(404, 'Post not found');
  }

  const postAuthor = normalizeAuthor(postRow.author);
  const authorHandle = postAuthor?.handle ?? profile.handle;

  if (authorHandle !== profile.handle) {
    const targetSlug = postRow.slug ? safe(postRow.slug) : `p/${safe(postRow.id)}`;
    throw redirect(302, `/app/u/${safe(authorHandle)}/${targetSlug}${search}`);
  }

  if (lookup.kind === 'slug' && postRow.slug && postRow.slug !== lookup.slug) {
    throw redirect(302, `/app/u/${safe(authorHandle)}/${safe(postRow.slug)}${search}`);
  }

  if (lookup.kind === 'id' && postRow.slug) {
    throw redirect(302, `/app/u/${safe(authorHandle)}/${safe(postRow.slug)}${search}`);
  }

  const { count: commentCount, error: commentCountError } = await supabase
    .from('comments')
    .select('id', { count: 'exact', head: true })
    .eq('post_id', postRow.id);

  if (commentCountError) {
    console.error('[profile focused post] comment count failed', commentCountError);
  }

  const meta = (postRow.meta ?? {}) as Record<string, unknown>;
  const rawTitle = typeof meta.title === 'string' ? meta.title : null;

  const bodyText =
    typeof postRow.text === 'string' && postRow.text.trim().length > 0
      ? postRow.text
      : postRow.body ?? '';

  const thread: Thread = {
    id: postRow.id,
    slug: postRow.slug ?? null,
    title: rawTitle && rawTitle.trim() !== '' ? rawTitle.trim() : null,
    body: bodyText,
    created_at: postRow.created_at,
    comment_count: commentCount ?? 0,
    author: {
      id: postRow.author?.id ?? profile.id,
      display_name: postAuthor?.display_name ?? profile.display_name ?? null,
      handle: authorHandle ?? null,
      avatar_url: postAuthor?.avatar_url ?? profile.avatar_url ?? null
    },
    kind: postRow.kind ?? null,
    text: postRow.text ?? null,
    meta
  };

  let commentRows: Comment[] = [];
  try {
    const treeRows = await fetchTreeRows(supabase, postRow.id);
    const visibleRows = blockPeers.size
      ? treeRows.filter((row) => !isBlockedPeer(blockPeers, row.author_id))
      : treeRows;
    const profileMap = await hydrateAuthors(supabase, visibleRows);
    commentRows = buildCommentTree(visibleRows, profileMap, { maxDepth: MAX_VISIBLE_DEPTH });
  } catch (treeError) {
    console.error('[profile focused post] comment tree query failed', treeError);
    throw error(500, 'Unable to load comments');
  }

  const comments = commentRows;
  const hasMore = false;
  const nextBefore = null;

  const { data: moreRows, error: moreError } = await supabase.rpc('get_user_posts', {
    p_user: profile.id,
    p_limit: 12,
    p_before: new Date().toISOString()
  });

  if (moreError) {
    console.error('[profile focused post] get_user_posts failed', moreError);
  }

  const morePosts = (Array.isArray(moreRows) ? moreRows : [])
    .filter((row) => row.id !== thread.id)
    .slice(0, 10) as PostRow[];

  return {
    post: thread,
    comments,
    pagination: {
      hasMore,
      before: nextBefore
    },
    morePosts
  };
}

export async function handleReplyAction(event: RequestEvent, postId: string) {
  const user = event.locals.user;
  if (!user) {
    throw redirect(303, '/app/auth');
  }

  const supabase = supabaseServer(event);
  const formData = await event.request.formData();
  const body = (formData.get('body') ?? '').toString().trim();
  const parentIdRaw = formData.get('parentId');
  const parentId = parentIdRaw ? parentIdRaw.toString().trim() : null;

  if (!body) {
    return fail(400, { message: 'Reply cannot be empty' });
  }

  const { data, error: insertError } = await supabase.rpc('fn_insert_comment_with_mentions', {
    p_post_id: postId,
    p_parent_id: parentId,
    p_body: body
  });

  if (insertError) {
    console.error('[profile focused post] insert_comment failed', insertError);
    return fail(500, { message: 'Unable to post reply' });
  }

  const inserted = Array.isArray(data) ? data[0] : data;
  const newId = inserted?.comment_id ?? inserted?.id;
  const depth = typeof inserted?.depth === 'number' ? inserted.depth : 0;
  const mentionedIds = Array.isArray(inserted?.mentioned_user_ids)
    ? (inserted.mentioned_user_ids as string[]).filter((id) => typeof id === 'string')
    : [];
  if (!newId) {
    console.error('[profile focused post] unexpected insert_comment payload', data);
    return fail(500, { message: 'Unexpected response from server' });
  }

  await recordAnalyticsEvent(supabase, user.id, 'comment_create', {
    surface: 'profile_focused_post',
    payload: {
      post_id: postId,
      comment_id: newId,
      parent_id: parentId,
      depth
    }
  });

  if (mentionedIds.length > 0) {
    await Promise.all(
      mentionedIds.map((mentionedUserId) =>
        recordAnalyticsEvent(supabase, user.id, 'mention_add', {
          surface: 'profile_focused_post',
          payload: {
            post_id: postId,
            comment_id: newId,
            mentioned_user_id: mentionedUserId
          }
        })
      )
    );
  }

  const { data: postRow, error: postError } = await supabase
    .from('posts')
    .select(
      `
        id,
        slug,
        author:profiles!posts_author_fk(handle)
      `
    )
    .eq('id', postId)
    .maybeSingle();

  if (postError || !postRow?.id) {
    console.error('[profile focused post] canonical path lookup failed', postError);
    throw redirect(303, `/app/thread/${postId}${commentHash(newId)}`);
  }

  const author = Array.isArray(postRow.author) ? postRow.author[0] ?? null : postRow.author ?? null;
  const handle = author?.handle ?? null;
  const slug = postRow.slug ?? null;
  const canonical = canonicalPostPath(handle, slug, postRow.id);

  throw redirect(303, `${canonical}${commentHash(newId)}`);
}
