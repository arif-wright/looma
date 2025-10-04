import type { Actions } from './$types';
import { PUBLIC_APP_URL } from '$env/static/public';

export const actions: Actions = {
  magic: async ({ request, locals, url }) => {
    const form = await request.formData();
    const email = String(form.get('email') || '').trim();
    if (!email) return { ok: false, error: 'Email required' };

    // One source of truth for redirects (works in dev & prod)
    const redirectTo = PUBLIC_APP_URL || url.origin;

    const { error } = await locals.sb.auth.signInWithOtp({
      email,
      options: { emailRedirectTo: redirectTo }
    });

    return { ok: !error, error: error?.message ?? null };
  },

  signout: async ({ locals }) => {
    await locals.sb.auth.signOut();
    return { ok: true };
  }
};

