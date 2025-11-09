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
    console.error('[privacy/follow-status] auth error', authError);
    return json({ error: 'unauthorized' }, { status: 500, headers: CACHE_HEADERS });
  }

  if (!user) {
    return json({ isFollowing: false, requested: false }, { headers: CACHE_HEADERS });
  }

  const [followEdge, requestEdge] = await Promise.all([
    supabase
      .from('follows')
      .select('followee_id')
      .eq('follower_id', user.id)
      .eq('followee_id', target)
      .maybeSingle(),
    supabase
      .from('follow_requests')
      .select('target_id')
      .eq('requester_id', user.id)
      .eq('target_id', target)
      .maybeSingle()
  ]);

  return json(
    {
      isFollowing: Boolean(followEdge.data),
      requested: Boolean(requestEdge.data)
    },
    { headers: CACHE_HEADERS }
  );
};
