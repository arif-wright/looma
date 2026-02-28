import { redirect } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ url }) => {
  const focus = url.searchParams.get('focus');
  const target = focus ? `/app/companions?focus=${encodeURIComponent(focus)}` : '/app/companions';
  throw redirect(302, target);
};
