import type { RequestHandler } from './$types';
import { json } from '@sveltejs/kit';
import { supabaseServer } from '$lib/supabaseClient';

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

  const { data, error } = await supabase.rpc(rpcName, params as Record<string, unknown>);

  if (error) {
    return json({ error: error.message }, { status: 400 });
  }

  return json({ items: data ?? [] });
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
  const isPublic = typeof payload.is_public === 'boolean' ? payload.is_public : true;

  const { error } = await supabase.from('posts').insert({
    user_id: user.id,
    body,
    meta,
    is_public: isPublic
  });

  if (error) {
    return json({ error: error.message }, { status: 400 });
  }

  return json({ ok: true });
};
