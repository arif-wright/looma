import { error, redirect, fail } from '@sveltejs/kit';
import type { RequestEvent } from '@sveltejs/kit';
import { supabaseServer } from '$lib/supabaseClient';
import type { ProfileSummary } from '$lib/profile/types';
import type { Comment, DbUser, Thread } from '$lib/threads/types';
import type { PostRow } from '$lib/social/types';
import { canonicalPostPath, commentHash } from '$lib/threads/permalink';

const PAGE_SIZE = 25;

type Lookup =
  | { kind: 'slug'; slug: string }
  | { kind: 'id'; id: string };

type FocusedPostResult = {
  post: Thread;
  comments: Comment[];
  pagination: { hasMore: boolean; before: string | null };
  morePosts: PostRow[];
};

type CommentRow = {
  id: string;
  post_id: string;
  parent_id: string | null;
  body: string | null;
  created_at: string;
  author_id: string;
  profiles?: {
    id: string;
    display_name: string | null;
    handle: string | null;
    avatar_url: string | null;
  } | null;
};

const toDbUser = (row: CommentRow): DbUser => ({
  id: row.profiles?.id ?? row.author_id,
  display_name: row.profiles?.display_name ?? null,
  handle: row.profiles?.handle ?? null,
  avatar_url: row.profiles?.avatar_url ?? null
});

const safe = (value: string) => encodeURIComponent(value);

