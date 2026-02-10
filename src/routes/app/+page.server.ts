import { redirect } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';

const ONBOARDING_COOKIE = 'looma_onboarding_v1';

export const load: PageServerLoad = async ({ locals, cookies }) => {
  if (!locals.user) {
    throw redirect(302, '/');
  }

  const seenOnboarding = cookies.get(ONBOARDING_COOKIE) === '1';
  if (seenOnboarding) {
    throw redirect(302, '/app/home');
  }

  return { showOnboarding: true };
};
