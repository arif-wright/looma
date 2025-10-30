import type { PageServerLoad } from './$types';
import { supabaseServer } from '$lib/supabaseClient';

export const load: PageServerLoad = async (event) => {
  const parentData = await event.parent();
  const profile = parentData.profile;
  const viewerId: string | null = parentData.viewerId ?? null;

  const supabase = supabaseServer(event);

  const { data: feedRows, error: feedError } = await supabase.rpc('get_user_public_feed', {
    p_user: profile.id,
    p_limit: 12
  });

  if (feedError) {
    console.error('[profile page] get_user_public_feed failed', feedError);
  }

  const highlightPostId = event.url.searchParams.get('post');

  return {
    profile,
    feed: feedRows ?? [],
    viewerId,
    highlightPostId
  };
};
