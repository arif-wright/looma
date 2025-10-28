import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { supabaseServer } from '$lib/supabaseClient';
import { updateUserContext } from '$lib/server/userContext';
import { recordAnalyticsEvent } from '$lib/server/analytics';

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

    const items = Array.isArray(data) ? data : [];
    return json({ items });
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

    const items = Array.isArray(data) ? data : [];
    return json({ items });
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

  let payload: { postId?: unknown; replyTo?: unknown; body?: unknown; isPublic?: unknown };
  try {
    payload = await event.request.json();
  } catch {
    return json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const providedPostId =
    typeof payload.postId === 'string' && payload.postId.trim().length > 0 ? payload.postId.trim() : null;
  const replyTo =
    typeof payload.replyTo === 'string' && payload.replyTo.trim().length > 0 ? payload.replyTo.trim() : null;
  const body = typeof payload.body === 'string' ? payload.body.trim() : '';
  const isPublic = typeof payload.isPublic === 'boolean' ? payload.isPublic : true;

  if (!providedPostId && !replyTo) {
    return json({ error: 'postId or replyTo is required' }, { status: 400 });
  }

  if (!body) {
    return json({ error: 'body is required' }, { status: 400 });
  }

  if (providedPostId && !UUID_REGEX.test(providedPostId)) {
    return json({ error: 'postId must be a uuid' }, { status: 400 });
  }

  if (replyTo && !UUID_REGEX.test(replyTo)) {
    return json({ error: 'replyTo must be a uuid' }, { status: 400 });
  }

  let postId = providedPostId;

  if (replyTo && !postId) {
    const { data: parentRow, error: parentError } = await supabase
      .from('comments')
      .select('post_id')
      .eq('id', replyTo)
      .maybeSingle();

    if (parentError) {
      console.error('[api/comments:POST] parent lookup failed', parentError);
      return json({ error: parentError.message ?? String(parentError) }, { status: 500 });
    }

    postId = parentRow?.post_id ?? null;
  }

  if (!postId) {
    return json({ error: 'postId could not be determined' }, { status: 400 });
  }

  if (!UUID_REGEX.test(postId)) {
    return json({ error: 'postId must be a uuid' }, { status: 400 });
  }

  console.debug('[api/comments:POST] payload', {
    postId,
    replyTo,
    len: body.length
  });

  const { data, error } = await supabase.rpc('insert_comment', {
    p_post: postId,
    p_body: body,
    p_parent: replyTo,
    p_is_public: isPublic
  });

  if (error) {
    console.error('[api/comments:POST] insert_comment failed', error);
    return json({ error: error.message }, { status: 400 });
  }

  const rows = Array.isArray(data) ? data : data ? [data] : [];
  const item = rows.length > 0 ? rows[0] : null;

  await updateUserContext(
    event,
    'feed',
    {
      postId,
      commentId: item?.comment_id ?? item?.id ?? null
    },
    'social'
  );

  await recordAnalyticsEvent(supabase, session.user.id, 'comment_created', {
    surface: 'home',
    payload: {
      postId,
      commentId: item?.comment_id ?? item?.id ?? null,
      replyTo: replyTo ?? null
    }
  });

  return json({ item }, { status: 201 });
};
