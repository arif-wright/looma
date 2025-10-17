import { redirect } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async (event) => {
  if (!event.locals.session) {
    const next = encodeURIComponent('/app/dashboard');
    throw redirect(303, `/login?next=${next}`);
  }

  return {};
};
