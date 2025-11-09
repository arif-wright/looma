import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { supabaseServer } from '$lib/supabaseClient';

const CACHE_HEADERS = { 'cache-control': 'no-store' } as const;

export const GET: RequestHandler = async (event) => {
  const target = event.url.searchParams.get('userId');
  if (!target) {
    return json({ error: 'bad_request' }, { status: 400, headers: CACHE_HEADERS });
  }

  const supabase = supabaseServer(event);
  const {
    data: { user },
    error: authError
  } = await supabase.auth.getUser();

  if (authError) {
    console.error('[api/follow/status] auth failed', authError);
    return json({ error: 'unauthorized' }, { status: 401, headers: CACHE_HEADERS });
  }

  if (!user) {
    return json({ isFollowing: false }, { headers: CACHE_HEADERS });
  }

  if (user.id === target) {
    return json({ isFollowing: false }, { headers: CACHE_HEADERS });
  }

  const { data, error } = await supabase
    .from('follows')
    .select('followee_id')
    .eq('follower_id', user.id)
    .eq('followee_id', target)
    .maybeSingle();

  if (error) {
    console.error('[api/follow/status] lookup failed', error);
    return json({ error: 'server_error' }, { status: 500, headers: CACHE_HEADERS });
  }

  return json({ isFollowing: Boolean(data) }, { headers: CACHE_HEADERS });
};
