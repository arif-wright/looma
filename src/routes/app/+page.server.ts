import type { Actions } from './$types';
import { redirect } from '@sveltejs/kit';

export const actions: Actions = {
  logout: async ({ locals }) => {
    await locals.supabase.auth.signOut();
    throw redirect(303, '/app/login');
  }
};
