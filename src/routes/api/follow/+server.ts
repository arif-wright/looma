import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { supabaseServer } from '$lib/supabaseClient';

const CACHE_HEADERS = { 'cache-control': 'no-store' } as const;

type FollowPayload = {
  userId?: string;
  action?: string;
};

export const POST: RequestHandler = async (event) => {
  const supabase = supabaseServer(event);
  const {
    data: { user },
    error: authError
  } = await supabase.auth.getUser();

  if (authError) {
    console.error('[api/follow] auth lookup failed', authError);
    return json({ error: 'unauthorized' }, { status: 401, headers: CACHE_HEADERS });
  }

  if (!user) {
    return json({ error: 'unauthorized' }, { status: 401, headers: CACHE_HEADERS });
  }

  let body: FollowPayload;
  try {
    body = await event.request.json();
  } catch {
    return json({ error: 'bad_request' }, { status: 400, headers: CACHE_HEADERS });
  }

  const targetId = typeof body.userId === 'string' ? body.userId : null;
  const action = body.action === 'follow' || body.action === 'unfollow' ? body.action : null;

  if (!targetId || !action) {
    return json({ error: 'bad_request' }, { status: 400, headers: CACHE_HEADERS });
  }

  if (targetId === user.id) {
    return json({ error: 'cannot_follow_self' }, { status: 400, headers: CACHE_HEADERS });
  }

  const rpc = action === 'follow' ? 'follow_user' : 'unfollow_user';
  const { error } = await supabase.rpc(rpc, { target: targetId });

  if (error) {
    console.error('[api/follow] rpc failed', error);
    return json({ error: error.message ?? 'server_error' }, { status: 400, headers: CACHE_HEADERS });
  }

  return json({ ok: true }, { headers: CACHE_HEADERS });
};
