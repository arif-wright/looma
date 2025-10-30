import { redirect } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import { sanitizeInternalPath } from '$lib/auth/redirect';

export const load: PageServerLoad = async ({ locals, url }) => {
  if (locals.user) {
    throw redirect(302, '/app/home');
  }

  const next = sanitizeInternalPath(url.searchParams.get('next'));
  return { next };
};
