import type { PageServerLoad } from './$types';
import { supabaseServer } from '$lib/supabaseClient';

export const load: PageServerLoad = async (event) => {
  const sb = supabaseServer(event);
  const handle = event.params.handle;

  const { data: rows, error: profileError } = await sb.rpc('get_profile_by_handle', {
    p_handle: handle
  });

  if (profileError) {
    console.error('get_profile_by_handle error', profileError);
    return { status: 500 };
  }

  const profile = Array.isArray(rows) ? rows[0] : null;
  if (!profile) {
    return { status: 404 };
  }

  const { data: feed, error: feedError } = await sb.rpc('get_user_public_feed', {
    p_user: profile.id,
    p_limit: 12
  });

  if (feedError) {
    console.error('get_user_public_feed error', feedError);
  }

  const viewerId = event.locals.user?.id ?? null;

  return { profile, feed: feed ?? [], viewerId };
};
