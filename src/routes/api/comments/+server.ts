import type { RequestHandler } from './$types';
import { json } from '@sveltejs/kit';
import { supabaseServer } from '$lib/supabaseClient';

const parseLimit = (value: string | null, fallback = 10) => {
  if (!value) return fallback;
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(1, Math.min(50, Math.floor(parsed)));
};

export const GET: RequestHandler = async (event) => {
  const supabase = supabaseServer(event);
  const search = event.url.searchParams;
  const postId = search.get('postId');
  const parentId = search.get('parentId');
  const limit = parseLimit(search.get('limit'));

  if (!postId && !parentId) {
    return json({ error: 'postId or parentId is required' }, { status: 400 });
  }

  if (postId) {
    const before = search.get('before');
    const { data, error } = await supabase.rpc('get_comments_tree', {
      p_post: postId,
      p_limit: limit,
      p_before: before ?? null
    });

    if (error) {
      return json({ error: error.message }, { status: 400 });
    }

    const items = Array.isArray(data) ? data : [];
    const last = items.length > 0 ? items[items.length - 1] : null;
    const nextCursor =
      items.length === limit ? ((last?.created_at as string | null) ?? null) : null;
    return json({ items, nextCursor });
  }

  if (!parentId) {
    return json({ error: 'parentId is required' }, { status: 400 });
  }

  const after = search.get('after');
  const { data, error } = await supabase.rpc('get_replies', {
    p_comment: parentId,
    p_limit: limit,
    p_after: after ?? null
  });

  if (error) {
    return json({ error: error.message }, { status: 400 });
  }

  const items = Array.isArray(data) ? data : [];
  const last = items.length > 0 ? items[items.length - 1] : null;
  const nextCursor =
    items.length === limit ? ((last?.created_at as string | null) ?? null) : null;
  return json({ items, nextCursor });
};

export const POST: RequestHandler = async (event) => {
  const supabase = supabaseServer(event);

  const {
    data: { user },
    error: userError
  } = await supabase.auth.getUser();

  if (userError) {
    return json({ error: userError.message }, { status: 400 });
  }

  if (!user) {
    return json({ error: 'Not authenticated' }, { status: 401 });
  }

  let payload: { postId?: unknown; body?: unknown; parentId?: unknown };
  try {
    payload = await event.request.json();
  } catch {
    return json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const postId = typeof payload.postId === 'string' ? payload.postId : null;
  const body = typeof payload.body === 'string' ? payload.body.trim() : '';
  const parentId =
    typeof payload.parentId === 'string' && payload.parentId.length > 0
      ? payload.parentId
      : null;

  if (!postId) {
    return json({ error: 'postId is required' }, { status: 400 });
  }

  if (!body) {
    return json({ error: 'Body is required' }, { status: 400 });
  }

  const { data: inserted, error: insertError } = await supabase.rpc('insert_comment', {
    p_post: postId,
    p_body: body,
    p_parent: parentId,
    p_public: true
  });

  if (insertError) {
    return json({ error: insertError.message }, { status: 400 });
  }

  const comment = Array.isArray(inserted) ? inserted[0] : inserted;

  if (!comment) {
    return json({ error: 'Failed to insert comment' }, { status: 400 });
  }

  if (typeof comment.reply_count !== 'number') {
    (comment as Record<string, unknown>).reply_count = 0;
  }

  const [commentStats, reactionStats] = await Promise.all([
    supabase
      .from('comments')
      .select('id', { head: true, count: 'exact' })
      .eq('post_id', postId),
    supabase.rpc('get_post_reaction_counts', { p_post_id: postId })
  ]);

  if (commentStats.error) {
    return json({ error: commentStats.error.message }, { status: 400 });
  }

  if (reactionStats.error) {
    return json({ error: reactionStats.error.message }, { status: 400 });
  }

  const likeCount =
    Array.isArray(reactionStats.data) && reactionStats.data.length > 0
      ? ((reactionStats.data[0]?.likes as number | null) ?? 0)
      : 0;

  return json({
    comment,
    totals: {
      comments: commentStats.count ?? 0,
      likes: likeCount
    }
  });
};
