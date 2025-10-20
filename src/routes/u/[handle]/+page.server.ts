import type { PageServerLoad } from './$types';
import { supabaseServer } from '$lib/supabaseClient';

export const load: PageServerLoad = async (event) => {
  const sb = supabaseServer(event);
  const handle = event.params.handle;
  const { data: profile } = await sb.rpc('get_profile_by_handle', { p_handle: handle });
  if (!profile) return { status: 404 };
  const { data: feed } = await sb.rpc('get_user_public_feed', { p_user: profile.id, p_limit: 12 });
  return { profile, feed };
};
