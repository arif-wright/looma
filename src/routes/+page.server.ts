import { redirect } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals, url }) => {
  if (url.searchParams.has('code') || url.searchParams.has('error')) {
    const suffix = url.search ? url.search : '';
    throw redirect(302, `/auth/callback${suffix}`);
  }

  return { loggedIn: Boolean(locals.user) };
};
