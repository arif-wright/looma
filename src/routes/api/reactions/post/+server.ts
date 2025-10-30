import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { supabaseServer } from '$lib/supabaseClient';
import { ensureUuid, getPostReactionCounts, togglePostReaction, validateReactionKind } from '$lib/server/engagement';
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
    console.error('[api/reactions/post] auth error', authError, {
      cookie: event.request.headers.get('cookie'),
      authorization: event.request.headers.get('authorization')
    });
    return json({ error: 'server_error' }, { status: 500, headers: CACHE_HEADERS });
  }

  if (!user) {
    return json({ error: 'unauthorized' }, { status: 401, headers: CACHE_HEADERS });
  }

  let payload: { post_id?: unknown; kind?: unknown };
  try {
    payload = await event.request.json();
  } catch (cause) {
    return json({ error: 'bad_request', details: 'Invalid JSON body' }, { status: 400, headers: CACHE_HEADERS });
  }

  const postId = payload?.post_id;
  const kind = payload?.kind;

  if (!ensureUuid(postId)) {
    return json({ error: 'bad_request', details: 'post_id must be a uuid' }, { status: 400, headers: CACHE_HEADERS });
  }

  if (!validateReactionKind(kind)) {
    return json({ error: 'bad_request', details: 'Invalid reaction kind' }, { status: 400, headers: CACHE_HEADERS });
  }

  try {
    const { data: existing, error: existingError } = await supabase
      .from('post_reactions')
      .select('post_id')
      .eq('post_id', postId)
      .eq('user_id', user.id)
      .eq('kind', kind)
      .maybeSingle();

    if (existingError) throw existingError;

    if (!existing) {
      const limit = enforceRateLimit('reaction', user.id);
      if (!limit.ok) {
        return json(
          { error: 'rate_limited', details: 'Please slow down before reacting again.' },
          { status: 429, headers: CACHE_HEADERS }
        );
      }
    }

    const result = await togglePostReaction(supabase, user.id, postId, kind);
    const counts = await getPostReactionCounts(supabase, postId);

    if (result.toggledOn) {
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
        console.error('[api/reactions/post] author lookup failed', postError);
      } else if (postRow?.author_id) {
        await createNotification(supabase, {
          actorId: user.id,
          userId: postRow.author_id as string,
          kind: 'reaction',
          targetId: postId,
          targetKind: 'post',
          metadata: {
            reaction: kind,
            postId,
            postSlug: (postRow.slug ?? null) as string | null,
            postHandle: (postRow.author?.handle ?? null) as string | null
          }
        });
      }
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
    console.error('[api/reactions/post] toggle failed', cause);
    return json(
      {
        error: 'server_error',
        details:
          cause && typeof cause === 'object'
            ? JSON.stringify(cause)
            : cause instanceof Error
            ? cause.message
            : String(cause)
      },
      { status: 500, headers: CACHE_HEADERS }
    );
  }
};
