import { error, type PageServerLoad } from '@sveltejs/kit';
import { supabaseServer } from '$lib/supabaseClient';

export const load: PageServerLoad = async (event) => {
  const supabase = supabaseServer(event);
  const handle = event.params.handle;

  const { data: profileData, error: profileError } = await supabase.rpc('get_profile_by_handle', {
    p_handle: handle
  });

  if (profileError) {
    console.error('get_profile_by_handle error', profileError);
    throw error(500, 'Failed to load profile');
  }

  const profile = Array.isArray(profileData) ? profileData[0] : profileData;
  if (!profile) {
    throw error(404, 'Profile not found');
  }

  const { data: feedData, error: feedError } = await supabase.rpc('get_user_public_feed', {
    p_user: profile.id,
    p_limit: 12
  });

  if (feedError) {
    console.error('get_user_public_feed error', feedError);
  }

  return {
    profile,
    feed: feedData ?? []
  };
};

