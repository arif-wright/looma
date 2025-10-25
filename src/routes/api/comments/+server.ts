import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { supabaseServer } from '$lib/supabaseClient';

const parseLimit = (value: string | null, fallback = 10) => {
  if (!value) return fallback;
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(1, Math.min(50, Math.floor(parsed)));
};

export const GET: RequestHandler = async (event) => {
  const supabase = event.locals.sb ?? supabaseServer(event);
  let session = event.locals.session ?? null;

  if (!session) {
    const { data } = await supabase.auth.getSession();
    session = data.session ?? null;
  }

  if (!session?.user?.id) {
    return json({ error: 'Not authenticated' }, { status: 401 });
  }

  const search = event.url.searchParams;
  const postId = search.get('postId');
  const replyTo = search.get('replyTo');
  const limit = parseLimit(search.get('limit'));
  const before = search.get('before') ?? new Date().toISOString();
  const after = search.get('after');

  if (replyTo) {
    const { data, error } = await supabase.rpc('get_replies', {
      p_comment: replyTo,
      p_limit: limit,
      p_after: after ?? null
    });

    if (error) {
      console.error('comments:get', error);
      return json({ error: error.message }, { status: 400 });
    }

    return json({ items: Array.isArray(data) ? data : [] });
  }

  if (postId) {
    const { data, error } = await supabase.rpc('get_comments_tree', {
      p_post: postId,
      p_limit: limit,
      p_before: before
    });

    if (error) {
      console.error('comments:get', error);
      return json({ error: error.message }, { status: 400 });
    }

    return json({ items: Array.isArray(data) ? data : [] });
  }

  return json({ error: 'Provide ?postId or ?replyTo' }, { status: 400 });
};

export const POST: RequestHandler = async (event) => {
  const supabase = event.locals.sb ?? supabaseServer(event);
  let session = event.locals.session ?? null;

  if (!session) {
    const { data } = await supabase.auth.getSession();
    session = data.session ?? null;
  }

  if (!session?.user?.id) {
    return json({ error: 'Not authenticated' }, { status: 401 });
  }

  let payload: { postId?: unknown; body?: unknown; parentId?: unknown; isPublic?: unknown };
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
  const isPublic =
    typeof payload.isPublic === 'boolean' ? payload.isPublic : true;

  if (!postId) {
    return json({ error: 'postId is required' }, { status: 400 });
  }

  if (!body) {
    return json({ error: 'body is required' }, { status: 400 });
  }

  const { data, error } = await supabase.rpc('insert_comment', {
    p_post: postId,
    p_body: body,
    p_parent: parentId,
    p_public: isPublic
  });

  if (error) {
    return json({ error: error.message }, { status: 400 });
  }

  return json({ item: Array.isArray(data) ? data[0] ?? null : data ?? null }, { status: 201 });
};
