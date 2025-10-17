import { supabaseServer } from '$lib/supabaseClient';
import { redirect } from '@sveltejs/kit';

export const load = async (event) => {
  const url = new URL(event.request.url);
  const code = url.searchParams.get('code');

  if (code) {
    const supabase = supabaseServer(event);

    // Most reliable: explicitly exchange the code for a session
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (error) {
      console.error('exchangeCodeForSession (root) error:', error.message);
      throw redirect(303, '/login?msg=auth_error');
    }

    // Optional next param support; default to dashboard
    const next = url.searchParams.get('next') ?? '/app/dashboard';
    throw redirect(303, next);
  }

  // No code → render homepage normally
  return {};
};