export async function loadFocusedPost(
  event: RequestEvent,
  profile: ProfileSummary,
  lookup: Lookup
): Promise<FocusedPostResult> {
  const supabase = supabaseServer(event);
  const search = event.url.search;

  const postQuery = supabase
    .from('posts')
    .select(
      `
        id,
        slug,
        body,
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

  const { data: postRow, error: postError } = await postQuery.maybeSingle();

  if (postError) {
    console.error('[profile focused post] post lookup failed', postError);
    throw error(500, 'Unable to load post');
  }

  if (!postRow?.id) {
    throw error(404, 'Post not found');
  }

  const authorHandle = postRow.author?.handle ?? profile.handle;

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

  const thread: Thread = {
    id: postRow.id,
    slug: postRow.slug ?? null,
    title: rawTitle && rawTitle.trim() !== '' ? rawTitle.trim() : null,
    body: postRow.body ?? '',
    created_at: postRow.created_at,
    comment_count: commentCount ?? 0,
    author: {
      id: postRow.author?.id ?? profile.id,
      display_name: postRow.author?.display_name ?? profile.display_name ?? null,
      handle: authorHandle ?? null,
      avatar_url: postRow.author?.avatar_url ?? profile.avatar_url ?? null
    }
  };

  const beforeId = event.url.searchParams.get('before');
  let anchorMeta: { id: string; created_at: string } | null = null;

  if (beforeId) {
    const { data: anchorRow, error: anchorError } = await supabase
      .from('comments')
      .select('id, created_at')
      .eq('post_id', postRow.id)
      .eq('id', beforeId)
      .maybeSingle();

    if (anchorError) {
      console.error('[profile focused post] pagination anchor lookup failed', anchorError);
      throw error(500, 'Unable to load comments');
    }

    if (!anchorRow) {
      throw error(404, 'Comment anchor not found');
    }

    anchorMeta = anchorRow;
  }

  let baseQuery = supabase
    .from('comments')
    .select(
      `
        id,
        post_id,
        parent_id,
        body,
        created_at,
        author_id,
        profiles:profiles!comments_author_fk(
          id,
          display_name,
          handle,
          avatar_url
        )
      `
    )
    .eq('post_id', postRow.id)
    .is('parent_id', null)
    .order('created_at', { ascending: false })
    .order('id', { ascending: false })
    .limit(PAGE_SIZE);

  if (anchorMeta) {
    baseQuery = baseQuery.or(
      `created_at.lt.${anchorMeta.created_at},and(created_at.eq.${anchorMeta.created_at},id.lt.${anchorMeta.id})`
    );
  }

  const { data: topRows, error: topError } = await baseQuery;

  if (topError) {
    console.error('[profile focused post] top-level comments query failed', topError);
    throw error(500, 'Unable to load comments');
  }

  const orderedTop = (topRows ?? []).slice().reverse() as CommentRow[];
  const parentIds = orderedTop.map((row) => row.id);

  let childRows: CommentRow[] = [];
  if (parentIds.length > 0) {
    const { data: rows, error: childError } = await supabase
      .from('comments')
      .select(
        `
          id,
          post_id,
          parent_id,
          body,
          created_at,
          author_id,
          profiles:profiles!comments_author_fk(
            id,
            display_name,
            handle,
            avatar_url
          )
        `
      )
      .in('parent_id', parentIds)
      .order('created_at', { ascending: true })
      .order('id', { ascending: true });

    if (childError) {
      console.error('[profile focused post] child comments query failed', childError);
      throw error(500, 'Unable to load replies');
    }

    childRows = (rows ?? []) as CommentRow[];
  }

  const childIds = childRows.map((row) => row.id);
  const nestedCount = new Map<string, number>();

  if (childIds.length > 0) {
    const { data: grandRows, error: grandError } = await supabase
      .from('comments')
      .select('parent_id')
      .in('parent_id', childIds);

    if (grandError) {
      console.error('[profile focused post] nested reply count failed', grandError);
      throw error(500, 'Unable to aggregate replies');
    }

    for (const row of grandRows ?? []) {
      if (!row?.parent_id) continue;
      nestedCount.set(row.parent_id, (nestedCount.get(row.parent_id) ?? 0) + 1);
    }
  }

  const childByParent = new Map<string, Comment[]>();
  for (const row of childRows) {
    if (!row.parent_id) continue;
    const comment: Comment = {
      id: row.id,
      post_id: row.post_id,
      parent_id: row.parent_id,
      body: row.body ?? '',
      created_at: row.created_at,
      author: toDbUser(row),
      reply_count: nestedCount.get(row.id) ?? 0,
      children: []
    };
    const existing = childByParent.get(row.parent_id) ?? [];
    existing.push(comment);
    childByParent.set(row.parent_id, existing);
  }

  const comments: Comment[] = orderedTop.map((row) => {
    const children = childByParent.get(row.id) ?? [];
    return {
      id: row.id,
      post_id: row.post_id,
      parent_id: row.parent_id,
      body: row.body ?? '',
      created_at: row.created_at,
      author: toDbUser(row),
      reply_count: children.length,
      children
    };
  });

  const hasMore = (topRows?.length ?? 0) === PAGE_SIZE;
  const nextBefore = hasMore && comments.length > 0 ? comments[0].id : null;

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
  const session = event.locals.session;
  if (!session) {
    throw redirect(303, '/login');
  }

  const supabase = supabaseServer(event);
  const formData = await event.request.formData();
  const body = (formData.get('body') ?? '').toString().trim();
  const parentIdRaw = formData.get('parentId');
  const parentId = parentIdRaw ? parentIdRaw.toString().trim() : null;

  if (!body) {
    return fail(400, { message: 'Reply cannot be empty' });
  }

  const { data, error: insertError } = await supabase.rpc('insert_comment', {
    p_post: postId,
    p_body: body,
    p_parent: parentId,
    p_is_public: true
  });

  if (insertError) {
    console.error('[profile focused post] insert_comment failed', insertError);
    return fail(500, { message: 'Unable to post reply' });
  }

  const inserted = Array.isArray(data) ? data[0] : data;
  const newId = inserted?.comment_id ?? inserted?.id;
  if (!newId) {
    console.error('[profile focused post] unexpected insert_comment payload', data);
    return fail(500, { message: 'Unexpected response from server' });
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

  const handle = postRow.author?.handle ?? null;
  const slug = postRow.slug ?? null;
  const canonical = canonicalPostPath(handle, slug, postRow.id);

  throw redirect(303, `${canonical}${commentHash(newId)}`);
}
