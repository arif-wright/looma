import type { PageServerLoad } from './$types';
import { getPlayerStats } from '$lib/server/queries/getPlayerStats';
import { requireUserServer } from '$lib/server/auth';

export const load: PageServerLoad = async (event) => {
  await requireUserServer(event);

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
