import type { RequestHandler } from './$types';
import { json } from '@sveltejs/kit';
import { supabaseServer } from '$lib/supabaseClient';
import { updateUserContext } from '$lib/server/userContext';
import { recordAnalyticsEvent } from '$lib/server/analytics';
import { ensureBlockedPeers, isBlockedPeer } from '$lib/server/blocks';

const parseLimit = (value: string | null, fallback = 20) => {
  if (!value) return fallback;
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(1, Math.min(50, Math.floor(parsed)));
};

export const GET: RequestHandler = async (event) => {
  const supabase = supabaseServer(event);
  const limit = parseLimit(event.url.searchParams.get('limit'));
  const before = event.url.searchParams.get('before') ?? new Date().toISOString();
  const user = event.url.searchParams.get('user');

  const rpcName = user ? 'get_user_posts' : 'get_public_posts';
  const params = user
    ? { p_user: user, p_limit: limit, p_before: before }
    : { p_limit: limit, p_before: before };

  const blockPeers = await ensureBlockedPeers(event, supabase);
  const { data, error } = await supabase.rpc(rpcName, params as Record<string, unknown>);

  if (error) {
    return json({ error: error.message }, { status: 400 });
  }

  let items = Array.isArray(data) ? (data as Record<string, any>[]) : [];
  if (blockPeers.size) {
    items = items.filter((row) => {
      const authorId =
        (typeof row.author_id === 'string' && row.author_id) ||
        (typeof row.user_id === 'string' && row.user_id) ||
        null;
      return !isBlockedPeer(blockPeers, authorId);
    });
  }

  return json({ items });
};

export const POST: RequestHandler = async (event) => {
  const supabase = supabaseServer(event);
  const {
    data: { user },
    error: userError
  } = await supabase.auth.getUser();

  if (userError) {
    return json({ error: userError.message }, { status: 400 });
  }

  if (!user) {
    return json({ error: 'Not authenticated' }, { status: 401 });
  }

  let payload: { body?: unknown; meta?: unknown; is_public?: unknown };
  try {
    payload = await event.request.json();
  } catch (cause) {
    return json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const body = typeof payload.body === 'string' ? payload.body.trim() : '';
  if (!body) {
    return json({ error: 'Body is required' }, { status: 400 });
  }

  const meta =
    payload.meta && typeof payload.meta === 'object' && !Array.isArray(payload.meta)
      ? (payload.meta as Record<string, unknown>)
      : {};

  const {
    data: inserted,
    error: insertError
  } = await supabase
    .from('posts')
    .insert({
      user_id: user.id,
      kind: 'text',
      body,
      text: body,
      meta,
      is_public: true
    })
    .select('id, user_id, kind, body, text, meta, is_public, created_at')
    .single();

  if (insertError) {
    return json({ error: insertError.message }, { status: 400 });
  }

  const { data: profile, error: profileError } = await supabase
    .from('profiles')
    .select('display_name, handle, avatar_url')
    .eq('id', user.id)
    .maybeSingle();

  if (profileError) {
    console.error('posts insert profile lookup error', profileError);
  }

  const authorHandle = profile?.handle ?? null;
  const authorName =
    profile?.display_name ?? (authorHandle ? `@${authorHandle}` : 'Someone');

  const response = {
    ...inserted,
    author_name: authorName,
    author_handle: authorHandle,
    author_avatar: profile?.avatar_url ?? null,
    comment_count: 0,
    reaction_like_count: 0,
    reaction_spark_count: 0,
    reaction_support_count: 0,
    current_user_reaction: null
  };

  await updateUserContext(event, 'feed', { postId: inserted?.id ?? null }, 'social');
  await recordAnalyticsEvent(supabase, user.id, 'post_created', {
    surface: 'home',
    payload: { postId: inserted?.id ?? null }
  });

  return json({ item: response });
};
