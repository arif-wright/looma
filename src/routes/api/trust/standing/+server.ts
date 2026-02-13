import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { createSupabaseServerClient } from '$lib/server/supabase';
import { getTrustStanding } from '$lib/server/trust';

const CACHE_HEADERS = { 'cache-control': 'no-store' } as const;

export const GET: RequestHandler = async (event) => {
  const { supabase, session } = await createSupabaseServerClient(event);
  if (!session) {
    return json({ error: 'unauthorized' }, { status: 401, headers: CACHE_HEADERS });
  }

  const standing = await getTrustStanding(supabase, session.user.id);
  return json(
    {
      standing: standing.standing,
      tier: standing.trust.tier,
      limited: standing.standing === 'limited',
      limits: standing.limits
    },
    { headers: CACHE_HEADERS }
  );
};
