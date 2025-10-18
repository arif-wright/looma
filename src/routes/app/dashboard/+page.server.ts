import { redirect } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import { getPlayerStats } from '$lib/server/queries/getPlayerStats';

export const load: PageServerLoad = async (event) => {
  if (!event.locals.session) {
    const next = encodeURIComponent('/app/dashboard');
    throw redirect(303, `/login?next=${next}`);
  }

  try {
    const stats = await getPlayerStats(event);
    return {
      stats: stats ?? null
    };
  } catch (err) {
    console.error('dashboard load error', err);
    return {
      stats: null
    };
  }
};
