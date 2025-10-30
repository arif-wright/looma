import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { supabaseServer } from '$lib/supabaseClient';
import { createShare, ensureUuid, sanitizeQuote } from '$lib/server/engagement';
import { enforceRateLimit, validateQuoteShare } from '$lib/server/safety';
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
  const quoteWasProvided = Object.prototype.hasOwnProperty.call(payload ?? {}, 'quote');
  if (quoteError) {
    return json({ error: 'bad_request', details: quoteError }, { status: 400, headers: CACHE_HEADERS });
  }

  if (quoteWasProvided && !quote) {
    return json({ error: 'bad_request', details: 'Quote cannot be empty.' }, { status: 400, headers: CACHE_HEADERS });
  }

  const limit = enforceRateLimit('share', user.id);
  if (!limit.ok) {
    return json(
      { error: 'rate_limited', details: 'You are sharing too quickly. Please slow down.' },
      { status: 429, headers: CACHE_HEADERS }
    );
  }

  if (quote) {
    const quoteCheck = validateQuoteShare(user.id, quote);
    if (!quoteCheck.ok) {
      const status = quoteCheck.reason === 'duplicate' ? 409 : 400;
      const details =
        quoteCheck.reason === 'duplicate'
          ? 'You already shared that quote recently.'
          : 'Quote cannot be empty.';
      return json({ error: 'invalid_quote', details }, { status, headers: CACHE_HEADERS });
    }
  }

  try {
    const share = await createShare(supabase, user.id, postId, quote);

    const { data: engagement, error: engagementError } = await supabase
      .from('post_engagement_view')
      .select('share_count')
      .eq('post_id', postId)
      .maybeSingle();

    if (engagementError) throw engagementError;

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
      console.error('[api/shares] post author lookup failed', postError);
    } else if (postRow?.author_id) {
      await createNotification(supabase, {
        actorId: user.id,
        userId: postRow.author_id as string,
        kind: 'share',
        targetId: postId,
        targetKind: 'post',
        metadata: {
          quote: Boolean(quote),
          postId,
          postSlug: (postRow.slug ?? null) as string | null,
          postHandle: (postRow.author?.handle ?? null) as string | null
        }
      });
    }

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
