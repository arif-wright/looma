import { redirect } from '@sveltejs/kit';
import type { LayoutServerLoad } from './$types';

export const load: LayoutServerLoad = async ({ locals, url }) => {
  const session = await locals.getSession();

  if (!session) {
    const redirectTarget = url.pathname + url.search;
    const loginLocation = redirectTarget
      ? '/login?next=' + encodeURIComponent(redirectTarget)
      : '/login';

    throw redirect(303, loginLocation);
  }

  const user = session.user;

  return {
    session,
    user
  };
};
