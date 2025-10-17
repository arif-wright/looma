import { supabaseServer } from '$lib/supabaseClient';
import { redirect } from '@sveltejs/kit';

export const load = async (event) => {
  const url = new URL(event.request.url);
  const next = url.searchParams.get('next') ?? '/app/dashboard';
  const supabase = supabaseServer(event);

  // Either exchange explicitly, or let getSession hydrate cookies if your version supports it
  const code = url.searchParams.get('code');
  if (code) {
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (error) {
      console.error('exchangeCodeForSession (callback) error:', error.message);
      throw redirect(303, '/login?msg=auth_error');
    }
  } else {
    await supabase.auth.getSession();
  }

  throw redirect(303, next);
};
