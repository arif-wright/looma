import { redirect } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import { createSupabaseServerClient } from '$lib/server/supabase';
import { getUserRole, isModeratorRole } from '$lib/server/moderation';

export const load: PageServerLoad = async (event) => {
  const { supabase, session } = await createSupabaseServerClient(event);
  if (!session) {
    throw redirect(302, '/app/home');
  }

  const role = await getUserRole(supabase, session.user.id, session.user.email ?? null);
  if (!isModeratorRole(role)) {
    throw redirect(302, '/app/home');
  }

  return {
    role
  };
};
