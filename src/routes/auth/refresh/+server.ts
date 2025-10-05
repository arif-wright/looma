import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';

export const POST: RequestHandler = async ({ locals, request }) => {
  const { access_token, refresh_token } = await request.json().catch(() => ({}));

  if (typeof access_token !== 'string' || typeof refresh_token !== 'string') {
    return json({ ok: false, error: 'Missing tokens' }, { status: 400 });
  }

  const { error } = await locals.supabase.auth.setSession({
    access_token,
    refresh_token
  });

  if (error) {
    return json({ ok: false, error: error.message }, { status: 401 });
  }

  return json({ ok: true });
};
