import { error, fail, redirect } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import { supabaseServer } from '$lib/supabaseClient';
import type { Comment, DbUser, Thread } from '$lib/threads/types';
import { commentHash, threadPermalinkById } from '$lib/threads/permalink';

const PAGE_SIZE = 25;

type CommentRow = {
  id: string;
  post_id: string;
  parent_id: string | null;
  body: string;
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

export const load: PageServerLoad = async (event) => {
  const supabase = supabaseServer(event);
  const threadId = event.params.id;

  const { data: postRow, error: postError } = await supabase
    .from('posts')
    .select('id, user_id, slug, body, meta, created_at')
    .eq('id', threadId)
    .maybeSingle();

  if (postError) {
    console.error('[thread] post lookup failed', postError);
    throw error(500, 'Unable to load thread');
  }

  if (!postRow) {
    throw error(404, 'Thread not found');
  }

  const { data: profileRow, error: profileError } = await supabase
    .from('profiles')
    .select('id, display_name, handle, avatar_url')
    .eq('id', postRow.user_id)
    .maybeSingle();

  if (profileError) {
    console.error('[thread] profile lookup failed', profileError);
  }

  const { count: commentCount, error: commentCountError } = await supabase
    .from('comments')
    .select('id', { count: 'exact', head: true })
    .eq('post_id', threadId);

  if (commentCountError) {
    console.error('[thread] comment count failed', commentCountError);
  }

  const meta = (postRow.meta ?? {}) as Record<string, unknown>;
  const rawTitle = typeof meta.title === 'string' ? meta.title : null;

  const thread: Thread = {
    id: postRow.id,
    slug: postRow.slug,
    title: rawTitle && rawTitle.trim() !== '' ? rawTitle.trim() : null,
    body: postRow.body,
    created_at: postRow.created_at,
    comment_count: commentCount ?? 0,
    author: {
      id: profileRow?.id ?? postRow.user_id,
      display_name: profileRow?.display_name ?? null,
      handle: profileRow?.handle ?? null,
      avatar_url: profileRow?.avatar_url ?? null
    }
  };

  const beforeId = event.url.searchParams.get('before');
  let anchorMeta: { id: string; created_at: string } | null = null;

  if (beforeId) {
    const { data: anchorRow, error: anchorError } = await supabase
      .from('comments')
      .select('id, created_at')
      .eq('post_id', threadId)
      .eq('id', beforeId)
      .maybeSingle();

    if (anchorError) {
      console.error('[thread] pagination anchor lookup failed', anchorError);
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
    .eq('post_id', threadId)
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
    console.error('[thread] top-level comments query failed', topError);
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
      console.error('[thread] child comments query failed', childError);
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
      console.error('[thread] nested reply count failed', grandError);
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

  return {
    thread,
    comments,
    pagination: {
      hasMore,
      before: nextBefore
    }
  };
};

export const actions: Actions = {
  reply: async (event) => {
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
      p_post: event.params.id,
      p_body: body,
      p_parent: parentId,
      p_is_public: true
    });

    if (insertError) {
      console.error('[thread] insert_comment failed', insertError);
      return fail(500, { message: 'Unable to post reply' });
    }

    const inserted = Array.isArray(data) ? data[0] : data;
    const newId = inserted?.comment_id ?? inserted?.id;
    if (!newId) {
      console.error('[thread] unexpected insert_comment payload', data);
      return fail(500, { message: 'Unexpected response from server' });
    }

    throw redirect(303, `${threadPermalinkById(event.params.id)}${commentHash(newId)}`);
  }
};
