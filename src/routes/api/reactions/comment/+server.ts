import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { supabaseServer } from '$lib/supabaseClient';
import { ensureUuid, getCommentReactionCounts, toggleCommentReaction, validateReactionKind } from '$lib/server/engagement';
import { enforceRateLimit } from '$lib/server/safety';
import { createNotification } from '$lib/server/notifications';

const CACHE_HEADERS = { 'cache-control': 'no-store' } as const;

export const POST: RequestHandler = async (event) => {
  const supabase = supabaseServer(event);

  const {
    data: { user },
    error: authError
  } = await supabase.auth.getUser();

  if (authError) {
    return json({ error: 'server_error' }, { status: 500, headers: CACHE_HEADERS });
  }

  if (!user) {
    return json({ error: 'unauthorized' }, { status: 401, headers: CACHE_HEADERS });
  }

  let payload: { comment_id?: unknown; kind?: unknown };
  try {
    payload = await event.request.json();
  } catch (cause) {
    return json({ error: 'bad_request', details: 'Invalid JSON body' }, { status: 400, headers: CACHE_HEADERS });
  }

  const commentId = payload?.comment_id;
  const kind = payload?.kind;

  if (!ensureUuid(commentId)) {
    return json({ error: 'bad_request', details: 'comment_id must be a uuid' }, { status: 400, headers: CACHE_HEADERS });
  }

  if (!validateReactionKind(kind)) {
    return json({ error: 'bad_request', details: 'Invalid reaction kind' }, { status: 400, headers: CACHE_HEADERS });
  }

  try {
    const [existingResult, commentLookup] = await Promise.all([
      supabase
        .from('comment_reactions')
        .select('comment_id')
        .eq('comment_id', commentId)
        .eq('user_id', user.id)
        .eq('kind', kind)
        .maybeSingle(),
      supabase.from('comments').select('author_id, post_id').eq('id', commentId).maybeSingle()
    ]);

    if (existingResult.error) throw existingResult.error;
    if (commentLookup.error) throw commentLookup.error;

    const commentRow = commentLookup.data;
    if (!commentRow) {
      return json({ error: 'not_found' }, { status: 404, headers: CACHE_HEADERS });
    }

    if (!existingResult.data) {
      const limit = enforceRateLimit('reaction', user.id);
      if (!limit.ok) {
        return json(
          { error: 'rate_limited', details: 'Please slow down before reacting again.' },
          { status: 429, headers: CACHE_HEADERS }
        );
      }
    }

    const result = await toggleCommentReaction(supabase, user.id, commentId, kind);
    const counts = await getCommentReactionCounts(supabase, commentId);

    if (result.toggledOn && commentRow?.author_id) {
      let postSlug: string | null = null;
      let postHandle: string | null = null;
      const commentPostId = typeof commentRow.post_id === 'string' ? commentRow.post_id : null;

      if (commentPostId) {
        const { data: postMeta, error: postMetaError } = await supabase
          .from('posts')
          .select(
            `
            slug,
            author:profiles!posts_author_fk(handle)
          `
          )
          .eq('id', commentPostId)
          .maybeSingle();

        if (postMetaError) {
          console.error('[api/reactions/comment] post meta lookup failed', postMetaError);
        } else if (postMeta) {
          const postAuthor = Array.isArray(postMeta.author) ? (postMeta.author[0] ?? null) : postMeta.author;
          postSlug = (postMeta.slug ?? null) as string | null;
          postHandle = (postAuthor?.handle ?? null) as string | null;
        }
      }

      await createNotification(supabase, {
        actorId: user.id,
        userId: commentRow.author_id as string,
        kind: 'reaction',
        targetId: commentId,
        targetKind: 'comment',
        metadata: {
          reaction: kind,
          postId: commentPostId,
          commentId,
          postSlug,
          postHandle
        }
      });
    }

    return json(
      {
        ok: true,
        toggledOn: result.toggledOn,
        counts
      },
      { headers: CACHE_HEADERS }
    );
  } catch (cause) {
    console.error('[api/reactions/comment] toggle failed', cause);
    return json({ error: 'server_error' }, { status: 500, headers: CACHE_HEADERS });
  }
};
