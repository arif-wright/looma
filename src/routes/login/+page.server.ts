import type { Actions } from './$types';

export const actions: Actions = {
  magic: async ({ request, locals }) => {
    const form = await request.formData();
    const email = String(form.get('email') || '');

    const redirectTo =
      process.env.NODE_ENV === 'production'
        ? 'https://looma.kinforge.net'
        : process.env.PUBLIC_APP_URL || 'http://localhost:3000';

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
