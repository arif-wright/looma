import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { supabaseServer } from '$lib/supabaseClient';
import {
  ensureUuid,
  getPostReactionCounts,
  togglePostReaction,
  validateReactionKind
} from '$lib/server/engagement';

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
    const result = await togglePostReaction(supabase, user.id, postId, kind);
    const counts = await getPostReactionCounts(supabase, postId);

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
