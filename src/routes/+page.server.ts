import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals }) => {
  return { loggedIn: Boolean(locals.user) };
};
