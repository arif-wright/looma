import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { supabaseServer } from '$lib/supabaseClient';

const CACHE_HEADERS = { 'cache-control': 'no-store' } as const;

export const POST: RequestHandler = async (event) => {
  const supabase = supabaseServer(event);
  const {
    data: { user },
    error: authError
  } = await supabase.auth.getUser();

  if (authError) {
    console.error('[privacy/follow-request] auth error', authError);
    return json({ error: 'unauthorized' }, { status: 500, headers: CACHE_HEADERS });
  }

  if (!user) {
    return json({ error: 'unauthorized' }, { status: 401, headers: CACHE_HEADERS });
  }

  let payload: { userId?: string };
  try {
    payload = await event.request.json();
  } catch {
    return json({ error: 'bad_request' }, { status: 400, headers: CACHE_HEADERS });
  }

  const targetId = typeof payload.userId === 'string' ? payload.userId : null;
  if (!targetId || targetId === user.id) {
    return json({ error: 'bad_request' }, { status: 400, headers: CACHE_HEADERS });
  }

  const { error } = await supabase.rpc('request_follow', { target: targetId });
  if (error) {
    console.error('[privacy/follow-request] rpc failed', error);
    return json({ error: error.message ?? 'server_error' }, { status: 400, headers: CACHE_HEADERS });
  }

  return json({ ok: true }, { headers: CACHE_HEADERS });
};
