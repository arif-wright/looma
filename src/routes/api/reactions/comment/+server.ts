import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { supabaseServer } from '$lib/supabaseClient';
import {
  ensureUuid,
  getCommentReactionCounts,
  toggleCommentReaction,
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
    const result = await toggleCommentReaction(supabase, user.id, commentId, kind);
    const counts = await getCommentReactionCounts(supabase, commentId);

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

