import { error } from '@sveltejs/kit';
import type { LayoutServerLoad } from './$types';
import { supabaseServer } from '$lib/supabaseClient';

export const load: LayoutServerLoad = async (event) => {
  const supabase = supabaseServer(event);
  const handle = event.params.handle;

  const { data: profileRows, error: profileError } = await supabase.rpc('get_profile_by_handle', {
    p_handle: handle
  });

  if (profileError) {
    console.error('[profile layout] get_profile_by_handle failed', profileError);
    throw error(500, 'Unable to load profile');
  }

  const profile = Array.isArray(profileRows) ? profileRows[0] : profileRows;

  if (!profile) {
    throw error(404, 'Profile not found');
  }

  const viewerId = event.locals.user?.id ?? null;

  return {
    profile,
    viewerId
  };
};
