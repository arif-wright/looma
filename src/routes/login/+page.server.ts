import { redirect } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import { magicLinkRedirect } from '$lib/supabaseClient';
import { sanitizeInternalPath } from '$lib/auth/consumeHashSession';

const DEFAULT_APP_PATH = '/app';

function resolveRedirectDestination(url: URL): string {
  const candidate =
    sanitizeInternalPath(url.searchParams.get('next')) ?? sanitizeInternalPath(url.searchParams.get('redirectTo'));
  return candidate ?? DEFAULT_APP_PATH;
}

export const load: PageServerLoad = async ({ locals, url }) => {
  const session = locals.session;
  if (session) {
    const destination = resolveRedirectDestination(url);
    throw redirect(303, destination);
  }

  return {};
};

export const actions: Actions = {
  magic: async ({ request, locals, url }) => {
    const form = await request.formData();
    const email = String(form.get('email') || '').trim();
    if (!email) return { ok: false, error: 'Email required' };

    const destination = resolveRedirectDestination(url);
    const emailRedirectTo = `${magicLinkRedirect}?${new URLSearchParams({ next: destination }).toString()}`;

    const { error } = await locals.supabase.auth.signInWithOtp({
      email,
      options: { emailRedirectTo }
    });

    if (error) {
      return { ok: false, error: error.message };
    }

    throw redirect(303, destination);
  },

  signout: async ({ locals }) => {
    await locals.supabase.auth.signOut();
    return { ok: true };
  }
};
