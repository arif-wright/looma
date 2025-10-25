import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { supabaseServer } from '$lib/supabaseClient';

const parseLimit = (value: string | null, fallback = 10) => {
  if (!value) return fallback;
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(1, Math.min(50, Math.floor(parsed)));
};

const UUID_REGEX =
  /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/;

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
  const beforeRaw = search.get('before');
  const before = beforeRaw && beforeRaw.trim().length > 0 ? beforeRaw : new Date().toISOString();
  const afterRaw = search.get('after');
  const after = afterRaw && afterRaw.trim().length > 0 ? afterRaw : null;

  if (replyTo) {
    const { data, error } = await supabase.rpc('get_replies', {
      p_comment: replyTo,
      p_limit: limit,
      p_after: after
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

  const postId = typeof payload.postId === 'string' ? payload.postId.trim() : '';
  const body = typeof payload.body === 'string' ? payload.body.trim() : '';
  const rawParent = typeof payload.parentId === 'string' ? payload.parentId.trim() : null;
  const parentId = rawParent && rawParent.length > 0 ? rawParent : null;
  const isPublic = typeof payload.isPublic === 'boolean' ? payload.isPublic : true;

  if (!postId || !UUID_REGEX.test(postId)) {
    return json({ error: 'postId is required' }, { status: 400 });
  }

  if (!body) {
    return json({ error: 'body is required' }, { status: 400 });
  }

  if (parentId && !UUID_REGEX.test(parentId)) {
    return json({ error: 'parentId must be a uuid' }, { status: 400 });
  }

  console.debug('[api/comments:POST] payload', { postId, parentId, len: body.length });

  const { data, error } = await supabase.rpc('insert_comment', {
    p_post: postId,
    p_body: body,
    p_parent: parentId,
    p_is_public: isPublic
  });

  if (error) {
    console.error('[api/comments:POST] insert_comment failed', error);
    return json({ error: error.message ?? 'insert failed' }, { status: 500 });
  }

  return json({ item: Array.isArray(data) ? data[0] ?? null : data ?? null }, { status: 201 });
};
