import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { supabaseServer } from '$lib/supabaseClient';
import { createShare, ensureUuid, sanitizeQuote } from '$lib/server/engagement';

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

  let payload: { post_id?: unknown; quote?: unknown };
  try {
    payload = await event.request.json();
  } catch (cause) {
    return json({ error: 'bad_request', details: 'Invalid JSON body' }, { status: 400, headers: CACHE_HEADERS });
  }

  const postId = payload?.post_id;
  if (!ensureUuid(postId)) {
    return json({ error: 'bad_request', details: 'post_id must be a uuid' }, { status: 400, headers: CACHE_HEADERS });
  }

  const { value: quote, error: quoteError } = sanitizeQuote(payload?.quote);
  if (quoteError) {
    return json({ error: 'bad_request', details: quoteError }, { status: 400, headers: CACHE_HEADERS });
  }

  try {
    const share = await createShare(supabase, user.id, postId, quote);

    const { data: engagement, error: engagementError } = await supabase
      .from('post_engagement_view')
      .select('share_count')
      .eq('post_id', postId)
      .maybeSingle();

    if (engagementError) throw engagementError;

    return json(
      {
        ok: true,
        share_id: share.shareId,
        shares_count: Number(engagement?.share_count ?? 0)
      },
      { headers: CACHE_HEADERS }
    );
  } catch (cause) {
    console.error('[api/shares] create failed', cause);
    return json({ error: 'server_error' }, { status: 500, headers: CACHE_HEADERS });
  }
};
