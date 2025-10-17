import { redirect } from '@sveltejs/kit';
import type { LayoutServerLoad } from './$types';

export const load: LayoutServerLoad = async ({ locals, url }) => {
  const session = locals.session;

  if (!session) {
    const redirectTarget = url.pathname + url.search;
    const loginLocation = redirectTarget
      ? '/login?next=' + encodeURIComponent(redirectTarget)
      : '/login';

    throw redirect(303, loginLocation);
  }

  return {
    session,
    user: session.user
  };
};
