import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { supabaseServer } from '$lib/supabaseClient';
import { updateUserContext } from '$lib/server/userContext';
import { recordAnalyticsEvent } from '$lib/server/analytics';
import { createNotification } from '$lib/server/notifications';
import { buildCommentTree, fetchTreeRows, hydrateAuthors } from '$lib/server/comments/tree';
import { ensureBlockedPeers, isBlockedPeer } from '$lib/server/blocks';

const parseLimit = (value: string | null, fallback = 10) => {
  if (!value) return fallback;
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(1, Math.min(50, Math.floor(parsed)));
};

const UUID_REGEX =
  /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/;

const filterBlockedRows = <T extends Record<string, unknown>>(rows: T[], peers: Set<string>): T[] => {
  if (!peers.size) return rows;
  return rows.filter((row) => {
    const authorId =
      (typeof row.author_id === 'string' && row.author_id) ||
      (typeof row.comment_user_id === 'string' && row.comment_user_id) ||
      (typeof row.user_id === 'string' && row.user_id) ||
      null;
    return !isBlockedPeer(peers, authorId);
  });
};

export const GET: RequestHandler = async (event) => {
  const supabase = event.locals.supabase ?? supabaseServer(event);
  const user = event.locals.user;

  if (!user?.id) {
    return json({ error: 'Not authenticated' }, { status: 401 });
  }

  const blockPeers = await ensureBlockedPeers(event, supabase);

  const search = event.url.searchParams;
  const postId = search.get('postId');
  const replyTo = search.get('replyTo');
  const limit = parseLimit(search.get('limit'));
  const beforeRaw = search.get('before');
  const before = beforeRaw && beforeRaw.trim().length > 0 ? beforeRaw : new Date().toISOString();
  const afterRaw = search.get('after');
  const after = afterRaw && afterRaw.trim().length > 0 ? afterRaw : null;
  const mode = search.get('mode');

  if (mode === 'deep') {
    if (!replyTo) {
      return json({ error: 'replyTo is required for deep mode' }, { status: 400 });
    }

    let branchPostId = postId;
    if (!branchPostId) {
      const { data: parentRow, error: parentError } = await supabase
        .from('comments')
        .select('post_id')
        .eq('id', replyTo)
        .maybeSingle();

      if (parentError) {
        console.error('[comments:get] parent lookup failed', parentError);
        return json({ error: 'Unable to resolve comment post' }, { status: 500 });
      }

      branchPostId = parentRow?.post_id ?? null;
    }

    if (!branchPostId) {
      return json({ items: [] });
    }

    try {
      const allRows = await fetchTreeRows(supabase, branchPostId);
      const visibleRows = filterBlockedRows(allRows, blockPeers);
      const branchRows = visibleRows.filter(
        (row) => row.id === replyTo || (Array.isArray(row.path) && row.path.includes(replyTo))
      );
      if (branchRows.length === 0) {
        return json({ items: [] });
      }
      const authorMap = await hydrateAuthors(supabase, branchRows);
      const branch = buildCommentTree(branchRows, authorMap, { ancestorId: replyTo });
      return json({ items: branch });
    } catch (err) {
      console.error('[comments:get] deep branch failed', err);
      return json({ error: 'Unable to load replies' }, { status: 500 });
    }
  }

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

    const items = filterBlockedRows(Array.isArray(data) ? data : [], blockPeers);
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

    const items = filterBlockedRows(Array.isArray(data) ? data : [], blockPeers);
    return json({ items });
  }

  return json({ error: 'Provide ?postId or ?replyTo' }, { status: 400 });
};

export const POST: RequestHandler = async (event) => {
  const supabase = event.locals.supabase ?? supabaseServer(event);
  const user = event.locals.user;

  if (!user?.id) {
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
  let parentAuthorId: string | null = null;

  if (replyTo) {
    const { data: parentRow, error: parentError } = await supabase
      .from('comments')
      .select('post_id, author_id')
      .eq('id', replyTo)
      .maybeSingle();

    if (parentError) {
      console.error('[api/comments:POST] parent lookup failed', parentError);
      return json({ error: parentError.message ?? String(parentError) }, { status: 500 });
    }

    if (!parentRow) {
      return json({ error: 'parent_not_found' }, { status: 400 });
    }

    if (!postId) {
      postId = parentRow.post_id ?? null;
    } else if (parentRow.post_id && parentRow.post_id !== postId) {
      return json({ error: 'reply_mismatch' }, { status: 400 });
    }

    parentAuthorId = parentRow.author_id ?? null;
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

  const { data, error } = await supabase.rpc('fn_insert_comment_with_mentions', {
    p_post_id: postId,
    p_parent_id: replyTo,
    p_body: body
  });

  if (error) {
    console.error('[api/comments:POST] fn_insert_comment_with_mentions failed', error);
    return json({ error: error.message }, { status: 400 });
  }

  const rows = Array.isArray(data) ? data : data ? [data] : [];
  const item = rows.length > 0 ? rows[0] : null;
  const commentId = item?.comment_id ?? item?.id ?? null;
  const depth = typeof item?.depth === 'number' ? item.depth : replyTo ? 1 : 0;
  const mentionedIds = Array.isArray(item?.mentioned_user_ids)
    ? (item.mentioned_user_ids as string[]).filter((value) => typeof value === 'string')
    : [];

  await updateUserContext(
    event,
    'feed',
    {
      postId,
      commentId
    },
    'social'
  );

  await recordAnalyticsEvent(supabase, user.id, 'comment_create', {
    surface: 'api_comments',
    payload: {
      postId,
      commentId,
      replyTo: replyTo ?? null,
      depth
    }
  });

  if (mentionedIds.length > 0) {
    await Promise.all(
      mentionedIds.map((mentionedUserId) =>
        recordAnalyticsEvent(supabase, user.id, 'mention_add', {
          surface: 'api_comments',
          payload: {
            postId,
            commentId,
            mentioned_user_id: mentionedUserId
          }
        })
      )
    );
  }

  try {
    const { data: postRow, error: postError } = await supabase
      .from('posts')
      .select(
        `
        author_id,
        slug,
        author:profiles!posts_author_fk(handle)
      `
      )
      .eq('id', postId)
      .maybeSingle();

    if (postError) {
      console.error('[api/comments:POST] post author lookup failed', postError);
    } else if (postRow?.author_id) {
      const postAuthorId = postRow.author_id as string;
      const isReply = Boolean(replyTo);
      const postSlug = (postRow.slug ?? null) as string | null;
      const postAuthor = Array.isArray(postRow.author) ? (postRow.author[0] ?? null) : postRow.author;
      const postHandle = (postAuthor?.handle ?? null) as string | null;

      await createNotification(supabase, {
        actorId: user.id,
        userId: postAuthorId,
        kind: 'comment',
        targetId: postId,
        targetKind: 'post',
        metadata: {
          isReply,
          postId,
          commentId,
          parentCommentId: replyTo ?? null,
          postSlug,
          postHandle
        }
      });

      if (parentAuthorId && parentAuthorId !== postAuthorId) {
        await createNotification(supabase, {
          actorId: user.id,
          userId: parentAuthorId,
          kind: 'comment',
          targetId: replyTo ?? commentId ?? postId,
          targetKind: 'comment',
          metadata: {
            isReply: true,
            postId,
            commentId,
            parentCommentId: replyTo ?? null,
            postSlug,
            postHandle
          }
        });
      }
    }
  } catch (notificationError) {
    console.error('[api/comments:POST] notification enqueue failed', notificationError);
  }

  return json({ item }, { status: 201 });
};
